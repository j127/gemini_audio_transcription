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

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: bun run src/index.ts <audio-file>");
  console.error("       bun run src/index.ts --set-key");
  process.exit(1);
}

const mimeTypes: Record<string, string> = {
  ".mp3": "audio/mp3",
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

async function main() {
  const apiKey = await getSecret("api-key", "Enter Gemini API key: ");
  const ai = new GoogleGenAI({ apiKey });

  console.log(`Uploading ${filePath}...`);
  const uploaded = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });

  const contents = createUserContent([
    createPartFromUri(uploaded.uri!, uploaded.mimeType!),
    "Generate a plain text transcription of this audio.",
  ]);

  const tokenCount = await ai.models.countTokens({
    model: "gemini-2.0-flash",
    contents,
  });

  const inputTokens = tokenCount.totalTokens!;
  const inputCost = (inputTokens / 1_000_000) * 0.7;
  console.log(
    `Input tokens: ${inputTokens.toLocaleString()} (estimated cost: $${inputCost.toFixed(4)})`,
  );
  console.log(
    "Note: output tokens will add ~$0.40/1M tokens on top of this.",
  );

  const maxCost = parseFloat(process.env.MAX_COST ?? "0.50");
  if (inputCost > maxCost) {
    console.error(
      `Aborting: estimated input cost $${inputCost.toFixed(4)} exceeds MAX_COST $${maxCost.toFixed(2)}`,
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
    model: "gemini-2.0-flash",
    contents,
  });

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  console.log(response.text);
}

await main();
