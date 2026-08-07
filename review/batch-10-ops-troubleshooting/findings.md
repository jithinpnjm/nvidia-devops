# Batch 10 — Production Ops & Troubleshooting — Findings

_Summary to be filled in when review is complete._

## Volume 19 — Production Operations

## Volume 20 — Troubleshooting Encyclopedia

### chapter-01-placeholder.md (Cluster Lifecycle and Upgrade Operations)
- [SEVERITY: medium] Wrong PCIe device ID for the A100 GPUs used throughout the scenario. The chapter's cluster is explicitly A100-PCIE-40GB (`nvidia-smi --query-gpu` output shows `NVIDIA A100-PCIE-40GB`), but every `lspci`/`dmesg` snippet shows device ID `10de:2330` (e.g. `NVIDIA Corporation Device [10de:2330]`, `nouveau: unknown chipset (0x2330)`). `0x2330` is the H100 SXM5 PCI device ID; the A100 PCIe 40GB device ID is `0x20F1`. The wrong ID is reused twice (Scenario 1 and Scenario 3).
  - Evidence: lines ~220-221 and ~342 — `05:00.0 3D controller [0302]: NVIDIA Corporation Device [10de:2330]` on a node explicitly running `A100-PCIE-40GB`.
  - Why it matters for JR2018680: this is the same class of error flagged in Batch 09 (fabricated/incorrect hardware identifiers) — an interviewer probing `lspci`/PCI enumeration output would catch a candidate quoting the wrong device ID for a GPU model.
  - Suggested fix: change device ID to `10de:20F1` (A100 PCIe 40GB) in both occurrences, or note that IDs are illustrative/redacted.
- [SEVERITY: low] "NVIDIA Fabric Manager 12.4→14.1" / "(12→14)" version numbering doesn't match real Fabric Manager versioning, which tracks the driver branch (e.g., `535.129.03`), not simple major versions like "12" or "14".
  - Evidence: mermaid diagram node A and the risk-matrix table row "NVIDIA Fabric Manager (12→14)".
  - Why it matters for JR2018680: minor — could read as inconsistent to someone who has run `nv-fabricmanager -v` before.
  - Suggested fix: use a realistic Fabric Manager version string tied to the driver branch.
- Otherwise this chapter is strong: real annotated command sequences (kubectl drain, nvidia-smi, gpu-burn), a well-reasoned canary/promote/revert decision tree, and first-person interview answers — matches the Volume 1 depth bar.

### chapter-02-placeholder.md (Incident Response and Game Day Execution)
- [SEVERITY: none] No accuracy issues found. NCCL/InfiniBand incident timeline, `ibstat` output, rank-to-node mapping, and the game-day runbook are internally consistent and technically plausible (ConnectX-7 / 400Gb/s NDR rate is correct for that HCA). Matches the depth-rework standard: real command sequences, a decision tree, and first-person interview answers.

### chapter-03-placeholder.md (Capacity Planning and Forecasting)
- [SEVERITY: medium] The worked linear-regression capacity forecast is internally inconsistent — the "output" numbers don't follow from the input data shown, suggesting fabricated/uncomputed console output rather than an actually-run example (same bug shape flagged in Batch 09: computed-looking numbers that don't reconcile).
  - Evidence: Given `weeks=[1..12]` and `avg_utilization=[42,45,48,44,52,50,46,43,51,49,47,45]` (mean ≈46.83), an actual OLS fit gives slope ≈0.22%/week and forecast(week 13) ≈48.2%, not the stated "Trend: +0.27% per week" / "Forecast week 13: 46.6%". Separately, the date labels don't match the week deltas: "week 13 (start of Aug)" to "week 26 (end of January)" is claimed as the next checkpoint, but 13 weeks after early August is early November, not end of January (off by ~3 months); "week 39 (end of June)" has the same ~3-month offset.
  - Why it matters for JR2018680: capacity-planning questions in ops interviews often ask candidates to sanity-check a forecast; presenting unreconciled numbers as a worked example undermines the "first-principles, evidence-based" claim this volume makes about itself.
  - Suggested fix: recompute the regression output and calendar mapping so the numbers are internally consistent, or clearly label them as illustrative/approximate.
- Otherwise strong: clear treatment of average vs. peak (p99) utilization, procurement lead-time reasoning, and seasonal adjustment — a topic real NVIDIA capacity-planning interviews would probe, and this chapter treats it with appropriate depth.

### chapter-04 through chapter-12, labs 1-4 (all -placeholder.md)
- [SEVERITY: high] Nine of twelve chapters (04–12) and all four labs in Volume 19 are entirely unauthored. Each chapter file is a generic 36-line template ("Chapter 4 — Topic", "this chapter covers [topic]... Content Under Development") with no real prose, evidence, diagrams, or troubleshooting content; each lab file is a 46-line template with placeholder objectives ("Objective 1", "Objective 2") and literal `[Lab content under development]` in place of exercise steps.
  - Evidence: `chapter-04-placeholder.md` line 2 `slug: "chapter-4-topic"`, line 24 heading "Content Under Development"; `labs/lab-01-placeholder.md` line 2 `slug: "lab-1-lab-title"`, line 28 `[Lab content under development ...]`. Identical pattern across chapters 5–12 and labs 2–4 (confirmed by line count: all 36 lines / 46 lines respectively, byte-for-byte template structure).
  - Why it matters for JR2018680: this is the single biggest interview-readiness gap in this batch. The volume's own index.md advertises full chapters on GPU memory/utilization troubleshooting, network fabric validation, cost optimization, multi-tenancy, security operations, monitoring at scale, disaster recovery, performance debugging, and on-call handoffs — all topics squarely in scope for NVIDIA production-ops interview questions — but none of that content exists. A candidate relying on this volume would have zero prepared material for roughly 75% of its advertised scope, including the on-call/incident-handoff chapter (Ch. 12) referenced as a cross-reference target by Chapter 2.
  - Suggested fix: author chapters 4–12 and labs 1–4 to the same standard as chapters 1–3 (real annotated evidence, mechanism diagrams, troubleshooting tables, first-person interview answers) before relying on this volume for interview prep.
