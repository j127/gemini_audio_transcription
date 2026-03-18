#!/usr/bin/env bun

import { setKey } from "./commands/set-key.ts";
import { transcribe } from "./commands/transcribe.ts";

const arg = process.argv[2];

if (arg === "--set-key") {
  await setKey();
} else if (!arg) {
  console.error("Usage: transcribe <audio-file>");
  console.error("       transcribe --set-key");
  process.exit(1);
} else {
  await transcribe(arg);
}
