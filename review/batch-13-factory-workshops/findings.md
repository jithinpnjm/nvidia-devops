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

### chapter-02-gpu-compute-cluster-design.md
- [SEVERITY: high] RECURRENCE of the cross-curriculum H100/A100 FP32 TFLOPS error. The GPU spec table lists "Peak TFLOPS (FP32)" as 151 for all H100 variants and 77.3 for all A100 variants — real published FP32 (CUDA-core, non-tensor) figures are ~67 TFLOPS for H100 SXM5/PCIe and ~19.5 TFLOPS for A100. The table's FP32 values are 2.25x too high for H100 and ~4x too high for A100.
  - Evidence: Line ~28-33 GPU spec table, "Peak TFLOPS (FP32)" column.
  - Why it matters for JR2018680: This is the same wrong-H100-FP32 pattern flagged in 11+ files across 3 volumes already; a candidate reciting these numbers in an NVIDIA interview would be corrected immediately.
  - Suggested fix: Replace FP32 column with correct dense CUDA-core values (A100 ≈19.5 TFLOPS, H100 ≈67 TFLOPS), and double-check TF32/FP8 columns against NVIDIA's official (dense, non-sparsity) spec sheet — several entries (e.g., H100 TF32=606, FP8=1457) don't match published dense or sparse figures either.
- [SEVERITY: high] RECURRENCE of the GFLOPS/TFLOPS 1000x unit-magnitude slip pattern, propagated through a cost calculation. "16-node aggregate: 16 × 7,912 TFLOPS = 126 TFLOPS peak" drops 3 orders of magnitude (16×7,912 = 126,592 TFLOPS, not 126). The error propagates: "Practical after AllReduce: 126 × 0.85 = 107 TFLOPS sustained" (should be ~107,603 TFLOPS), and then into "Cost per TFLOP-year: $6.79M / (107 TFLOPS × 3 yr) = $21,121/TFLOP/year" (should be ≈$21/TFLOP/year using the correct sustained aggregate).
  - Evidence: Lines ~352-353, 378 (Part 3.2, "Real Topology Example: 128-GPU Cluster").
  - Why it matters for JR2018680: Exactly the unit-magnitude-slip pattern flagged repeatedly across this review series; also undermines the chapter's own cost-per-TFLOP framework used to justify hardware decisions.
  - Suggested fix: Correct the aggregate figure to 126,592 TFLOPS (~126.6 PFLOPS) and recompute downstream cost-per-TFLOP-year.
- [SEVERITY: medium] Interview-answer worked example has a ~1000x arithmetic error: "$0.026 × 64 GPU × 13.4 extra hours = $22,400" — actual product is $22.30, not $22,400 (verified: 0.026*64*13.4=22.30). This feeds into the "$537K/year" and "$1.61M over 3 years" ROI claims later in the same answer, which are likely similarly inflated.
  - Evidence: Line ~453 (Part 6 interview answer).
  - Why it matters for JR2018680: This worked "how do you justify premium interconnect cost" answer is presented as something to recite in an interview; the headline ROI number is wrong by 3 orders of magnitude.
  - Suggested fix: Recompute the per-run cost delta (~$22, not $22,400) and cascade the correction through the annual/3-year totals — the qualitative conclusion (choose IB) may still hold but the magnitude claimed is unsupported.

### chapter-03-high-speed-networking-architecture.md
- [SEVERITY: high] RECURRENCE of the AllReduce bandwidth-math error pattern (~6x), and internally self-contradictory. Section 2.1 states "200 MB / 300 GB/s (IB NDR per direction) = 0.67 ms per step", treating IB NDR as 300 GB/s. But Section 5.1 of the same chapter correctly states "Bandwidth per GPU uplink: 400 Gbps IB NDR = 50 GB/s" (400 Gbps NDR really is 50 GB/s, not 300 GB/s). The wrong 300 GB/s figure (6x too high) is then used to derive per-step ring-AllReduce times (0.67ms/step) throughout Section 4.1's "Single-Rack NVLink Topology Optimization" (e.g., "Single AllReduce on 128 GPU: ~11 ms", "Training iteration overhead: 0.7%"), understating real AllReduce time and overhead by roughly the same 6x.
  - Evidence: Line ~135 ("300 GB/s (IB NDR per direction)") vs line ~372 ("400 Gbps IB NDR = 50 GB/s") in the same file.
  - Why it matters for JR2018680: This is the specific "Ring-AllReduce bandwidth math wrong by 5-9x" pattern flagged repeatedly across the review series, appearing again here with the two conflicting bandwidth figures in the same chapter.
  - Suggested fix: Standardize on 50 GB/s for IB NDR per direction and recompute the Section 2.1/4.1 per-step and total AllReduce times (and downstream overhead percentages) using that figure.
- [SEVERITY: medium] Gradient quantization math (BF16 → INT8) claims a 4x data reduction ("140GB → 35GB", "2.1875GB → 546.875MB", "4x faster") but BF16 (2 bytes) → INT8 (1 byte) is only a 2x reduction; correct values are 140GB → 70GB and 2.1875GB → ~1.09GB, and the AllReduce time should be ~21.9ms (2x faster), not 10.9ms (4x faster).
  - Evidence: Line ~375-378 (Section 5.1, "Optimization 1: Gradient Quantization").
  - Why it matters for JR2018680: A candidate asked to reason about gradient-compression bandwidth savings needs the byte-width arithmetic right; this table overstates the benefit by 2x.
  - Suggested fix: Correct the reduction factor to 2x and recompute the derived numbers.
- [SEVERITY: low] Nonsensical/garbled unit calculation: "Throughput: 64 GPU × 350W × 100ms = 2.24 MWh per day" mixes power, GPU count, and a 100ms duration into a result labeled MWh/day; the arithmetic and units don't correspond to any coherent derivation (correct daily energy for 64×350W run continuously would be ~537.6 kWh/day, not 2.24 MWh via this formula).
  - Evidence: Line ~227 (Section 3.1, NCCL performance box).
  - Why it matters for JR2018680: Low interview-relevance but signals sloppy copy/paste of numbers that could confuse a reader trying to reproduce power/energy estimates.
  - Suggested fix: Remove or replace with a correct daily-energy calculation (kW × 24h × kWh cost).

