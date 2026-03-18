#!/usr/bin/env bun

import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const SERVICE = "gemini-transcribe";

function prompt(message: string): Promise<string> {
  process.stdout.write(message);
  return new Promise((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

async function getSecret(name: string, promptMessage: string): Promise<string> {
  let value = await Bun.secrets.get({ service: SERVICE, name });
  if (!value) {
    value = await prompt(promptMessage);
    if (!value) {
      console.error("No value provided. Aborting.");
      process.exit(1);
    }
    await Bun.secrets.set({ service: SERVICE, name, value });
    console.log(`Saved "${name}" to keychain.`);
  }
  return value;
}

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (isNaN(parsed)) {
    console.error(`Invalid ${name}: "${raw}" is not a number.`);
    process.exit(1);
  }
  return parsed;
}

// --set-key: manually set/update the API key
if (process.argv[2] === "--set-key") {
  const key = await prompt("Enter Gemini API key: ");
  if (!key) {
    console.error("No key provided.");
    process.exit(1);
  }
  await Bun.secrets.set({ service: SERVICE, name: "api-key", value: key });
  console.log("API key saved to keychain.");
  process.exit(0);
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: transcribe <audio-file>");
  console.error("       transcribe --set-key");
  process.exit(1);
}
const filePath: string = fileArg;

const mimeTypes: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wma": "audio/x-ms-wma",
  ".webm": "audio/webm",
};

const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
const mimeType = mimeTypes[ext];
if (!mimeType) {
  console.error(`Unsupported file extension: ${ext}`);
  console.error(`Supported: ${Object.keys(mimeTypes).join(", ")}`);
  process.exit(1);
}

async function waitForFileActive(
  ai: GoogleGenAI,
  fileName: string,
  maxWaitMs = 60_000
) {
  const start = Date.now();
  while (true) {
    const file = await ai.files.get({ name: fileName });
    if (file.state === "ACTIVE") return file;
    if (file.state === "FAILED") {
      throw new Error(`File processing failed: ${fileName}`);
    }
    if (Date.now() - start > maxWaitMs) {
      throw new Error(
        `Timed out waiting for file to become ACTIVE after ${maxWaitMs / 1000}s`
      );
    }
    console.log("Waiting for file to be processed...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  const apiKey = await getSecret("api-key", "Enter Gemini API key: ");
  const ai = new GoogleGenAI({ apiKey });

  console.log(`Uploading ${filePath}...`);
  const uploaded = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });

  const file = await waitForFileActive(ai, uploaded.name!);

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
  const inputCost = (inputTokens / 1_000_000) * 1.0; // $1.00/1M audio input tokens
  const maxOutputCost = (maxOutputTokens / 1_000_000) * 2.5; // $2.50/1M output tokens
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

  const answer = (await prompt("Proceed? [Y/n] ")).toLowerCase();
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
  const outputCost = (outputTokens / 1_000_000) * 2.5; // $2.50/1M output tokens
  const totalCost = inputCost + outputCost;
  console.log(
    `\nOutput tokens: ${outputTokens.toLocaleString()} (cost: $${outputCost.toFixed(4)})`
  );
  console.log(`Total cost: $${totalCost.toFixed(4)}`);

  process.exit(0);
}

await main();
