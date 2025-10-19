# RFC-0001: Local, Open-Source Transcription & Search for NYCMA Preservica AV Assets

**Authors:** James “Jamie” Burkart
**Status:** Draft for community review  
**Audience:** Engineers, archivists, accessibility advocates, researchers, NYCMA/DORIS staff  
**Created:** 2025‑10‑19  
**Reference Environment:** macOS 15.4.1 (Sequoia) on Apple M2 Max (38‑core GPU), 96 GB RAM; Metal 3; `ffmpeg` installed.

---

## 0. Executive Summary

We propose an open‑source, **local‑first** command‑line toolchain that:

1. **Discovers** publicly accessible NYC Department of Records & Information Services (DORIS) **Preservica** AV assets.
2. **Fetches** lawful derivatives/proxies (per robots/terms), normalizes audio, and **transcribes** speech entirely offline using **Whisper** models (via `whisper.cpp` with Metal acceleration).
3. **Produces** standards‑compliant **closed captions** (WebVTT/SRT) and rich **JSON** transcripts (segments, timestamps, confidence, optional speaker labels).
4. **Indexes** everything into a portable **SQLite** database with FTS5 for **granular full‑text search**, and ships a minimal read‑only web UI (or **Datasette**) for browsing and citation.
5. **Packages** sidecars and **Dublin Core** mappings for **ingest into Preservica** as related derivatives—so DORIS can adopt or import at will.

This supports **accessibility** (captioning for hearing‑impaired users) and **research** (time‑coded full‑text search across recordings), while aligning with DORIS’s digital preservation stack (Preservica on Azure, OAIS; DC metadata; DEIA/harmful‑content work). :contentReference[oaicite:2]{index=2}

---

## 1. Background & Rationale

- **Institutional context.** NYCMA/DORIS manages large, multi‑format collections (including significant AV: WNYC radio/TV, nitrate reformats, etc.), runs Preservica in Azure with OAIS framing, and has been remediating metadata to **Dublin Core**. The agency has also launched DEIA initiatives and a **harmful content statement** with a public reporting loop. Our outputs should align to these practices and be adoptable. :contentReference[oaicite:3]{index=3}
- **User needs.**
  - **Accessibility:** Closed captions and transcripts for hearing‑impaired New Yorkers and global audiences.
  - **Discovery:** Search inside content to surface specific moments, names, topics, and places.
  - **Provenance:** Retain original context, identifiers, and rights information; do not “orphan” content.
- **Local‑first design.** All ASR runs offline on Apple Silicon using quantized Whisper models (no cloud calls). This reduces costs, protects privacy, and works in constrained environments.

---

## 2. Goals & Non‑Goals

**Goals**

- Accurate, timecoded transcripts and captions for publicly accessible AV assets.
- Simple setup on macOS (Apple Silicon), with reproducible pipelines.
- Durable artifacts: WebVTT/SRT, JSON, and a single **SQLite** database with FTS.
- Clean **Dublin Core** mappings and ingest‑ready sidecars for Preservica.
- Built‑in feedback loop: allow users to flag errors/harmful terms and submit corrections for curator review.

**Non‑Goals**

- Rehosting full audiovisual assets outside DORIS policy.
- Bypassing access controls or terms of use.
- Defining new institutional policy; we align to NYCMA/DORIS.

---

## 3. Reference System & Constraints

- **OS/Arch:** `Darwin 24.4.0` (macOS 15.4.1) on Apple M2 Max; x86_64 userspace reported by uname; ARM64 chip; Metal 3 GPU available.
- **RAM:** 96 GB LPDDR5 (ample for quantized large‑v3).
- **GPU:** Apple GPU (no CUDA); use **Metal** kernels via `whisper.cpp`.
- **Utilities:** `ffmpeg` required; optional PyTorch (MPS) only if advanced alignment/diarization enabled.

---

## 4. Architecture Overview

```

discover ─▶ fetch ─▶ prepare ─▶ transcribe ─▶ align/diarize? ─▶ package ─▶ index ─▶ serve/export

```

- **discover:** Enumerate candidate AV assets via Preservica’s public search endpoints or sitemaps; respect robots and rate limits.
- **fetch:** Retrieve permissible audio/video derivatives (or stream‑capture) with provenance fields (object identifier, title, creator, date, rights).
- **prepare:** Normalize with `ffmpeg` (mono, 16kHz PCM), chunk via VAD (Silero/WebRTC VAD).
- **transcribe:** `whisper.cpp` (Metal) using GGUF models; output JSON segments with word timestamps.
- **align/diarize (optional):** Enable `whisperX` alignment and `pyannote` diarization (local, MPS) if users opt‑in.
- **package:** Emit **WebVTT** (captions), **SRT**, and **segments.jsonl**; generate **Dublin Core** sidecar for ingest.
- **index:** Store into **SQLite** with FTS5 (documents, segments, timecodes, metadata).
- **serve/export:** Minimal read‑only web UI, or **Datasette** attached to the DB; export CSV/NDJSON and Preservica bundles.

