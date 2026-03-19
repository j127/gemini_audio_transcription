#!/usr/bin/env bun

import { setKey } from "./commands/set-key.ts";
import { transcribe } from "./commands/transcribe.ts";

const flags = new Set<string>();
let fileArg: string | undefined;

for (const arg of process.argv.slice(2)) {
  switch (arg) {
    case "-s":
    case "--summarize":
      flags.add("summarize");
      break;
    case "-f":
    case "--format":
      flags.add("format");
      break;
    case "-t":
    case "--timestamp":
      flags.add("timestamp");
      break;
    case "--set-key":
      await setKey();
      process.exit(0);
    default:
      if (arg.startsWith("-")) {
        console.error(`Unknown flag: ${arg}`);
        process.exit(1);
      }
      if (fileArg) {
        console.error(`Unexpected argument: ${arg}`);
        console.error("Only one audio file can be transcribed at a time.");
        process.exit(1);
      }
      fileArg = arg;
  }
}

if (!fileArg) {
  console.error("Usage: transcribe [flags] <audio-file>");
  console.error("       transcribe --set-key");
  console.error("");
  console.error("Flags:");
  console.error("  -s, --summarize   Generate a summary of the transcription");
  console.error("  -f, --format      Generate a formatted version with speaker labels");
  console.error("  -t, --timestamp   Generate a timestamped transcription");
  process.exit(1);
}

await transcribe(fileArg, flags);
