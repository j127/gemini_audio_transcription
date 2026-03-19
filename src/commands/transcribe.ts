// Main transcription workflow: validates the audio file, estimates cost,
// generates the requested outputs, and saves them with coordinated filenames.

import { getSecret, prompt } from "../secrets.ts";
import { parseEnvNumber } from "../config.ts";
import path from "path";
import type { GoogleGenAI } from "@google/genai";
import {
  MIME_TYPES,
  createGeminiClient,
  uploadFile,
  generateFilename,
  createUserContent,
  createPartFromUri,
  NAMING_MODEL,
} from "../providers/gemini.ts";

const OUTPUT_DIR = path.join(import.meta.dir, "../../output");

const FLAG_CONFIGS: Record<
  string,
  { suffix: string; ext: string; prompt: string }
> = {
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

function buildOutputPath(
  baseName: string,
  suffix: string | null,
  counter: number | null,
  ext: string
): string {
  const suffixPart = suffix ? `_${suffix}` : "";
  const counterPart = counter ? `--${counter}` : "";
  return path.join(OUTPUT_DIR, `${baseName}${suffixPart}${counterPart}${ext}`);
}

// Counter selection has to consider every file this run may emit, not just the
// base transcript. Otherwise a leftover derived file could be overwritten if
// the matching `.txt` was deleted manually.
async function anyOutputExists(
  baseName: string,
  counter: number | null,
  activeFlags: string[]
): Promise<boolean> {
  if (
    await Bun.file(buildOutputPath(baseName, null, counter, ".txt")).exists()
  ) {
    return true;
  }
  for (const flag of activeFlags) {
    const config = FLAG_CONFIGS[flag]!;
    if (
      await Bun.file(
        buildOutputPath(baseName, config.suffix, counter, config.ext)
      ).exists()
    ) {
      return true;
    }
  }
  return false;
}

// One transcription run should produce a matched set of filenames, so the same
// counter is reused across the base transcript and all requested derivatives.
async function findAvailableCounter(
  baseName: string,
  activeFlags: string[]
): Promise<number | null> {
  if (!(await anyOutputExists(baseName, null, activeFlags))) {
    return null;
  }
  let counter = 2;
  while (await anyOutputExists(baseName, counter, activeFlags)) {
    counter++;
  }
  return counter;
}

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
    model: "gemini-2.5-flash",
    contents,
    config: { maxOutputTokens },
  });

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const cost = (outputTokens / 1_000_000) * 2.5;
  return { text: response.text, outputTokens, cost };
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
    model: "gemini-2.5-flash",
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
  const inputCost = (inputTokens / 1_000_000) * 1.0 * totalCalls;
  const maxOutputCost = ((maxOutputTokens * totalCalls) / 1_000_000) * 2.5;
  const maxTotalCost = inputCost + maxOutputCost;
  console.log(
    `Input tokens:      ${inputTokens.toLocaleString()} x ${totalCalls} call${totalCalls > 1 ? "s" : ""} (cost: $${inputCost.toFixed(4)})`
  );
  console.log(
    `Max output tokens: ${maxOutputTokens.toLocaleString()} x ${totalCalls} call${totalCalls > 1 ? "s" : ""} (cost: $${maxOutputCost.toFixed(4)})`
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
  const counter = await findAvailableCounter(baseName, activeFlags);

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
  const totalCost = inputCost + totalOutputCost + namingCost;
  console.log(
    `\nOutput tokens: ${totalOutputTokens.toLocaleString()} (cost: $${totalOutputCost.toFixed(4)})`
  );
  console.log(`Naming cost:   $${namingCost.toFixed(4)}`);
  console.log(`Total cost:    $${totalCost.toFixed(4)}`);

  process.exit(0);
}
