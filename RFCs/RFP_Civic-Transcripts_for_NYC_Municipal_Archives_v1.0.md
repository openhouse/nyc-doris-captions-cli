# Request for Proposals (RFP)

**Project:** Civic Transcripts — On‑device captioning & search for NYC Municipal Archives audio/video holdings
**Issuer:** (Your organization / consortium)
**Date:** 2025‑10‑19
**Contact:** (name, email)
**Proposal Due:** (insert date)

---

## 1. Executive Summary

NYC’s public record has thousands of hours of audio and video—press conferences, hearings, PSAs, documentaries, and community media. Much of it is not captioned, limiting access for deaf and hard‑of‑hearing New Yorkers and making granular research slow.

We seek an **open‑source, on‑device** CLI and reference UI that:

1. **Generates high‑quality closed captions and transcripts** for eligible public assets (audio & video).
2. **Attaches** those captions back to Preservica (our digital preservation platform) in a standards‑compliant way.
3. **Builds a fast, accessible, researcher‑friendly search UI** that supports keyword and semantic search across transcript text and existing metadata, with deep‑link playback into the exact moment in an asset.

This is a design‑advocacy project: we will demonstrate the value end‑to‑end and make adoption by NYC Department of Records & Information Services (DORIS) as low‑friction as possible. DORIS uses Preservica (OAIS) within its Azure environment, follows Dublin Core, and is advancing inclusive, reparative description practices. Proposers should plan to integrate cleanly with that ecosystem.

---

## 2. Goals & Non‑Goals

**Primary goals**

- **Accessibility:** Produce captions (WebVTT by default) that meet practical quality targets (see §7) and improve equity for deaf and hard‑of‑hearing users.
- **Searchability:** Provide word‑ and sentence‑level timestamps, chunked transcript indices, and a reference UI supporting keyword and semantic search with sub‑second response on typical researcher hardware.
- **Adoptability:** Make it trivial for DORIS to import sidecar captions and for other archives to reuse the tool (config‑driven, portable, documented).
- **Ethics & Governance:** Respect institutional restrictions; include guardrails for content that is sensitive or harmful; surface provenance and rights in UI.

**Non‑goals (for this phase)**

- Training proprietary ASR models on restricted holdings.
- Public hosting of restricted assets.
- Replacing Preservica; we attach to it.
- Full productionization of diarization for broadcast (optional plugin only).

---

## 3. Project Context

- **Institutional environment:** NYC Municipal Archives (DORIS) implements **Preservica** as its trusted digital repository (OAIS), within NYC’s Azure environment, to manage born‑digital and digitized content; metadata follows **Dublin Core**; a DEIA initiative informs reparative description and a harmful‑content policy. Proposers should align with this reality.
- **Why on‑device?** Many research environments are air‑gapped or bandwidth‑limited; on‑device also simplifies privacy and legal compliance.
- **Intended users:** Researchers, archivists, journalists, teachers/students, and DORIS staff.

---

## 4. Scope of Work

### 4.1 Discovery & Intake (Preservica‑aware)

- Provide a **Preservica connector** (via `pyPreservica`) to enumerate candidate assets (audio or video) and retrieve:

  - Persistent identifiers, titles, creators, dates, subjects, rights statements, and access policies.
  - Access representations or service URLs for media derivations appropriate for automated processing.

- Provide a **local‑folder connector** for pilot work and offline testing.
- Implement **eligibility filters** (e.g., media duration caps, rights constraints, collection allow/deny lists).
- Implement **rate‑limiting and polite fetching** to avoid stressing the access tier.

### 4.2 Media preparation

- Use **FFmpeg** to normalize media to mono/stereo PCM at 16 kHz; detect track language when possible.
- Pre‑segment with **VAD** (Silero or WebRTC) to reduce ASR compute and improve timestamps.
- Optional: down‑mix noisy multi‑mic sources using simple beamforming/noise gates.

### 4.3 On‑device ASR

- Default engine: **`whisper.cpp`** (GGUF models; Metal backend on macOS; CPU builds elsewhere).
- Alternate engine (pluggable): **faster‑whisper** (CTranslate2) for teams preferring Python/CPU.
- Provide **word & sentence timestamps**; apply **stable‑ts** like post‑processing for consistent cue boundaries.
- Optional plugin: **diarization** (`pyannote.audio`) with speaker labels, gated by a config flag.

### 4.4 Post‑processing & Quality

- **Normalization:** punctuation, numbers/dates normalization for US English; simple profanity masking toggle.
- **Caption constraints:** 2 lines max, ~42 chars/line, ~17 characters/second, no orphans; automatic line‑breaks on phrase boundaries.
- **Glossary injection:** allow a user‑maintained CSV of “NYC‑isms” (borough names, agency acronyms) to reduce mistakes.
- **Confidence scoring:** attach per‑segment confidence; flag low‑confidence spans for later human review.

