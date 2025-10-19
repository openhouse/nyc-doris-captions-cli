# Request for Proposals (RFP)

**Open‑source CLI for accessible captioning + transcript search of NYC Municipal Archives’ Preservica assets**

**Issue date:** 2025‑10‑19
**Proposals due:** _See Section 10_
**Contact:** _See Section 10_
**Intended license:** Apache‑2.0 (or MIT) for code; Creative Commons guidance for docs (see Section 11)

---

## 1) Executive summary

The sponsor seeks an open‑source, local‑first command‑line application (CLI) that:

1. **Discovers audio/video assets** available at NYC Department of Records & Information Services (DORIS) Preservica portals (nycrecords.access.preservica.com), via API when available and with ethical crawling when not.
2. **Generates high‑quality, accessible captions and transcripts** (SRT, WebVTT, TTML, JSON) entirely on local hardware using open models (e.g., Whisper/whisper.cpp), with options for GPU/CPU and quantized inference.
3. **Packages outputs for archivally sound ingest** into DORIS’s digital preservation environment (Preservica OAIS in Azure), including provenance, checksums, and metadata mappings (Dublin Core/PREMIS/METS).
4. **Builds a lightweight, external search UI** (open source) that indexes transcript text and extant metadata for granular discovery, with result links back to the original Preservica assets and timestamps.
5. **Meets accessibility (WCAG 2.2 AA/Section 508)** and inclusive design criteria across captions and UI.

Context: DORIS uses Preservica for trusted digital preservation, has ongoing data remediation to Dublin Core, and maintains significant A/V collections that would benefit from captioning and improved discovery.

---

## 2) Background & goals

- **Institutional context.** DORIS (NYC Municipal Archives) preserves multi‑format collections dating from the 17th century and manages an OAIS‑compliant preservation stack (Preservica in Azure). Recent efforts emphasize digital preservation, Dublin Core remediation, and inclusive description.
- **Problem.** Many A/V assets accessible through Preservica lack captions and searchable transcripts, hindering accessibility for Deaf/Hard‑of‑Hearing users and limiting researchers’ ability to discover specific content.
- **Goals.**

  - Create captions/transcripts **locally** to protect privacy and reduce cloud expenses.
  - Produce **ingest‑ready packages** with consistent metadata.
  - Offer an **external, open search UI** for researchers and DORIS staff.
  - Demonstrate a replicable model DORIS can adopt in‑house.

---

## 3) Scope of work

### 3.1 Functional requirements (must)

**A. Discovery & acquisition**

- Respectful asset discovery via Preservica API where available, else robots‑compliant crawling with explicit throttling and a branded User‑Agent.
- Asset registry with stable IDs, canonical URLs, mime types, durations, and checks for audio presence.
- Optional input: CSV/NDJSON of asset IDs for batch runs.

**B. Transcription & captioning**

- Local inference using open models (e.g., Whisper via `whisper.cpp`/GGUF).
- Features: language detection, segment‑level timestamps, punctuation, simple diarization (Speaker 1/2), non‑speech cues, profanity handling, and optional translation to English.
- Outputs: **SRT, WebVTT, TTML, JSON (time‑aligned)**.
- Forced alignment step to refine timestamps (max drift target ≤ ±250 ms vs. audio).
- Configurable WER/CER sampling with reports.
- Batch resumability and robust logging.

**C. Metadata & packaging**

- JSON sidecar per asset: technical info (codec/duration), model params, quantization, inference env, checksums, provenance chain (retrieval → ASR → alignment → packaging), and quality metrics.
- Mapping templates for **Dublin Core** (dc:title, dc:creator, dc:date, dc:subject, dc:identifier, dc:rights), and **PREMIS/METS** elements required by Preservica ingest.
- BagIt or ZIP packages with manifest and checksums.

**D. Index & search UI (external)**

- Create an open‑source web UI (static or minimal server) that:

  - Indexes transcripts + metadata (BM25 baseline; optional dense retrieval).
  - Supports keyword and semantic search; highlights matched transcript spans.
  - Deep‑links results back to Preservica at the **exact timestamp** (where URL fragments are supported) or to the nearest per‑segment marker.
  - Exposes simple JSON APIs for query/results.
  - Ships as a Docker image and as a static build (e.g., SQLite + Datasette or equivalent).

- Publish a small **evaluation harness** (MRR@10/NDCG@10) with a seed qrels file.

**E. Accessibility & inclusion**

- Captions conform to **WCAG 2.2 AA** and **Section 508**: accurate, synchronized, speaker changes, non‑speech cues, legible pace (~140–180 wpm), and consistent casing/punctuation.
- UI: keyboard accessible; screen‑reader friendly (tested with NVDA/JAWS/VoiceOver); adequate color contrast; skip links; focus outlines; reduced‑motion option; language tags (BCP 47).

