# Request for Proposals (RFP)

**Open‑source Local Transcription & Search for NYC AV Collections**  
_(sometimes referred to in this document as “RFC” due to early working notes)_

## 1) Summary

The project will deliver an **open‑source, offline‑capable CLI application** and a minimal companion UI that:

- Discovers AV assets from **nycrecords.access.preservica.com** (and other DORIS‑approved endpoints),
- Fetches audio/video in a cooperative, rate‑limited way,
- Generates **accurate closed captions and transcripts fully locally** (no cloud services required),
- Stores caption files (WebVTT/SRT) and rich JSON sidecars with provenance,
- Indexes transcripts and metadata into a **self‑contained SQLite FTS** catalog for granular search,
- Exposes a simple read‑only API and lightweight search UI for researchers and staff,
- Produces **Preservica‑ready** deliverables suitable for DORIS ingestion and long‑term stewardship.

DORIS uses **Preservica** (OAIS‑aligned) within the City’s Azure environment for digital preservation; results from this project must integrate cleanly into that environment and DORIS’ descriptive and access practices. :contentReference[oaicite:1]{index=1}

## 2) Background & Rationale

The NYC Municipal Archives (a division of DORIS) stewards extensive historical AV holdings—including WNYC radio/TV, motion picture film, and born‑digital video—serving accessibility, research, and civic memory. DORIS has modernized its digital operations, adopting **Preservica** to manage hundreds of TB of content and advancing inclusive description and access initiatives. This RFP seeks to accelerate **caption availability** for hearing‑impaired users and to unlock **full‑text search** inside AV assets to support scholarly and public research. :contentReference[oaicite:2]{index=2}

## 3) Goals & Objectives

1. **Accessibility:** Generate closed captions (WebVTT/SRT) for eligible audio/video assets to support ADA/Section 508 objectives.
2. **Searchability:** Create a granular, time‑coded transcript index with **keyword‑to‑timestamp** linking and phrase search.
3. **Local-first Operation:** All core functions (STT, indexing) must run offline on commodity hardware (CPU/GPU optional).
4. **Adoptability:** Outputs (captions, JSON sidecars, index DB) must map cleanly to DORIS and **Preservica** workflows. :contentReference[oaicite:3]{index=3}
5. **Ethics & Care:** Respect source systems’ terms; support content advisories and reparative description practices.
6. **Open Source:** License under **Apache‑2.0** or **MIT** with full documentation and reproducible builds.

## 4) Scope of Work

### 4.1 Discovery & Fetch

- **Primary source:** `nycrecords.access.preservica.com` (and related DORIS‑approved endpoints).
- **Discovery modes:**
  - Preservica API integration (preferred) or HTML parsing (fallback), configurable via provider plugin.
  - Query by collection, date range, media type, or asset ID list.
- **Respect & safety:**
  - Honor `robots.txt`, rate limits, HTTP ETags/If‑Modified‑Since; exponential backoff.
  - **Opt‑in rules** for assets (e.g., only items with streaming derivatives), and an allow/deny list.
- **Fixity:** Record checksums and content lengths on fetch; store in JSON sidecar.

### 4.2 Transcription & Captioning

- **Engines:** Must support local STT with **OpenAI Whisper family** (e.g., faster‑whisper/CTranslate2, whisper.cpp) and allow drop‑in alternatives (Vosk, NVIDIA NeMo, etc.).
- **Performance controls:** Model selection (`tiny`→`large‑v3`), quantization, threads, GPU acceleration, batch size.
- **Enhancements:**
  - **Voice Activity Detection (VAD)** to trim silence/noise.
  - **Optional speaker diarization** (pluggable).
  - **Language detection** with per‑segment language tags (if present).
  - Punctuation/normalization settings.
- **Outputs:**
  - **WebVTT** and **SRT** captions, with consistent `00:00:00.000` formatting.
  - **JSON** (per asset) capturing: model+version+hash, engine options, confidence, WER proxy metrics, segment list (text, start/end, speaker), and provenance.

