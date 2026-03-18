# gemini_audio_transcription

Small Bun CLI for transcribing local audio files with the Gemini API.

It uploads an audio file, waits for Gemini to finish processing it, estimates the cost before generation, asks for confirmation, then prints a plain-text transcript to stdout.

<mark><strong>Caution:</strong></mark> use this code at your own risk. Be sure that you understand how the script works and the pricing before using it.

## What this does

- Transcribes a local audio file with `gemini-2.5-flash`
- Estimates input and maximum output cost before sending the transcription request
- Prompts for confirmation before continuing
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

## Quick start

Install [Bun](https://bun.com/docs/installation).

Install dependencies:

```bash
bun install
```

Run the script with an audio file:

```bash
bun run src/index.ts ./audio_samples/2026-03-audio-test.m4a
```

On first run, the script will prompt for your Gemini API key and save it to the keychain.

## Typical flow

1. The script uploads your audio file to Gemini.
2. It waits until Gemini marks the file as ready.
3. It counts tokens and estimates the maximum cost.
4. It asks `Proceed? [Y/n]`.
5. It prints the transcript and final token usage.

## Commands

Transcribe a file:

```bash
bun run src/index.ts <audio-file>
```

Set or replace the saved API key manually:

```bash
bun run src/index.ts --set-key
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
MAX_COST=0.10 MAX_OUTPUT_TOKENS=4096 bun run src/index.ts ./audio_samples/2026-03-audio-test.m4a
```

## Cost and safety notes

- Pricing in the script is hardcoded for `gemini-2.5-flash`
- If Google changes pricing, the estimate in this repo can become inaccurate
- Check current pricing here: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash)
- The script stops before generation if the estimated maximum cost is greater than `MAX_COST`
- Audio is uploaded to the Gemini Files API as part of the transcription flow

## Current limitations

- Transcript output is printed to stdout only
- No timestamps
- No speaker diarization
- No automatic pricing refresh
- No batch processing

## Development notes

- Entry point: `src/index.ts`
- Formatting: `bun run format`

## Future improvements

- Save transcripts to a file
- Add timestamps
- Add speaker identification
- Fetch pricing dynamically instead of hardcoding it
- Support batch runs over a directory