**F. Admin & adoption**

- CLI must offer: `discover`, `transcribe`, `qa`, `package`, `push` (dry‑run supported).
- Cross‑platform binaries (macOS (Intel/Apple Silicon), Linux, Windows), plus containers.
- Comprehensive docs, JSON Schemas, and training materials.
- “Adoption kit”: step‑by‑step ingest guide for DORIS Preservica workflows.

### 3.2 Non‑functional requirements (must)

- **Performance:** On a typical workstation (8‑core CPU, 32 GB RAM), base/small models should achieve within 1–1.5× realtime; larger models may run quantized. Provide benchmarks.
- **Reliability:** Resume interrupted batches; persistent logs; automatic retries; robust error codes.
- **Security/privacy:** No asset content or transcripts leave the machine unless explicitly configured. No opaque third‑party telemetry.
- **Compliance:** Respect Preservica TOS and DORIS policies; include a legality/ethics mode with conservative defaults.

### 3.3 Optional (nice to have)

- Domain lexicons (NYC agencies, Dutch/Lenape names) with pronunciation hints.
- Language‑aware post‑processing (e.g., Dutch/German capitalization rules).
- Editors’ workbench (web or TUI) for quick human fixes.
- Audio description scaffolding (hook points, not authoring).

---

## 4) Technical architecture & constraints

- **Language/stack:** Proposers may choose (Rust/Go/Python/C++ acceptable). If using Whisper, prefer `whisper.cpp` for portability with GGUF models and optional GPU backends (Metal/CUDA/Vulkan).
- **Packaging:** Static binaries where possible; containers; reproducible builds (SBOM).
- **Indexing:** Baseline BM25 (e.g., Anserini/Pyserini/Lucene). Optional hybrid with dense embeddings (e.g., E5) and reciprocal rank fusion.
- **Data formats:** JSON Lines, Parquet for optional analytics; SRT/VTT/TTML for captions; BagIt for packaging; checksums (SHA‑256).
- **APIs & IDs:** Persist stable asset identifiers and original URLs. If Preservica provides an ingest API, include a connector; otherwise generate uploadable packages for staff ingest.
- **Observability:** Structured logs (JSON), progress bars, and quality reports.

---

## 5) Metadata, standards, and preservation

- **Dublin Core** and **PREMIS/METS** mappings provided as templates and code.
- **Provenance** recorded at each step (who/what/when/with‑which‑model).
- **Checksums** for every deliverable; manifests included.
- **Time alignment** documented (method, confidence, drift stats).
- **Rights & harmful content.** Include flags/notes fields aligned with DORIS’s harmful‑content statement and reparative description practices.

---

## 6) Accessibility & caption style guide (minimum)

- **Accuracy:** Target ≥ 95% on sampled evaluation; WER/CER reported.
- **Timing:** Error ≤ ±250 ms for segment boundaries after alignment.
- **Presentation:** Two lines max, ≤ 42 characters per line recommended; speaker changes indicated; music/effects bracketed.
- **Language tags:** Use BCP 47 in files and HTML attributes.
- **QC workflow:** Sampling plan (e.g., 5–10% stratified by year/source/language) with a simple annotation rubric and report template.

---

## 7) Security, privacy, and ethics

- Local‑only default; opt‑in for any network use (e.g., model download).
- Clear statement on TOS compliance, rate‑limits, and user identity in requests.
- No collection of PII beyond what’s necessary for provenance and logs.
- Documented **content warnings** pipeline to mark sensitive material.

---

## 8) Deliverables & milestones

**D1. Inception package (Week 2–3)**

- Technical design doc; risk register; project plan; sample mappings (DC/PREMIS).

**D2. CLI alpha (Week 6–8)**

- Discovery, basic ASR, SRT/VTT JSON output; minimal packaging; initial docs.

**D3. Quality & alignment beta (Week 10–12)**

- Forced alignment; diarization; TTML; QC sampling; first evaluation report; JSON Schemas.

**D4. Index & search UI beta (Week 12–14)**

- BM25 index; UI with deep links; seed evaluation harness; Docker/static builds.

**D5. Preservation & ingest RC (Week 14–16)**

- BagIt packaging; checksums; PREMIS/METS templates; dry‑run ingest with DORIS.

**D6. Accessibility & docs RC (Week 16–18)**

- WCAG audited UI; caption style guide; training materials; admin handbook.

**D7. Final release (Week 20)**

- Tagged v1.0.0; binaries/containers; reproducible build scripts; SBOM; final reports.

(_Vendors may propose alternate schedules; see Section 10._)

