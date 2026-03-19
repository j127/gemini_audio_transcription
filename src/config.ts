// Small configuration helpers for reading and validating numeric environment
// variables used by the CLI.

export function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (isNaN(parsed)) {
    console.error(`Invalid ${name}: "${raw}" is not a number.`);
    process.exit(1);
  }
  return parsed;
}