---

## 5. Data Model (SQLite)

**Tables (suggested):**

- `objects(id TEXT PRIMARY KEY, source_url, title, creator, date, coverage, language, rights, collection, dc_json, duration_s, has_captions BOOL, created_at)`
- `segments(id INTEGER PRIMARY KEY, object_id TEXT, start_ms INT, end_ms INT, text TEXT, confidence REAL, speaker TEXT NULL, FOREIGN KEY(object_id) REFERENCES objects(id))`
- `files(object_id TEXT, kind TEXT, path TEXT, sha256 TEXT, bytes INT)` — `kind ∈ {audio, vtt, srt, json, dc_xml}`
- `flags(id INTEGER, object_id TEXT, kind TEXT, payload JSON, created_at, status TEXT)` — corrections/harm notices.

Enable **FTS5** virtual table over `segments(text)` with porter stemming; store unaccented forms for recall.

---

## 6. File Outputs

- **Captions:** `OBJECTID.en.vtt`, `OBJECTID.en.srt` (UTF‑8; compliance with WebVTT/SRT)
- **Transcript JSON:** `OBJECTID.segments.jsonl` (one segment per line; fields: `start`, `end`, `text`, `confidence`, `speaker?`)
- **Dublin Core sidecar:** `OBJECTID.dc.xml` or `OBJECTID.dc.json`  
  Minimum DC mappings:

  - `dc:title`, `dc:creator`, `dc:date`, `dc:language` (`en`), `dc:rights`, `dc:coverage`,
  - `dc:description` → plain‑text transcript abstract,
  - `dcterms:hasPart` → links to `vtt`/`srt`/`segments.jsonl`,
  - `dcterms:source` → Preservica object URI,
  - `dcterms:provenance` → tool version & hash.  
    (Aligns with DORIS Dublin Core practice in Preservica.) :contentReference[oaicite:4]{index=4}

- **Preservica package manifest** (optional): minimal CSV/JSON mapping object IDs to derivative files for bulk ingest.

---

## 7. CLI Specification

**Binary name:** `civic-asr` (placeholder)

**Subcommands**

- `discover`  
  Scan Preservica access endpoints/sitemaps; write `objects.ndjson` with `id`, `source_url`, `title`, etc.  
  Options: `--query`, `--since`, `--max`, `--robots`, `--out`.
- `fetch`  
  Download or capture playable audio; emit normalized WAV; write `files` rows.  
  Options: `--id`, `--concurrency`, `--rate-limit`, `--cache-dir`.
- `transcribe`  
  Run offline ASR on prepared WAVs.  
  Options: `--model {base.en,small,large-v3}`, `--quant {q5_0,q5_1,q8_0}`, `--vad {webrtc,silero,off}`, `--lang en`, `--threads`, `--metal`.  
  Outputs VTT, SRT, segments JSONL.
- `align` (optional)  
  Improve word timings; requires PyTorch MPS. Options: `--whisperx`, `--pyannote`.
- `index`  
  Populate SQLite; create FTS; dedupe on `object_id`.
- `serve`  
  Read‑only local UI with search, hit‑highlights, and timecode deep‑links.
- `export`  
  Produce Preservica sidecars/manifests, CSVs, or Datasette bundle.

**Configuration:** `civic-asr.yml` (overridable by env vars), including user agent, crawl politeness, model choice, output dirs.

**Exit codes & idempotency:** every command can re‑run safely; partials are resumed per file hashes.

---

## 8. ASR Pipeline Details

- **Audio prep:** `ffmpeg` → mono 16 kHz PCM WAV; loudness normalization (EBU R128).
- **Segmentation:** VAD to split on silence; merge too‑short chunks to stabilize context windows.
- **ASR:** `whisper.cpp` with **Metal** backend; models downloaded to `~/.civic-asr/models`. Recommended presets:
  - Quick: `base.en` (GGUF q8_0)
  - Balanced: `small` (GGUF q5_1)
  - High‑accuracy: `large‑v3` (GGUF q5_0 or q8_0)
- **Post‑processing:** punctuation, de‑um, expandable abbreviations (conservative), profanity masking (**off by default**), optional word timings.
- **Alignment (opt):** `whisperX` for improved timestamps; store a `timings_version` field in DB.

---

## 9. Web UI / Search

- **Local UI:** Minimal, accessible (WCAG 2.2 AA), keyboard‑navigable search with snippet previews. Clicking a result jumps the media player to `start` timecode (via query hash).
- **Datasette option:** `datasette index.db` for instant browse, CSV/JSON APIs, SQL queries, and facets (creator, year, collection).
- **Citations:** Stable links display Preservica identifier and original landing page; transcripts show a “Not official—see NYCMA” banner.