---

## 9) Acceptance criteria

- **Functional:** CLI completes full pipeline on a 50‑asset acceptance set; packages validate; index searchable; deep links correct.
- **Quality:** On a stratified sample (≥ 2 hours), **WER ≤ 10%** overall or demonstrable best‑effort given audio quality; **timestamp drift ≤ ±250 ms** median.
- **Accessibility:** Independent audit confirms WCAG 2.2 AA conformance for UI and captioning practices.
- **Preservation:** Packages pass checksum verification; DC/PREMIS/METS mappings accepted by DORIS staff for ingest to Preservica.
- **Docs/Training:** A new operator can run the full pipeline following the handbook.
- **Licensing:** Code under Apache‑2.0 (or MIT); no copyleft dependencies that impede DORIS adoption.

---

## 10) Proposal instructions

**Timeline (indicative):**

- Questions due: **T+2 weeks** from issue date.
- Proposals due: **T+4 weeks**.
- Vendor selection: **T+6 weeks**.
- Kickoff target: **T+8 weeks**.

**Submission format (≤ 25 pages + appendices):**

1. **Cover letter** and summary.
2. **Team qualifications** (relevant open‑source, speech/IR, accessibility, archives).
3. **Technical approach** (ASR, alignment, packaging, indexing, UI).
4. **Project plan** (milestones, risks, mitigation).
5. **Accessibility plan** (WCAG testing, caption standards).
6. **Preservation/metadata plan** (DC/PREMIS/METS, provenance, checksums).
7. **Security/ethics plan** (TOS, privacy).
8. **Maintenance/governance** (release, issues, triage, community).
9. **Budget** (fixed price or T&M with caps) and payment milestones.
10. **References** and code samples (links to relevant repos).

**Questions & submissions:**

- Email: **rfp@…** (plaintext or PDF).
- Subject: **RFP—Accessible Transcripts & Search CLI**.
- Include a link to a public repo (if possible) demonstrating relevant prior work.

---

## 11) IP, licensing, and governance

- Source code and docs released under **Apache‑2.0** (or MIT).
- Caption outputs and indices generated from public assets should include clear rights notices; proposer must not assume rights beyond what DORIS policies allow.
- Create a CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, release policy, and SBOM.

---

## 12) Evaluation criteria & scoring

- **Technical soundness & feasibility (30%)**
- **Accessibility & preservation rigor (20%)**
- **Team experience (15%)**
- **Open‑source practice & maintainability (15%)**
- **Cost & value (15%)**
- **Community/knowledge transfer (5%)**

---

## 13) Risks & mitigations (expected in proposals)

- **Audio quality variance** → layered models, domain lexicons, alignment.
- **Scale/throughput** → batching, resume, quantization, GPU options.
- **TOS/legal concerns** → API‑first approach, robots compliance, opt‑in modes.
- **Metadata mismatch** → early mapping workshop with DORIS; templates + tests.
- **Accessibility drift** → style guide, audits, checklists, and linting.

---

## 14) Appendices

**A. Minimal data model (JSON) for one asset (excerpt)**

```json
{
  "asset_id": "preservica:XYZ123",
  "source_url": "https://nycrecords.access.preservica.com/...",
  "duration_sec": 3672.1,
  "audio_present": true,
  "language_detected": "en",
  "transcript": [
    {
      "start": 12.34,
      "end": 15.2,
      "speaker": "spk1",
      "text": "Good afternoon..."
    }
  ],
  "captions": {
    "srt_path": "XYZ123.srt",
    "vtt_path": "XYZ123.vtt",
    "ttml_path": "XYZ123.ttml",
    "json_path": "XYZ123.transcript.json"
  },
  "provenance": {
    "retrieved_at": "2025-11-03T15:22:01Z",
    "asr": {
      "model": "ggml-base.en",
      "tool": "whisper.cpp",
      "quant": "Q5_K_M"
    },
    "aligner": "X",
    "hashes": { "audio_sha256": "…", "srt_sha256": "…" }
  },
  "dc": {
    "title": "…",
    "creator": "…",
    "date": "…",
    "subject": ["…"],
    "identifier": "…",
    "rights": "…"
  }
}
```

**B. Caption style quick‑reference**

- Two lines max, ≤ ~42 chars/line.
- New caption on change of speaker or scene.
- [music], [laughter], [applause] in brackets.
- Numbers: write out one‑through‑nine; numerals 10+.
- Avoid over‑capitalization; sentence case preferred.
- Offensive language policy configurable; never bowdlerize quoted record without flag.

**C. Seed evaluation plan**

- 2 hours stratified by decade/source/language; report WER/CER; include timestamp drift histogram and diarization error rate (if feasible).
