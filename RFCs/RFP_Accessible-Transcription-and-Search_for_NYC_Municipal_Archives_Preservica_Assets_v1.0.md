# Request for Proposals (RFP)

**Accessible Transcription, Captioning, and Search for NYC Municipal Archives (Preservica Assets)**
**RFP ID:** ATC-NYCMA-2025-01
**Issue Date:** 2025‑10‑19
**Proposal Due:** _Proposer to supply timeline in response_
**Primary Contact (Project Sponsor):** _To be provided_
**Partnership Context:** Project will be developed open‑source and offered to the NYC Department of Records & Information Services (DORIS / NYC Municipal Archives) for adoption.

---

## 1) Purpose

Design and deliver an **open‑source, local‑first CLI application** and a lightweight **external index UI** that:

1. Discovers **audio/video assets** with sound on `https://nycrecords.access.preservica.com/` (or associated APIs/feeds as authorized).
2. Generates **closed captions (WebVTT & SRT)** and **verbatim transcripts** locally (no cloud processing required).
3. Emits **search‑ready structured data** (JSON + SQLite), plus a **static search UI** that supports granular text queries with time‑coded hits.
4. Packages derivatives in a DORIS‑compatible structure, with **Dublin Core** field mappings and ingest manifests for **Preservica** (OAIS‑aligned), enabling eventual institutional adoption.
5. Aligns with DORIS **DEIA/reparative description** practices and **harmful content** notice framework; includes flagging and correction workflows.

---

## 2) Background & Context

- **NYC Municipal Archives / DORIS** preserves records of NYC government from the 17th century to present and has implemented **Preservica** (Azure, OAIS) to manage digital preservation at scale (300+ TB). DORIS metadata practices are aligned to **Dublin Core** and include ongoing **data remediation**.
- DORIS runs a significant digital program (e.g., **Historical Vital Records** platform) and has strengthened **Industry City** facilities for digitization, conservation, and public access.
- DORIS explicitly advances **DEIA**: inclusive/reparative description, harmful‑content statements, and community engagement; the RFP solution must integrate with these practices.
- The project sponsor intends to create an openly licensed tool and initial corpus of captions/transcripts that improve accessibility for the hearing‑impaired and unlock **full‑text search** within public audiovisual holdings.
- **Important legal/ethical constraint:** Only process assets where discovery and derivative creation are **authorized** by DORIS; do not bypass technical or policy controls. Maintain respectful, low‑impact fetch patterns.

---

## 3) Scope of Work

### 3.1 Discovery & Enumeration

- Primary: Enumerate eligible Preservica assets via official **APIs/feeds** if made available; fallback: **respectful crawling** with robots.txt compliance, configurable **rate limits** (e.g., 1–3 requests/sec, burst controls), and written permission.
- Maintain a **reproducible manifest** (CSV/JSON + checksums) of discovered items (asset identifier, collection link, title, duration, source URL, rights/notes pages).
- Provide a `--dry-run` option to simulate actions.
- Produce **audit logs** for each run (timestamped, asset IDs fetched/skipped, HTTP status, bytes transferred).

### 3.2 Ingestion & Media Preparation

- Download or stream audio/video as permitted. Use **ffmpeg** to normalize to **16 kHz mono PCM** for ASR, with **voice activity detection (VAD)** and **silence‑aware chunking**.
- Cache decoded audio and normalized chunks **by content hash** for incremental reruns.
- Optional: diarization hook (e.g., WhisperX, pyannote) behind a feature flag.

### 3.3 Local Speech‑to‑Text

- Default engine: **whisper.cpp** (GGUF quantized OpenAI Whisper models) with **Metal** acceleration on Apple Silicon; allow model selection (`tiny.en`→`large‑v3`) and quant levels (e.g., Q5_K_M default, Q8_0 for QC).
- Alternatives (pluggable): **faster‑whisper / CTranslate2** or PyTorch MPS (document tradeoffs).
- Output:

  - **Verbatim transcript JSON** with per‑segment text, start/end (ms), confidence, and source chunk ID.
  - **SRT** and **WebVTT** with sensible line lengths, sentence‑aware segmentation.
  - Optional: “**Readable transcript**” (light editorial normalization) as a separate file.

### 3.4 Quality Control & Alignment

- Provide a **QC report** (per asset) with duration, tokens/sec, average confidence, OOV rate (heuristic), and warnings (e.g., low SNR).
- Optional alignment pass (e.g., WhisperX) to tighten word‑level timestamps.
- Provide a **WER evaluation harness** for a small gold‑set (vendor to propose) to baseline quality and track regressions.

### 3.5 Metadata, Storage & Index

