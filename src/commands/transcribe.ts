import { getSecret, prompt } from "../secrets.ts";
import { parseEnvNumber } from "../config.ts";
import path from "path";
import {
  MIME_TYPES,
  createGeminiClient,
  uploadFile,
  generateFilename,
  createUserContent,
  createPartFromUri,
  NAMING_MODEL,
  NAMING_INPUT_COST_PER_M,
  NAMING_OUTPUT_COST_PER_M,
} from "../providers/gemini.ts";

const OUTPUT_DIR = path.join(import.meta.dir, "../../output");

export async function transcribe(filePath: string): Promise<void> {
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

  const inputTokens = tokenCount.totalTokens!;
  const inputCost = (inputTokens / 1_000_000) * 1.0;
  const maxOutputCost = (maxOutputTokens / 1_000_000) * 2.5;
  const maxTotalCost = inputCost + maxOutputCost;
  console.log(
    `Input tokens:      ${inputTokens.toLocaleString()} (cost: $${inputCost.toFixed(4)})`
  );
  console.log(
    `Max output tokens: ${maxOutputTokens.toLocaleString()} (cost: $${maxOutputCost.toFixed(4)})`
  );
  console.log(`Max total cost:    $${maxTotalCost.toFixed(4)}`);
  console.log(
    `Naming request:    ${NAMING_MODEL} (< $0.0001)`
  );

  if (maxTotalCost > maxCost) {
    console.error(
      `Aborting: estimated max cost $${maxTotalCost.toFixed(4)} exceeds MAX_COST $${maxCost.toFixed(2)}`
    );
    process.exit(1);
  }

  console.log(`\nSettings (override via environment variables):`);
  console.log(`  MAX_OUTPUT_TOKENS:\t${maxOutputTokens}`);
  console.log(`  MAX_COST:\t\t${maxCost}`);

  const answer = (await prompt("\nProceed? [Y/n] ")).toLowerCase();
  if (answer && answer !== "y" && answer !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  console.log("Transcribing...");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: { maxOutputTokens },
  });

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  console.log(response.text);

  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const outputCost = (outputTokens / 1_000_000) * 2.5;

  console.log("\nGenerating filename...");
  const { name: description, cost: namingCost } = await generateFilename(
    ai,
    response.text
  );

  const date = new Date().toISOString().slice(0, 10);
  const baseName = `${date}-${description}`;
  let outputPath = path.join(OUTPUT_DIR, `${baseName}.txt`);
  let counter = 2;
  while (await Bun.file(outputPath).exists()) {
    outputPath = path.join(OUTPUT_DIR, `${baseName}--${counter}.txt`);
    counter++;
  }
  await Bun.write(outputPath, response.text);
  console.log(`Saved to ${outputPath}`);

  const totalCost = inputCost + outputCost + namingCost;
  console.log(
    `\nOutput tokens: ${outputTokens.toLocaleString()} (cost: $${outputCost.toFixed(4)})`
  );
  console.log(`Naming cost:   $${namingCost.toFixed(4)}`);
  console.log(`Total cost:    $${totalCost.toFixed(4)}`);

  process.exit(0);
}
