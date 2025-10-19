### 1) Overview

The NYC Department of Records & Information Services (DORIS) and collaborators seek an open‑source, local‑first command‑line application and companion search UI that:

1. **Transcribes** every publicly accessible audio/video asset in the NYC Municipal Archives’ Preservica access portal ([https://nycrecords.access.preservica.com/](https://nycrecords.access.preservica.com/)) to produce accurate **closed captions** and full‑text transcripts;
2. **Packages** outputs with standards‑aligned metadata (WebVTT/SRT + JSON sidecars mapped to Dublin Core, PREMIS events, fixity) suitable for **OAIS ingest**—so DORIS can adopt the outputs directly; and
3. **Indexes & serves** transcripts and existing metadata via an external, researcher‑friendly UI that supports granular _time‑coded search_ and accessibility by design.

> **Context:** DORIS manages multi‑format collections and uses **Preservica** in an OAIS‑conformant, cloud environment; description centers on Dublin Core. Any solution must produce ingestion‑ready SIPs and align with DORIS DEIA practices and harmful‑content guidance.

This RFP is written so a team with no prior context can deliver the requested system.

---

### 2) Goals & Success Criteria

- **Accessibility:** Provide high‑quality captions (WebVTT, SRT) and transcripts for all eligible public A/V assets; captions meet WCAG 2.2 AA guidance on timing, length, and labeling.
- **Searchability:** Enable time‑coded, full‑text search across transcripts + extant metadata (title, date, collection, etc.), exposing precise jump‑to‑time playback.
- **Adoptability:** Output _OAIS‑friendly_ packages: sidecar JSON with **Dublin Core** mappings; **PREMIS** events (creation, validation); SHA‑256 checksums; an ingest manifest; and a consistent directory layout for Preservica ingest.
- **Local‑first:** All core features run offline on Apple Silicon (Metal) and CPU‑only x86.
- **Open source:** MIT or Apache‑2.0 license; docs, tests, CI, contribution guidelines.
- **Quality:** On a representative gold set, meet or exceed acceptance thresholds (see §10).
- **Ethics:** Respect rights and limitations. Provide content warnings and a correction workflow aligned with DORIS’ DEIA/harmful‑content statement.

---

### 3) Scope of Work

**3.1 Discovery & Design**

- Inventory A/V asset retrieval paths (see §6).
- Confirm metadata crosswalk (Dublin Core) and SIP structure for Preservica ingest.
- Define captioning and segmentation rules (cue duration, characters/line, reading speed).
- Establish evaluation protocol and gold set.

**3.2 CLI Application (local‑first)**

- Subcommands:

  - `scan` — enumerate eligible public assets with stable IDs/links
  - `pull` — retrieve playable proxies or source A/V (respect rate limits)
  - `transcribe` — run ASR with optional language detection, diarization, punctuation
  - `package` — create outputs: `.vtt`, `.srt`, `.json` sidecars, checksums, PREMIS log
  - `ingest` — build OAIS‑friendly SIPs and ingest manifests for Preservica
  - `index` — push/update a local search index (Lucene/OpenSearch)
  - `serve` — launch the minimal researcher UI (static or small server)

- Engine pluggability: default to **whisper.cpp** (GGUF models, Metal on macOS); support **faster‑whisper** (CTranslate2) and allow additional engines via adapter interface.
- Performance: batch & streaming modes; quantized models; concurrency controls.
- Outputs:

  - **Captions**: `.vtt` + `.srt`, time‑aligned, readable cues, speaker labels where available
  - **Transcript JSON** (one per asset): time‑coded tokens/segments; language; model + version; diarization; confidence; word‑level timings (when available); provenance
  - **Metadata JSON**: Dublin Core mapping (title, creator, date, identifier, description, subject, rights, source URL), plus any Preservica fields harvested; all fields documented
  - **PREMIS JSON**: events (transcription, validation, fixity calc), agents, software versions
  - **Checksums**: SHA‑256 for all derivative files; a single manifest per SIP

**3.3 Researcher UI (external index)**

- Search modalities: keyword/phrase, field filters, time‑coded snippet previews, result‑to‑time jump, and browse by collection/agency/date.
- Indexing: BM25 + light‑weight embeddings (e.g., Pyserini/Anserini) for semantic queries.
- Accessibility: keyboard support, visible focus, ARIA roles, caption preview, dark mode; follow WCAG 2.2 AA.
- Linking: deep‑link back to Preservica asset page; if time‑anchored links are unsupported, provide an on‑page cue with the exact timestamp.
- Feedback: inline “suggest a correction” (routes to GitHub Issues/Forms or a mailbox) with simple, respectful UX.

**3.4 Packaging for Preservica**

- Produce OAIS‑friendly **SIP** directories: `/SIP/<asset_id>/` containing captions, transcript JSON, metadata JSON, PREMIS log, checksums, and a machine‑readable ingest manifest.
- Dublin Core field usage documented; PREMIS event taxonomy documented.
- Provide sample ingest and a step‑by‑step guide for DORIS staff.

**3.5 Documentation & Handover**

- Administrator guide, user guide, and contributor guide.
- Architecture diagram, data model, and API/CLI reference (man pages).
- Reproducible benchmarks and the agreed evaluation report.
- Training session(s) for DORIS staff and community maintainers.

---

### 4) Non‑Goals (out of scope for this RFP)

- Transcription of non‑public or legally restricted holdings.
- Rights clearance for public redistribution of media.
- Large‑scale cloud hosting; deliverables must run locally.
- Full catalog synchronization with ArchivesSpace (future extension).

---

### 5) Target Environments

- **Primary dev/test**: macOS 15.x on Apple M‑series (e.g., M2 Max, 96 GB) with Metal; no NVIDIA CUDA required.
- **Secondary**: Linux x86_64 (CPU), macOS x86_64 (Rosetta), Windows 11 (optional).
- Packaging: Homebrew formula (macOS), standalone binaries, and `uv`/`pipx` install.

---

### 6) Data Acquisition & Rate Limiting

Preferred order of acquisition:

1. **Preservica APIs / export feeds** for publicly accessible proxies and metadata (recommended to ensure stability and respect for access controls).
2. **DORIS‑provided bulk export** (if arranged) for high‑volume processing.
3. **Ethical, rate‑limited HTTP retrieval** from the public access portal when 1–2 are unavailable—complying with robots.txt and fair‑use limits, with user‑tunable concurrency.

> Note: DORIS uses Preservica (OAIS) in Azure; work products must integrate smoothly with that environment and its Dublin Core metadata practices.

---

### 7) Standards & Formats

- **Captions:** WebVTT (primary), SubRip (SRT)
- **Text:** UTF‑8; normalized punctuation; optional TEI export (stretch goal)
- **Metadata:** JSON sidecars with **Dublin Core** mapping; optional JSON‑LD profile
- **Preservation:** **PREMIS** events; SHA‑256 fixity; OAIS SIP directory structure
- **Search:** Lucene/OpenSearch schema, documented; export to line‑delimited JSON

---

### 8) Accessibility Requirements

- WCAG 2.2 AA compliance for the researcher UI (keyboard, focus, ARIA, contrast).
- Caption authoring rules: max ~42 chars/line; 1–2 lines/cue; ≥ 1s and ≤ 7s per cue (guidelines adjustable); meaningful line breaks; non‑speech info as [bracketed] labels.
- Speaker labels where diarization is reliable; otherwise use neutral labels or omit.
- Multilingual handling: auto language detection, correct caption language tags, and UTF‑8.
- Inclusive language and alignment with DORIS’ DEIA and harmful‑content statement.

---

### 9) Privacy, Rights, and Ethics

- Treat outputs as _descriptive augmentation_ of public materials; do not bypass rights or access restrictions.
- Include a per‑asset **rights field** and display usage guidance prominently in the UI.
- Provide a “content note” mechanism for potentially harmful language or imagery—aligning with DORIS practice.
- Logs contain no personal data and may be disabled.

---

### 10) Quality & Evaluation

**10.1 Gold Set Creation**

- Curate ~50–100 short clips (diverse eras, speakers, audio conditions). DORIS will assist (e.g., selections from WNYC TV/radio holdings referenced in internal reports).
- Manually caption to spec; use as ground truth.

**10.2 Metrics**

- **WER** (word error rate) on “good” audio: ≤ 15% median; “difficult” audio: ≤ 30% median.
- **Caption conformance**: ≥ 95% cues pass timing/length checks on sample.
- **Search hit quality**: manual pooled relevance on 20 queries—≥ 0.7 nDCG@10.
- **Packaging validity**: 100% files produce valid checksums; PREMIS log validates against schema; ingest pilot succeeds in Preservica.

**10.3 Benchmarks**

- Report real‑time factors (RTF) by model size (tiny/base/small/medium/large‑v3) on Apple M‑series; document tradeoffs.

---

### 11) Security & Operations

- No external network required during transcription (except retrieval step).
- Verifiable checksums for every derivative file; signed release artifacts.
- CI with linting, tests, and reproducible builds; SBOM included.

---

### 12) Deliverables

1. **CLI tool** with subcommands defined in §3.2; prebuilt binaries + Homebrew tap.
2. **Researcher UI** (static build or minimal server) with documented index schema.
3. **Documentation** (admin, user, contributor), architecture diagram, data model, and API/CLI reference.
4. **Packaging profile** for Preservica: sample SIPs, ingest manifest, mapping guide.
5. **Evaluation report** with gold set, metrics, and benchmark results.
6. **Training & handover**: 1–2 live sessions + recorded walkthrough.

---

### 13) Project Plan & Milestones (illustrative 16‑week plan)

- **Weeks 1–2:** Discovery, API confirmation, metadata crosswalk, eval plan.
- **Weeks 3–6:** CLI core (`scan/pull/transcribe/package`), first SIPs, initial eval.
- **Weeks 7–9:** Index + researcher UI prototype; accessibility pass (round 1).
- **Weeks 10–12:** Performance tuning, diarization option, packaging polish.
- **Weeks 13–14:** Pilot ingest in Preservica, researcher UI hardening, DEIA/harmful‑content UX text.
- **Weeks 15–16:** Final evaluation, documentation, training, and release.

---

### 14) Vendor Qualifications

- Demonstrated expertise in **ASR** (Whisper/whisper.cpp, CTranslate2, Kaldi/k2).
- Prior work in **archives/libraries** and OAIS/Preservica, Dublin Core, PREMIS.
- Accessibility track record (WCAG 2.1/2.2 AA).
- Information retrieval/search (Lucene/OpenSearch, vector search) at scale.
- Open‑source stewardship (docs, CI, releases).

---

### 15) Open‑Source, IP, and Licensing

- Code: MIT or Apache‑2.0 (bidder may propose with rationale).
- Models: user‑supplied or downloaded under their original licenses; document provenance.
- All outputs (captions/transcripts/JSON) are produced for _accessibility and description_; bidders must document any third‑party license constraints clearly.

---

### 16) Pricing Template (fill and attach)

- **Phase A (MVP):** CLI (`scan/pull/transcribe/package`) + SIP packaging + docs.
- **Phase B (Search):** Indexer + researcher UI, accessibility compliance.
- **Phase C (Enhancements):** Diarization, embeddings search, TEI export, etc.
- Break out labor categories, hours, rates, and any optional support/maintenance.

---

### 17) Submission Instructions

**Due:** _[insert date]_ at _[time, ET]_.
**Format:** One PDF proposal + links to relevant repositories/demos.
**Sections required:**

1. Executive summary
2. Technical approach (mapped to §§3–12)
3. Project plan & staffing
4. Accessibility approach
5. Preservation packaging approach (Dublin Core/PREMIS/OAIS)
6. Risks & mitigations
7. Budget (see §16)
8. References and portfolio

Questions may be sent to _[contact]_ by _[date]_.

---

### 18) Evaluation Criteria (100 pts)

- Technical fit & architecture (local‑first, pluggable ASR, packaging): **30**
- Accessibility & DEIA alignment (captions, UI, harmful‑content notes): **20**
- Search experience & index design (time‑coded IR): **15**
- Preservation readiness (Dublin Core, PREMIS, SIP, checksums): **15**
- Team qualifications & open‑source practice: **10**
- Cost & timeline realism: **10**

---

### 19) Risks & Mitigations

- **Asset access variability** → Prefer API/export; implement respectful rate‑limited fallback.
- **Noisy/legacy audio** → Offer enhancement options and document quality expectations.
- **Rights/usage uncertainty** → Prominent per‑asset rights fields; link back to Preservica page; avoid redistributing media.
- **Model drift** → Version pinning; PREMIS software agents; reproducible builds.
- **Adoption gap** → Provide a one‑click “build SIPs & ingest” guide and staff training.

---

### 20) Appendices

**A. CLI Sketch**

```
asrkit scan --since 2020-01-01
asrkit pull --id <asset_id> --out media/
asrkit transcribe media/<asset_id>.mp4 --model small --metal --out out/
asrkit package out/<asset_id>/ --dc-map maps/dublin-core.yaml --sip sip/
asrkit index sip/ --index .index/
asrkit serve --index .index/ --port 8080
```

**B. Directory Layout (per SIP)**

```
SIP/<asset_id>/
  captions/
    <asset_id>.vtt
    <asset_id>.srt
  transcripts/
    <asset_id>.transcript.json
  metadata/
    <asset_id>.dublin_core.json
    <asset_id>.premis.json
  checksums/
    manifest-sha256.txt
  manifest.json   # ingest manifest: files, roles, fixity, software, timestamps
```

**C. Dublin Core Mapping (excerpt)**

- `dc:title` ← Preservica title or page title
- `dc:date` ← known date or best available
- `dc:description` ← abstract/summary (auto + human‑editable)
- `dc:subject` ← tags/keywords (from portal + auto keyphrases)
- `dc:identifier` ← stable asset URL/ID
- `dc:creator` / `dc:publisher` / `dc:source` ← as available and documented
  _(Full crosswalk delivered with the solution.)_

**D. Captioning Rules (summary)**

- Max ~42 chars/line; 1–2 lines/cue; cues 1–7 seconds; no orphan words; bracketed non‑speech. Speaker names when diarization confidence ≥ threshold; else neutral labels.

**E. Evaluation Queries (examples)**

- “Room 9 City Hall press strike” (WNYC newsroom context)
- “Snow removal operations video” (municipal operations)
- “Community board town meeting housing” (public meetings)
  _(Illustrative; to be finalized with DORIS.)_

---

### 21) Why this matters

This project expands _access_—for Deaf and hard‑of‑hearing New Yorkers and for researchers—while producing preservation‑ready assets DORIS can adopt. It’s design advocacy through open tools, shared standards, and careful attention to people and context.