### chapter-04-storage-infrastructure-for-ai-pipelines.md
- [SEVERITY: high] RECURRENCE of the GFLOPS/TFLOPS-style unit-magnitude slip, this time on a derived tokens/sec figure. "Tokens per second per GPU = 989 TFLOPS / 15 FLOPs per token = ~66M tokens/sec theoretical" — verified: 989e12/15 = 65.93 trillion tokens/sec, not 66 million (off by a factor of ~10^6, i.e. should read "~66 trillion" / "66T", not "66M").
  - Evidence: Line ~35 (Part 1.1, "Training Data Pipeline Math").
  - Why it matters for JR2018680: Same class of magnitude error flagged repeatedly across the review series (GFLOPS reported as TFLOPS, etc.) — here a 10^6 error in a foundational throughput estimate that seeds the rest of the storage-bandwidth sizing math in the chapter.
  - Suggested fix: Correct to ~66 trillion tokens/sec theoretical (still absurdly above the practical 300-500K figure used afterward, which is the point being made, but the stated number should be right).
- [SEVERITY: low] "Practical (accounting for memory, synchronization): ~300K-500K tokens/sec per GPU" is not independently derived and looks implausibly high for a 70B-parameter model (real-world large-model training throughput is typically in the low thousands of tokens/sec per GPU, not hundreds of thousands); flagged for follow-up verification rather than confirmed wrong.
  - Evidence: Line ~36.
  - Why it matters for JR2018680: If asked to sanity-check a training throughput number in an interview, reciting 300-500K tokens/sec/GPU for a 70B model would likely draw skepticism.
  - Suggested fix: Cross-check against known reference throughputs (e.g., Megatron-LM/NeMo published numbers) and revise.

### chapter-05-power-delivery-and-thermal-management.md
- No high/medium findings. Spot-checked power/cost arithmetic (facility power rollups, PDU 3-phase capacity 208V×100A×√3≈36kW, monthly electricity cost, COP calculations) — all verified correct. Matches Volume 1 depth bar with concrete numbers and a real troubleshooting table.

### chapter-06-software-stack-integration.md
- [SEVERITY: low] Fabricated/incorrect PyTorch API: `timeout=torch.distributed.timedelta(minutes=30)` — `torch.distributed` has no `timedelta` attribute; the correct call is `datetime.timedelta(minutes=30)` from the standard library.
  - Evidence: Line ~132 (`setup_distributed()`).
  - Why it matters for JR2018680: Minor, but a candidate copying this snippet into a live-coding round would hit an AttributeError immediately.
  - Suggested fix: Change to `import datetime` and `timeout=datetime.timedelta(minutes=30)`.
- Otherwise clean: CUDA/driver compatibility matrix, DDP/DeepSpeed code, and K8s job manifest are consistent with real NVIDIA stack conventions; no FP32/AllReduce/DCGM pattern recurrences found here.

### chapter-07-multi-node-distributed-training.md
- No high/medium findings. LR scaling (sqrt rule), throughput, and tensor-parallelism sharding arithmetic check out. Fault-tolerance code is reasonable and consistent with the checkpoint chapter.

### chapter-08-inference-serving-at-scale.md
- [SEVERITY: high] RECURRENCE of the 1000x unit-magnitude-slip pattern in the headline cost figure. "Cost per 1M tokens served: $46.6M / (2000 QPS × 86400 sec/day × 365 days × 150 tokens/seq) = $0.005 per 1M tokens" — verified: the stated denominator computes to 9.46 trillion tokens/year, giving $46.6M / 9.46M(millions) ≈ **$4.93 per 1M tokens** (not $0.005) using the formula as literally written (1-year token volume against a 3-year cost figure); even generously using 3 years of token volume to match the 3-year cost, the correct answer is **≈$1.64 per 1M tokens** — roughly 1000x and 330x off respectively from the doc's claimed $0.005.
  - Evidence: Line ~195 (Part 2.2, "Production Inference Cluster: 2000 QPS Peak").
  - Why it matters for JR2018680: This is the volume's headline economic conclusion for inference serving cost — exactly the kind of number an interviewer would sanity-check, and it's wrong by roughly three orders of magnitude, matching the GFLOPS/TFLOPS-style unit-slip pattern flagged repeatedly across the review series.
  - Suggested fix: Recompute using consistent time periods (e.g., annual cost / annual tokens, or 3-year cost / 3-year tokens) — correct figure is on the order of $1.50-5.00 per 1M tokens, not $0.005.
- [SEVERITY: medium] Multi-region capacity sizing is internally inconsistent / over-provisioned by ~2.3x. The chapter computes "132 GPUs minimum" to serve 2000 QPS, then applies "3x redundancy" to get 396 GPUs total across 3 regions — implying each region carries roughly a third of load with failover headroom. But the per-region breakdown then states Region 1 alone (100 model replicas) serves "1520 QPS" — and with 3 symmetric regions that's ~4560 QPS of aggregate capacity for a 2000 QPS target, not the ~2000 QPS (with 1 region as failover) the earlier "132 × 3" redundancy framing implied.
  - Evidence: Lines ~174-187.
  - Why it matters for JR2018680: Capacity-planning math for multi-region HA is a common systems-design interview topic; the sizing logic here doesn't hang together and would not survive a "walk me through your math" follow-up question.
  - Suggested fix: Clarify whether the design target is N+1 regional failover (each region ~2000/2≈1000 QPS capacity, tolerating 1 region down) or full triplication, and make the GPU count and per-region QPS figures consistent with that choice.

### chapter-09-multi-region-deployment.md
- No high/medium findings. Cost rollups check out (electricity calc off by <2%, immaterial rounding). Failover/health-check code and cross-region training sync narrative are reasonable and clearly caveated (async, eventual consistency).

### chapter-10-monitoring-and-operations.md
- [SEVERITY: high] RECURRENCE of the fabricated-DCGM-field-name pattern. The Prometheus scrape config and alerting rules use informal snake_case metric names (`dcgm_gpu_utilization`, `dcgm_.*_temperature`, `dcgm_.*_power`, `dcgm_gpu_temp`) that do not correspond to real dcgm-exporter Prometheus metrics. The actual DCGM field names exposed by dcgm-exporter preserve the `DCGM_FI_DEV_*` naming convention (e.g., `DCGM_FI_DEV_GPU_TEMP`, `DCGM_FI_DEV_GPU_UTIL`, `DCGM_FI_DEV_POWER_USAGE`, `DCGM_FI_DEV_SM_CLOCK`, `DCGM_FI_DEV_XID_ERRORS`), not lowercase `dcgm_gpu_temp`/`dcgm_gpu_utilization`.
  - Evidence: Line ~77, ~87 (Prometheus relabel_configs regex) and line ~129 (`expr: dcgm_gpu_temp > 75` in the `GPUTemperatureHigh` alert rule).
  - Why it matters for JR2018680: This is the exact "fabricated DCGM field names that don't correspond to real DCGM_FI_DEV_* metrics" pattern flagged repeatedly across the review series. A candidate reciting or copy-pasting this alert rule into a real Prometheus config would get zero matches — the rule silently never fires.
  - Suggested fix: Replace with real `DCGM_FI_DEV_*` metric names as exposed by dcgm-exporter (e.g., `DCGM_FI_DEV_GPU_TEMP`, `DCGM_FI_DEV_GPU_UTIL`, `DCGM_FI_DEV_POWER_USAGE`).

