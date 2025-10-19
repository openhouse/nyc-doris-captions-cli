### Title

Civic‑Captions: On‑device captioning & searchable transcripts for NYC Municipal Archives (Preservica Access)

### Authors

Project Champion: Jamie “Jamie” Burkart
Contributors: Georgi Gerganov, Max Bain, Dan Vanderkam, Léonie Watson, pyPreservica, Yehuda Katz, Sylvia Kollar, Deborah Treisman

### Status

**Proposed** (Draft v1)

### Target Audience

- NYC Department of Records & Information Services (DORIS) / NYC Municipal Archives (NYCMA) leadership & staff
- Accessibility leads, archivists, and researchers
- Open‑source contributors and civic technologists

---

## 1. Summary

Civic‑Captions is an open‑source command‑line application and companion web UI that:

1. **Discovers** public audiovisual assets in the NYCMA Preservica Access portal (nycrecords.access.preservica.com) using the Preservica API;
2. **Processes** media locally (on Apple Silicon or Linux) to generate accurate, standards‑compliant captions and word‑level transcripts (Whisper/whisper.cpp + optional WhisperX alignment and diarization);
3. **Packages** outputs (WebVTT, SRT, JSON) with Dublin Core–aligned sidecar metadata;
4. **Indexes** transcripts for granular search; and
5. **Prepares** ready‑to‑ingest caption/transcript files as new Preservica “Text/Caption” representations—so DORIS can adopt them with minimal overhead.

The project serves two civic goals: accessibility for Deaf/Hard‑of‑Hearing users; and research discovery through full‑text search across audiovisual content. It is designed as **design advocacy** that integrates cleanly with DORIS’s established digital preservation environment (Preservica in Azure) and description practices.

---

## 2. Motivation

- **Accessibility**: A large public archive should be captioned. WebVTT/SRT captions increase access and legal compliance for public programming.
- **Research value**: Word‑addressable transcripts unlock search within audio/video, enabling citation by timecode and discovery across collections.
- **Institutional fit**: DORIS relies on Preservica (OAIS‑aligned) for ingest, storage, management, and access; any solution must slot into that reality and into ongoing reparative description efforts and harmful‑content practices.
- **On‑device privacy & feasibility**: Many assets are public; still, local processing avoids network costs, reduces friction, and demonstrates a sustainable civic approach.

---

## 3. Non‑Goals

- Replacing Preservica or DORIS’s existing access layer.
- Mass‑scraping without API use or contrary to portal terms/robots.
- Automatic publication of restricted or rights‑encumbered content.
- Doing editorial “reparative description” automatically. (We’ll surface hooks to support it.)

---

## 4. System Context & Constraints

- **NYCMA uses Preservica** as its trusted digital repository in Azure, with hundreds of TB managed; ingestion and description processes already exist and must not be disrupted.
- **Harmful content & DEIA**: DORIS has introduced DEIA and harmful‑content practices; transcripts and captions must carry content warnings/reporting affordances and avoid perpetuating harm in description.
- **Target workstation**: Apple M2 Max (96 GB RAM) running macOS 15.4.1; Metal GPU acceleration available; no NVIDIA CUDA. (See §11.)
- **Public portal**: Stick to official APIs via pyPreservica. Respect any rate limits and security tags.

---

## 5. Functional Requirements

1. **Discovery**

   - Authenticate to Preservica; enumerate public assets with audiovisual content (“Access” representations).
   - Produce a manifest (JSONL) of assets to process.

2. **Media Ingest & Normalization**

   - For each asset, download the access representation, extract audio via ffmpeg, downmix to mono, resample to 16 kHz WAV/FLAC.

3. **Transcription & Alignment**

   - Run Whisper locally (whisper.cpp or faster‑whisper).
   - Optional: run WhisperX forced alignment for word‑level timestamps and optional diarization (pyannote).
   - Segment texts with timestamps, confidence; detect language; optionally translate to English.

4. **Outputs**

   - Captions: **WebVTT** (primary) and **SRT** (secondary), compliant with accessibility guidance (timing, line length, SDH options).
   - **Transcript JSON**: words, segments, speakers, confidence, language.
   - **Sidecar metadata JSON**: Dublin Core–aligned (see Appendix A).

5. **Indexing & UI**

   - Local SQLite (FTS5) index for ad‑hoc search.
   - Optional export to Meilisearch/Typesense for a static or Next.js web UI (full‑text search with hit highlighting & time‑coded links).

6. **Preservica Integration (Adoption)**

   - Produce a deterministic folder of deliverables per asset, ready to upload via API as a new “Text/Caption” representation or as additional content streams.
   - Include checksums and a compact readme per asset for provenance.