### 4.5 Outputs

- **Captions:** WebVTT (default) + SRT; optional TTML.
- **Full transcripts:** JSON (structured with word timings) and HTML (with `<figure>`/`<figcaption>`).
- **IIIF Annotation (optional):** emit Web Annotation JSON for IIIF viewers that support time‑based annotation.
- **Packaging:** include a provenance block: tool version, ASR model checksum, audio hash, date, operator.

### 4.6 Write‑back to Preservica

- Attach the sidecar caption/transcript as an **Access** or **Preservation** representation (per DORIS policy), with:

  - Dublin Core description fields (title, type, language, relation to source, rights, provenance).
  - The **audio hash** stored in metadata to ensure idempotency (skip if an identical hash exists).

- Provide a **dry‑run** mode (no writes) for pilots.

### 4.7 Search Index & Reference UI

- Build a **local index** (Typesense or Meilisearch) over metadata + transcript chunks (~3–5 sentences / ~500–700 characters) with offsets back to timestamps.
- Add an **embeddings index** (e.g., `gte-small` or `e5-base` open models) for semantic search, stored locally.
- Ship a **reference SPA** (Vite + TypeScript + Svelte/React) that:

  - Is WCAG 2.2 AA accessible (focus states, ARIA landmarks, keyboard actions).
  - Scrubs to timecodes precisely; exposes copy‑linkable moment URLs (`?t=hh:mm:ss`).
  - Displays rights/provenance and collection context clearly.
  - Runs offline (service worker optional) against the local index.

### 4.8 CLI & Config

- Single entrypoint: `civic-transcripts`.
- Core commands: `discover`, `fetch`, `transcribe`, `export`, `attach`, `index`, `serve`, `run` (pipeline).
- Config is a **versioned YAML** file (paths, API creds, filters, engine options, rate limits).
- Ship **signed binaries** and a Homebrew formula for macOS; static builds for Linux; Windows zip.

### 4.9 Documentation & Handover

- **Admin guide:** install, configuration, credentials, rate limiting, metadata mapping, Preservica write‑back.
- **Operator guide:** how to run, resume a run, review QC flags, and re‑attach corrected files.
- **Developer guide:** plugin interface (engines, connectors, exporters), schema, tests.
- **Ethical use note:** harmful content statement, privacy, restricted items handling (align with DORIS).

---

## 5. Deliverables

1. **CLI Tooling** (source + binaries) implementing §§4.1–4.8.
2. **Reference UI** (static app + local search daemon).
3. **Preservica connector** (read + write, idempotent attachments).
4. **Schemas**: transcript JSON, chunk index, IIIF annotation (optional).
5. **Documentation** (admin/operator/developer), plus video walkthroughs.
6. **Test suite** (unit + integration + golden outputs for SRT/VTT), and headless perf tests.
7. **Pilot run artifacts**: captions for an agreed pilot set (e.g., 50–100 assets across eras), attached back into a sandbox collection.
8. **Handover**: knowledge‑transfer sessions; issue tracker triage; maintenance plan.

---

## 6. Acceptance Criteria

- **Caption quality** (pilot sample):

  - Word Error Rate (WER) ≤ 15% on clean speech, ≤ 25% on noisy archival speech (measured against a hand‑checked subset).
  - WebVTT formatting meets the constraints in §4.4 (validated automatically).

- **Performance** (on the environment in §9):

  - Throughput ≥ 1× real‑time for 16 kHz mono on M2 Max with `medium.en` (guidance; evaluated on pilot).
  - Local search latency < 200 ms p95 over an index of ≥ 100k caption chunks on the same machine.

- **Preservica write‑back:** attachments are visible with correct metadata and do not duplicate on re‑runs.
- **Accessibility:** Reference UI passes automated a11y checks and manual WCAG spot checks.
- **Documentation:** An operator unfamiliar with the code can run the end‑to‑end pilot with only the docs.

---

## 7. Accessibility & Editorial Standards

- **Caption format:** WebVTT (default), SRT; optional TTML.
- **Cue rules:** max 2 lines; ~42 chars/line; ~17 cps; no dangling words; split on phrase boundaries; add `[MUSIC]`, `[LAUGHTER]` when meaningful.
- **Speaker labels:** only when reliable; otherwise omit.
- **Transcripts:** provide HTML and plain‑text alternatives.

---

## 8. Legal, Ethical, and Policy Requirements

