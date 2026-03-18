import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({});

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: bun run src/index.ts <audio-file>");
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
  console.log(`Uploading ${filePath}...`);
  const uploaded = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });

  console.log("Transcribing...");

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: createUserContent([
      createPartFromUri(uploaded.uri!, uploaded.mimeType!),
      "Generate a plain text transcription of this audio.",
    ]),
  });

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  console.log(response.text);
}

await main();
