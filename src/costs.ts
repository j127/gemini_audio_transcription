// Centralized pricing constants and cost helpers for all Gemini models used
// by this CLI. Update these when Google changes their pricing.

export const TRANSCRIPTION_MODEL = "gemini-2.5-flash";
export const TRANSCRIPTION_INPUT_COST_PER_M = 1.0;
export const TRANSCRIPTION_OUTPUT_COST_PER_M = 2.5;

export const NAMING_MODEL = "gemini-2.5-flash-lite";
export const NAMING_INPUT_COST_PER_M = 0.1;
export const NAMING_OUTPUT_COST_PER_M = 0.4;

export function inputCost(tokens: number, costPerM: number): number {
  return (tokens / 1_000_000) * costPerM;
}

export function outputCost(tokens: number, costPerM: number): number {
  return (tokens / 1_000_000) * costPerM;
}