7. **Policy & Ethics**

   - Respect security tags and **do not** process restricted assets.
   - Surface a “Content may contain harmful or outdated language” banner in the UI and include a link/email for reporting.

---

## 6. Non‑Functional Requirements

- **Accuracy**: Minimize WER; allow model selection (tiny–large).
- **Accessibility**: WCAG 2.2 AA front‑end; captions that meet SDH conventions (speaker labels, sound cues as optional).
- **Reproducibility**: Deterministic processing configs hashed per asset; log provenance.
- **Performance**: Reasonable throughput on M2 Max with Metal; batch scheduling; resumable work.
- **Safety**: Rate‑limit API calls and downloads; backoff on errors; no scraping outside scope.

---

## 7. Detailed Design

### 7.1 High‑Level Architecture

```
[Preservica API] → [Asset Manifest] → [Downloader + ffmpeg] → [STT Engine]
                                                    ↘
                        [WhisperX align + diarization (optional)]
                             ↓
         [Outputs: .vtt, .srt, transcript.json, dc_meta.json, checksums]
                             ↓
      [Local FTS5 Index]      [Preservica-ready package]      [Web UI]
```

### 7.2 Discovery & Manifest (pyPreservica)

- Use pyPreservica to authenticate, query entities, and enumerate assets with an audio or video “Access” stream.
- Persist manifest as **JSONL**:

```json
{
  "asset_id": "UUID",
  "title": "...",
  "collection": "...",
  "created": "...",
  "media_url": "...",
  "repr_id": "...",
  "security": "public"
}
```

- Respect **security** and **retention** flags; skip non‑public or restricted content.

### 7.3 Media Normalization

- `ffmpeg -i input -ac 1 -ar 16000 -sample_fmt s16 output.wav`
- Keep original bitrate and duration metadata for reference.
- Chunk long files if needed (e.g., 30–60 min windows with 5 s overlap for alignment).

### 7.4 Local STT Engines

- **whisper.cpp (ggml/gguf)** for on‑device inference with Metal on Apple Silicon; expose flags: threads, model size, beam size, temperature, best‑of, VAD on/off.
- **faster‑whisper** (CTranslate2) alternative for users wanting Python stack; supports Metal backend.
- Allow **language auto‑detect** and “translate to English” toggle.

### 7.5 Alignment & Diarization (Optional)

- **WhisperX** for word‑level alignment; output words with start/end.
- **Diarization** with pyannote.audio (local), enabled via config; store speaker labels (`spk_0`, `spk_1`), with a simple merging heuristic to reduce over‑segmentation.
- If diarization is disabled, still allow manual speaker labels via small YAML mapping.

### 7.6 Output Formats

- **WebVTT**: 1–2 lines per cue, max ~32–42 chars/line, 1–3 s cues where possible; SDH optional (config flag).
- **SRT**: Timecodes with millisecond precision; identical content to VTT.
- **Transcript JSON**:

```json
{
  "asset_id": "UUID",
  "language": "en",
  "segments": [
    {
      "start": 12.34,
      "end": 17.89,
      "text": "…",
      "speaker": "spk_0",
      "confidence": 0.92
    }
  ],
  "words": [
    {
      "start": 12.34,
      "end": 12.56,
      "text": "hello",
      "speaker": "spk_0",
      "confidence": 0.88
    }
  ],
  "provenance": {
    "engine": "whisper.cpp",
    "model": "ggml-large-v3-q5_k_m",
    "whisperx": true
  }
}
```

- **Sidecar metadata (dc_meta.json)** per Appendix A mapping.
- **CHECKSUMS** (SHA‑256) file for all deliverables.

### 7.7 Local Index & External UI

- **SQLite + FTS5** stores (asset_id, segment_id, start, end, text).
- Web UI options:

  1. **Static** (export JSON + client‑side Typesense/Meilisearch)
  2. **Next.js (TypeScript)** server‑rendered app with API routes backed by SQLite.

- Accessibility: semantic landmarks, skip links, high contrast, keyboard support, robust focus, captions preview, download links, content warnings, “report a problem” CTA. (See Appendix D.)

### 7.8 Preservica Ingest Package

Per asset folder:

```
/ASSET_UUID/
  captions.en.vtt
  captions.en.srt
  transcript.json
  dc_meta.json
  CHECKSUMS.sha256
  README.txt
```

- **Naming**: `captions.<lang>.vtt` and `transcript.<lang>.json`.
- **README**: tool version, model, date, md5/sha256, source representation ID, exact ffmpeg & STT flags.
- Upload via pyPreservica to create a **new representation** of type “Text/Caption” (or add as content streams if that is preferred in DORIS’s configuration).