### chapter-11-capacity-planning-and-forecasting.md
- [SEVERITY: high] Capacity math is internally contradictory in the core worked example. "current_capacity = 400 GPUs = 6080 QPS (at 15.2 QPS/GPU)" then immediately "target_capacity = 1000 QPS = 66 GPUs needed" — but 400 GPUs already deliver 6080 QPS of capacity, which is 6x the 1000 QPS target; no additional GPUs would be needed at all. The example proceeds as if 66 more GPUs must be purchased to reach 1000 QPS, which doesn't follow from the stated current capacity.
  - Evidence: Line ~117-118 (Part 2.1).
  - Why it matters for JR2018680: This is the chapter's central "capacity vs. cost trade-off" example — the exact skill (translating QPS targets to GPU counts) an infra interview would probe, and the numbers don't hang together.
  - Suggested fix: Fix the current-capacity figure (likely meant to be a much smaller existing fleet, e.g. current QPS demand ~400 not GPU count 400) so the "66 GPUs needed" conclusion follows logically.
- [SEVERITY: medium] `forecast_gpu_demand()` only returns 12 forecast values (indices 0-11, months t=12..23) but the narrative references `forecast[12]`/"Month 12: 902 QPS", which would raise `IndexError` if actually run. Independently, running the function as written gives Month 0 ≈ 286 QPS and Month 6 ≈ 507 QPS, not the "315 QPS" and "533 QPS" quoted in the comments (verified by executing the code).
  - Evidence: Lines ~44-66 (`forecast_gpu_demand` and the "Month 0/6/12" comments).
  - Why it matters for JR2018680: A hands-on capstone-adjacent code example whose comments don't match its own output undermines trust in the worked forecasting model.
  - Suggested fix: Either extend the forecast horizon to include month 12 or drop that reference, and regenerate the "Month 0/6" comments from an actual run of the code.

### chapter-12-cost-optimization-and-resource-efficiency.md
- [SEVERITY: high] RECURRENCE of the TFLOPS/PFLOPS magnitude-slip pattern. "1200 GPU = 26.4 PETAFLOPS peak (estimate)" is ~45x too low: using this same volume's own H100 BF16 figure (989 TFLOPS/GPU, Chapter 2), 1200 GPUs = 1,186,800 TFLOPS = **1,186.8 PFLOPS** (≈1.19 EFLOPS), not 26.4 PFLOPS. This feeds directly into "Cost per PETAFLOP-year: $908K," which is therefore also off by roughly the same ~45x factor.
  - Evidence: Line ~217-219 (Part 3, "Cost per training throughput").
  - Why it matters for JR2018680: Same class of TFLOPS-magnitude error flagged across the review series; this is the chapter's own headline "cost per compute" metric for the training cluster.
  - Suggested fix: Recompute aggregate PFLOPS from the per-GPU BF16 figure already used elsewhere in Volume 21 and recalculate cost-per-PFLOPS-year.
- [SEVERITY: low] Mislabeled intermediate result, self-corrected two lines later: "`cost_per_billion_tokens = $40.2K / (25.9B tokens) = $0.00155 per billion tokens`" is actually the cost **per token** ($1.55e-6), not per billion tokens (which would be ≈$1,552); the next line correctly restates it as "cost per million tokens = $1.55," which is the figure used in all subsequent conclusions.
  - Evidence: Line ~67-69.
  - Why it matters for JR2018680: Low impact since the correct figure is used downstream, but the mislabeled line could confuse a reader trying to verify the unit conversion.
  - Suggested fix: Relabel or remove the "$0.00155 per billion tokens" line; keep only the verified $1.55/million-tokens figure.
- [SEVERITY: low] Spot/on-demand annual pricing appears to assume ~300 operating days/year rather than 365, without stating so ($120/GPU/day × 365 = $43.8K, not the stated $36K/GPU/year; ratio is consistent between on-demand and spot figures, suggesting an implicit, undisclosed days-per-year assumption).
  - Evidence: Line ~92-101.
  - Why it matters for JR2018680: Minor, but an interviewer asking "walk me through that annualization" would expose the unstated assumption.
  - Suggested fix: State the assumed operating days/year explicitly (or use 365 and update the derived annual figures).

### chapter-13-reference-architecture-100-gpu-training-cluster.md
- [SEVERITY: high] RECURRENCE of the 1000x unit-magnitude-slip pattern in the chapter's own cost-per-TFLOP figure. "Cost per TFLOP: $6.11M / (128 × 989 TFLOPS) = $48.1K per TFLOP" — verified: 6.11e6 / (128×989) = **$48.27 per TFLOP**, not $48.1K (i.e. not $48,100). This is also inconsistent with Chapter 2 of the same volume, which correctly computes the per-GPU figure as "$30 per TFLOP" (no "K") for a single H100 — a cluster-level $/TFLOP in the tens of thousands would be wildly out of line with that.
  - Evidence: Line ~97 (Hardware Cost Breakdown).
  - Why it matters for JR2018680: Same 1000x-slip pattern as flagged elsewhere in this volume (Ch. 2, Ch. 8, Ch. 12); a cost-per-compute metric is exactly the kind of number a systems-design interview would sanity-check against a simple order-of-magnitude estimate.
  - Suggested fix: Correct to ≈$48/TFLOP (drop the erroneous "K").
- Rest of chapter (topology diagram, deployment checklist, power draw 16×3.86kW=61.8kW, cost per GPU $47.7K) checks out arithmetically and is consistent with the rest of Volume 21.

