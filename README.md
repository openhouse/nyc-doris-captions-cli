# NYC Collections Browser

An offline-first research tool that ingests local or harvested records, normalises metadata into SQLite with FTS5, and serves an accessible Next.js interface for browsing NYC DORIS materials. We store metadata, transcripts, OCR, and provenance—never the remote media files themselves.

## TL;DR – harvest → ingest → browse

```bash
pnpm install
pnpm approve-builds better-sqlite3
pnpm harvest:preservica --seeds seeds/nycma-sample.txt --out data/harvest/preservica.jsonl
pnpm transcribe:remote --source data/harvest/preservica.jsonl --filter video --max 2 --concurrency 1
pnpm ingest --from-jsonl data/harvest/preservica+asr.jsonl
pnpm dev
```

Open http://localhost:3000 and you should see “Recently added” populated, search working, and item pages linking back to the NYC Municipal Archives for remote assets.

## What this app does

- **Harvest (HTML)** – a polite scraper for Preservica item URLs that respects `robots.txt`, caches HTML responses, throttles requests, captures thumbnails/durations when available, and normalises metadata (title, description, creators, subjects, collection, rights, advisory hints). Output lands in JSONL with deterministic IDs (SHA-256 of the canonical URL).
- **Ingest** – merges harvested JSONL (now supporting multiple `--from-jsonl` flags) and local source files into `data/collections.db` (SQLite + FTS5) and `data/items.jsonl`. JSONL lines are validated with Zod so malformed records fail fast with a helpful line number + field message.
- **Transcribe** – `pnpm transcribe:remote` streams remote Preservica audio/video through `ffmpeg`, runs Whisper (via `whisper.cpp`) to generate WebVTT/SRT captions plus plain-text transcripts, and writes updated JSONL alongside reusable caption files.
- **Browse** – a Next.js 14 UI that reads the SQLite database server-side. Remote-only items show a prominent “View on NYC Municipal Archives” button; empty catalogues emit actionable guidance instead of 500s.

## One-time setup

```bash
nvm use        # repo ships .nvmrc (Node 20)
pnpm install
pnpm approve-builds better-sqlite3
pnpm install   # re-run once the build is approved
```

The scripts will create `data/`, `data/harvest/`, `.cache/preservica/`, and `public/thumbnails/` as needed, but you can pre-create them if you prefer.

## Hello world (always works)

If you just want to boot the UI with an empty catalogue:

```bash
pnpm ingest   # creates data/collections.db with zero rows
pnpm dev
```

Browse/Search will show “No items yet—run `pnpm harvest:preservica …` then `pnpm ingest …`” rather than erroring.

## Harvest Preservica metadata (HTML)

```bash
pnpm harvest:preservica \
  --seeds seeds/nycma-sample.txt \
  --out data/harvest/preservica.jsonl \
  --concurrency 2 \
  --delay-ms 750 \
  --max 10
```

Highlights:

- Checks `/robots.txt` and exits early if the requested path is disallowed.
- Uses a descriptive user agent (`nyc-doris-captions-cli/0.2 (+mailto:archives-tech@records.nyc.gov)`).
- Caches HTML in `.cache/preservica/` (filename = SHA-256 of the URL) to avoid re-fetching during development.
- Normalises common field labels (`Creator`, `Contributors`, `Type of Resource`, `Duration`, etc.) into consistent fields.
- Extracts thumbnails from `og:image`/JSON-LD, parses duration hints (`HH:MM:SS`, ISO 8601, “3 minutes 20 seconds”), and logs each result as `{ status, title, url }`.
- Deterministic IDs: `sha256(canonicalUrl)` (first 32 hex chars stored in `id`).

Useful flags:

- `--seeds <file>` – newline-delimited Preservica item URLs (sample file lives in `seeds/`).
- `--out <file>` – JSONL destination (default `data/harvest/preservica.jsonl`).
- `--concurrency <n>` – concurrent page fetches (default `2`).
- `--delay-ms <ms>` – minimum spacing between requests (default `750`).
- `--max <n>` – process only the first `n` seeds (handy for smoke tests).
- `--help` – print full usage info.

The JSONL output is safe to commit locally but is ignored by git via `.gitignore`.

## Transcribe remote media (Whisper + ffmpeg)

```bash
pnpm transcribe:remote \
  --source data/harvest/preservica.jsonl \
  --filter video \
  --max 2 \
  --headers "Referer: https://nycrecords.access.preservica.com" \
  --concurrency 1
```

What happens:

