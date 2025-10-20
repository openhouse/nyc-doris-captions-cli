# NYC Collections Browser

An offline-first research tool that ingests the local `2025-10-18/` corpus, normalises metadata into SQLite with FTS5,
then serves an accessible Next.js 14 interface for browsing, searching, and reviewing NYC DORIS archival materials.

## Prerequisites

- Node.js 18+
- pnpm 8+
- SQLite with FTS5 support (bundled with modern SQLite)

## Quick start

```bash
pnpm install
pnpm ingest
pnpm dev
```

The ingest step writes `data/collections.db` and `data/items.jsonl`. The development server uses that SQLite database for
all pages.

## Available scripts

- `pnpm ingest` — walk `2025-10-18/`, extract metadata and text, create thumbnails, and build the SQLite + JSONL dataset.
- `pnpm dev` — start the Next.js dev server.
- `pnpm build` / `pnpm start` — production build and start.
- `pnpm test` — run Vitest unit tests for the ingest pipeline.
- `pnpm test:e2e` — Playwright smoke tests (stubbed, add credentials as needed).
- `pnpm tsx scripts/fetch-preservica.ts --config preservica.config.json` — harvest Preservica metadata into Markdown stubs
  under `2025-10-18/preservica/`.

## Preservica metadata adapter

The `scripts/fetch-preservica.ts` CLI creates front-matter stubs that mirror the ingest folder layout. Configure the adapter
with a JSON file (see `preservica.config.example.json`) and optional YAML seed list (`seed.example.yml`).

1. Copy the sample files:

   ```bash
   cp preservica.config.example.json preservica.config.json
   cp seed.example.yml seed.yml
   ```

2. Edit `preservica.config.json`:

   - `mode`: `api`, `seed`, or `placeholder`.
   - `clientId` / `clientSecret`: required only for `api` mode.
   - `seedPath`: path to `seed.yml` entries used by `seed` and `placeholder` modes.
   - `requestsPerSecond`: polite throttle for API/HTML requests.

3. Populate `seed.yml` with the Preservica URLs or placeholder records you want to ingest.

4. Run the harvester:

   ```bash
   pnpm tsx scripts/fetch-preservica.ts --config preservica.config.json
   ```

5. Run the existing ingest step to refresh SQLite/JSONL outputs:

   ```bash
   pnpm ingest
   ```

Seed mode fetches live HTML (respecting the configured rate limit); placeholder mode writes static records for offline demos.
API mode scaffolds requests for Preservica's Content API when credentials are available.

## Testing

Vitest tests exercise the ingest script against fixtures in `tests/fixtures/`. They verify metadata heuristics, adjacent
transcript detection, and the end-to-end database build.

## Architecture overview

- **Ingest (`scripts/ingest.ts`)** parses Markdown, plain text, PDFs, and AV metadata, computing SHA-256 checksums and
  writing FTS5-backed SQLite tables plus JSONL snapshots.
- **Data access (`lib/*.ts`)** provides typed helpers for fetching recent items, executing searches, and resolving
  collection metadata.
- **UI (`app/`)** is a Next.js App Router site using server components for data fetching, accessible forms, skip links,
  ARIA live regions, and advisory banners.

## Definition of done checkpoints

- FY23–24 ARB PDF renders inline with download link when present in the corpus.
- Lunch & Learn transcript, Spreaker episode, and other transcripts surface as text/audio with provenance.
- Search leverages SQLite FTS5 with highlight snippets, filters, and sort order.
- Report form posts to `/api/report` and logs payloads server-side for triage.
- README includes these instructions and guidance for future iterators.

## Screenshots

Add screenshots after running the app locally once ingestion populates real data.