### chapter-14-reference-architecture-multi-region-inference-deployment.md
- [SEVERITY: high] RECURRENCE of the cost-per-million-tokens magnitude-slip pattern (also seen in Ch. 8), and this time it drives the volume's closing competitive claim. "Cost per million tokens: $18.59M / (2000 QPS × 86400s × 150 tokens/seq) = $0.008/1M tokens" mixes an annual cost ($18.59M/year) with only a single day's token volume (2000×86400×150 = 25.92B tokens = 1 day, not 1 year) — computed literally, this gives ≈$717/1M tokens; using a consistent annual/annual comparison (18.59M / (25.92B×365)) gives ≈$1.96/1M tokens. Either way it's nowhere near the stated $0.008/1M tokens (off by 245x-90,000x). This directly undermines the chapter's claim "Competitive vs AWS Bedrock (~$0.005-0.02/1M tokens)" and the Volume 21 summary's "$0.008 per million tokens (competitive)" — the real figure (~$2/1M tokens) is roughly 100-400x higher than commercial Bedrock pricing, i.e. NOT competitive.
  - Evidence: Line ~97 (Cost Breakdown) and reiterated in the chapter Summary (line ~285) and would also affect the "$0.002/token" vs "$0.008/token" comparison in the Key Insight (line ~289 — note these are also inconsistently written as "/token" there vs "/1M tokens" in the cost breakdown, a further units-labeling error).
  - Why it matters for JR2018680: This is the same 1000x-class magnitude-slip pattern recurring for the fourth time within Volume 21 alone (also in Ch. 2, Ch. 8, Ch. 12, Ch. 13), and here it produces the volume's final, headline "is this economically competitive" conclusion — exactly the kind of claim a systems-design interview would stress-test, and it's wrong.
  - Suggested fix: Recompute using consistent annual cost / annual token volume (≈$1.96-2/1M tokens), and revise the "competitive vs Bedrock" claim accordingly since the corrected figure is substantially higher than Bedrock's published range.

### labs/lab-01-cluster-design-workshop.md
- [SEVERITY: medium] Reference solution arithmetic doesn't multiply out: "Throughput: 243 QPS per GPU × 32 GPU = ~500 QPS" — 243 × 32 = 7,776, not ~500. The final "~500 QPS" figure is actually consistent with the volume's established ~15.2 QPS/GPU figure (Chapter 8: 15.2 × 32 = 486.4 ≈ 500), suggesting "243" is a stray/wrong intermediate number, not the "~500" conclusion.
  - Evidence: Line ~156 ("Example Solution (Reference)").
  - Why it matters for JR2018680: This is the lab's official model-answer used for grading; a student (or interview candidate rehearsing this material) checking the arithmetic would find it doesn't hold up.
  - Suggested fix: Replace "243 QPS per GPU" with the ~15.2 QPS/GPU figure established in Chapter 8, consistent with the rest of the volume.

### labs/lab-03-storage-pipeline-design.md
- [SEVERITY: low] `measure_cache_efficiency()`'s "Effective throughput" print statement conflates a hit-rate percentage with a MB/sec bandwidth figure (`nvme_hit_rate * 100` used directly as "MB/sec"), a unit/category mismatch in illustrative simulation code rather than a factual claim.
  - Evidence: Line ~251.
  - Why it matters for JR2018680: Minor; a careful reader implementing this exercise would need to fix the throughput formula to use real NVMe/NAS bandwidth numbers (e.g., from Chapter 4) rather than the hit-rate percentage itself.
  - Suggested fix: Multiply hit rates by actual tier bandwidths (e.g., NVMe ~7 GB/s, NAS ~10 GB/s aggregate) established in Chapter 4, not by 100.
- Otherwise clean: DataLoader benchmarking, distributed sampler usage, and checkpoint/resume code are technically sound.

### labs/lab-04-capacity-planning-exercise.md
- [SEVERITY: low] Inconsistent per-GPU power assumption used for the facility power limit: the plot axis label uses "0.33 kW/GPU" (line ~94) while the surrounding text/print statement uses "0.35 kW/GPU" (line ~108, ~241, ~315) — neither cleanly yields the stated "~150 GPU" limit at 50kW (50/0.33≈151.5, 50/0.35≈142.9).
  - Evidence: Line ~94 vs ~108/241/315.
  - Why it matters for JR2018680: Minor; doesn't change the qualitative conclusion (facility-limited by year 2-3) but is an easy inline fix for consistency.
  - Suggested fix: Standardize on 0.35 kW/GPU (H100 TDP figure used elsewhere in the volume) and recompute the ~143 GPU limit.
- Otherwise clean: exponential forecasting, hardware refresh planning, and TCO/optimization code are logically sound and consistent with the rest of Volume 21's cost model.

### index.md (Volume 21)
- [SEVERITY: low] Stub content: "Volume structure and content to be developed. See chapter list below for planned scope." — no chapter list actually present, and this is inconsistent with the fact that all 14 chapters + 4 labs are fully written. Contrast with Volume 22's index.md, which is a complete, well-structured overview.
  - Evidence: Full file content (6 lines).
  - Why it matters for JR2018680: Cosmetic/structural only — doesn't affect technical content, but is an easy, low-risk fix (structural/build integrity criterion).
  - Suggested fix: Replace with a proper index summarizing the 14 chapters and 4 labs, matching the Volume 22 index style.

## Volume 22 — Customer Workshops: Industry-Specific AI Solutions

### chapter-01-consulting-methodology-for-customer-engagement.md
- [SEVERITY: high] Power-cost line item is off by 10x, inflating the customer-facing cost quote in the chapter's central worked example. "Power (8 GPUs × 250W × 8,760 × $0.15/kWh) ... $26,280" — verified: 8 × 0.25kW × 8,760h × $0.15/kWh = **$2,628**, not $26,280. The wrong figure propagates into "Subtotal Ops (Annual): $111,164" (which sums power+cooling+network+staff using the inflated power number) and into the customer-facing pitch text ("$0.70 per million inferences... 3-4x cheaper than cloud inference").
  - Evidence: Line ~146 (Cost Breakdown table, "Power" row) and downstream Subtotal/cost-per-inference figures.
  - Why it matters for JR2018680: This chapter is explicitly about building a "justifiable cost model" for a customer quote — the flagship consulting skill of the volume — and the worked example's core arithmetic doesn't check out. It's also consistent with the review series' repeated finding of magnitude slips in cost/power calculations across volumes.
  - Suggested fix: Correct the power line to $2,628/year, recompute cooling (30% of corrected power ≈ $788), Subtotal Ops (≈$80.4K), and the downstream cost-per-inference and "$/day" figures.
