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

### chapter-01-gpu-memory-not-detected.md, chapter-02-gpu-driver-crash-and-xid-errors.md, chapter-03-nccl-timeout-and-collective-communication-failures.md, chapter-04-nvlink-errors-and-topology-issues.md, chapter-05-ecc-errors-and-memory-bit-flips.md
- [SEVERITY: high] All five of the first five "encyclopedia entries" in Volume 20 are unauthored stubs following the volume's own 7-part framework (Symptoms → Evidence → Diagnosis → Resolution → Verification → Prevention → Escalation). Only `Symptoms` and `Evidence` are filled in for each; `Diagnosis`, `Resolution`, `Verification`, `Prevention`, and `Escalation` are all empty headers with no content (34-35 lines per file vs. 368-447 lines for chapters 6-12).
  - Evidence: e.g. `chapter-02-gpu-driver-crash-and-xid-errors.md` lines 26-36 — `## Diagnosis` / `## Resolution` / `## Verification` / `## Prevention` / `## Escalation` each followed by nothing.
  - Why it matters for JR2018680: **Chapter 2 is specifically the Xid-error-code reference chapter** — the exact topic the review protocol flagged as highest-risk for this batch (prior batches found a wrong Xid code, 94 instead of 79, in another volume). This chapter currently contains **no Xid code table or code-to-meaning mapping at all**, so there is nothing here to independently verify or correct — the gap itself is the finding. A candidate cannot prepare for "what does Xid 79 mean and how do you respond" from this volume as it stands. Same applies to NCCL timeout diagnosis, NVLink topology troubleshooting, and ECC error response — all core NVIDIA infra interview topics with zero actual diagnostic/resolution content.
  - Suggested fix: author Diagnosis/Resolution/Verification/Prevention/Escalation for these 5 chapters to match chapters 6-12's depth, and when doing so, cross-check every Xid code against NVIDIA's official Xid documentation (e.g., confirm Xid 79 = "GPU has fallen off the bus", not 94) before publishing, given the error found elsewhere in this curriculum.