- Persist structured outputs in **SQLite** (the canonical local database) and JSON sidecars.
- Map extracted fields to **Dublin Core** where possible: `dc:title`, `dc:identifier`, `dc:date`, `dc:creator` (if known), `dc:description`, `dc:subject`, `dc:rights`, `dc:source`, `dc:coverage`, `dc:relation`. Keep an extension namespace for ASR metrics.
- Include **provenance** (tool versions, model name, checksum, run timestamp).
- Emit **BagIt‑style folder** per asset (bag‑info.txt, manifests) OR an equivalent structured package with checksums and inventory. This supports preservation workflows and later **Preservica ingest**.

### 3.6 External Index UI (Static)

- Deliver a lightweight, static web UI (no server required) that can be hosted on GitHub Pages/S3:

  - Full‑text search across transcripts & metadata.
  - Result snippets with **time‑coded hits** and click‑to‑seek (using built‑in HTML5 player where lawful).
  - Content warnings banners when flagged.
  - Download links for SRT/WebVTT/JSON where allowed.

- Backend options:

  - Client‑side index (Lunr/Elasticlunr), or
  - **Datasette** over SQLite for richer faceting, with CORS‑enabled JSON endpoints.

### 3.7 Packaging for DORIS / Preservica

- Deliver a **documented packaging format** for batch ingest that:

  - Preserves original asset identifier, establishes **derivative relationships**, and includes checksums.
  - Provides **Dublin Core** XML/JSON mapping files per asset.
  - Includes summary CSV manifests for bulk operations.

- Provide examples and a **validation script** for pre‑ingest checks (missing fields, bad checksums). (Note: DORIS presently uses Preservica with OAIS practices and Dublin Core—align to those conventions.)

### 3.8 Accessibility, Ethics, and Community Input

- Conform to **WCAG 2.2 AA** for the static UI.
- Implement **harmful‑content notices** and a **flag/correction** mechanism that can be exported as annotations (CSV/JSON). Align with DORIS’ reparative description aims.
- Respect legal rights and privacy restrictions; never process restricted assets.

### 3.9 Documentation & Training

- Administrator and user guides; **CLI help** with examples.
- “Operating at scale” runbook (throttling, retries, resume, storage planning).
- Contribution guide (open‑source), code of conduct, and license notices.

---

## 4) Non‑Functional Requirements

### 4.1 Performance & Footprint

- **Baseline system** (for development and testing):

  - macOS 15.4.1 on **Apple M2 Max** (38‑core GPU), 96 GB RAM; no NVIDIA GPU. (This reflects the sponsor’s environment.)

- Target throughput (guidance, vendor to refine):

  - Whisper.cpp `medium.en` Q5 on M2 Max should approach **~1× real time** for clean speech; `large‑v3` may be slower. Provide measured benchmarks.

- Resumeable processing; idempotent reruns with content‑hash caching.

### 4.2 Portability & Installability

- Prebuilt binaries for **macOS (Apple Silicon)**; CI builds for Linux x86_64.
- Package for **Homebrew** (macOS) and a Docker image (optional).
- No external paid services required; fully offline operation possible after initial downloads.

### 4.3 Reliability & Observability

- Structured logs (JSON) with run IDs; **metrics** endpoints (optional) for batch stats.
- Clear exit codes; retries with exponential backoff on transient network failures.
- **Hash‑based de‑duplication** so reprocessing is minimized.

### 4.4 Security & Legal

- Obey robots.txt and any DORIS policy; **throttle** by default.
- Do not circumvent access controls.
- Include SPDX license metadata and third‑party attributions.
- Provide a **rights field** in outputs; if asset rights prohibit redistribution, the UI must omit streaming and offer metadata only.

---

## 5) Data Models (Summaries)

### 5.1 Transcript JSON Schema (simplified)

```json
{
  "asset_id": "preservica:XYZ",
  "source_url": "https://nycrecords.access.preservica.com/...",
  "duration_ms": 1234567,
  "asr": {
    "engine": "whisper.cpp@commit",
    "model": "ggml-large-v3-q5_k_m",
    "language": "en",
    "confidence_avg": 0.86
  },
  "segments": [
    {
      "index": 0,
      "start_ms": 0,
      "end_ms": 4520,
      "text": "Good afternoon and welcome ...",
      "confidence": 0.9
    }
  ],
  "dc": {
    "title": "…",
    "identifier": "…",
    "date": "…",
    "rights": "…"
  },
  "provenance": {
    "ffmpeg": "6.1",
    "vad": "silero-vad 0.4",
    "hash_pcm16": "sha256:…",
    "generated_at": "2025-10-19T12:00:00Z"
  },
  "flags": [{ "type": "harmful_language", "offset_ms": 12345, "note": "…" }]
}
```

### 5.2 Packaging Layout (per asset)