### 4.3 Indexing & Search

- **Catalog:** **SQLite** with **FTS5** for full‑text search; schema includes:
  - `assets(id, title, source_url, duration, sha256, media_type, created_at, updated_at)`
  - `transcripts(asset_id, segment_id, t_start, t_end, speaker, text, lang)`
  - `meta(key, value)` for global settings; `captions(asset_id, vtt_path, srt_path, json_path)`
- **API/UI:**
  - Minimal read‑only HTTP API (e.g., FastAPI/Starlette) serving search and “jump to timestamp” links.
  - Lightweight **researcher UI**: query box, hit highlighting, context preview, content warnings, and copy‑paste citations.

### 4.4 Packaging & Operations

- **CLI:** Subcommands (illustrative):
  - `discover` (list assets), `fetch` (download derivatives), `transcribe` (run local STT),
  - `caption` (emit VTT/SRT), `index` (build/update SQLite), `serve` (start read‑only API/UI),
  - `attach` (prepare deliverables for DORIS/Preservica ingest), `validate` (QA checks).
- **Config:** YAML + env vars; everything supports `--dry-run`.
- **Distribution:** Homebrew, `pipx`, Docker image, and (if Rust) `cargo install`.
- **Reproducibility:** Manifest records exact engine build, model SHA, quantization, and hardware profile.

### 4.5 Governance, Ethics & Inclusion

- **Use policy:** Respect collection terms; add a “consent mode” to exclude or log restricted assets.
- **Attribution & provenance:** Embed source URLs and credit lines in sidecars and captions.
- **Harm statements:** Provide a configurable hook to display DORIS’ harmful content statement in UI and exports. :contentReference[oaicite:4]{index=4}
- **Reparative description:** Provide a lightweight review UI or CLI workflow to add names/notes discovered through community remediation.

### 4.6 Deliverables

1. Source code in a public repository (Apache‑2.0 or MIT).
2. Cross‑platform binaries/containers.
3. Installer scripts (Homebrew formula, `pipx`).
4. Schema‑documented **SQLite catalog** and **JSON sidecar** formats.
5. **Administrator guide** (install, config, Preservica integration), **User guide** (CLI + UI), and **Contributor guide**.
6. **Test corpus** and automated test suite (unit + end‑to‑end) with synthetic and real‑world samples (where permitted).
7. **Pilot run outputs**: captions + index for an agreed pilot set (≥100 hours of AV), with QA metrics.

## 5) Out of Scope

- Changing Preservica configuration or DORIS’ internal infrastructure.
- Mass web‑crawling beyond DORIS‑approved collections.
- Rights clearance for third‑party copyrighted materials in source media.

## 6) Technical Requirements

### 6.1 Accuracy & Quality

- **Target WER:** ≤ 20% on clean speech with `medium` model; document performance per model size.
- **Timestamps:** Segment drift ≤ 250ms average per 10 minutes.
- **Diarization:** If enabled, speaker change error ≤ 20% on multi‑speaker speech (best‑effort).
- **QA hooks:** CLI `validate` reports duration matches, empty segments, non‑monotonic timestamps, encoding issues.

### 6.2 Performance

- **Throughput:** On an Apple M2 Pro, ≥ 0.6x realtime with `small` model for 16kHz mono audio.
- **Resource limits:** Configurable CPU cores and RAM ceilings; graceful degradation on low‑spec machines.

### 6.3 Security & Privacy

- No outbound calls during STT/Indexing unless the operator opts in.
- Checksums and logs redact secrets; PII processing is configuration‑guarded.
- Signed release artifacts; supply chain manifests (SBOM).

### 6.4 Accessibility & Internationalization

- UI keyboard navigable; screen‑reader tested.
- Language tags per segment; UI strings externalized for translation.

## 7) Integration & Data Mapping

- **Preservica mapping:** Provide a mapping document from sidecar/captions to Preservica’s metadata fields and packaging for ingest (e.g., identifiers, titles, dates, checksums).
- **DORIS practices:** Hooks for harmful content statement and DEIA remediation to align with current DORIS initiatives. :contentReference[oaicite:5]{index=5}