- [SEVERITY: low] Units inconsistency in the customer-facing pitch: "$300/day for 157.7 million inferences/year" should read 157.7 **billion** inferences/year (matches the cost table's "157.7B" figure) — as written it understates annual volume by 1000x.
  - Evidence: Line ~156.
  - Why it matters for JR2018680: Minor wording slip, but it's the literal script a solutions architect would read to a customer.
  - Suggested fix: Change "million" to "billion."

### chapter-02-banking-and-financial-services.md
- [SEVERITY: high] RECURRENCE of the wrong-GPU-spec pattern, this time for A100 FP64. "A100 has 312 TFLOPS FP64 (L40S only 25 TFLOPS)" is fabricated — real A100 FP64 (CUDA core) is ≈9.7 TFLOPS, and FP64 Tensor Core (matrix) throughput is ≈19.5 TFLOPS; 312 TFLOPS is actually in the ballpark of A100's FP16/BF16 Tensor Core figure (312 TFLOPS dense), not FP64. It's off by roughly 16-32x. L40S's "25 TFLOPS FP64" is also implausible — Ada Lovelace consumer-class GPUs like L40S have crippled FP64 throughput (~1/64 of FP32, on the order of 1-1.5 TFLOPS), not 25.
  - Evidence: Line ~65 (Use Case 2, "Why A100 (not L40S)").
  - Why it matters for JR2018680: This is the same class of error as the repeatedly-flagged wrong H100 FP32 figure (a real GPU's precision-specific TFLOPS stated wildly incorrectly) — here applied to A100 FP64, the exact spec a "why GPU over CPU for VaR" interview question would probe.
  - Suggested fix: Replace with real figures (A100 FP64 ≈9.7-19.5 TFLOPS; L40S FP64 ≈1-1.5 TFLOPS) and recheck whether the "12x faster" claim still holds (directionally yes, but the stated absolute numbers must change).
- [SEVERITY: medium] Interview model-answer under-provisions relative to the stated requirement. Q2's answer says "4 L40S GPUs behind load balancer... Total = 3,000 TPS available" as the design for "5,000 TPS with <100ms latency" — 3,000 TPS capacity cannot serve a 5,000 TPS sustained requirement. This also contradicts the chapter's own architecture description a few lines earlier ("2 Clusters of 4 L40S GPUs" = 8 GPUs, 6,000 TPS).
  - Evidence: Line ~111 vs line ~29, ~39.
  - Why it matters for JR2018680: This is presented as the "model answer" to recite in an interview; a candidate using it would propose a design that can't meet its own stated throughput target.
  - Suggested fix: Align the interview answer with the chapter's actual 8-GPU/6,000 TPS architecture.

### chapter-03-generative-ai-and-large-language-models.md
- [SEVERITY: high] RECURRENCE of the cost-per-token magnitude-slip pattern, in the chapter's headline "1,000x cheaper" savings claim, and internally self-contradictory. Two lines earlier the chapter correctly computes cost-per-token as $0.00000174 (from $110K/year ÷ 63B tokens/year), which is **$1.74 per 1M tokens** — but the "vs cloud" comparison then states "GPU cluster: $0.0011 per 1M tokens ($1.74/year @ 1B tokens)" (both figures wrong: should be $1.74/1M tokens and $1,740/year @ 1B tokens) and concludes "Savings: 1,000× cheaper at scale." Using the chapter's own correctly-derived $1.74/1M-token figure against AWS's stated $2.00/1M tokens, the real savings is only **≈1.15x**, not 1,000x.
  - Evidence: Lines ~60-66.
  - Why it matters for JR2018680: This is the chapter's headline economic pitch ("GPU beats cloud by 1000x") and it's flatly contradicted by the chapter's own math two lines above it — exactly the kind of number an interviewer or a skeptical customer would immediately challenge.
  - Suggested fix: Recompute consistently: GPU cost ≈$1.74-1.75/1M tokens vs AWS $2.00/1M tokens ⇒ modest (~13%) savings, not 1,000x. If a larger savings multiple is intended, the underlying $110K/year or 63B tokens/year assumption needs revisiting, not the comparison arithmetic.
- [SEVERITY: high] RECURRENCE of the 1000x unit-magnitude-slip pattern in the interview-prep answer. "10,000 users × 100 tokens/day = 1B tokens/day" — verified: 10,000 × 100 = 1,000,000 = **1 million** tokens/day, not 1 billion (off by 1000x). This wrong 1B figure is then used consistently: "At $2/million (cloud), that's $2,000/day = $730K/year" (mathematically consistent with the wrong 1B premise, but the correct answer using 1M tokens/day is $2/day ≈ $730/year — 1000x smaller).
  - Evidence: Line ~83 (Interview Preparation Q&A).
  - Why it matters for JR2018680: This is presented as a spoken interview answer to memorize; the "$730K/year" conclusion is wrong by exactly 1000x, and is the primary numeric evidence for the answer's central claim that "inference dominates [training cost] by 3-4x."
  - Suggested fix: Correct to 1M tokens/day → $2/day → ~$730/year, and reconsider whether the "inference dominates training cost" conclusion still holds at the corrected scale (it likely still holds at higher user counts, but the specific numbers given don't support it).

### chapter-04-automotive-and-autonomous-vehicles.md
- [SEVERITY: high] Content mix-up: the "Requirements" section for the Drive Orin edge-deployment use case contains manufacturing/predictive-maintenance content, not automotive content: "50 production lines, 1,250 bearings" and "Prediction window: 7-14 days before failure" describe bearing-failure prediction (matches Chapter 8's predictive-maintenance topic), not autonomous-vehicle perception. This appears to be copy-pasted from the Manufacturing chapter and not adapted.
  - Evidence: Line ~24-25 (Use Case: Edge Deployment on Drive Orin, "Requirements").
  - Why it matters for JR2018680: A clear structural/content-integrity defect — a candidate studying this chapter for AV/edge-inference interview prep would be reading requirements for the wrong industry entirely.
  - Suggested fix: Replace with actual AV requirements (e.g., number of vehicles/fleet size, sensor suite, frame rate, operating domain) consistent with the rest of the use case.
- [SEVERITY: low] "Single GPU failure rate: ~0.1%/year, Dual redundancy: ~0.001%/year" — for independent failures the dual-redundancy rate should be roughly (0.1%)² ≈ 0.0001%/year, not 0.001%/year (10x higher than the independent-failure model would predict, though plausible if failures are treated as partially correlated).
  - Evidence: Line ~33-34.
  - Why it matters for JR2018680: Minor; if asked to justify a redundancy argument with a simple reliability calc, this ratio doesn't quite hold up to a first-principles check.
  - Suggested fix: Either show the reliability math explicitly (independent vs. correlated failure assumption) or adjust the figure to ≈0.0001%/year.

### chapter-05-pharmaceuticals-and-drug-discovery.md
- [SEVERITY: high] Multiple mutually-inconsistent throughput/speedup figures in the flagship virtual-screening example. Three numbers are given that cannot all be true simultaneously: (1) "Current time: 232 days (CPU)" for 10M molecules implies a CPU baseline of only ≈0.5 molecules/sec; (2) "CPU baseline: 128 molecules/sec (256-core cluster)" implies 10M molecules would take ≈21.7 hours, not 232 days (256x discrepancy); (3) "GPU (8 A100s): 800 molecules/sec (50× faster)" — but 800/128 = 6.25x, not 50x (verified). None of the three reconcile with each other.
  - Evidence: Line ~21, ~28-29 (Use Case 1 Requirements/Performance).
  - Why it matters for JR2018680: This is the chapter's headline "GPU vs CPU speedup" claim for pharma virtual screening — exactly the kind of ROI number a solutions architect would present to a customer, and none of the underlying arithmetic is self-consistent.
  - Suggested fix: Pick one consistent CPU baseline (either the 232-day figure or the 128 molecules/sec figure, not both) and recompute the GPU speedup multiplier from it.

### chapter-06-telecommunications.md
- No high/medium findings. Compute-budget math (10M samples × 10ms = 100K sec, parallelized 1000-way = 100 sec within 300 sec budget) and ROI (40x) check out.

### chapter-07-healthcare-and-medical-imaging.md
- [SEVERITY: high] Radiologist time-saved value is stated inconsistently, and the discrepancy materially changes the ROI conclusion. Requirements section: "Time saved: 50,000 × 23 min = 19,167 hours/year = **$1.9M value**." Cost Model section (same use case): "Radiologist time saved: **$274K/year**" — a ~7x contradiction for the identical benefit figure. Using $1.9M, net benefit would be ≈$1.76M/year with payback in ≈1 month, not the stated "$129K/year, payback in 1.8 years" (which is consistent only with the $274K figure).
  - Evidence: Line ~20 vs line ~42-43.
  - Why it matters for JR2018680: ROI/payback-period justification is exactly the kind of business case a solutions architect presents to a hospital customer; the two contradictory benefit figures in the same chapter would not survive a customer's own back-of-envelope check.
  - Suggested fix: Reconcile the hourly-rate assumption used to convert 19,167 hours/year into a dollar figure, and make both sections consistent (pick one value, e.g. clarify if $1.9M is gross clinical value and $274K is a discounted/labor-cost-only figure — if so, state that distinction explicitly).

### chapter-08-manufacturing-and-predictive-maintenance.md
- [SEVERITY: high] Latency SLA is marked as met when the chapter's own math shows it is violated. "Inference: 5ms per bearing × 25 = 125ms total" is immediately followed by "Latency requirement: <100ms ✓" — but 125ms exceeds the stated <100ms requirement (5×25=125, verified). The architecture summary also claims "Latency: <100ms for 25 bearings," which contradicts the computed 125ms.
  - Evidence: Line ~29, ~32-34.
  - Why it matters for JR2018680: This is a real requirements/latency-budget check — the exact kind of "does your design actually meet the SLA" verification an infra interview would probe — and the chapter marks a failing design as passing (✓).
  - Suggested fix: Either batch/parallelize bearing inference to fit under 100ms (e.g., across multiple cores on the Jetson) and show the corrected math, or revise the SLA/architecture claim.
- [SEVERITY: medium] Per-failure downtime cost is inconsistent between the "current state" and "avoided downtime" halves of the same ROI calculation: "Current state: 10 failures/year × $50K downtime" uses $50K/failure, but "Avoided downtime: 7 × $150K" uses $150K/failure for the identical failure type — a 3x unexplained jump that inflates the "$1.05M/year avoided" and downstream "$960K/year net benefit, payback in 3 weeks" figures.
  - Evidence: Line ~39 vs ~43.
  - Why it matters for JR2018680: This is the chapter's central ROI/payback pitch; the inconsistent unit cost undermines the "3 weeks payback" headline number used to justify the investment.
  - Suggested fix: Use a single, justified downtime-cost-per-failure figure throughout (state if $150K reflects a different/worse failure class than the historical $50K average).

### chapter-09-scientific-research-and-simulation.md
- [SEVERITY: high] RECURRENCE of the 1000x unit-magnitude-slip pattern, compounded by an internally inconsistent compute-time claim. "10 runs × 1,200 steps × 1 petaflop-sec = 12 petaflop-seconds" is arithmetically wrong — 10 × 1,200 × 1 = **12,000** petaflop-seconds, not 12 (stated both in Requirements "Total compute: 12 petaflop-seconds" and repeated in the Compute breakdown). Separately, "32 A100s = 1.6 petaflops → ~7.5 days per run" doesn't follow from the stated per-run compute (1,200 petaflop-seconds): at 1.6 PFLOPS sustained, one run would take 1,200/1.6 = 750 seconds (12.5 minutes), not 7.5 days — the "7.5 days" figure would require a throughput of only ≈0.00185 PFLOPS, roughly 865x slower than the stated 1.6 PFLOPS.
  - Evidence: Line ~24, ~37-38.
  - Why it matters for JR2018680: This is the chapter's central compute-sizing example ("why 32 A100s, how long does the ensemble take") — exactly the kind of capacity math a systems-design interview would walk through, and the numbers are internally contradictory by three orders of magnitude in one place and ~865x in another.
  - Suggested fix: Recompute total compute as 12,000 petaflop-seconds, and derive per-run time consistently from the stated 1.6 PFLOPS sustained throughput (≈12.5 min/run compute-bound, so the 6-month "pipelined 3 runs in parallel" timeline claim likely needs to be re-derived from a different bottleneck, e.g. I/O or ensemble post-processing, if 7.5 days/run is otherwise intended).

### index.md (Volume 22)
- No findings. Well-structured overview consistent with the 9 chapters and 4 labs actually present; good cross-references to Volumes 4, 11, 16, 21.

## Volume 22 Labs

### labs/lab-01-banking-use-case-workshop.md
- [SEVERITY: high] RECURRENCE of the fabricated-tool-output pattern: physically impossible GPU memory readings. The lab establishes each L40S GPU has 48,080 MiB (≈47 GiB) total memory (`nvidia-smi --query-gpu=... memory.total` output, Section 5), but later fabricated tool output shows memory usage exceeding that capacity: Section 10's load-test summary states "GPU memory: 68-70 GB used per GPU," and Section 12's diagnosis shows `nvidia-smi` memory.used readings of "68200," "75600," and "76000" MiB (68.2-76 GB) — all impossible on a 48 GB card.
  - Evidence: Line ~52-55 (memory.total = 48080 MiB) vs line ~256 ("68-70 GB used") and line ~284-288 (memory.used values 68200-76000).
  - Why it matters for JR2018680: This is the same "fabricated tool output" pattern flagged repeatedly across the review series (wrong DCGM fields, wrong Xid codes) — here it's fabricated `nvidia-smi` memory readings that violate basic GPU hardware limits, which would be an immediate red flag to anyone who has actually run `nvidia-smi` on an L40S.
  - Suggested fix: Cap the fabricated memory.used values below 48,080 MiB (e.g., 38-44 GB used, consistent with "headroom for batching" framing already in the text).
- Otherwise the lab's throughput/latency benchmark narrative is internally plausible (batch-size-vs-throughput/latency tradeoff direction is correct) and the SLA validation table correctly compares against Chapter 2's stated targets.

### labs/lab-02-llm-serving-design.md
- [SEVERITY: high] Throughput formula's own arithmetic doesn't support its stated conclusion (~8x off). "Throughput: (100 requests × 500 tokens) ÷ (total time) = 50,000 tokens ÷ (100 × (0.045 + 500 × 0.0038)) seconds ≈ 2,100 tokens/sec ✓" — verified: 100 × (0.045 + 500×0.0038) = 194.5 seconds, and 50,000/194.5 = **≈257 tokens/sec**, not ≈2,100 (off by ≈8x). The formula as written computes a serial (sum-of-all-requests) elapsed time, which is inconsistent with a concurrent-batching throughput claim of 2,100 tokens/sec.
  - Evidence: Line ~220-222 (Step 4, "Measure Per-Token Latency During Generation").
  - Why it matters for JR2018680: This is a hands-on lab whose worked-example math a candidate would be expected to reproduce and defend; the formula as literally written doesn't support the "✓" SLA-passing conclusion it's presented alongside.
  - Suggested fix: If requests are processed concurrently (continuous batching, which is the whole point of vLLM), state the actual measured wall-clock time (not a serial sum) in the denominator — the elapsed time would need to be ≈23.8 sec to yield 2,100 tokens/sec, which should be clarified as the real measured value rather than derived from the serial-sum formula shown.
- Otherwise clean: GPU memory readings in the troubleshooting scenarios stay within the A100 80GB budget (68-77.7GB), unlike the lab-01 L40S example; tensor-parallel and quantization narrative is directionally sound.

### labs/lab-03-edge-deployment.md
- [SEVERITY: medium] Jetson Orin spec line mixes units and uses a non-standard memory config: "GPU 0: NVIDIA Orin (12 GB, 275 TFLOPS)" — 275 is NVIDIA's published **TOPS** (INT8 sparse) figure for the top-tier Jetson AGX Orin 64GB module, not TFLOPS (a different unit for floating-point ops), and "12 GB" isn't a standard Jetson Orin memory configuration (real options are 8/16/32/64 GB).
  - Evidence: Line ~50 (`nvidia-smi` fabricated output in Environment Setup).
  - Why it matters for JR2018680: Jetson/edge hardware specs are a plausible interview topic for an automotive/robotics-adjacent role; conflating TOPS (INT8) with TFLOPS (FP) is a real-world unit confusion worth getting right, and mirrors the review series' broader pattern of imprecise GPU spec figures.
  - Suggested fix: Use a real Jetson Orin SKU's published spec (e.g., Jetson AGX Orin 64GB: 275 TOPS INT8; Jetson Orin NX 16GB: 100 TOPS INT8) and label it TOPS, not TFLOPS.
- Otherwise clean: latency/FPS benchmark numbers are internally consistent (24-26ms latency ↔ ~40 FPS), and the SLA validation table correctly flags the fail-safe gap as unresolved (⚠️) rather than falsely marking it passed.

### labs/lab-04-medical-imaging-pipeline.md
- [SEVERITY: high] RECURRENCE of the ms/sec (1000x) unit-magnitude-slip pattern, and internally self-contradictory within the same lab. Step 4's "Expected output" states "Inference latency: 8.2 ms ✓ (within SLA)" (Section 9), but Step 6's throughput benchmark, in the very same file, uses "8 sec/study" consistently ("Actual GPU time: 50,000 studies × 8 sec/study ÷ 2 GPUs ÷ 86,400 sec/day = 2.31 days" — verified correct at 8 sec/study) and Chapter 7 (the source chapter for this lab) also establishes "Inference time: 8 seconds per study (A100)." The "8.2 ms" figure is a 1,000x understatement of the model's actual per-study inference time used everywhere else.
  - Evidence: Line ~203 ("8.2 ms") vs line ~300-302 ("8 sec/study") in the same file, and Chapter 7 line ~26 ("Inference time: 8 seconds per study").
  - Why it matters for JR2018680: The exact ms/sec 1000x-slip pattern flagged repeatedly across this review series, occurring twice in the same lab file with directly conflicting values for the identical metric.
  - Suggested fix: Correct Section 9's "Expected output" to "8.2 sec" (or the dummy toy model's genuinely-fast synthetic latency should be clearly labeled as illustrative and not conflated with the real 8 sec/study figure used for capacity planning).
- Otherwise clean: HIPAA audit-logging code, DICOM/Hounsfield-unit preprocessing, and batch-processing code are technically reasonable.

## Volume 24 — Capstone Projects: Building Real GPU Systems

### index.md
- No findings. Well-structured, all 12 projects map to real content files (no orphaned links), consistent with placeholder-exclusion noted in PROGRESS.md.

### chapter-01-cuda-kernel-optimization.md
- [SEVERITY: high] FLAGSHIP RECURRENCE of the H100 FP32 TFLOPS error pattern — this is the single most damaging instance found in this batch. The entire capstone project is built on "H100's peak FP32 throughput (1456 TFLOPS)," repeated throughout (Problem Statement, Success Criteria "≥1150 TFLOPS," starter-code printf comparing against 1456.0, roofline "H100 peak compute (FP32): 1456 TFLOPS," Python roofline plot `peak_compute = 1456`, the spoken interview answers claiming "1232 TFLOPS, which is 84.6% of peak," and the Evaluation Rubric's throughput bands). NVIDIA's published H100 FP32 (CUDA-core, dense, non-tensor) peak is **≈67 TFLOPS** — the doc's figure is off by roughly **22x**. 1456 doesn't correspond to any real H100 precision mode either (TF32 dense ≈495, TF32 sparse ≈989, BF16 dense ≈989, FP8 dense ≈1979) — it appears to be a fabricated/garbled number.
  - Evidence: Line ~25 (Problem Statement), ~94 (starter code printf: `H100 peak (1456 TFLOPS)`), ~109 (Success Criteria), ~154-162 (roofline calculation), ~310 (Python roofline script `peak_compute = 1456`), ~358-364 (interview-answer spoken numbers), ~380 (rubric).
  - Why it matters for JR2018680: This is exactly the error pattern the review series was specifically watching for, appearing in exactly the chapter flagged as highest-risk (a CUDA kernel-optimization capstone). Because the FP32 ceiling is fabricated ~22x too high, the entire project's premise — "optimize a real FP32 kernel to 80%+ of peak (1150+ TFLOPS)" — describes a target that is **physically impossible** on real H100 hardware without switching to Tensor Cores/lower precision (real achievable FP32 ceiling is ~67 TFLOPS, not 1150-1456). A candidate who internalized this chapter's numbers would be instantly and severely corrected in a real NVIDIA CUDA-optimization interview.
  - Suggested fix: Replace 1456 with the correct H100 FP32 dense peak (~67 TFLOPS) everywhere it appears in this file, and rescale the entire worked example (baseline/optimized TFLOPS figures, roofline plot, success-criteria thresholds, interview-answer narrative) to be consistent with a realistic FP32 target — or, if the intent was to showcase Tensor Core throughput, change the problem statement to TF32/FP16 and use the correct Tensor Core figures instead of mislabeling them as "FP32."
cat: +=: No such file or directory

### chapter-02-allreduce-algorithm-design.md
- [SEVERITY: high] RECURRENCE of the wrong-interconnect-bandwidth pattern: the Problem Statement claims "nodes connected via 1.6 TB/s Infiniband," but the Production Troubleshooting table in the same file states "inter-node (IB4, ~50 GB/s)" for the identical cluster — a 32x internal contradiction. No real single/aggregate InfiniBand configuration described in this doc (4 GPUs/node, IB4) plausibly reaches 1.6 TB/s (even the fastest current IB standards, XDR at 800 Gb/s/port ≈ 100 GB/s, are far below this); the ~50 GB/s figure used elsewhere is far more realistic for an IB4-class fabric.
  - Evidence: Line ~23 ("1.6 TB/s Infiniband") vs line ~270 ("IB4, ~50 GB/s").
  - Why it matters for JR2018680: This is the same class of wrong interconnect-bandwidth figure flagged repeatedly across the review series (paired with the AllReduce topic specifically called out as high-risk); a candidate must know real IB bandwidth figures cold for an NVIDIA networking interview.
  - Suggested fix: Use a single, correct IB bandwidth figure throughout (~50 GB/s for IB4/HDR-class, or state clearly if 1.6 TB/s is meant as an aggregate multi-rail figure across many nodes, which should then be labeled as such, not per-link).
- [SEVERITY: medium] `TENSOR_SIZE` macro doesn't match its own comment: `#define TENSOR_SIZE (100 * 1024 * 1024) // 100 MB gradient tensor` defines 104,857,600 **elements** (floats), which at 4 bytes/float is **≈419 MB**, not 100 MB (off by ~4.2x). This inflates the actual data volume moved in every benchmark in the file relative to what's documented.
  - Evidence: Line ~44.
  - Why it matters for JR2018680: A hands-on capstone whose starter code doesn't match its own stated tensor size would produce benchmark results inconsistent with the "100 MB tensor" framing used throughout the Problem Statement and Success Criteria.
  - Suggested fix: Define `TENSOR_SIZE` as `(100 * 1024 * 1024 / 4)` (elements) to get a true 100 MB float32 tensor, or update the comment/success criteria to reflect ~400 MB.

### chapter-03-distributed-training-fault-tolerance.md
- [SEVERITY: medium] ResNet-50 model size is overstated by ~12x. "Model weights (e.g., 1.2 GB for ResNet-50)" — ResNet-50 has ≈25.6M parameters; at FP32 (4 bytes/param) that's ≈102 MB, not 1.2 GB (verified: 25.56M × 4 bytes ≈ 0.102 GB).
  - Evidence: Line ~270 (Solution Walkthrough, Step 1, "Design Checkpoint Structure").
  - Why it matters for JR2018680: ResNet-50 is one of the most widely-cited reference models in ML systems interviews; getting its well-known parameter count/size wrong by an order of magnitude is a notable, easily-checked factual error.
  - Suggested fix: Correct to ≈100 MB (FP32) / ≈50 MB (FP16) for ResNet-50 model weights; keep the "optimizer state doubles/quadruples size" framing but rescale from the correct base.
- Otherwise clean: checkpoint-overhead math (42s/2500s ≈ 1.7%), the failure/recovery mermaid flow, and the fault-tolerance code are technically reasonable and internally consistent.

### chapter-04-observability-system-design.md
- [SEVERITY: high] RECURRENCE of the 100x unit-magnitude-slip pattern in the opening "Real math" framing box, self-contradicted by a correct calculation later in the same file. "100 GPUs × 20 metrics per GPU × 60 samples/hour × 24 hours × 90 days = 25.9 billion data points. At 8 bytes per point, that's ~207 GB" — verified: 100×20×60×24×90 = **259.2 million** data points (not 25.9 billion, off by 100x), and at 8 bytes/point that's **≈2.07 GB** (not ~207 GB). Solution Walkthrough Step 1, later in the same file, independently derives the *correct* figure ("100 × 20.7 MB = 2.07 GB raw"), directly contradicting the Problem Statement's "~207 GB" claim by exactly 100x.
  - Evidence: Line ~31 (Problem Statement, "Real math") vs line ~285-296 (Solution Walkthrough Step 1).
  - Why it matters for JR2018680: This is the volume's observability capstone, and the review series has repeatedly flagged magnitude-slip errors in storage/data-volume math; here the wrong framing number (~207 GB) sits right next to the correct one (2.07 GB) two sections later in the same document, which would confuse anyone trying to reconcile the two while studying.
  - Suggested fix: Correct the Problem Statement's "Real math" box to 259.2 million data points / ≈2.07 GB, matching Step 1's derivation.
