#!/usr/bin/env tsx
/**
 * Placeholder for future remote transcription workflow.
 *
 * Planned responsibilities:
 *  - Read harvested items (JSONL or SQLite) where mediaType is audio/video.
 *  - Stream remote media via ffmpeg into a temporary file.
 *  - Run ASR (Whisper or similar) to produce transcripts and timestamps.
 *  - Persist transcript text back to SQLite/JSONL and clean up temporary media.
 *  - TODO: Gate execution behind explicit flags/allowlists and ensure temporary media is deleted after each run.
 *  - TODO: Capture ffmpeg/ASR failures with actionable logging for operators.
 */
import { fileURLToPath } from 'node:url';

async function main() {
  console.log('transcribe-remote is not implemented yet. This placeholder documents the intended workflow.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