## 8) Project Management

### 8.1 Milestones (illustrative)

- **M1 (Week 4):** Architecture & schema freeze; discovery/fetch prototype.
- **M2 (Week 8):** Local STT (whisper engine) with VAD; JSON sidecars; first VTT/SRT.
- **M3 (Week 12):** SQLite FTS index; API + minimal UI; pilot crawl plan.
- **M4 (Week 16):** Pilot run (≥100 hours), QA report (WER, timestamp drift), and ingest bundle.
- **M5 (Week 20):** Packaging (brew/pipx/Docker), docs, reproducible builds.
- **M6 (Week 24):** Handoff, training, and community launch.

_(Vendors may propose alternative timelines; justify deviations.)_

### 8.2 Roles & Collaboration

- Project Manager; Lead Engineer; Preservation/Metadata Lead; Accessibility Lead; QA Engineer; Community/Docs Lead.
- Bi‑weekly demos; shared issue tracker; public roadmap.

## 9) Acceptance Criteria

1. CLI runs fully offline on macOS/Linux/Windows; STT outputs consistent VTT/SRT/JSON.
2. Indexed search finds phrases and returns timestamped results within 150ms median on 100k segments.
3. Pilot deliverables are ingest‑ready; DORIS validates identifier mapping and provenance.
4. Documentation enables another team to reproduce a full pipeline on a fresh machine in ≤ 2 hours.
5. Licensing, SBOM, and test suite included; all CI checks green.
6. Content warning and attribution hooks present and configurable.

## 10) Vendor Qualifications

- Demonstrated experience with **speech‑to‑text**, **digital preservation**, and/or **library/archives** systems.
- Prior work with **SQLite / FTS**, CLI packaging, and cross‑platform builds.
- Commitment to open‑source maintenance (governance plan, code of conduct).

## 11) Proposal Instructions

### 11.1 Submission Contents

- **Technical approach** (architecture diagrams, data flows, Preservica integration plan).
- **Accessibility plan** (captions QA, Section 508 considerations).
- **Ethical use plan** (terms of use, content warnings, community remediation workflow).
- **Project plan & timeline**, staffing, and risk register.
- **Deliverables & milestones** with clear acceptance tests.
- **Budget** (fixed‑price by milestone; separate maintenance/options).
- **Open‑source plan** (license, governance, sustainment).

### 11.2 Evaluation Criteria

- Technical strength & feasibility (30%)
- Accessibility & ethical design (15%)
- Integration & adoptability for DORIS/Preservica (20%) :contentReference[oaicite:6]{index=6}
- Team experience & OSS track record (15%)
- Documentation & community plan (10%)
- Cost/value (10%)

## 12) Budget & Options (guidance)

Proposers should price:

- Core build (Sections 4–8) as fixed‑price with milestone payments.
- **Options:** (a) diarization plugin; (b) Datasette publishing profile; (c) volunteer QA review UI; (d) additional STT engines.
- **Maintenance:** 12‑month patch SLAs; security updates; community triage.

## 13) Risks & Mitigations

- **Rights/Terms ambiguity:** Start with DORIS‑approved collections; add “consent mode.”
- **Model drift/accuracy:** Version‑lock models; ship WER monitoring on pilot sets.
- **System load:** Strict rate limits and ETag checks; batch overnight runs.
- **Adoption gap:** Provide import mappings, docs, and training sessions for DORIS staff. :contentReference[oaicite:7]{index=7}

## 14) References (context)

- NYC Municipal Archives adoption of **Preservica** for OAIS‑aligned digital preservation within Azure; ongoing DEIA and harmful content statement work; extensive AV holdings (e.g., WNYC video/film) described in recent **Archival Review Board** reports and program documentation. :contentReference[oaicite:8]{index=8}

---

**Submission:**  
Please submit proposals (PDF + links to prior OSS) per Section 11 to the point of contact designated by the sponsor.
