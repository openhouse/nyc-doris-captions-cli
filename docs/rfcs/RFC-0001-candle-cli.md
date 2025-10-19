### Title

CANDLE — A local, open‑source CLI to generate accessible captions and searchable transcripts for NYC Municipal Archives AV assets, with packaging for archival ingest and a lightweight research UI

### Status

Draft (Request for Comments)

### Authors

- Jamie “Jamie” Burkart (project lead)
- Community collaborators (ASR, accessibility, archives)
- Advisors referenced in “Prior Art & Acknowledgments”

### Date

2025‑10‑19

---

### 1. Abstract

This RFC proposes **CANDLE**, a permissively licensed, fully local command‑line toolchain that:

1. **Discovers** AV assets (audio/video) approved for processing;
2. **Fetches** approved derivatives respectfully and rate‑limited;
3. **Transcribes** them on‑device (Apple Silicon/CPU) using Whisper‑family models;
4. **Produces** accessible **VTT/SRT** captions and a structured **JSON**/**SQLite** corpus with timestamps, per‑token confidences, and optional diarization;
5. **Indexes** for granular textual search (FTS5) and optional static/datasette UI;
6. **Packages** sidecar files and metadata (**Dublin Core + PREMIS**) into OAIS‑friendly bags and Preservica‑compatible ingest bundles;
7. **Supports reparative description** and harmful‑content flags;
8. **Maintains legal/ethical compliance** and institutional interoperability.

The primary beneficiaries are Deaf/Hard‑of‑Hearing users, researchers, and the New York City Department of Records & Information Services (DORIS). DORIS currently preserves and provides access to historical city records, operates Preservica in Azure with Dublin Core metadata, and runs DEIA and reparative description efforts—CANDLE is designed to fit that reality.

---

### 2. Motivation & Goals

**Motivation.** Many AV assets in NYC’s municipal collections lack captions/transcripts. Captioning advances equity (ADA/504/508), dramatically improves discoverability, and enriches scholarship.

**Goals.**

- Run **entirely offline** on commodity machines (e.g., macOS 15 on M2 Max with 96 GB RAM).
- Produce **accurate, time‑coded** captions and a **research‑grade transcript corpus**.
- Ship **clean metadata** that DORIS can ingest with minimal overhead (Dublin Core, PREMIS event logs, OAIS packages).
- Provide a **zero‑ops search** experience: a single SQLite database with FTS5 and an optional static/Datasette UI.
- Be **courteous and lawful** toward upstream systems (no scraping; approved API access and rate limits).
- Enable **reparative description** workflows (flag terms, allow community review lanes).

**Non‑Goals.**

- Replacing DORIS’s systems or policies.
- Guaranteeing perfect diarization or entity normalization.
- Hosting centralized services (default mode is local, air‑gapped capable).

---

### 3. Terminology

- **Asset**: An audio/video object and its metadata.
- **Sidecar**: Caption/transcript files stored alongside the asset.
- **OAIS / PREMIS / Dublin Core**: Archival frameworks and schemas for preservation and description.
- **Preservica XIP/BagIt**: Ingest packaging formats.
- **WER/CER**: Word/character error rates.
- **FTS5**: SQLite full‑text search extension.

---

### 4. Stakeholders

- **DORIS (NYC Municipal Archives)** — repository steward; ingestion and access; DEIA leadership.
- **Accessibility communities** — Deaf/Hard‑of‑Hearing users; screen‑reader users.
- **Researchers** — historians, journalists, community historians.
- **Developers/Contributors** — maintain the open‑source code and docs.
- **Public** — benefits from equitable access to public records.

---

### 5. Constraints & Environment

- **Host**: macOS 15.4.1, Apple M2 Max (38‑core GPU), 96 GB RAM; no NVIDIA CUDA.
- **Tooling**: Homebrew, `ffmpeg`, `whisper.cpp` (Metal), Python 3.11+/Node 20+ optional.
- **Institutional systems**: Preservica in Azure; Dublin Core; DEIA program; harmful content flagging; reading rooms at 31 Chambers & Industry City.

---

### 6. Architecture Overview

```
 ┌──────────────┐      ┌───────────┐      ┌──────────────┐
 │  Discoverer  ├─────►│  Fetcher  ├─────►│ Transcriber  │
 └─────┬────────┘      └────┬──────┘      └──────┬───────┘
       │ approved list        │ media (A/V)             │ segments, JSON, SRT/VTT
       ▼                      ▼                         ▼
 ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
 │  Indexer     ├─────►│  Exporter    ├─────►│ Packager (OAIS)  │
 └─────┬────────┘      └────┬─────────┘      └─────────┬────────┘
       │ SQLite/FTS5          │ files & UI              │ BagIt/XIP
       ▼                      ▼                         ▼
 ┌───────────────────────────────────────────────────────────────┐
 │         Optional static/Datasette UI for researcher use       │
 └───────────────────────────────────────────────────────────────┘
```

**Components.**

- **Discoverer**: Queries an approved source of truth (DORIS/Preservica export, CSV, or API endpoint provided by DORIS) to list _eligible_ assets with URIs and metadata. No scraping; robots and rate policies respected.
- **Fetcher**: Uses `ffmpeg` to download or pull _approved_ derivatives, extracting standardized audio (`wav`, 16 kHz mono) for ASR. Enforces rate limits (configurable) and retry/back‑off.
- **Transcriber**: Runs Whisper via `whisper.cpp` (Metal enabled). Emits segment‑level timestamps, per‑token timestamps/probabilities, and optional diarization (configurable; CPU/MPS‑only options).
- **Exporter**: Writes **.vtt**, **.srt**, **.json** (schema below), and **.sqlite** with FTS5 indices; optionally renders an accessible HTML transcript.
- **Indexer**: Builds a single SQLite database per corpus: `assets`, `segments`, `tokens`, `entities`, `flags`.
- **Packager**: Produces **BagIt** or **Preservica XIP** with Dublin Core descriptive metadata and PREMIS events (“transcription generated”, tool + model versions, checksums). Designed for ingest into DORIS’s environment.

---

### 7. Data & File Formats

**Sidecars produced per asset:**

- `assetid.vtt` (WebVTT, caption‑ready, includes non‑speech notation)
- `assetid.srt` (SubRip captions)
- `assetid.transcript.json` (see schema)
- `assetid.transcript.html` (accessible rendering; optional)
- Thumbnails or waveform JSON (optional, for UI)

**Transcript JSON (simplified):**

```json
{
  "asset_id": "preservica:UUID-or-local-id",
  "source": {
    "uri": "https://…/derivative.mp4",
    "duration_ms": 123456,
    "sha256": "…"
  },
  "asr": {
    "engine": "whisper.cpp",
    "model": "ggml-large-v3-q5_0",
    "language": "en",
    "timestamped_tokens": true,
    "diarization": "none|basic",
    "confidence_method": "token-logprob"
  },
  "segments": [
    {
      "start_ms": 1230,
      "end_ms": 5820,
      "speaker": "A",
      "text": "Good afternoon and welcome…",
      "tokens": [
        { "t": "Good", "start_ms": 1230, "end_ms": 1500, "p": -0.03 },
        { "t": "afternoon", "start_ms": 1500, "end_ms": 1850, "p": -0.2 }
      ],
      "non_speech": []
    }
  ],
  "flags": {
    "pii": false,
    "harmful_language": []
  }
}
```

**SQLite schema (high‑level):**

- `assets(id, title, date, uri, checksum, duration_ms, dc_json)`
- `segments(id, asset_id, start_ms, end_ms, speaker, text)`
- `tokens(id, segment_id, start_ms, end_ms, token, logprob)`
- `entities(id, asset_id, type, text, start_ms, end_ms)` // optional NER
- `flags(asset_id, pii, harmful_json)`
- **FTS5** virtual table on `segments(text)`

---

### 8. Metadata & Standards

- **Descriptive**: Dublin Core fields (title, creator, date, description, language).
- **Preservation**: PREMIS events (“transcription generated”), software agent (CANDLE + version), model hash, checksums (SHA‑256).
- **Packaging**: **BagIt** profile (manifest + tagmanifest) and/or **Preservica XIP** with linkage to existing entities/representations so sidecars can be associated to current assets.
- **DEIA & Harmful Content**: Flag offensive terms without altering originals; provide a reparative description notes file and a correction pathway for archivists and community contributors, aligning with DORIS’s DEIA initiatives and harmful content statement.

---

### 9. Accessibility Requirements

- Caption styling compatible with major players (line length, timing, no over‑segmentation).
- Include **non‑speech** (music, laughter, [applause]) and speaker changes.
- Provide **VTT** (preferred) and **SRT**; HTML transcript uses semantic markup (`<figure>`, `<time>`, `<ruby>` if needed).
- CLI must be screen‑reader friendly: no color‑only status; `--no-emoji`; deterministic, quiet modes; TTY detection.

---

### 10. Legal/Ethical Compliance

- **Consent & Access**: Process only assets DORIS authorizes. No scraping; respect robots.txt, TOS, and internal policies.
- **Rate‑limiting**: Default conservative limit (e.g., 1–3 concurrent fetches; 2–4 MB/s ceiling; configurable).
- **PII**: Offer _optional_ local redaction suggestions (phone, SSN) using deterministic regex + dictionary; do **not** auto‑redact outputs—surface to archivists for review.
- **Attribution**: Preserve provenance and do not obfuscate harmful content; instead, contextualize with flags and notes.

---

### 11. Implementation Plan

**Phase 0 — Institutional handshake**

- Obtain written approval, API endpoints/exports, and rate limits from DORIS.
- Secure example Preservica ingest profile or XIP sample (for validation).

**Phase 1 — Prototype (10–25 assets)**

- Build `discover` (CSV/JSON input), `fetch` (ffmpeg, rate limits), `transcribe` (`whisper.cpp` + Metal).
- Emit VTT/SRT/JSON; assemble a single `candle.sqlite`.
- Establish WER baseline from a small hand‑corrected set; log ASR model and flags.

**Phase 2 — Index & UI**

- FTS5 indexing with token confidences; optional NER pass (spaCy, on‑device).
- Generate an optional static search UI or `datasette publish` bundle (local only).

**Phase 3 — Packaging for ingest**

- Implement BagIt writer and a configurable Preservica XIP writer with Dublin Core and PREMIS. Validate with DORIS ingest tests.

**Phase 4 — Bulk run**

- Run jobs in batches with back‑pressure. Record PREMIS events and checksums.
- Produce per‑batch manifests and QA reports (duration processed, WER samples, file counts).

**Phase 5 — Handover & maintenance**

- Document everything; publish binaries and Homebrew formula.
- Establish contribution guide and issue templates for corrections/reparative description.

---

### 12. CLI Design

```
candle discover --from preservica-export.json --out queue.ndjson
candle fetch --queue queue.ndjson --audio wav16k --rate-limit 2
candle transcribe --model large-v3-q5_0 --lang auto --vad webrtc --out out/
candle export --formats vtt,srt,json,html --out out/
candle index --db candle.sqlite --from out/*.json --ner off
candle pack --profile bagit --out ingest/           # or --profile preservica-xip
candle ui --db candle.sqlite                        # optional local UI
```

**Config:** `candle.toml` holds endpoints, credentials (if any), rate limits, default models, and packaging profiles.

**Exit codes:** 0 (success), 10 (partial), 20 (fetch error), 30 (asr error), 40 (packaging error).

---

### 13. Evaluation & QA

- **Accuracy**: WER/CER on a gold subset (e.g., 60–120 minutes balanced by era/genre).
- **Timing**: Mean absolute error of segment boundaries vs. human review (±150 ms target).
- **Accessibility**: Human review of caption readability (characters/line, reading speed).
- **IR utility**: Precision@10/Recall@10 for test queries by archivists/researchers.
- **Performance**: Log wall‑clock per hour processed; memory usage.

---

### 14. Performance Notes (Apple Silicon)

- `whisper.cpp` with Metal performs well on Apple GPUs; choose quantized models to fit memory and speed targets.
- Chunk long recordings (e.g., 30–60 s windows with overlap) to maintain stability.
- MPS‑only diarization/alignment is optional and may be slower; make it opt‑in with a clear warning.

---

### 15. Security & Privacy

- All processing is local by default.
- No telemetry or hidden network calls.
- Secrets (if any) stored in OS keychain; never in repo.
- Checksums for every artifact; signed releases.

---

### 16. Open Questions

- Confirm Preservica ingest flavor (XIP profile details, relationships to existing entities).
- Preferred DC elements for sidecars (e.g., `dc:type=“Transcript”`, `dc:relation` pointing back).
- Institutional stance on diarization labels and speaker naming conventions.
- Public vs. internal availability for sensitive series.

---

### 17. Risks & Mitigations

- **Risk**: Overloading sources.
  **Mitigation**: Pre‑agreed batch exports and strict rate limits.

- **Risk**: Inaccurate ASR for mixed languages/noisy audio.
  **Mitigation**: Language detection, model fallback, and mark low‑confidence regions.

- **Risk**: Packaging mismatch.
  **Mitigation**: Validate against a DORIS‑provided sample before bulk operations.

- **Risk**: Harmful content exposure without context.
  **Mitigation**: Flagging pipeline + reparative notes and clear disclaimers.

---

### 18. Sustainability & Licensing

- **License**: Apache‑2.0 (permissive, institutional‑friendly).
- **Reproducibility**: `justfile` or Makefile for builds; lockfiles for Python/Node extras.
- **Docs**: Task‑oriented guides and an accessibility style sheet.

---

### 19. Prior Art & Acknowledgments

- **Whisper & whisper.cpp** (local ASR on Apple Silicon).
- **SQLite + FTS5** for durable, portable search.
- **Datasette** for instant, no‑ops browsing.
- **DORIS practice**: Preservica OAIS, Dublin Core, DEIA & harmful content statement, and public‑facing access ethos, all of which this RFC is designed to complement.

---

### 20. Appendix A — Sample Packaging (BagIt)

```
bagit.txt
manifest-sha256.txt
data/
  assetid.vtt
  assetid.srt
  assetid.transcript.json
  assetid.premis.xml
  assetid.dc.xml
tagmanifest-sha256.txt
bag-info.txt  (Source-Organization: DORIS; External-Description: Transcript sidecars…)
```

**PREMIS event excerpt (illustrative):**

```xml
<premis:event>
  <premis:eventType>transcription</premis:eventType>
  <premis:eventDateTime>2025-10-19T12:00:00Z</premis:eventDateTime>
  <premis:eventDetail>ASR via whisper.cpp ggml-large-v3-q5_0</premis:eventDetail>
  <premis:linkingAgentIdentifier>candle-cli v0.1.0</premis:linkingAgentIdentifier>
</premis:event>
```

---

### 21. Appendix B — Developer Setup (macOS)

```bash
# Prereqs
brew install ffmpeg sqlite ripgrep
# Build whisper.cpp (Metal)
git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp
mkdir build && cd build && cmake -DGGML_METAL=ON .. && make -j
# (CANDLE binary build steps will be documented similarly)
```

---

### 22. Appendix C — Captioning Style (excerpt)

- 32–42 chars/line; max 2 lines; 140–180 wpm.
- Break on syntactic boundaries.
- Use [music], [laughter], [applause], [indistinct].
- Use “Speaker A/B/…”. Real names only when verified by archivists.
- Respect original language; avoid editorializing inside captions.

---

### 23. Appendix D — Reparative Description Hooks

- `flags.harmful_language` array populated by lexicon pass.
- `notes/reparative.yml` per asset for archivist review (community‑sourced suggestions can merge through PRs/issues).

---

### 24. Decision

Proceed with Phase 0 (institutional handshake) and Phase 1 (prototype on a small, approved set) using the architecture above. This path creates immediate accessibility benefits, unlocks search, and generates archival‑ready sidecars that align with DORIS’s preservation environment and description standards.

---

#### Citations to institutional context

- DORIS operates Preservica (OAIS), uses Dublin Core, runs DEIA/reparative description and harmful content guidance, and provides public reference services—see the ARB reports and blog excerpts embedded in the provided project overview.
