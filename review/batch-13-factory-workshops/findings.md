# Batch 13 Findings — AI Factory, Customer Workshops, Capstone (ZTH-21, ZTH-22, ZTH-24)

(Summary to be added at top once review is complete.)

## Volume 21 — AI Factory

### chapter-01-ai-factory-fundamentals-and-design-principles.md
- [SEVERITY: high] Training cost worked example double-counts the 64-GPU cluster cost, inflating the answer by 64x, and contradicts an earlier correct calculation in the same chapter.
  - Evidence: Line ~234-242 computes `total_facility_power_kw` and `facility_cost_per_hour` for the *whole 64-GPU cluster* (30.24 kW total, $3.63/hr total), then `cost_per_compute_day = $87.12` (already cluster-wide for one day). The prose then does `"Hardware cost: $87.12/day × 64 GPUs × 7 days = $39,004.16"`, multiplying by 64 a second time. Earlier in the same chapter (line ~104) a consistent calc (`37.4 kW × 168 hours × $0.12/kWh = $753`) gives the correct order of magnitude for the same 7-day, 64-GPU run — off by ~52x from the $39,004 figure a few paragraphs later.
  - Why it matters for JR2018680: Cost/TCO modeling is the explicit purpose of Volume 21; an interviewer probing infra economics would immediately catch a 64x unit error, and self-contradictory numbers a few lines apart undermine credibility on the exact "cost per output" skill this volume claims to teach.
  - Suggested fix: Recompute the "hardware cost for 7-day run" as `facility_cost_per_hour * hours` (no extra ×64), matching the $753/run figure already in the chapter.
- [SEVERITY: low] "Cost per training iteration: $43,000 / ~50 iterations = $860 per iteration (assuming 2 iterations for hyperparameter search)" is internally contradictory — text references both "50 iterations" and "2 iterations" for the same figure.
  - Evidence: Line ~251.
  - Why it matters for JR2018680: Minor, but a candidate reciting this worked example in an interview would visibly stumble on the inconsistency.
  - Suggested fix: Clarify which iteration count (2 or 50) the $860 figure is meant to reflect.

### labs/lab-02-networking-simulation.md
- [SEVERITY: high] RECURRENCE of the cross-curriculum Ring-AllReduce bandwidth-math error pattern. Every "Expected output" comment in this lab is fabricated — none match what the lab's own Python code actually computes. Verified by executing the exact code:
  - `ring_allreduce(64, 1000, 400)` → actual **51.97ms**, doc claims **5.03ms** (10.3x off)
  - `ring_allreduce(64, 1000, 100)` → actual **170.10ms**, doc claims **20.10ms** (8.5x off)
  - `ring_allreduce(128, 1000, 400)` → actual **65.09ms**, doc claims **10.05ms** (6.5x off)
  - Topology exercise (Ex. 3): single_rack actual **16.54ms** vs claimed **2.51ms**; fat_tree actual **91.35ms** vs claimed **5.03ms**; multi_rack actual **212.8ms** vs claimed "~20.00ms".
  - Throughput exercise (Ex. 4): `training_iteration_time(128, 4096, 64, 5.0)` → actual compute_time **67,108.86ms**, doc claims **1048.58ms** — a clean **64x** discrepancy (exactly `num_gpu`), consistent with the code's formula multiplying total_tokens by `num_gpu` instead of dividing (a data-parallel throughput model should not make training slower with more GPUs).
  - Why it matters for JR2018680: This is the fourth+ occurrence across the review series of wrong AllReduce/bandwidth arithmetic, and now also a GFLOPS-style unit/scale slip (the exact 64x = num_gpu factor). A hands-on lab whose "expected output" doesn't match its own code is actively miseducating — dangerous for someone about to be interviewed on exactly this collective-communication math.
  - Suggested fix: Recompute all "Expected output" comments in this lab by actually running the provided code (as done above), and fix the `training_iteration_time` formula so total_tokens does not double-count `num_gpu`.