- **Permissions & restrictions:** Only process assets permitted by DORIS/collection policy; obey terms of use; no scraping. **All discovery and writes must occur via the Preservica API** for auditable provenance.
- **Harmful content:** Align with DORIS’s harmful‑content statement; mark content; avoid euphemisms; allow opt‑out of automatic publication for sensitive materials.
- **Privacy:** Do not retain media beyond processing; store only hashes and derived captions locally unless configured otherwise.
- **Licensing:** Tooling released under an OSI‑approved license (Apache‑2.0 or MIT). Caption files must include rights/provenance fields.

---

## 9. Target Environment & Constraints

- **Primary dev/run machine** (provided by the Project Team):

  - macOS 15.4.1; Apple M2 Max (38‑core GPU), 96 GB RAM; Metal 3; dual displays.
  - No NVIDIA GPU; **no CUDA**.
  - CLI must run with **no internet** (except when calling Preservica where credentials and policy allow).
  - Uptime and load are typical of a developer workstation.

_(A system snapshot documenting the above was shared with proposers.)_

---

## 10. Project Plan & Timeline

**Phase 1 — Inception (2–3 weeks)**

- Finalize scope, access credentials (sandbox), select pilot collections, confirm caption policies, agree on metadata mapping.

**Phase 2 — Core pipeline (6–8 weeks)**

- Implement connectors, VAD, `whisper.cpp` inference, post‑processing, exporters, pilot‑quality metrics.

**Phase 3 — Preservica write‑back + Reference UI (5–7 weeks)**

- Idempotent attachments; local index & SPA; accessibility pass; pilot end‑to‑end.

**Phase 4 — Pilot run & handover (3–4 weeks)**

- Process 50–100 assets; acceptance testing; docs/videos; training.

_(Vendors may propose alternatives if they preserve delivery value and acceptance criteria.)_

---

## 11. Budget & Pricing

Please propose:

- **Fixed‑price** for the build, tests, docs, and pilot delivery.
- **Optional add‑ons:** diarization plugin, IIIF annotation, non‑English ASR packs, Windows builds.
- **Maintenance** (SLA, updates for model drift, security patches).
- **In‑kind/open‑source offsets** (e.g., if reusing pre‑existing modules under permissive licenses).

---

## 12. Vendor Qualifications

- Demonstrated experience with **ASR at scale**, timestamped captioning, and archival media.
- Prior integrations with **Preservica** (or similar OAIS repositories) strongly preferred.
- Accessibility track record (WCAG 2.1/2.2 AA).
- Open‑source stewardship (CI, issue triage, release hygiene).
- References for at least two public‑sector or GLAM (Galleries, Libraries, Archives, Museums) clients.

---

## 13. Proposal Format

1. **Cover letter** and summary.
2. **Technical approach** addressing §§4–8.
3. **Work plan & timeline** with milestones.
4. **Team bios** (roles, time allocations).
5. **Budget** with assumptions and hours.
6. **Risk register** and mitigations (rights, QA, performance).
7. **Accessibility plan** and caption QA plan.
8. **Open‑source plan** (license, governance, contribution model).
9. **Relevant work samples** (links, repos, videos).

---

## 14. Evaluation Criteria

- **Technical fit** (pipeline, performance, robustness): 30%
- **Adoptability** (Preservica write‑back, simple ops, docs): 20%
- **Accessibility & UX quality**: 15%
- **Team experience** (ASR, archives, a11y): 15%
- **Open‑source approach & sustainability**: 10%
- **Cost & value**: 10%

---

## 15. Risks & Mitigations

- **Speech quality** (old field recordings, crosstalk) → glossary, VAD, optional diarization, QC flags, partial manual review pipeline.
- **Rate limits / access load** → capped concurrency, exponential backoff, resumable jobs, Preservica sandbox testing first.
- **Metadata drift** → versioned mapping; unit tests against live records.
- **Sensitive content** → config gates; alignment with DORIS policies; in‑UI warnings.

---

## 16. Appendices

**A. Sample JSON schemas** (transcript, chunk index, provenance)
**B. WebVTT style guide** (house rules)
**C. Preservica mapping** (DC fields, representation policy)
**D. Pilot collections list** (to be agreed)
**E. System snapshot** (see §9)

---

### Closing

This RFP centers care: for deaf and hard‑of‑hearing New Yorkers, for researchers who need to find what matters, and for archivists who must preserve provenance and ethics. We invite proposals that meet the technical brief and honor the responsibilities of public memory.

---

**Notes & context**
NYC Municipal Archives uses Preservica (OAIS) within its Azure environment, has ingested large volumes of digital content, aligns with Dublin Core, and is advancing inclusive description and a harmful‑content statement; integrations and policies should reflect this reality.

---
