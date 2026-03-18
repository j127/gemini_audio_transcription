# gemini_audio_transcription

This is a rough script to transcribe audio files with Gemini via the API.

Feel free to make PRs.

## Caution

Be sure that you understand how the script works and the pricing before using it. The script will not update the pricing when Google changes the pricing so be sure to check the current pricing [here](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash).

## Feature Ideas

- Fetch pricing from the API when the script launches (or at least once per day).
- Save the transcription to a file.
- Optionally add timestamps to the transcription.
- Optionally add speaker identification (and other features) to the transcription.

## Usage

```bash
bun run src/index.ts <path_to_audio_file>
```

Example:

```bash
bun run src/index.ts ./audio_samples/2026-03-audio-test.m4a
```

## Setup

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run
```
