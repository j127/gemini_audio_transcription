# gemini_audio_transcription

This is a rough script to transcribe audio files with Gemini via the API.

Feel free to make PRs.

## <mark>Caution</mark>

Use this code at your own risk. Be sure that you understand how the script works and the pricing before using it. The script will not update the pricing when Google changes the pricing so be sure to check the current pricing [here](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash).

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

You'll need a [Gemini API key](https://aistudio.google.com/app/api-keys). The script will prompt you to enter the API on the first run. The API key gets saved with [Bun secrets](https://bun.com/docs/runtime/secrets).

If you need to delete the API key, run:

```bash
bun --eval "await Bun.secrets.delete({ service: 'gemini-transcribe', name: 'api-key' })
```
