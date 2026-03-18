import { getSecret, prompt } from "../secrets.ts";
import { parseEnvNumber } from "../config.ts";
import {
  MIME_TYPES,
  createGeminiClient,
  uploadFile,
  createUserContent,
  createPartFromUri,
} from "../providers/gemini.ts";

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
  const totalCost = inputCost + outputCost;
  console.log(
    `\nOutput tokens: ${outputTokens.toLocaleString()} (cost: $${outputCost.toFixed(4)})`
  );
  console.log(`Total cost: $${totalCost.toFixed(4)}`);

  process.exit(0);
}