---

## 10. Ethics, Rights, and Community Feedback

- **Robots/Terms:** Respect robots.txt, rate limits, and any DORIS‑published access terms; coordinate IP‑range and politeness. The tool should default to “discovery only” unless an explicit `--fetch` is given.
- **Harmful content & DEIA:** Present a visible **content notice**; provide an in‑tool and in‑UI **“Report issue”** path that drops a row into `flags` with contact info. This mirrors DORIS’s harmful‑content statement and DEIA remediation practice. :contentReference[oaicite:5]{index=5}
- **PII & sensitive content:** Offer optional heuristics to flag likely SSNs/phone numbers; do **not** auto‑redact—route to archivist review.

---

## 11. Packaging for Preservica

- **Adoption model:** We produce **non‑destructive derivatives** (captions/transcripts) with DC sidecars; DORIS can bulk‑ingest as related digital objects in Preservica, preserving provenance and rights.
- **Record provenance:** Include tool version, model hash, VAD choice, and alignment mode in `dcterms:provenance`.
- **Collections:** Allow a `--collection` tag to aggregate objects under a logical series (e.g., WNYC TV).

---

## 12. Installation & Build

- **Prereqs:** `brew install ffmpeg sqlite`
- **ASR core:** vendored `whisper.cpp` with Metal enabled; GGUF models auto‑downloaded on first run.
- **Python (optional):** Only for alignment/diarization (`pip install whisperx pyannote.audio`), guarded by feature flags.
- **Single‑binary option:** For a Rust orchestrator, ship a static binary; call `ffmpeg` and `whisper.cpp` via FFI/exec.

---

## 13. Testing & Quality

- **Golden corpus:** Curate a small, legally shareable set of NYCMA public clips spanning decades, accents, and recording conditions; keep expected outputs under `tests/fixtures/`.
- **Metrics:** Word Error Rate (WER), coverage (percent with captions), and user‑flag rates from `flags` table.
- **Human‑in‑the‑loop:** Provide a simple `correct` script that opens VTT+JSON in a text editor, validates syntax, and updates the DB.

---

## 14. Security & Privacy

- Offline by default; no external calls during ASR.
- Hash all outputs; keep a local inventory (`files` table) with SHA‑256.
- Logs never store credentials; redact URLs with signed tokens if present.

---

## 15. Roadmap (high‑level)

- **MVP:** discover → fetch → transcribe → VTT/SRT/JSON → index → serve.
- **Adoption:** DC sidecars + sample Preservica ingest manifest.
- **Enhancements:** alignment/diarization opt‑in; Datasette packaging; correction UI.

(No dates included; sequence reflects dependency order.)

---

## 16. Governance & License

- **License:** MIT (code), CC‑BY 4.0 for docs.
- **Governance:** Public GitHub with CODEOWNERS; semantic versioning; issue templates for accessibility bugs and metadata corrections; regular checkpoints with NYCMA staff (if desired).

---

## 17. Appendix

### A. Dublin Core mapping example (JSON)

```json
{
  "dc:title": "Mayor Dinkins Hotline – Room 9 Press Coverage (excerpt)",
  "dc:creator": "WNYC Television",
  "dc:date": "1990-10-05",
  "dc:language": "en",
  "dc:rights": "© NYC Department of Records & Information Services",
  "dc:coverage": "New York (N.Y.)",
  "dc:description": "Timecoded transcript and captions generated by civic-asr; see hasPart for files.",
  "dcterms:source": "https://nycrecords.access.preservica.com/.../OBJECTID",
  "dcterms:hasPart": [
    "OBJECTID.en.vtt",
    "OBJECTID.en.srt",
    "OBJECTID.segments.jsonl"
  ],
  "dcterms:provenance": {
    "tool": "civic-asr 0.1.0",
    "asr_model": "whisper-large-v3 (GGUF q5_0)",
    "vad": "silero",
    "align": "off",
    "sha256": "..."
  }
}
```

### B. Example CLI session (happy path)

```bash
# 1) Discover
civic-asr discover --query "collection:WNYC type:video" --max 200 > objects.ndjson

# 2) Fetch & prep
civic-asr fetch --rate-limit 1/s --cache-dir ./cache --from objects.ndjson

# 3) Transcribe (Metal accelerated)
civic-asr transcribe --model large-v3 --quant q5_0 --vad silero --threads 8

# 4) Index & serve
civic-asr index --db index.db
civic-asr serve --db index.db --open
```

---

**Alignment with NYCMA/DORIS practice:** Preservica (Azure, OAIS), Dublin Core metadata, and an active DEIA/harmful‑content program are explicitly considered throughout—sidecars, mappings, and the feedback loop are designed for direct adoption without disrupting existing workflows.
