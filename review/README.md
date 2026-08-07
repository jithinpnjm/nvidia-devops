# NVIDIA Interview Quality Check — Review Protocol

**Context:** Reviewer (Jithin) has passed HR screening and hiring-manager rounds for NVIDIA, Job ID **JR2018680**. Technical rounds ahead cover NVIDIA ecosystem: software, hardware, bare-metal, Kubernetes, GPU, networking. This review audits all curriculum content (34 volumes: 10 foundational + 24 Zero-to-Hero) against interview readiness, not just doc polish.

## Scope

- `docs/volume-01` … `docs/volume-10` — Foundational/Senior curriculum (Linux, Python, K8s internals, GPU/PCIe, AI workloads, networking, observability, system design, interview prep, bare-metal/BMC).
- `docs/nvidia-zero-to-hero/volume-01` … `volume-24` — Zero-to-Hero curriculum (GPU architecture through capstone projects).

## Review Criteria (apply to every chapter)

1. **Technical accuracy** — Any factual error about GPU architecture, CUDA, NVLink/PCIe, RDMA/RoCE/InfiniBand, Kubernetes internals, DCGM, BMC/Redfish, Slurm/BCM, etc. is a **high-severity finding**.
2. **Interview-readiness gap** — Does this chapter actually prepare for what a NVIDIA AI-infra technical interview would probe? Flag topics that are covered superficially where real interviews go deep (e.g., GPU memory hierarchy specifics, NVLink topology bandwidth math, RoCE vs InfiniBand tradeoffs and when NVIDIA picks which, K8s device plugin + MIG/time-slicing internals, bare-metal provisioning/BMC/Redfish workflows, DCGM diagnostics, thermal/power troubleshooting with real numbers).
3. **Depth-bar consistency** — Volumes 1 (both curricula) are the gold standard: real annotated command output, mechanism-first diagrams with decision branches, troubleshooting tables with concrete evidence numbers, interview questions answered as first-person spoken explanations. Flag any chapter that reads as generic/thin against that bar.
4. **Cross-curriculum consistency** — Foundational and ZTH volumes cover overlapping ground (GPU, K8s, networking). Flag material contradictions between the two curricula, and flag heavy duplication that adds no additional depth.
5. **Structural/build integrity** — Broken MDX (unescaped `<`/`>` in tables, unbalanced code fences), broken internal links, missing frontmatter. Low-risk mechanical fixes (MDX escaping, obvious typos) may be applied inline. Do NOT rewrite substantive content — file it as a finding for a follow-up authoring pass.

## Checkpoint Protocol (MANDATORY — sessions may be interrupted by rate limits / account switches)

Each batch agent owns a subdirectory `review/batch-XX-<topic>/` and must:

1. **Step 0:** List every chapter/lab file for each assigned volume. Write `review/batch-XX-<topic>/PROGRESS.md` — a checklist table: `Volume | File | Status (pending/in-progress/done) | Severity Summary`. Commit this immediately before reviewing anything.
2. **Per chapter:** Review it, append findings to `review/batch-XX-<topic>/findings.md` (one section per volume, subsection per chapter), then **immediately** flip that row to `done` in `PROGRESS.md` and commit both files together. One commit per chapter (or per small group of 2-3 short chapters) — never batch an entire volume into one commit.
3. **On resume** (new session/agent instance): read `PROGRESS.md` first. Skip every row marked `done`. Continue from the first `pending` row. Do not re-review completed chapters.
4. **Finding format:**
   ```
   ### chapter-XX-slug.md
   - [SEVERITY: high/medium/low] Short description of the issue.
     - Evidence: quote or line reference.
     - Why it matters for JR2018680: one sentence tying it to interview readiness.
     - Suggested fix: one sentence (not the fix itself, unless it's a trivial MDX/typo fix applied inline).
   ```
5. **Do not push or merge.** Work stays local on your batch branch until the coordinator (main session) merges it into `review/interview-qc-main`.

## Batch Assignments

| Batch | Topic | Volumes | Wave |
|---|---|---|---|
| 01 | GPU & CUDA Fundamentals | ZTH-01, ZTH-02, ZTH-03, F-04 | 1 |
| 02 | NVIDIA Systems Portfolio | ZTH-04, ZTH-05, ZTH-06 | 1 |
| 03 | Bare-Metal & Cluster Management | F-10 | 1 |
| 04 | Networking & Interconnect | F-06, ZTH-07, ZTH-08, ZTH-09 | 1 |
| 05 | Kubernetes for GPUs | F-03, ZTH-10, ZTH-11 | 1 |
| 06 | Linux & Python Foundations | F-01, F-02 | 2 |
| 07 | AI Workloads & Training | F-05, ZTH-12, ZTH-13 | 2 |
| 08 | AI Platform & Storage | ZTH-14, ZTH-15 | 2 |
| 09 | Observability & Performance | F-07, ZTH-16, ZTH-17 | 2 |
| 10 | Production Ops & Troubleshooting | ZTH-19, ZTH-20 | 3 |
| 11 | Security | ZTH-18 | 3 |
| 12 | System Design & Interview Prep | F-08, F-09, ZTH-23 | 3 |
| 13 | AI Factory, Customer Workshops, Capstone | ZTH-21, ZTH-22, ZTH-24 | 4 |

`F-XX` = `docs/volume-XX`. `ZTH-XX` = `docs/nvidia-zero-to-hero/volume-XX`.

## Master Progress

See `review/MASTER_PROGRESS.md` for roll-up status across all batches (updated by coordinator after each batch merges).
