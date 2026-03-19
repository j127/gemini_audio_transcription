// Shared keychain and prompt helpers for reading interactive input and storing
// the Gemini API key via Bun secrets.

export const SERVICE = "gemini-transcribe";

export function prompt(message: string): Promise<string> {
  process.stdout.write(message);
  return new Promise((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

export async function getSecret(
  name: string,
  promptMessage: string
): Promise<string> {
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
