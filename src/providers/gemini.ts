import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

export { createUserContent, createPartFromUri };

export const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wma": "audio/x-ms-wma",
  ".webm": "audio/webm",
};

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
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

export async function uploadFile(
  ai: GoogleGenAI,
  filePath: string,
  mimeType: string
) {
  console.log(`Uploading ${filePath}...`);
  const uploaded = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });
  return waitForFileActive(ai, uploaded.name!);
}
