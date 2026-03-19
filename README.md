# gemini_audio_transcription

Small Bun CLI for transcribing local audio files with the Gemini API.

It uploads an audio file, waits for Gemini to finish processing it, estimates the cost before generation, asks for confirmation, then saves a plain-text transcript to the `output/` directory.

<mark><strong>Caution:</strong></mark> use this code at your own risk. Be sure that you understand how the script works and the pricing before using it.

## What this does

- Transcribes a local audio file with `gemini-2.5-flash`
- Estimates input and maximum output cost before sending the transcription request
- Prompts for confirmation before continuing
- Saves the transcript to `output/` with an auto-generated descriptive filename
- Stores your Gemini API key in the system keychain via [Bun secrets](https://bun.com/docs/runtime/secrets)

## Before you start

- Bun `1.3.11` or compatible
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/api-keys)
- One local audio file in a supported format

Supported file types:

- `.mp3`
- `.wav`
- `.flac`
- `.ogg`
- `.m4a`
- `.aac`
- `.wma`
- `.webm`

## Installation

Install [Bun](https://bun.com/docs/installation).

Install dependencies and link the package globally:

```bash
bun install
bun link
```

> **Note:** `bun link` creates a symlink to this directory. If you pull a latest version from GitHub, you do not need to run `bun link` again. The `transcribe` command will automatically use the latest code in this directory.

## Quick start

Run the script with an audio file:

```bash
transcribe my_spoken_notes.mp3
```

On first run, the script will prompt for your Gemini API key and save it to the keychain.

## Typical flow

1. The script uploads your audio file to Gemini.
2. It waits until Gemini marks the file as ready.
3. It counts tokens and estimates the maximum cost.
4. It shows current settings (`MAX_OUTPUT_TOKENS`, `MAX_COST`) and asks `Proceed? [Y/n]`.
5. It prints the transcript and saves it to `output/YYYY-MM-DD-<description>.txt`.
6. It uses `gemini-2.5-flash-lite` to generate the descriptive filename.
7. It prints the final token usage and cost breakdown.

## Commands

Transcribe a file:

```bash
transcribe <audio-file>
```

Set or replace the saved API key manually:

```bash
transcribe --set-key
```

Delete the saved API key:

```bash
bun --eval "await Bun.secrets.delete({ service: 'gemini-transcribe', name: 'api-key' })"
```

## Configuration

The script reads these optional environment variables:

| Variable            | Default | Purpose                                                               |
| ------------------- | ------- | --------------------------------------------------------------------- |
| `MAX_OUTPUT_TOKENS` | `8192`  | Caps the transcription response size                                  |
| `MAX_COST`          | `0.5`   | Aborts if the estimated maximum total cost exceeds this amount in USD |

Example:

```bash
MAX_COST=0.10 MAX_OUTPUT_TOKENS=4096 transcribe ./audio_samples/2026-03-audio-test.m4a
```

## Cost and safety notes

- Pricing in the script is hardcoded for `gemini-2.5-flash` (transcription) and `gemini-2.5-flash-lite` (filename generation)
- If Google changes pricing, the estimates in this repo can become inaccurate
- Check current pricing here: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- The script stops before generation if the estimated maximum cost is greater than `MAX_COST`
- Audio is uploaded to the Gemini Files API as part of the transcription flow

You might also want to take a look at these sections from Google's billing documentation:

- https://ai.google.dev/gemini-api/docs/billing#about-billing
- https://ai.google.dev/gemini-api/docs/billing#project-spend-caps

## Current limitations

- No timestamps
- No speaker diarization
- No automatic pricing refresh
- No batch processing

## Development notes

- Entry point: `src/index.ts`
- Formatting: `bun run format`

## Future improvements

- Add timestamps
- Add speaker identification
- Fetch pricing dynamically instead of hardcoding it
- Support batch runs over a directory
