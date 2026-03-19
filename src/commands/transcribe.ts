// Main transcription workflow: validates the audio file, estimates cost,
// generates the requested outputs, and saves them with coordinated filenames.

import { getSecret, prompt } from "@/secrets.ts";
import { parseEnvNumber } from "@/config.ts";
import type { GoogleGenAI } from "@google/genai";
import {
  MIME_TYPES,
  createGeminiClient,
  uploadFile,
  generateFilename,
  createUserContent,
  createPartFromUri,
} from "@/providers/gemini.ts";
import {
  TRANSCRIPTION_MODEL,
  TRANSCRIPTION_INPUT_COST_PER_M,
  TRANSCRIPTION_OUTPUT_COST_PER_M,
  NAMING_MODEL,
  inputCost,
  outputCost,
} from "@/costs.ts";
import type { FlagConfig } from "@/output.ts";
import { buildOutputPath, findAvailableCounter } from "@/output.ts";

const FLAG_CONFIGS: Record<string, FlagConfig> = {
  summarize: {
    suffix: "summary",
    ext: ".md",
    prompt:
      "Read the full audio and provide a concise, structured summary of the core topics, decisions, and discussions. Use Markdown formatting. Do not alter the factual meaning of the source material.",
  },
  format: {
    suffix: "formatted",
    ext: ".md",
    prompt:
      "Generate a well-formatted Markdown transcription of this audio. Use headers, paragraphs, and lists as appropriate. Remove filler words (um, uh, like) but do not change the actual vocabulary or meaning. Identify and label individual speakers (e.g., Speaker 1, Speaker 2, or by name if inferable).",
  },
  timestamp: {
    suffix: "timestamped",
    ext: ".txt",
    prompt:
      "Generate a literal transcription of this audio with timestamps inserted at regular intervals or at the beginning of speaker turns to indicate when the speech occurred.",
  },
};

// Variations are generated with separate prompts instead of post-processing the
// base transcript so each output can optimize for its own format and structure.
async function generateVariation(
  ai: GoogleGenAI,
  fileUri: string,
  fileMimeType: string,
  promptText: string,
  maxOutputTokens: number
): Promise<{ text: string; outputTokens: number; cost: number }> {
  const contents = createUserContent([
    createPartFromUri(fileUri, fileMimeType),
    promptText,
  ]);

  const response = await ai.models.generateContent({
    model: TRANSCRIPTION_MODEL,
    contents,
    config: { maxOutputTokens },
  });

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  const tokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    text: response.text,
    outputTokens: tokens,
    cost: outputCost(tokens, TRANSCRIPTION_OUTPUT_COST_PER_M),
  };
}

/**
 * Transcribe one local audio file and optionally generate additional outputs
 * such as a summary, formatted transcript, or timestamped transcript.
 */
