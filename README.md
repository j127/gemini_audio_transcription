# gemini_audio_transcription

This is a simple [Bun](https://bun.sh/) (TypeScript) CLI for transcribing and summarizing local audio files with the Gemini API. Installing it will create a `transcribe` command that you can use from anywhere in your terminal.

<mark><strong>CAUTION:</strong></mark> Use this code at your own risk. Be sure that you understand how this script works and that you double-check Google's API pricing before using it (see below).

## What this does

- Transcribes a local audio file with `gemini-2.5-flash`
- Estimates input and maximum output cost before sending the transcription request
- Prompts for confirmation before continuing
- Saves the transcript to `output/` with an auto-generated descriptive filename
- Can also generate a summary, a formatted Markdown transcript, and a timestamped transcript
- Stores your Gemini API key in the system keychain via [Bun secrets](https://bun.com/docs/runtime/secrets)

## Before you start

- Bun -- see the `.bun-version` file for the exact version that was used while developing the script
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

Generate extra outputs alongside the plain-text transcript:

```bash
transcribe --summarize --format --timestamp my_spoken_notes.mp3

# or shorthand:
transcribe -s -f -t my_spoken_notes.mp3
```

On first run, the script will prompt for your Gemini API key and save it to the keychain.

## Typical flow

1. The script uploads your audio file to Gemini.
2. It waits until Gemini marks the file as ready.
3. It counts tokens and estimates the maximum cost.
4. It shows current settings (`MAX_OUTPUT_TOKENS`, `MAX_COST`) and asks `Proceed? [Y/n]`.
5. It prints the plain-text transcript and saves it to `output/YYYY-MM-DD-<description>.txt`.
6. If you requested extra outputs, it saves those with matching filenames such as `output/YYYY-MM-DD-<description>_summary.md`.
7. It uses `gemini-2.5-flash-lite` to generate the descriptive filename.
8. It prints the final token usage and cost breakdown.

## Commands

Transcribe a file:

```bash
transcribe <audio-file>
```

Transcribe a file and request additional outputs:

```bash
transcribe [flags] <audio-file>
```

Available flags:

- `-s`, `--summarize`: generate a concise Markdown summary
- `-f`, `--format`: generate a cleaned-up Markdown transcript with speaker labels when inferable
- `-t`, `--timestamp`: generate a timestamped plain-text transcript

Flags can be combined in a single run:

```bash
transcribe --summarize --format meeting.m4a
transcribe -s -t interview.wav
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
| `MAX_OUTPUT_TOKENS` | `8192`  | Caps the response size for each generated output                      |
| `MAX_COST`          | `0.5`   | Aborts if the estimated maximum total cost exceeds this amount in USD |

Example:

```bash
MAX_COST=0.10 MAX_OUTPUT_TOKENS=4096 transcribe ./audio_samples/2026-03-audio-test.m4a
```

If you request extra outputs with flags, the cost estimate scales up to include the additional Gemini calls before asking for confirmation.

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

- Speaker labels are inferred by the model and are not true diarization
- Timestamps are model-generated and may not align exactly with the source audio
- No automatic pricing refresh
- No batch processing; only one audio file can be transcribed at a time

## Development notes

- Entry point: `src/index.ts`
- Formatting: `bun run format`

## Future improvements

- Improve speaker identification
- Fetch pricing dynamically instead of hardcoding it
- Support batch runs over a directory