---

## 8. Configuration

- Single **YAML** file with JSON Schema validation:

```yaml
preservica:
  base_url: "https://nycrecords.access.preservica.com"
  auth: { client_id: "...", client_secret: "..." }
  collection_filter: ["NYPD Moving Images", "WNYC TV"] # examples

discovery:
  query: "mediaType:(audio OR video) AND security:public"
  max_items: 500
  rate_limit_rps: 2

processing:
  engine: "whisper.cpp" # or "faster-whisper"
  model: "ggml-large-v3-q5_k_m"
  diarization: false
  alignment: true
  translate_to_english: false

output:
  sdh: false
  line_length: 38
  min_cue: 1.0
  max_cue: 6.0

index:
  sqlite_path: "./index/civic_captions.db"

ui:
  export_static: true
  nextjs_server: false
```

---

## 9. CLI (Illustrative)

```
# 1) Discover & build manifest
civic-captions discover --config config.yaml --out manifest.jsonl

# 2) Process manifest (batch)
civic-captions run --manifest manifest.jsonl --workspace ./workspace

# 3) Build local search index
civic-captions index --workspace ./workspace --db ./index/cc.db

# 4) Export a static search site
civic-captions export-site --db ./index/cc.db --out ./site

# 5) Prepare Preservica ingest bundles
civic-captions package --workspace ./workspace --out ./deliverables

# 6) (Optional) Upload to Preservica as new representation
civic-captions upload --deliverables ./deliverables --representation-type "Text"
```

---

## 10. Data & Metadata Mapping (Preservica / Dublin Core)

See **Appendix A** for a detailed mapping table.

- Use authoritative catalog fields for `dc.title`, `dc.description`, `dc.date`, `dc.identifier`, `dc.creator`, `dc.subject`, and collection info; never invent provenance.
- Include `dcterms:conformsTo = "WebVTT 1.0"` and `dcterms:format = "text/vtt"` for captions.

---

## 11. Performance & Environment Notes (Apple M2 Max)

- **OS**: macOS 15.4.1 (Apple Silicon).
- **Hardware**: 96 GB LPDDR5; Apple M2 Max (38 GPU cores).
- **Acceleration**: whisper.cpp with Metal; faster‑whisper with Metal backend (via CTranslate2).
- **Dependencies**: `ffmpeg`, `python>=3.10` (if using WhisperX/pyannote), `sqlite3`.
- **Models**: `ggml-small`/`base` for fast scans; `ggml-large-v3` quantized for final pass.
- **Considerations**: diarization models are heavier; keep it optional. Chunk long inputs; retry on out‑of‑memory gracefully.

(These details align with the project’s workstation snapshot; adjust per deployment.)

---

## 12. Accessibility Requirements (Captions & UI)

- **Captions**: WebVTT primary; follow timing rules; avoid overly long cues; SDH optional; include speaker labels when diarization is available.
- **UI**: WCAG 2.2 AA; semantic landmarks, keyboard support, visible focus, adequate color contrast, reduced motion preference honored, transcripts downloadable.
- **Content Warnings**: present and user‑reporting available, in line with DORIS’s harmful‑content statement practice.

---

## 13. Ethics, Legal, and Policy

- **Respect portal terms and robots**. Always prefer official API; back off if rate limits are reached.
- **Security & Rights**: process only public, non‑restricted assets; if security tags change post‑manifest, skip or purge.
- **PII**: do not redact automatically; flag potential PII risk areas in documentation.
- **Attribution**: preserve original titles and identifiers; do not overwrite metadata.
- **Harmful content**: label, provide pathway to report/feedback; defer to DORIS policy for any takedown/remediation.

---

## 14. Drawbacks

- Word‑level alignment and diarization increase compute time.
- On‑device inference can be slower than cloud offerings (offset by privacy and sustainability).
- Whisper may mis‑transcribe proper nouns or code‑switching; QC remains essential.

---

## 15. Alternatives Considered

- **Cloud STT** (faster, but pushes audio off‑device, adds cost and approvals).
- **Scraping the portal** (fragile; avoids API but risks violating norms).
- **Index‑only approach** (no captions back into Preservica; harder to adopt institutionally).

---

## 16. Incremental Adoption Plan

**Phase 0 (Dry‑run)**

- Authenticate, build small manifest (≤20 assets), no downloads; confirm metadata mapping.

**Phase 1 (Pilot)**

- Process 20–50 representative assets (varied languages, durations, genres).
- QC by archivists; tweak caption rules and metadata mapping.

**Phase 2 (Public Beta)**