export async function transcribe(
  filePath: string,
  flags: Set<string> = new Set()
): Promise<void> {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    console.error(`Unsupported file extension: ${ext}`);
    console.error(`Supported: ${Object.keys(MIME_TYPES).join(", ")}`);
    process.exit(1);
  }

  const apiKey = await getSecret("api-key", "Enter Gemini API key: ");
  const ai = createGeminiClient(apiKey);

  const file = await uploadFile(ai, filePath, mimeType);

  const contents = createUserContent([
    createPartFromUri(file.uri!, file.mimeType!),
    "Generate a plain text transcription of this audio.",
  ]);

  const tokenCount = await ai.models.countTokens({
    model: TRANSCRIPTION_MODEL,
    contents,
  });

  const maxOutputTokens = parseEnvNumber("MAX_OUTPUT_TOKENS", 8192);
  const maxCost = parseEnvNumber("MAX_COST", 0.5);

  const activeFlags = [...flags].filter((f) => f in FLAG_CONFIGS);
  // Every requested variation is its own generateContent call against the same
  // uploaded audio, so the upfront estimate has to scale with the number of
  // outputs we may ask Gemini to produce.
  const totalCalls = 1 + activeFlags.length;

  const inputTokens = tokenCount.totalTokens!;
  const estInputCost = inputCost(inputTokens, TRANSCRIPTION_INPUT_COST_PER_M) * totalCalls;
  const estMaxOutputCost = outputCost(maxOutputTokens, TRANSCRIPTION_OUTPUT_COST_PER_M) * totalCalls;
  const maxTotalCost = estInputCost + estMaxOutputCost;
  console.log(
    `Input tokens:      ${inputTokens.toLocaleString()} x ${totalCalls} call${totalCalls > 1 ? "s" : ""} (cost: $${estInputCost.toFixed(4)})`
  );
  console.log(
    `Max output tokens: ${maxOutputTokens.toLocaleString()} x ${totalCalls} call${totalCalls > 1 ? "s" : ""} (cost: $${estMaxOutputCost.toFixed(4)})`
  );
  console.log(`Max total cost:    $${maxTotalCost.toFixed(4)}`);
  console.log(`Naming request:    ${NAMING_MODEL} (< $0.0001)`);

  if (maxTotalCost > maxCost) {
    console.error(
      `Aborting: estimated max cost $${maxTotalCost.toFixed(4)} exceeds MAX_COST $${maxCost.toFixed(2)}`
    );
    process.exit(1);
  }

  console.log(`\nSettings (override via environment variables):`);
  console.log(`  MAX_OUTPUT_TOKENS:\t${maxOutputTokens}`);
  console.log(`  MAX_COST:\t\t${maxCost}`);

  if (activeFlags.length > 0) {
    console.log(`\nAdditional outputs: ${activeFlags.join(", ")}`);
  }

  const answer = (await prompt("\nProceed? [Y/n] ")).toLowerCase();
  if (answer && answer !== "y" && answer !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  // --- Base transcription ---
  console.log("Transcribing...");
  const base = await generateVariation(
    ai,
    file.uri!,
    file.mimeType!,
    "Generate a plain text transcription of this audio.",
    maxOutputTokens
  );
  console.log(base.text);

  let totalOutputTokens = base.outputTokens;
  let totalOutputCost = base.cost;

  // --- Generate filename and determine counter ---
  console.log("\nGenerating filename...");
  const { name: description, cost: namingCost } = await generateFilename(
    ai,
    base.text
  );

  const date = new Date().toISOString().slice(0, 10);
  const baseName = `${date}-${description}`;
  const activeFlagConfigs = activeFlags.map((f) => FLAG_CONFIGS[f]!);
  const counter = await findAvailableCounter(baseName, activeFlagConfigs);

  // Save base transcription
  const baseOutputPath = buildOutputPath(baseName, null, counter, ".txt");
  await Bun.write(baseOutputPath, base.text);
  console.log(`Saved to ${baseOutputPath}`);

  // --- Flag variations ---
  for (const flag of activeFlags) {
    const config = FLAG_CONFIGS[flag]!;
    console.log(`\nGenerating ${config.suffix}...`);
    const variation = await generateVariation(
      ai,
      file.uri!,
      file.mimeType!,
      config.prompt,
      maxOutputTokens
    );
    totalOutputTokens += variation.outputTokens;
    totalOutputCost += variation.cost;

    const varOutputPath = buildOutputPath(
      baseName,
      config.suffix,
      counter,
      config.ext
    );
    await Bun.write(varOutputPath, variation.text);
    console.log(`Saved to ${varOutputPath}`);
  }

  // --- Cost summary ---
  const totalCost = estInputCost + totalOutputCost + namingCost;
  console.log(
    `\nOutput tokens: ${totalOutputTokens.toLocaleString()} (cost: $${totalOutputCost.toFixed(4)})`
  );
  console.log(`Naming cost:   $${namingCost.toFixed(4)}`);
  console.log(`Total cost:    $${totalCost.toFixed(4)}`);

  process.exit(0);
}
