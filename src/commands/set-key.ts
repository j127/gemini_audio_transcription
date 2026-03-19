// Command handler for explicitly setting or replacing the saved Gemini API key
// in the local keychain.

import { prompt, SERVICE } from "@/secrets.ts";

export async function setKey(): Promise<void> {
  const key = await prompt("Enter Gemini API key: ");
  if (!key) {
    console.error("No key provided.");
    process.exit(1);
  }
  await Bun.secrets.set({ service: SERVICE, name: "api-key", value: key });
  console.log("API key saved to keychain.");
  process.exit(0);
}