- Streams audio only via `ffmpeg` (no media is retained on disk beyond a temporary WAV).
- Runs `whisper.cpp` using the configured model, emitting `data/captions/<id>.vtt` + `.srt` and updating the JSONL with `transcriptText`, `captionsVttPath`, and `captionsSrtPath`.
- Caches discovery HTML under `.cache/preservica/` so repeated runs avoid refetching pages.
- Maintains a resumable status log at `data/asr-status.json` so previously completed items are skipped automatically.
- Writes an enriched JSONL beside the source (default `<source>+asr.jsonl`, override with `--out`).

> Tip: set `WHISPER_CPP_BIN`/`WHISPER_MODEL` env vars or pass `--whisper-bin`/`--model` explicitly. A default user agent is supplied; add the Preservica referer header via `--headers` when required.

## Ingest data into SQLite

```bash
pnpm ingest --root 2025-10-18 --from-jsonl data/harvest/preservica.jsonl --from-jsonl data/harvest/preservica+asr.jsonl
```

Behaviour:

- Creates `data/collections.db` (SQLite + WAL) and `data/items.jsonl` snapshots.
- Merges local files (Markdown, text, PDF, images, audio, video) with harvested/enriched JSONL (last write wins by `id`).
- Generates thumbnails for local images via `sharp` and stores them in `public/thumbnails/`.
- Stores caption download paths (`captionsVttPath`, `captionsSrtPath`) and transcript text when provided by the JSONL.
- Validates JSONL records with Zod; failures report the offending line and field before any database work occurs.
- Drops + recreates tables today, but an `upsertItems(db, items)` helper exists for future partial updates.

CLI / environment knobs:

- `--root <dir>` or `COLLECTIONS_ROOT` (default `2025-10-18/`).
- `--from-jsonl <file>` to merge harvested items.
- `COLLECTIONS_DB_PATH` (default `data/collections.db`).
- `--help` prints usage.

## Generated artefacts

- `data/collections.db` – SQLite database consumed by the UI.
- `data/items.jsonl` – snapshot of every ingested record.
- `data/harvest/*.jsonl` – harvested metadata (ignored by git).
- `.cache/preservica/` – cached HTML responses from the harvester.
- `public/thumbnails/` – generated thumbnails for local images.

## Troubleshooting

| Issue | Fix |
| --- | --- |
| `Ignored build scripts: better-sqlite3` during install | Run `pnpm approve-builds better-sqlite3` followed by `pnpm install`. |
| `The better-sqlite3 native bindings could not be loaded` | Approve/reinstall as above, then re-run `pnpm ingest` to create the DB. |
| `No items yet` banner in the UI | Confirm `data/collections.db` exists. Run `pnpm harvest:preservica …` then `pnpm ingest --from-jsonl …`, or run `pnpm ingest` alone for an empty catalogue. |
| Ingest fails with “Invalid record at line …” | The JSONL did not match the schema. Fix the referenced line/field and rerun ingest. |

To inspect counts manually:

```bash
sqlite3 data/collections.db "select count(*) from items;"
```

## Architecture overview

- **Types** – `types/item.ts` defines the shared `ItemRecord`/`MediaType` contract used by ingest and UI queries.
- **Harvester** – `scripts/harvest-preservica.ts` handles robots checks, caching, metadata normalisation, thumbnail/duration extraction, and emits JSONL.
- **Ingest** – `scripts/ingest.ts` validates JSONL with Zod, walks local corpora, generates checksums/thumbnails, writes SQLite + JSONL snapshots, and exposes an `upsertItems` helper for future incremental updates.
- **Data access** – `lib/db.ts` and `lib/queries.ts` wrap `better-sqlite3`, auto-create the database directory, gracefully handle missing tables, and hydrate JSON columns (creators/subjects) into arrays.
- **UI** – `app/` uses Next.js App Router server components. Search results announce counts via ARIA live regions, remote items render external-link buttons with descriptive labels, and PDF previews include direct download fallbacks.

## Scripts at a glance

- `pnpm harvest:preservica --help` – HTML harvester CLI help.
- `pnpm transcribe:remote --help` – remote transcription CLI help.
- `pnpm ingest --help` – ingest CLI help/flags.
- `pnpm dev` – Next.js dev server.
- `pnpm build` / `pnpm start` – production build & serve.
- `pnpm test` – Vitest unit tests.
- `pnpm test:e2e` – Playwright smoke tests (stubbed).

Future work (see backlog): capture additional metadata (e.g., remote thumbnails, durations), hook up transcription once policy permits, and expand diagnostics.
