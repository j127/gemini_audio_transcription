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

export const NAMING_MODEL = "gemini-2.0-flash-lite";
export const NAMING_INPUT_COST_PER_M = 0.075;
export const NAMING_OUTPUT_COST_PER_M = 0.3;

export async function generateFilename(
  ai: GoogleGenAI,
  transcription: string
): Promise<{ name: string; cost: number }> {
  const response = await ai.models.generateContent({
    model: NAMING_MODEL,
    contents: `Given this transcription, generate a short kebab-case description (2-5 words) suitable for a filename. Reply with ONLY the kebab-case string, nothing else.\n\n${transcription.slice(0, 500)}`,
    config: { maxOutputTokens: 32 },
  });

  const name = (response.text ?? "transcription").trim().replace(/[^a-z0-9-]/g, "");
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const cost =
    (inputTokens / 1_000_000) * NAMING_INPUT_COST_PER_M +
    (outputTokens / 1_000_000) * NAMING_OUTPUT_COST_PER_M;

  return { name: name || "transcription", cost };
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