```
asset_<identifier>/
  bagit.txt
  bag-info.txt
  data/
    transcript.json
    captions.srt
    captions.vtt
    audio_normalized.wav  (optional per policy)
    manifest.csv
    dc.json               (Dublin Core mapping)
  manifests/
    manifest-sha256.txt
```

---

## 6) Deliverables & Milestones

1. **Inception (Week 0–2)**

   - Technical plan; discovery approach; permissions plan; acceptance criteria.

2. **Alpha (Week 3–8)**

   - CLI skeleton; discovery dry‑run; basic ASR pipeline; JSON/SRT/VTT; SQLite store.
   - Minimal static UI with search and time‑coded hits.

3. **Beta (Week 9–14)**

   - Packaging for DORIS (BagIt‑style + DC mappings); QC reports; content warnings; admin docs.
   - Benchmarks on the M2 Max baseline; WER baseline on a small gold set.

4. **Release Candidate (Week 15–18)**

   - Performance polish; error handling; Homebrew formula; prebuilt binaries; CI.
   - Training and handoff; final documentation.

5. **General Availability (Week 19+)**

   - v1.0.0 tagged; governance docs; issue tracker open.

_Proposers may adjust timeline with justification._

---

## 7) Acceptance Criteria

- Runs end‑to‑end on macOS 15.4.1 **Apple M2 Max** with no proprietary cloud dependencies.
- Produces valid **SRT** and **WebVTT** matching transcript JSON timecodes.
- SQLite catalog populated; static UI serves search and jumps to timecodes.
- Packaging validated by included script (checksums, required fields).
- Demonstrated **WER baseline** and repeatable benchmark.
- Documentation sufficient for another party (e.g., DORIS staff) to run the pipeline.
- Ethical & legal compliance features enabled by default (robots, throttling, notices).

---

## 8) Open‑Source, Licensing, and Governance

- Code licensed **Apache‑2.0** or **MIT**; models subject to their licenses.
- Clear CONTRIBUTING, CODE_OF_CONDUCT, and SECURITY policies.
- Semantic versioning; release notes; signed tags.
- Third‑party components tracked with SPDX IDs.

---

## 9) Vendor Proposal Instructions

Submit a single PDF that includes:

1. **Technical Approach** — discovery method, ASR stack, packaging plan, UI approach; risk mitigation.
2. **System Design** — architecture diagram; data flows; schemas; caching strategy; observability.
3. **Benchmark Plan** — methodology and expected throughput/quality on the M2 Max baseline.
4. **Team & Experience** — relevant open‑source work (ASR, archives, accessibility).
5. **Project Plan & Timeline** — milestones, staffing, communication cadence.
6. **Budget** — fixed price or T&M with cap; breakdown by milestone.
7. **Assumptions & Dependencies** — access permissions, API availability, sample asset set.
8. **Maintenance & Handoff** — support period, knowledge transfer, sustainability plan.
9. **Compliance Statement** — confirmation of robots.txt compliance, rights‑respecting processing, and alignment with DORIS DEIA/harmful‑content practices.

---

## 10) Evaluation Criteria

- **Technical merit & maintainability** (30%)
- **Accessibility, ethics, and preservation alignment** (20%)
- **Performance & quality plan** (15%)
- **Packaging & interoperability with Preservica/Dublin Core** (15%)
- **Team experience & open‑source track record** (10%)
- **Cost & timeline realism** (10%)

---

## 11) Constraints & Out‑of‑Scope

- Do **not** bypass access controls; do not process restricted or confidential assets.
- No bulk streaming or hot‑linking that stresses institutional infrastructure; respect throttles.
- No cloud‑only ASR approaches that exfiltrate media.
- This RFP doesn’t require speaker diarization, translation, or summarization—provide hooks; optional modules welcome.

---

## 12) Future Extensions (Non‑binding)

- **Diarization** and word‑level alignment (WhisperX)
- **Named‑entity recognition** for people/places and linked‑data enrichment
- **Translation** for multilingual access
- **Editorial review UI** for staff/community corrections
- **WARC export** to align with broader web archiving practices

---

## 13) Appendices

### A. System Baseline (for Development & Tests)

- OS: `macOS 15.4.1 (24E263)`
- Hardware: Apple **M2 Max**, 96 GB LPDDR5; Metal 3 GPU; no NVIDIA CUDA device
- Displays: Built‑in + external 1080p
- Uptime and load typical for interactive development

### B. DORIS / NYC Municipal Archives References (context)

- Preservica OAIS deployment, Azure; **Dublin Core** metadata; digital ingest and remediation programs; DEIA and harmful‑content statement; moving image holdings (e.g., WNYC) and nitrate reformatting; new facilities at Industry City. These inform required mappings, packaging, and ethics.

---

### End of RFP
