// Output file naming and collision avoidance. All transcription artifacts
// (base transcript, summaries, formatted versions, etc.) are written through
// these helpers so filenames stay coordinated across a single run.

import path from "path";

export const OUTPUT_DIR = path.join(import.meta.dir, "../output");

export interface FlagConfig {
  suffix: string;
  ext: string;
  prompt: string;
}

export function buildOutputPath(
  baseName: string,
  suffix: string | null,
  counter: number | null,
  ext: string
): string {
  const suffixPart = suffix ? `_${suffix}` : "";
  const counterPart = counter ? `--${counter}` : "";
  return path.join(OUTPUT_DIR, `${baseName}${suffixPart}${counterPart}${ext}`);
}

// Counter selection has to consider every file this run may emit, not just the
// base transcript. Otherwise a leftover derived file could be overwritten if
// the matching `.txt` was deleted manually.
async function anyOutputExists(
  baseName: string,
  counter: number | null,
  flagConfigs: FlagConfig[]
): Promise<boolean> {
  if (
    await Bun.file(buildOutputPath(baseName, null, counter, ".txt")).exists()
  ) {
    return true;
  }
  for (const config of flagConfigs) {
    if (
      await Bun.file(
        buildOutputPath(baseName, config.suffix, counter, config.ext)
      ).exists()
    ) {
      return true;
    }
  }
  return false;
}

// One transcription run should produce a matched set of filenames, so the same
// counter is reused across the base transcript and all requested derivatives.
export async function findAvailableCounter(
  baseName: string,
  flagConfigs: FlagConfig[]
): Promise<number | null> {
  if (!(await anyOutputExists(baseName, null, flagConfigs))) {
    return null;
  }
  let counter = 2;
  while (await anyOutputExists(baseName, counter, flagConfigs)) {
    counter++;
  }
  return counter;
}