- Publish external index UI for the pilot set; gather researcher feedback.
- Package and **upload transcripts/captions** to Preservica for a subset as new representations.

**Phase 3 (Scale‑out)**

- Batch processing with manifests by collection; routine packaging for ingest.
- Document institutional SOP for ongoing caption creation.

---

## 17. Governance & Licensing

- **License**: Apache‑2.0
- **Code of Conduct**: Contributor Covenant
- **Change process**: Minor changes via PR; breaking changes via mini‑RFC (template included in repo).
- **Ownership**: Community‑led, with DORIS consultative steering for ingest conventions.

---

## 18. Acceptance Criteria (“Definition of Done” for v1)

- CLI runs locally on M2 Max with Metal acceleration; end‑to‑end for a pilot set.
- WebVTT and SRT pass basic validators; JSON schema validates.
- Local search works (FTS5) and optional static export renders with accessibility checks.
- Preservica‑ready packages generated with checksums and Dublin Core sidecar.
- Upload path tested (against a non‑production sandbox or limited collection) with DORIS confirmation.

---

## 19. Open Questions

- Preferred Preservica representation type naming (“Text”, “Captions”, or “Transcripts”)?
- Organizational preference: one representation with multiple streams vs. multiple representations per language?
- Diarization default: off by default or “auto” based on duration?
- Long‑term hosting of the external UI (if the archive wishes to link out)?

---

## Appendix A — Dublin Core Mapping (example)

| Source (Preservica/Portal) | DC field               | Notes                                |
| -------------------------- | ---------------------- | ------------------------------------ |
| Asset title                | `dc.title`             | Copy exact                           |
| Asset identifier/URI       | `dc.identifier`        | Persist GUID/handle                  |
| Collection                 | `dc.relation.isPartOf` | Human & machine forms                |
| Creation date              | `dc.date`              | ISO 8601                             |
| Rights statement           | `dc.rights`            | From catalog                         |
| Subject keywords           | `dc.subject`           | As cataloged                         |
| Transcript language        | `dc.language`          | IETF tag (e.g., en, es)              |
| Caption format             | `dcterms.format`       | `text/vtt` or `application/x-subrip` |
| Conforms to                | `dcterms.conformsTo`   | `WebVTT 1.0`                         |
| Provenance (tooling)       | `dcterms.provenance`   | Version, model, flags                |
| Content warning            | `dcterms.description`  | Add short notice when applicable     |

Include the sidecar `dc_meta.json` with these fields and checksums.

---

## Appendix B — Transcript JSON Schema (excerpt)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CivicCaptionsTranscript",
  "type": "object",
  "required": ["asset_id", "language", "segments"],
  "properties": {
    "asset_id": { "type": "string" },
    "language": { "type": "string" },
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["start", "end", "text"],
        "properties": {
          "start": { "type": "number" },
          "end": { "type": "number" },
          "text": { "type": "string" },
          "speaker": { "type": "string" },
          "confidence": { "type": "number" }
        }
      }
    },
    "words": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["start", "end", "text"],
        "properties": {
          "start": { "type": "number" },
          "end": { "type": "number" },
          "text": { "type": "string" },
          "speaker": { "type": "string" },
          "confidence": { "type": "number" }
        }
      }
    },
    "provenance": { "type": "object" }
  }
}
```

---

## Appendix C — Example WebVTT (snippet)

```
WEBVTT

00:00:12.340 --> 00:00:17.890
We invite our partners from the New Amsterdam History Center…

00:00:17.890 --> 00:00:20.320
[applause]
```

---

## Appendix D — Accessibility Checklist (UI)

- Headings follow a logical hierarchy; ARIA roles used sparingly.
- Keyboard navigation for all interactive controls; visible focus.
- Minimum color contrast 4.5:1; test with system high‑contrast modes.
- Captions preview pane with play/pause and jump‑to‑cue (keyboard accessible).
- `prefers-reduced-motion` respected; no auto‑playing animations.
- Content warning banner and a “Report a problem” link.

---

## Appendix E — Operational Notes for DORIS

- **Preservica**: Create/confirm a representation type for captions/transcripts; decide on single vs. multiple streams strategy.
- **QC**: Sample a fixed % for human review; maintain a correction channel for edits (patch files).
- **Harmful content**: Affirm banner language and reporting inbox in line with DORIS’s current practice.

---

## Appendix F — References to Current DORIS Context

- DORIS uses Preservica in Azure for OAIS‑aligned digital preservation; large‑scale ingest and DEIA work are ongoing; harmful‑content notification practices are in place. These inform design choices around ingestion, metadata mapping, and user warnings.