### chapter-*-placeholder.md (dead duplicates, chapters 1-12) and labs/*-placeholder.md (dead duplicates, labs 1-4)
- [SEVERITY: low] Volume 20 carries 16 dead duplicate stub files — one per chapter/lab — that are near-empty generic templates (18 lines for chapters: "Objective 1", "Objective 2", empty section headers; 11 lines for labs) and are not linked from `index.md` or referenced anywhere. They sit alongside the real, correctly-named content files (e.g. `chapter-01-placeholder.md` next to `chapter-01-gpu-memory-not-detected.md`).
  - Evidence: `chapter-01-placeholder.md` (18 lines, generic "## Learning Objectives / Objective 1 / Objective 2" template) vs. `chapter-01-gpu-memory-not-detected.md` (34 lines, real content) in the same directory.
  - Why it matters for JR2018680: not an accuracy risk (dead files, unreferenced), but repo hygiene — same class of leftover-artifact clutter as the Volume 13 duplication bug fixed on this branch's base commit (`d99bb03`). Confusing for future authors/reviewers who might edit the wrong file.
  - Suggested fix: delete all 16 `*-placeholder.md` files in `docs/nvidia-zero-to-hero/volume-20/` and `volume-20/labs/` once confirmed unreferenced (a trivial cleanup, flagged here rather than applied since it touches file existence across the volume — leaving for the coordinator's structural pass).

### chapter-06-thermal-throttling-and-cooling-degradation.md
- [SEVERITY: medium] Baseline/target GPU clock speed of "2.5 GHz" / "2500 MHz" is unrealistic for any current NVIDIA data-center GPU. Real boost clocks: A100 SXM4 ≈1410 MHz, H100 SXM5 ≈1980 MHz, H100 PCIe ≈1755 MHz — none approach 2.5 GHz (that range is typical of consumer GeForce cards, e.g. RTX 4090 ≈2.5 GHz boost, not datacenter parts).
  - Evidence: Symptoms section "GPU clock speed drops from 2.5 GHz to 1.8 GHz"; Verification section "Clock speed consistent at 2.5 GHz ... Expected: ~2500 MHz sustained"; interview answer repeats "drop from 2.5 to 1.8 GHz".
  - Why it matters for JR2018680: this is the same error shape as the H100 FP32 TFLOPS figure flagged in Batch 09 — a specific, checkable hardware number that's wrong and repeated multiple times within one chapter. An interviewer asking "what boost clock would you expect on an H100" would immediately catch ~2.5 GHz as wrong.
  - Suggested fix: replace with a real GPU's clock range, e.g. H100 SXM5 nominal/boost ≈1590/1980 MHz, and adjust the "27% clock reduction" example math to match (1833 MHz during throttle already sits closer to a real H100 clock, so only the "before throttle" baseline needs correcting).
- [SEVERITY: low] The `nvidia-smi dmon -s puctem` sample output's column header (`GPU Pwr Temp SM Mem Enc Dec XSM Mxm Fbg Xid Pid Name`) doesn't match real `nvidia-smi dmon` output, which reports columns like `pwr temp sm mem enc dec jpg ofa mclk pclk` and has no `Xid`/`Pid`/`Name` columns by default.
  - Evidence: lines 52-58.
  - Why it matters for JR2018680: minor, but a candidate who has actually run `nvidia-smi dmon` in production would notice the mismatch.
  - Suggested fix: replace with an accurate `nvidia-smi dmon` header/sample or note it's illustrative.
- Otherwise strong: decision-tree diagnosis flowchart, realistic power-limit tuning (`nvidia-smi -pl 200`), a well-reasoned troubleshooting table distinguishing paste/airflow/facility/DVFS root causes, and first-person interview answers.

### chapter-07-dma-engine-failures-and-pcie-issues.md
- [SEVERITY: high] Xid codes 94 and 63 are mapped to the wrong meanings, and the correct code for this chapter's headline symptom ("GPU falls off PCIe bus") is never mentioned. Per NVIDIA's official Xid error reference: **Xid 79 = "GPU has fallen off the bus"** (the actual code for the exact symptom this chapter opens with), **Xid 94 = "Contained ECC error"**, **Xid 63 = "ECC page retirement or row remapping recording event"** — both 94 and 63 are ECC/memory-remapping codes, not PCIe/DMA-link codes. The GPU memory-access-fault code the chapter is reaching for is closer to **Xid 31 ("GPU memory page fault")**.
  - Evidence: Symptoms — "GPU falls off PCIe bus ... Xid 94 or Xid 63 errors (GPU lost PCIe link)"; Diagnosis interpretation — "Xid 94 = GPU video memory access fault (DMA engine error)" and "Xid 63 = GPU lost PCIe link"; repeated in the troubleshooting table and both interview-answer scripts.
  - Why it matters for JR2018680: this is the exact error pattern the review protocol flagged as highest risk for this batch — Batch 09 already found Xid 94 substituted for the correct code (79) for "GPU fell off the bus" in another volume, and this chapter repeats that same wrong 94↔79 substitution, plus misattributes 63. A candidate who memorizes this chapter would give the wrong Xid code in exactly the scenario ("GPU fell off the bus") interviewers are most likely to ask about, and would misdiagnose a real ECC event (Xid 94/63) as a PCIe/DMA problem.
  - Suggested fix: correct the chapter to use Xid 79 for "GPU has fallen off the bus," Xid 31 for GPU memory/DMA page faults, and remove/relocate the ECC-code (94/63) references to the ECC chapter (05) where they belong.
- [SEVERITY: medium] PCIe Gen4 x16 bandwidth baseline is stated too low. "Should see 10-12 GB/s for PCIe Gen4 x16" — real-world `bandwidthTest` H2D/D2H throughput on Gen4 x16 is typically ~20-26 GB/s (raw link ≈31.5 GB/s minus encoding/protocol overhead); 10-12 GB/s is closer to real-world Gen3 x16 throughput, not Gen4 x16.
  - Evidence: "Baseline: Should see 10-12 GB/s for PCIe Gen4 x16, or 5-6 GB/s for Gen3 x8" and repeated in the Verification section ("Expected: 10-12 GB/s (Gen4 x16)") and the weekly bandwidth-test script (`expected=11.0`).
  - Why it matters for JR2018680: same class of error as the H100 FP32 TFLOPS figure from Batch 09 — a specific, checkable bandwidth number understated by roughly half, which would read as wrong to anyone who has run `bandwidthTest` on Gen4 hardware.
  - Suggested fix: correct the Gen4 x16 baseline to ~20-26 GB/s range (or clarify if the number is meant for a narrower link/older toolkit measurement).
- Otherwise the chapter's structure (PCIe rescan procedure, decision tree, escalation criteria) is sound and matches the depth-rework standard.

### chapter-08-fan-failure-and-cooling-system-degradation.md
- [SEVERITY: none] No accuracy issues found. Fan diagnosis flowchart, `nvidia-smi`/DCGM commands, and troubleshooting table are technically plausible and internally consistent; no Xid codes or hardware specs are misstated. Matches depth-rework standard.

### chapter-09-power-supply-issues-and-brownout-scenarios.md
- [SEVERITY: low] Repeated A100 TDP figure of "350W" doesn't match any real A100 SKU. Standard A100 power limits are 250W (PCIe 40GB), 300W (PCIe 80GB), or 400W (SXM4) — 350W isn't a canonical default for any A100 variant, though it falls within the SXM4 configurable range.
  - Evidence: "For A100: 350W" (Resolution step 1), "Per GPU max: 350W (A100)" and "4 * 350 * 1.3 = 1820W min PSU" (PSU capacity planning), interview answer "4x A100s at 350W each". H100's figure (700W) in the same chapter is correct for SXM5, making the A100 number stand out as likely wrong rather than intentionally approximate.
  - Why it matters for JR2018680: PSU capacity-planning questions ("how much power does a node of A100s need") are a plausible NVIDIA ops interview topic, and this specific, repeated number is off from every real A100 SKU's rated TDP.
  - Suggested fix: use 400W (A100 SXM4, the common cluster deployment) or clarify which A100 variant if 300W/250W (PCIe) is intended, and recompute the PSU sizing example accordingly.
- Otherwise strong: clean diagnosis flow (software-set vs. hardware voltage-sag branches), realistic IPMI/voltage-rail evidence, and well-reasoned interview answers.

### chapter-10-clock-instability-and-frequency-scaling-problems.md
- [SEVERITY: medium] Same unrealistic "2.5 GHz" / "2500 MHz" datacenter-GPU clock baseline as Chapter 6 (see finding there — real A100/H100 boost clocks top out around 1410/1980 MHz), used throughout this chapter's P-state table, oscillation examples, and both interview answers.
  - Evidence: "P0: 2500 MHz (max performance)", "Clock should stabilize at 2400-2500 MHz", verification "Expected: Constant 2500 MHz", interview answer "clock should lock at 2500 MHz".
  - Why it matters for JR2018680: repeats the same checkable-hardware-number error pattern flagged in Batch 09, now appearing in two chapters of this volume.
  - Suggested fix: same as Chapter 6 — use a real GPU's clock range (e.g., H100 ≈1590/1980 MHz boost).
- [SEVERITY: low] Two fabricated/non-existent CLI tools and one fabricated flag: `nvidia-query-gpu` (not a real NVIDIA tool — GPU queries are done via `nvidia-smi -q`), `nvidia-fw-tool` (not a real NVIDIA firmware-update tool), and `nvidia-smi -pgc <max_freq>` (not a real nvidia-smi flag; the real clock-lock flags are `-lgc`/`-rgc`, which the chapter also uses correctly elsewhere).
  - Evidence: "`$ nvidia-query-gpu -i 0 | grep -A 20 \"Performance States\"`"; "`nvidia-fw-tool update --gpu-index 0`"; troubleshooting table row 2 "Try `nvidia-smi -pgc <max_freq>` to unlock".
  - Why it matters for JR2018680: a candidate quoting these tool names in an interview would be immediately corrected; low severity because they read as clearly illustrative/placeholder rather than confidently-stated facts.
  - Suggested fix: replace with real commands (`nvidia-smi -q -d PERFORMANCE`, `nvidia-smi -lgc`/`-rgc`, and note that GPU firmware/VBIOS updates go through vendor tools, not a generic driver CLI).
- Otherwise well-structured: correct P-state concept (P0-P8 is a real NVIDIA GPU power-state range), sound DVFS-vs-thermal-vs-power decision tree, and solid interview answers.

### chapter-11-multi-gpu-imbalance-and-straggler-detection.md
- [SEVERITY: medium] NVLink per-link bandwidth understated. `nvidia-smi nvlink --status` output shows healthy links at "10GB/sec" — real per-link NVLink bandwidth is much higher: ≈25 GB/s per link for NVLink3 (A100, 12 links / 600 GB/s aggregate) or ≈50 GB/s per link for NVLink4 (H100, 18 links / 900 GB/s aggregate). 10 GB/s is closer to a single PCIe Gen4 x16 link, not NVLink.
  - Evidence: "Link 0: OK (10GB/sec) ... Link 3: DEGRADED (2GB/sec)"; Prevention section "Verify all links at 10 GB/sec ... Alert if any link < 5 GB/sec".
  - Why it matters for JR2018680: NVLink bandwidth math is an explicitly called-out interview topic in this review's criteria (topology bandwidth math); stating per-link bandwidth as 10 GB/s instead of ~25-50 GB/s would give a wrong answer if asked "how much bandwidth does one NVLink give you."
  - Suggested fix: correct the per-link figures to match the GPU generation in the example (state which GPU/NVLink generation is assumed, then use ~25 GB/s for NVLink3 or ~50 GB/s for NVLink4 as the healthy baseline).
- Otherwise strong: correct `nvidia-smi nvlink --status`/`nccl-tests allreduce_perf` command usage, a clear hardware-vs-software decision tree, and well-reasoned interview answers distinguishing straggler causes.

### chapter-12-cross-layer-diagnosis-when-metrics-lie.md
- [SEVERITY: none] No hardware-spec or Xid-code accuracy issues found. Methodology-focused chapter (layer-by-layer timing, Heisenbug/profiler-overhead reasoning, cross-metric correlation) with no checkable hardware numbers to get wrong. Strong close to the volume — ties together the diagnostic mindset from earlier chapters. Matches depth-rework standard.

### labs/lab-01-symptom-to-evidence-mapping.md, labs/lab-02-root-cause-analysis.md, labs/lab-03-production-incident-simulation.md, labs/lab-04-postmortem-analysis.md
- [SEVERITY: none] All four labs are well-constructed (scenario → hypotheses → evidence collection → solution, with rubrics), match the depth-rework standard, and are internally consistent (rate/percentage math checked in several places, e.g. lab-02 Exercise 1's clock/power percentage deltas, lab-03/04's ECC error-rate extrapolation — all correct).
- [SEVERITY: low] These labs inherit the two recurring hardware-spec issues already flagged at the chapter level rather than introducing new ones: the unrealistic "2.5 GHz / 2500 MHz" datacenter GPU clock baseline (lab-01 Exercise 2, lab-02 Exercise 1, lab-03 Exercise 1) and the "10 GB/sec" NVLink per-link bandwidth figure (lab-02 Exercise 2) — see Chapter 6/10 and Chapter 11 findings above for the correct values. Flagged here only for completeness; not counted as new distinct findings.
  - Why it matters for JR2018680: reinforces the same wrong numbers through repetition across the volume, which increases the chance a candidate memorizes and repeats them.
  - Suggested fix: once the chapter-level clock/bandwidth figures are corrected, propagate the same correction to these lab exercises (a global find-and-replace of "2.5 GHz"/"2500 MHz" and the NVLink "10 GB/sec" figures across Volume 20 would catch all occurrences at once).
