# Batch 12 System Design and Interview Prep Review Notes

Volumes reviewed: F-08 (System Design), F-09 (Interview Prep), ZTH-23 (Interview Masterclass: GPU Systems Engineering)

Summary line will be added to the top of this file once the full pass is complete.

---

## Volume F-08 — Senior Solutions Architecture Practice

### 01-chapter-1-discovery-that-changes-the-architecture.md
No issues found. Strong depth: discovery-elimination framework, worked transcript, math check on 70B FP16 (140GB) is correct.

### 02-chapter-2-architecture-from-data-and-control-paths.md
No issues found. Control-plane/data-plane classification is accurate (including the RoCE/NCCL-is-data-plane point, and the "control plane down doesn't kill already-running data plane traffic" point, both correct).

### 03-chapter-3-trade-off-matrices-with-weighted-requirements.md
No issues found. Worked matrix arithmetic verified: weights sum to 1.00, K8s total 4.20 and Slurm total 3.30 both recompute correctly from the stated weights/ratings.

### 04-chapter-4-kubernetes-versus-slurm-decision-workshop.md
- [SEVERITY: low] Arithmetic error in the worked batch-training trade-off matrix: the K8s weighted total is stated as 2.55 but recomputes to 2.50 (0.25×3=0.75, 0.30×1=0.30, 0.20×3=0.60, 0.15×5=0.75, 0.10×1=0.10; sum=2.50, not 2.55).
  - Evidence: "TOTAL 1.00 4.35 2.55" in the "Sample annotated scoring for this exact scenario" block.
  - Why it matters for JR2018680: this chapter explicitly frames the worked matrix as "the arithmetic that survives a follow-up why" — a candidate who rehearses this exact table and gets asked to walk through the math live would visibly fail to reproduce the stated total.
  - Suggested fix: correct 2.55 to 2.50 (does not change the conclusion — Slurm 4.35 still wins).

### 05-chapter-5-gpu-sharing-and-capacity-recommendation.md
No issues found. KV-cache capacity worksheet arithmetic verified: 0.5MB × 4096 × 32 = 64GB; total 26+64+8=98GB; correctly concludes single 80GB H100 doesn't fit.

### 06-chapter-6-poc-design-test-uncertainty-not-product-demos.md
No issues found.

### 07-chapter-7-tco-and-capacity-conversations.md
No issues found. TCO worked example arithmetic verified: 12000×0.55×0.92=6072 tokens/sec; 6072×3600=21,859,200 tokens/hr; $35.70/21.8592=$1.63/1M tokens; naive $28/43.2=$0.65/1M tokens; ratio ~2.5x — all check out.

### 08-chapter-8-security-architecture-and-governance.md
No issues found.

### 09-chapter-9-migration-and-adoption-strategy.md
No issues found.

### 10-chapter-10-customer-communication-and-executive-explanation.md
No issues found. "About 12%" for 1-of-8-nodes capacity loss (12.5%) is a reasonable rounding.

### 11-senior-deep-dive-1-workload-characterization-before-architecture.md
No issues found.

### 12-senior-deep-dive-2-ai-factory-layered-architecture.md
No issues found.

### 13-senior-deep-dive-3-capacity-and-tco-convert-slo-into-resources.md
No issues found.

### 14-senior-deep-dive-4-poc-design-test-the-uncertainty.md
No issues found.

### 15-senior-deep-dive-5-security-and-governance-for-gpu-ai-platforms.md
No issues found.

### 16-senior-deep-dive-6-decision-workshops-kubernetes-slurm-run-ai-nim-and-dynamo.md
No issues found. Product descriptions (Run:ai, NIM, Dynamo roles) are accurate at the level of detail given.

### 17-senior-deep-dive-7-communicate-at-three-levels.md
No issues found (intentional condensed cross-reference of Ch.10).

### 18-senior-deep-dive-8-practitioner-role-model-solutions-architect-versus-implemen.md
No issues found. Good interview self-check rubric.

**F-08 volume complete.** 18/18 chapters reviewed. 1 low-severity finding (arithmetic error in ch.4 worked matrix).

## Volume F-09 — JR2018680 Interview Preparation

### 01-chapter-1-the-answer-framework-expose-your-reasoning.md
No issues found. Strong C-M-H-E-R framework, accurate K8s Pending-pod worked answer.

### 02-chapter-2-python-coding-interview-workflow.md
- [SEVERITY: low] Practice question 3 references a function named `summarize()`, but the chapter's worked example function is named `count_errors()`. No `summarize()` function is defined anywhere in the chapter.
  - Evidence: "Rewrite `summarize()` so that instead of silently `continue`-ing on a non-matching line, it also returns a count of malformed lines..." vs. the code block defining `def count_errors(lines: Iterable[str]) -> Counter[str]:`.
  - Why it matters for JR2018680: minor, but a candidate rehearsing this chapter verbatim could be confused referencing a function that doesn't exist in the material; also a leftover from source-document editing that should be cleaned up.
  - Suggested fix: rename `summarize()` to `count_errors()` in the practice question.
  Python/async code reviewed (`count_errors`, `check_node`/`check_all`) is correct: regex group indexing, `search` vs `match` justification, exception ordering (`TimeoutException` before more general `HTTPError`), and concurrency-bound reasoning all check out.

### 03-chapter-3-linux-troubleshooting-questions.md
No issues found. `vmstat` b-column/wchan reasoning and load-average-includes-D-state explanation are correct.

### 04-chapter-4-kubernetes-troubleshooting-questions.md
No issues found. Exit code mapping correct (137=SIGKILL, 143=SIGTERM).

### 05-chapter-5-gpu-and-ai-infrastructure-troubleshooting.md
No issues found.

### 06-chapter-6-ai-inference-architecture-questions.md
No issues found. TTFT (prefill/queue-bound) vs TPOT/ITL (decode/memory-bandwidth-bound) distinction is technically accurate.

### 07-chapter-7-hpc-networking-questions.md
No issues found on the RDMA/RoCE/InfiniBand conceptual explanation (accurate: RDMA bypasses CPU/kernel, InfiniBand is natively lossless with credit-based flow control, RoCEv2 needs PFC/ECN to approximate lossless behavior). The illustrative `nccl-tests` output table's busbw values are rough/illustrative and don't exactly match the ring-allreduce busbw formula (busbw ≈ algbw × 2(n-1)/n), but the table is explicitly presented as illustrative sample output, not a specific hardware performance claim, so not flagged as a hard error.

### 08-chapter-8-solutions-architecture-whiteboard-method.md
No issues found.

### 09-chapter-9-customer-discovery-interview.md
No issues found.

### 10-chapter-10-behavioral-and-stakeholder-stories.md
No issues found.

### 11-chapter-11-question-bank-foundations-to-sa-depth.md
No issues found. Model answers (load average, driver-to-K8s GPU trace, GPU util as poor HPA trigger, RDMA pairwise diagnosis) all technically accurate.

### 12-chapter-12-45-minute-mock-interview-structure.md
No issues found. Timing math consistent (5+10+12+11+5+2=45).

### 13-senior-interview-method-clarify-model-hypothesize-test-recommend.md
No issues found.

### 14-question-set-a-linux-and-host-mechanics.md
- [SEVERITY: medium] The "disk 70% full yet writes fail" worked scenario's third branch (ext4 reserved-blocks) is technically imprecise: it claims `df -h` can show free space while a non-root writer hits ENOSPC purely because of the ~5% root-reserved blocks. In reality, GNU `df`'s "Avail"/Use% columns are computed from `statvfs.f_bavail`, which already excludes root-reserved blocks for a non-privileged caller — so `df -h` would already show reduced/zero availability once only reserved blocks remain, not "free space" that then unexpectedly fails. The reserved-blocks mechanism actually manifests the opposite way (root can write into space `df` reports as unavailable to normal users), not as a discrepancy where df says free but a normal write fails.
  - Evidence: "a reserved-blocks percentage (`tune2fs -l` shows `Reserved block count`... a non-root writer can hit ENOSPC while `df` still shows 'free' space that's actually root-reserved)" and the diagram's "Mechanism: ext-family reserves ~5% of blocks for root. df shows it as used, but a non-root writer can't touch it."
  - Why it matters for JR2018680: this is presented as a memorized three-branch diagnostic ("inode / RO-remount / reserved-blocks") for a classic Linux troubleshooting question; a candidate citing the reserved-blocks branch exactly as written could be corrected by an interviewer who knows `df` already nets out reserved blocks in Avail.
  - Suggested fix: reframe the third branch as "reserved blocks make df's reported Avail lower than the raw free-block count would suggest" (already accounted for) rather than a case where df misleadingly shows free space; or replace with a genuinely distinct third mechanism (e.g. quota, or a filesystem where du/df disagree due to deleted-but-open files holding blocks).

### 15-question-set-b-python-coding-and-production-automation.md
No issues found. Note: this chapter defines the `summarize()` function that Chapter 2's Practice question 3 refers to by name — the cross-reference exists but isn't signposted between chapters (see Chapter 2 finding above).

### 16-question-set-c-kubernetes-platform-depth.md
No issues found. "Driver/library version mismatch" NVML error and device-plugin CrashLoopBackOff chain are accurate.

### 17-question-set-d-gpu-and-accelerated-networking.md
No issues found. Xid 79 correctly described as "GPU has fallen off the bus" (matches NVIDIA's actual Xid code table — this is a specific area a prior batch found an error in, verified correct here). `nvidia-smi dmon`/throttle-reason and `nvidia-smi topo -m` reasoning both accurate.

### 18-question-set-e-ai-inference-architecture.md
No issues found. Disaggregated prefill/decode and KV-cache-pressure-under-concurrency reasoning both accurate.

### 19-question-set-f-customer-architecture-and-poc.md
No issues found.

### 20-question-set-g-whiteboard-production-genai-platform.md
No issues found.

### 21-question-set-h-behavioral-stories-for-a-senior-sa.md
No issues found.

### 22-current-role-family-signals-to-be-able-to-discuss.md
No issues found.

**F-09 volume complete.** 22/22 chapters reviewed. 1 low-severity (stale function name cross-reference), 1 medium-severity (df reserved-blocks mechanism imprecision).

## Volume ZTH-23 — Interview Masterclass: GPU Systems Engineering

### index.md
No issues found.

### chapter-01-gpu-architecture-deep-dive.md — MULTIPLE HIGH-SEVERITY HARDWARE/MATH ERRORS (verified independently per task instructions)

- [SEVERITY: high] A100 CUDA-core count per SM is stated as 192; the correct figure is 64 FP32 CUDA cores per SM (108 SMs × 64 = 6,912 total CUDA cores, the well-documented A100 spec). 192 cores/SM is the Kepler-era (GK110) number, not Ampere.
  - Evidence: "192 CUDA cores per SM (A100)" in the opening SM diagram.
  - Why it matters for JR2018680: this is a headline hardware fact a candidate would state confidently and get corrected on immediately.
  - Suggested fix: change 192 to 64.

- [SEVERITY: high] Question 1's entire occupancy worked answer is quantitatively wrong and reaches the opposite conclusion from the correct one. It states "each SM has 192 KB of register file" (real A100 register file is 65,536 32-bit registers = 256 KB) and then conflates kilobytes with register count: "192 KB = 196,608 registers total per SM" (this divides nothing by the 4 bytes/register — it's treating 1 KB as ~1,024 registers instead of 256 registers). The same conflation recurs in "Follow-up Trap 2": "A100 has 255 KB = 261,120 registers." Using the real number (65,536 registers/SM), a kernel at 80 registers/thread (2,560 registers/warp) can only fit 65,536 ÷ 2,560 ≈ 25 warps — registers ARE the binding constraint, giving occupancy ≈ 25/64 ≈ 39%. The chapter's model answer instead concludes "registers aren't the constraint... The limiter is the 64-warp maximum... 100% occupancy" — the exact opposite of the correct result. The "Follow-up Trap 2" answer, whose entire purpose is to correct a candidate's mistake, reinforces the same error instead of catching it.
  - Evidence: "With 192 KB = 196,608 registers total per SM, I can fit 196,608 ÷ 2,560 = 76 warps theoretically... The limiter is the 64-warp maximum. So my occupancy is 64 ÷ 64 = 100% occupancy." and "A100 has 255 KB = 261,120 registers. So technically it fits."
  - Why it matters for JR2018680: this is the chapter's flagship "Explain Occupancy" question — the single most likely GPU-architecture question in an NVIDIA interview — and the memorized model answer gets the arithmetic and the conclusion backwards.
  - Suggested fix: rebuild the worked answer using 65,536 registers/SM (256 KB), correctly compute ≈25 warps as the register-bound ceiling, and restate the conclusion as "registers are the binding constraint, occupancy ≈ 39%, not 100%."

- [SEVERITY: high] H100 FP32 peak is stated as 989 TFLOPS in Question 4 (used twice) and the "Real Profiler Data" example uses the same 989 TFLOPS figure as the FP32 "Peak theoretical" for an A100 kernel. 989 TFLOPS is actually H100's dense FP16/BF16 Tensor Core peak (no sparsity). Real H100 FP32 (CUDA-core, non-tensor) peak is ~67 TFLOPS. Real A100 FP32 peak is ~19.5 TFLOPS (or ~156 TFLOPS TF32 Tensor Core) — nowhere near 989 TFLOPS. This is the same class of error a prior batch flagged as critical (H100 FP32 peak wrong, repeated across multiple files).
  - Evidence: "Peak compute (ignoring memory): H100 = 989 TFLOPS (FP32)" (Question 4) and "FP32 compute throughput: 750 TFLOPS / Peak theoretical: 989 TFLOPS" in the "Real Profiler Data Example" (whose header states "SM count: 108 (A100)").
  - Why it matters for JR2018680: identical error category to one already found and flagged as high-severity in a prior batch (H100 FP32 mislabeled 141 vs real 67 TFLOPS) — this volume independently repeats the same mistake with a different wrong number (989 vs real 67), confirming it is not an isolated typo but a systemic sourcing problem across the curriculum.
  - Suggested fix: use 67 TFLOPS for H100 FP32 (CUDA core) and ~19.5 TFLOPS for A100 FP32; if the intent was Tensor Core throughput, label it explicitly as FP16/BF16 or TF32 Tensor Core, not "FP32."

- [SEVERITY: high] Question 4's roofline calculation has a 1000x unit error: "2 × 10¹² bytes/sec × 0.083 FLOP/byte = 166 TFLOPS achievable" — the arithmetic actually yields 1.66×10¹¹ FLOP/s = 166 GFLOPS (0.166 TFLOPS), not 166 TFLOPS. A second, independent 1000x error appears later in the same worked answer: "If kernel achieves 80% of peak bandwidth = 1.6 TB/s / Execution time = 12 GB ÷ 1.6 GB/s ≈ 7.5 seconds" — dividing by the stated 1.6 TB/s (=1600 GB/s) gives 12/1600 = 0.0075 s = 7.5 milliseconds, not 7.5 seconds; the division line switches units from TB/s to GB/s without converting.
  - Evidence: quotes above, Question 4 model answer.
  - Why it matters for JR2018680: this is exactly the shape of error flagged as critical in a prior batch (ring-AllReduce bandwidth math wrong by ~8x) — here two separate 1000x errors sit in the same "model answer" a candidate would rehearse verbatim, and either would be caught instantly by an interviewer doing the arithmetic live.
  - Suggested fix: recompute both lines with correct unit tracking (166 GFLOPS memory ceiling; ~7.5 ms execution time), and re-examine whether the memory-bound conclusion still holds against the corrected FP32 peak (67 TFLOPS) — it does (166 GFLOPS ≪ 67 TFLOPS), so the qualitative conclusion survives even though the stated numbers are wrong by 3 orders of magnitude.

- [SEVERITY: medium] H100 HBM bandwidth is capped at "1.5-2 TB/s (A100 to H100)" in the opening diagram. Real H100 SXM HBM3 bandwidth is ~3.35 TB/s (up to 3.9 TB/s for H100 NVL) — the stated range understates H100's actual bandwidth by roughly 40-50%.
  - Evidence: "Bandwidth: 1.5-2 TB/s (A100 to H100)".
  - Why it matters for JR2018680: bandwidth-hierarchy questions ("A100 vs H100, what changed and why") are common in GPU systems interviews; understating H100's HBM3 bandwidth gap versus A100 undersells one of the most interview-relevant generational deltas.
  - Suggested fix: state A100 (up to ~2 TB/s, HBM2e) vs H100 (~3.35 TB/s SXM, HBM3) as two distinct figures rather than one blended range.

- [SEVERITY: low] Question 2's per-warp bandwidth conversion skips the clock-frequency step needed to turn bytes/cycle into bytes/second: "128 bytes / 400 cycles (latency) = 0.32 B/cycle = 102.4 GB/s effective." Multiplying 0.32 B/cycle by a realistic GPU clock (~1.4-1.5 GHz) gives well under 1 GB/s per warp, not 102.4 GB/s; the stated conversion implicitly requires an implausible ~320 GHz clock.
  - Evidence: quoted line above, Question 2 model answer.
  - Why it matters for JR2018680: a minor but demonstrable unit error in a bandwidth-estimation answer; low severity because the qualitative point (coalesced access is far more bandwidth-efficient than strided) still stands and the number is a throwaway aside, not the question's core conclusion.
  - Suggested fix: either drop the specific GB/s figure or show the clock-rate multiplication step explicitly.

**Overall assessment of chapter 1:** this chapter has the highest concentration of verified hardware-spec and arithmetic errors found in this batch, all in sections explicitly framed as rehearsable "model answers." Given the pattern (mislabeled FP32 peak reused twice, a 1000x-scale unit error appearing twice in one answer, and a register-file miscalculation that flips the stated conclusion), the remaining ZTH-23 chapters are being reviewed with continued extra scrutiny on any hardware/bandwidth numbers per the task brief.

### chapter-02-cuda-programming-and-optimization.md — SAME SYSTEMIC ERROR PATTERNS AS CHAPTER 1

- [SEVERITY: high] Question 1's model answer repeats chapter 1's register/byte-count conflation and, as a result, reaches a wrong practical recommendation. It states "A100 has 255 KB = 261,120 registers per SM" (real: 261,120 *bytes* ÷ 4 bytes/register ≈ 65,280 registers, matching the documented 65,536-register spec) and then divides register *counts* by this inflated (4x too large) figure throughout the answer. Using the correct register count, a kernel at 64 registers/thread × 256 threads/block = 16,384 registers/block = 65,536 bytes = 64 KB/block; blocks limited by registers = 256 KB ÷ 64 KB = 4 blocks, giving 4 × 8 warps = 32 warps = 50% occupancy — the register budget alone explains the stated 50% occupancy directly, without ever invoking the 64-warp hardware cap. The chapter's answer instead concludes "we're limited by the 64-warp hardware limit, not registers" and states Option 1 ("reduce register pressure to 32/thread") "doesn't help." With correct math, reducing to 32 registers/thread roughly doubles the register-limited block count (to ~8 blocks = 64 warps = 100% occupancy) and clearly does help — the opposite of the stated recommendation.
  - Evidence: "A100 has 255 KB = 261,120 registers per SM... Blocks per SM limited by registers = 261,120 ÷ 16,384 = ~16 blocks... This doesn't help! We're limited by the 64-warp hardware limit, not registers."
  - Why it matters for JR2018680: register-pressure-vs-occupancy tradeoff is one of the most common CUDA interview questions, and this volume's memorized model answer gives the practically wrong recommendation (says reducing register pressure won't help, when for this exact scenario it would be the fix that matters).
  - Suggested fix: rebuild using 65,536 registers/SM (256 KB) with the ×4-bytes-per-register conversion applied consistently, confirm which resource (registers vs. warp cap) is actually binding before writing the recommendation.
  - Note: the same chapter's earlier standalone examples ("Example 1: Low register pressure," "Example 2: High register pressure") apply the ×4-bytes-per-register conversion *correctly* (e.g., "255KB ÷ (4 registers × 4 bytes)"), making the inconsistency within the same chapter — correct methodology in the intro, wrong methodology in the interview-question model answer — worth noting as a specific place a careful re-author should reconcile.

- [SEVERITY: high] The "Occupancy Calculation Example" earlier in the chapter has the identical conflation: "Registers per block: 32 registers/thread × 256 threads = 8,192 registers" then "Max blocks limited by registers: 255 KB ÷ 8 KB = 31 blocks" — treating 8,192 registers as "8 KB" instead of the correct 8,192 × 4 bytes = 32 KB. Correct calculation: 256 KB ÷ 32 KB = 8 blocks (register-limited), not 31.
  - Evidence: "Max blocks limited by registers: 255 KB ÷ 8 KB = 31 blocks" (should be 255 KB ÷ 32 KB ≈ 8 blocks).
  - Why it matters for JR2018680: same root cause as the Question 1 finding above; changes which resource is presented as the binding constraint.
  - Suggested fix: apply the 4-bytes-per-register conversion consistently everywhere registers are converted to a byte budget.

- [SEVERITY: high] Question 3's arithmetic-intensity-to-throughput conversion repeats chapter 1's 1000x GFLOPS/TFLOPS unit error, twice in the same answer: "On a 2 TB/s GPU: achievable throughput = 0.125 × 2 = **250 TFLOPS**" (correct: 0.125 FLOP/byte × 2×10¹² bytes/s = 2.5×10¹¹ FLOP/s = 250 GFLOPS, not TFLOPS) and "On a 2 TB/s GPU: achievable throughput = 4 × 2 = **8,000 TFLOPS**" (correct: 4 × 2×10¹² = 8×10¹² FLOP/s = 8 TFLOPS, not 8,000 TFLOPS — note 8,000 TFLOPS = 8 PFLOPS, an implausible figure for a single GPU that should have been a sanity-check red flag).
  - Evidence: quoted lines above, Question 3 model answer.
  - Why it matters for JR2018680: this is the third occurrence in two chapters of the identical 1000x scale error converting arithmetic-intensity × bandwidth into a FLOPS figure — confirms a systemic, not isolated, math-generation issue in this volume's roofline-style calculations, exactly the risk category called out for this batch.
  - Suggested fix: recompute both throughput figures as GFLOPS/TFLOPS with correct order of magnitude (250 GFLOPS naive, 8 TFLOPS tiled), and re-verify the qualitative conclusion (tiled version is compute-bound relative to a corrected, realistic FP32/TF32 peak) still holds with corrected numbers.

**Pattern confirmed across chapters 1-2:** two distinct, repeating error types — (a) treating "N KB of register file" and "N registers" as numerically interchangeable (off by 4x, the bytes-per-register factor), and (b) dropping three orders of magnitude when converting arithmetic-intensity × bandwidth into achievable FLOPS (GFLOPS reported as TFLOPS). Both error types recur multiple times each across just the first two chapters, in sections explicitly framed as memorizable "model answers." Continuing to check remaining chapters for the same patterns given this establishes a volume-wide risk, not a one-off.

### chapter-03-multi-gpu-and-distributed-systems.md — RING-ALLREDUCE BANDWIDTH MATH WRONG BY ~5-9x (same error class a prior batch already flagged elsewhere in this curriculum)

- [SEVERITY: high] The chapter's introductory "Real example: A100 cluster" worked calculation computes ring AllReduce time without chunking the gradient across ranks, inflating the result by roughly 8-9x. It states: "Send phase: 1 GB around ring = 8 transfers × 1 GB at 25 GB/s = 320 ms" and "Reduce phase: 8 transfers × 1 GB at 25 GB/s = 320 ms" for a total of ~640 ms. Standard ring AllReduce splits the gradient into N chunks (N = rank count) and each of the ~(N-1) ring steps moves only one chunk (S/N), not the full gradient — the correct formula is time ≈ 2(N-1)(S/N)/B. For S=1 GB, N=8, B=25 GB/s: 2×7×(1/8)/25 ≈ 0.07 s = 70 ms, not 640 ms — the chapter's number is roughly **9x too high**. This is the same category of error a prior batch review already flagged elsewhere in this curriculum ("ring-AllReduce bandwidth math wrong by ~8x").
  - Evidence: "Send phase: 1 GB around ring = 8 transfers × 1 GB at 25 GB/s = 320 ms" and "Reduce phase: 8 transfers × 1 GB at 25 GB/s = 320 ms" / "Total: ~640 ms".
  - Why it matters for JR2018680: AllReduce bandwidth math is one of the highest-value NVIDIA distributed-training interview topics, and this is the chapter's flagship worked example — a candidate who rehearses this exact calculation would be off by nearly an order of magnitude if an interviewer checks the arithmetic.
  - Suggested fix: apply the standard chunked-ring formula 2(N-1)(S/N)/B consistently, as the chapter's own Question 2 does correctly (see below) — recompute the "Ring is 2.6x faster/slower" comparison against tree with the corrected numbers, since with correct ring math the conclusion likely flips (a properly chunked ring at this size and rank count would beat the naive tree, not lose to it).

- [SEVERITY: high] The same unchunked-ring error recurs in Interview Question 1's hierarchical AllReduce model answer: "Stage 2: AllReduce among node leaders... Time: 2 × 4 × 1 GB at 25 GB/s = 320 ms." Correct chunked formula for N=4 leaders: 2×(4-1)×(1GB/4)/25GB/s = 1.5/25 ≈ 60 ms — the stated 320 ms is roughly **5.3x too high**.
  - Evidence: "Time: 2 × 4 × 1 GB at 25 GB/s = 320 ms" in Question 1's "Stage 2" and the "Total: 5 + 320 + 25 = 350 ms" conclusion built on it.
  - Why it matters for JR2018680: this is the chapter's headline "design an AllReduce algorithm" interview question — the exact scenario a candidate would be asked to whiteboard live, and the total time is dominated by the miscalculated stage.
  - Suggested fix: recompute Stage 2 with the chunked formula (≈60 ms), giving a corrected total of roughly 5 + 60 + 25 ≈ 90 ms instead of 350 ms.

- [SEVERITY: low] Note for context: Question 2 (gradient compression at 256 GPUs) applies the correct chunked ring-AllReduce formula — "Each rank sends/receives 2×(N-1) segments... Time: 2 × (256-1) × (140÷256) ÷ 25 ≈ 11.2 seconds" is the right methodology and the right answer (verified: 2×255×0.547/25≈11.16s). This confirms the chunking omission in the intro example and Question 1 is an inconsistency within the same chapter, not a matter of differing conventions — the correct formula is demonstrably known and used elsewhere in the same document.

- [SEVERITY: medium] Question 3's "loss accounting" calculation is not dimensionally meaningful: "The 10% AllReduce overhead accounts for 60 × (1 - 0.73) ÷ 0.73 = ~22% loss" multiplies a throughput figure (60 images/sec) by a dimensionless ratio and calls the result a percentage — the units don't resolve to "% loss," and it's unclear what real quantity this is meant to represent. The paragraph structure presents this as an authoritative diagnostic calculation.
  - Evidence: "The 10% AllReduce overhead accounts for 60 × (1 - 0.73) ÷ 0.73 = ~22% loss. But we only have 10% overhead, so something else is wrong."
  - Why it matters for JR2018680: presented as a live diagnostic technique for a common "why is my scaling efficiency low" interview question; the underlying reasoning doesn't hold up if an interviewer asks "walk me through that calculation."
  - Suggested fix: replace with a straightforward efficiency-loss breakdown (e.g., total loss = 1 - 0.73 = 27%, then attribute that 27 percentage points across AllReduce/imbalance/memory-pressure/kernel-fusion causes without the dimensionally-invalid multiplication).

- [SEVERITY: low] Weak-scaling section states "AllReduce = 10 ms out of 130 ms = ~8% overhead," but the preceding table's "Time (min)" column and surrounding text are in **minutes**, not milliseconds (130 min at 16 GPUs, per the table). The 8% ratio itself is arithmetically fine (10/130≈7.7%≈8%) but the unit label contradicts the table.
  - Evidence: table header "Time (min)" with row "16 | 256 | 4096 | 130 | 92%" vs. the text "AllReduce = 10 ms out of 130 ms."
  - Why it matters for JR2018680: minor, but a candidate reciting "10 ms" instead of "10 min" would be describing a wildly different (and wrong) AllReduce absolute time.
  - Suggested fix: change "ms" to "min" in that sentence.

**Chapter 3 assessment:** contains the specific ring-AllReduce chunking error already identified as a high-risk recurring bug in a prior batch review of this curriculum, appearing independently in two places in this chapter (and correctly done in a third place in the same chapter), confirming this is a persistent authoring pattern rather than a one-off typo.

### chapter-04-observability-and-monitoring.md

- [SEVERITY: medium] Question 3's "increase utilization to 70%" optimization claims cost drops to "$2.38/GPU-hour" and "$0.027/iteration," but this doesn't follow from the chapter's own numbers. Using the same methodology as the rest of the answer (total facility cost $2M/year ÷ actual GPU-hours consumed), 70% utilization of a 256-GPU cluster (256 × 8760 × 0.70 ≈ 1,568,896 GPU-hours/year) gives $2M ÷ 1,568,896 ≈ $1.27/GPU-hour, not $2.38. No alternate derivation of the given figures reproduces $2.38 cleanly.
  - Evidence: "Increase cluster utilization: Currently at 5%. Target 70%. Cost per GPU-hour drops to $2.38 / Cost per iteration drops to $0.027" and the related "1 sec saved × 139 hours × 8 GPUs × $2.38 = $26 saved" line, which also mixes seconds and hours without a unit conversion.
  - Why it matters for JR2018680: cost-per-GPU-hour and utilization-driven cost reduction is a realistic NVIDIA SA/infra cost conversation; an interviewer doing the arithmetic live would catch the mismatch.
  - Suggested fix: recompute the 70%-utilization cost figure directly from $2M ÷ (0.70 × 256 × 8760) and propagate the corrected number through the iteration-cost and savings-per-second lines.

- [SEVERITY: low] Question 2's network-congestion diagnostic aside — "Expected: If 1.2 GB gradients × 8 GPUs × 25 GB/s link → ~5 sec" — doesn't resolve to 5 seconds under any straightforward reading (1.2 GB × 8 ÷ 25 GB/s ≈ 0.38 s; even applying the chunked ring-AllReduce formula from Chapter 3 gives well under 1 s for this size). The qualitative point (actual 8 sec vs. an expected baseline suggests congestion) still stands, but the specific "~5 sec" isn't traceable to the stated inputs.
  - Evidence: quoted line above, Question 2 diagnostic steps.
  - Why it matters for JR2018680: minor, since it's a parenthetical estimate rather than the answer's core conclusion, but it's another instance of unclear bandwidth arithmetic in a chapter otherwise adjacent to Chapter 3's verified AllReduce math errors.
  - Suggested fix: show the actual formula (chunked ring AllReduce) used to derive the "expected" baseline time before comparing it to the observed 8 sec.

Chapter 4's core content (SLO/SLI design, alert-threshold reasoning, cost-per-GPU-hour walkthrough for the primary 5%-utilization case) is otherwise sound; the two items above are narrower, secondary-calculation issues rather than flagship-answer errors.

### chapter-05-performance-analysis-and-troubleshooting.md — ROOFLINE CROSSOVER OFF BY 1000x, CASCADES INTO WRONG WORKLOAD CLASSIFICATIONS

- [SEVERITY: high] The chapter's "Example: H100 GPU" roofline crossover calculation has the same 1000x unit error found repeatedly in chapters 1-2: "Crossover point: 989 TFLOPS ÷ 2000 GB/s = 0.495 FLOP/byte." The correct division is 989×10¹² FLOP/s ÷ 2×10¹² byte/s ≈ **494.5 FLOP/byte** (TFLOPS and GB/s are both already scaled by powers of 10¹²/10⁹ respectively — 989 TFLOPS = 989,000 GFLOPS, and 989,000 ÷ 2,000 GB/s = 494.5 FLOP/byte), not 0.495. This is the same class of 1000x scale error already confirmed in chapters 1 and 2.
  - Evidence: "Crossover point: 989 TFLOPS ÷ 2000 GB/s = 0.495 FLOP/byte."
  - Why it matters for JR2018680: this single number is the anchor for the entire chapter's "Real workload examples" classification table and both of the first two interview questions' model answers — an error here cascades everywhere below it.
  - Suggested fix: recompute as ~494.5 FLOP/byte (or, once the FP32-peak mislabeling below is also fixed, recompute from the corrected FP32 figure).

- [SEVERITY: high] Using the corrected crossover (~494.5 FLOP/byte, or even a corrected FP32 peak of ~67 TFLOPS giving a crossover of ~33.5 FLOP/byte), the chapter's own "Real workload examples" table mislabels three of four workloads. The table classifies "Matrix multiply (n=1024)" at 1 FLOP/byte, "Tiled matrix multiply" at 32 FLOP/byte, and "Deep learning inference (batched)" at 10 FLOP/byte all as **"Compute"**-bound. Under either corrected crossover value (494.5 using the mislabeled 989 TFLOPS peak, or ~33.5 using the real FP32 peak of 67 TFLOPS), intensities of 1, 32, and 10 FLOP/byte are all still below or near the crossover — meaning these workloads should be classified as memory-bound (or borderline), not compute-bound as stated. Also note the mislabeled 989 TFLOPS "(FP32)" peak recurs here for at least the third time across this volume (chapters 1, 2, and 5) — see chapter 1's finding for the correct figure (H100 FP32 CUDA-core peak ≈ 67 TFLOPS; 989 TFLOPS is H100's dense FP16/BF16 Tensor Core figure).
  - Evidence: the "Real workload examples" table's Bottleneck column, and "Peak compute: 989 TFLOPS (FP32)" repeated in the chapter's opening H100 example and in Question 1's scenario text ("Peak GPU has 989 TFLOPS compute and 2 TB/s bandwidth").
  - Why it matters for JR2018680: roofline classification (is this workload compute- or memory-bound) is a core, frequently-asked performance-engineering interview question, and this chapter's canonical reference table gets 3 of 4 example classifications wrong once the underlying numbers are corrected.
  - Suggested fix: rebuild the table using the correct FP32 (or explicitly-labeled Tensor Core) peak and a correctly-computed crossover, and re-derive each workload's classification from its arithmetic intensity against that corrected crossover.

- [SEVERITY: medium] Question 1's model answer is internally inconsistent: it correctly derives that this memory-bound kernel's achievable ceiling is "Performance = 0.125 FLOP/byte × 2 TB/s = 250 GFLOPS" (i.e., far below the compute peak, consistent with being memory-bound), but the "Key Reasoning Points" table then states "At 150 GFLOPS on 989 TFLOPS GPU, there's 6.6× room to grow" — implying headroom toward the 989 TFLOPS compute peak, which contradicts the answer's own conclusion that this kernel is capped at ~250 GFLOPS by memory bandwidth (a memory-bound kernel cannot approach the compute peak without an algorithmic change that increases arithmetic intensity, which the answer states elsewhere).
  - Evidence: "Performance = 0.125 FLOP/byte × 2 TB/s = 250 GFLOPS" vs. "At 150 GFLOPS on 989 TFLOPS GPU, there's 6.6× room to grow."
  - Why it matters for JR2018680: a candidate reciting "6.6x room to grow" right after correctly explaining the kernel is memory-bound and capped at 250 GFLOPS would visibly contradict themselves if an interviewer asked "so can you get to 989 TFLOPS?"
  - Suggested fix: remove or correct the "6.6× room to grow" framing — the real achievable headroom for this specific kernel is 250/150 ≈ 1.67×, not 6.6×, until the algorithm itself is changed to increase arithmetic intensity.

Chapter 5's Question 2 (occupancy/latency diagnosis from profiler metrics) and Question 3 (multi-GPU scaling efficiency breakdown, including a self-corrected "wait, that doesn't match — let me recalculate" arithmetic pass that lands on the right final numbers: 5.2/8=65%) were checked and are consistent.

### chapter-06-gpu-sharing-and-virtualization.md

- [SEVERITY: high] The MIG architecture diagram and profile table contain multiple factual errors about A100 MIG, a topic the task brief specifically flags as an area real NVIDIA interviews probe deeply. The diagram shows "A100 GPU (40 SMs, 640 GB/s bandwidth)" split into exactly 4 partitions ("MIG-1..MIG-4") of "10 SMs" each. The real A100 has 108 SMs (not 40) and supports up to **7** MIG instances at the smallest granularity (1g profile, ~14 SMs/slice on a 108-SM die), not a native 4-way split — there is no standard MIG profile that divides an A100 into exactly four equal partitions. Separately, the "Profiles available" row states memory sizes of "7×MIG-1g (8GB), 3×MIG-2g (16GB), 2×MIG-3g (28GB), 1×MIG-7g (40GB)" — the real A100 40GB card's MIG profile memory sizes are 1g.5gb / 2g.10gb / 3g.20gb / 7g.40gb (5/10/20/40 GB), and the 80GB card's are 1g.10gb / 2g.20gb / 3g.40gb / 7g.80gb (10/20/40/80 GB); the chapter's "8/16/28/40 GB" figures match neither variant.
  - Evidence: "A100 GPU (40 SMs, 640 GB/s bandwidth)" with 4× "MIG-1..MIG-4, 10 SMs, 20 GB" partitions; and "7×MIG-1g (8GB), 3×MIG-2g (16GB), 2×MIG-3g (28GB), 1×MIG-7g (40GB)."
  - Why it matters for JR2018680: MIG partitioning mechanics (SM count, max instance count, memory-per-slice) is exactly the kind of "K8s device plugin + MIG internals" depth the task brief calls out as a high-probability interview area — a candidate citing 40 SMs or a 4-way split for A100 would be corrected immediately by an interviewer familiar with the hardware.
  - Suggested fix: correct SM count to 108 total (A100), state the real maximum of 7 instances at 1g granularity, and use the documented profile memory sizes for whichever card variant (40GB or 80GB) is being illustrated.

- [SEVERITY: low] "Switching overhead ~1-2 seconds per context switch" is listed as a MIG property, but MIG instances are statically hardware-partitioned and don't incur a per-context-switch cost the way time-slicing does — the ~1-2 second figure more accurately describes MIG *reconfiguration* (changing the partition geometry, which requires a GPU reset), not switching between workloads already running on separately-provisioned MIG instances. This conflates two different operations under one row.
  - Evidence: "Switching overhead | ~1-2 seconds per context switch" in the MIG "Key properties" table.
  - Why it matters for JR2018680: a candidate could mistakenly describe MIG as having per-job switching latency, which is actually the differentiator time-slicing has and MIG doesn't (MIG's whole value proposition is no runtime switching overhead once partitioned).
  - Suggested fix: relabel as "reconfiguration time (changing MIG geometry)" and clarify that running workloads on existing MIG instances have no switching overhead.

Question 1-3 model answers (workload-to-sharing-mode allocation, isolation-failure diagnosis, fairness policy design) are conceptually sound; the numeric examples within them (utilization percentages, cost ratios, Jain's fairness index) are illustrative and internally consistent, not tied to specific hardware specs that could be independently fact-checked.

### chapter-07-kubernetes-and-container-orchestration.md

- [SEVERITY: low] Question 3's monthly cost projection is internally inconsistent: peak and off-peak segments correctly convert hours-at-a-node-count into monthly cost via `(hours × nodes × $500) ÷ 730`, but the "Night/weekend" segment abandons that method and instead computes "1 node running (0.5 capacity idle) = 500 × 0.5 = $250/month" — an arbitrary 0.5 multiplier rather than the actual remaining time fraction. The three segments' hours do sum correctly to 730 (44 + 110 + 576), but 576 hours at 1 node should cost 576/730 × $500 ≈ $394, not $250 — understating the total ("$445/month") by roughly $145.
  - Evidence: "Night/weekend: 1 node running (0.5 capacity idle) = 500 × 0.5 = $250/month" alongside the correctly-derived peak ($120) and off-peak ($75) lines above it.
  - Why it matters for JR2018680: minor relative to other findings in this volume, but it's a cost-estimation answer a candidate might reproduce, and the inconsistent methodology (two segments computed one way, the third computed another) would be an easy follow-up catch ("why did you switch formulas for the third segment?").
  - Suggested fix: apply the same `(hours × nodes × $500) ÷ 730` formula to the night/weekend segment (576 hours × 1 node), giving ≈$394/month and a corrected total near $589/month.

Resource-quota percentages (16/32=50%, 12/32=37.5%, 4/32=12.5%, summing to 32) and the graceful-shutdown/SIGTERM handling content are accurate.

### chapter-08-security-and-compliance.md

- [SEVERITY: low] Question 1's model answer claims "This architecture provides 95%+ security for multi-tenant workloads" — security is not a meaningfully quantifiable percentage, and stating a specific number here reads as an unfalsifiable, unverifiable claim rather than a defensible engineering statement (especially awkward alongside the same answer's own "Residual risk" table, which lists open risks with no way to derive 95% from them).
  - Evidence: "This architecture provides **95%+ security** for multi-tenant workloads."
  - Why it matters for JR2018680: a candidate should avoid quantifying security posture with a bare percentage in an interview — it's the kind of unsupported claim an interviewer would immediately probe ("95% of what, measured how?").
  - Suggested fix: replace with a qualitative defense-in-depth statement (e.g., "no single control failure results in cross-tenant exposure") rather than a percentage.
- [SEVERITY: low] "HIPAA violations carry $100-1.5M fines per incident" slightly conflates two different figures: HIPAA's per-violation penalty tiers run roughly $100-$50,000 per violation, with a separate ~$1.5-2M *annual* cap per identical-violation category — describing the full range as "per incident" is imprecise.
  - Evidence: closing line of Question 2's model answer.
  - Why it matters for JR2018680: minor; the general point (HIPAA penalties are large and non-optional) is correct and the imprecision is unlikely to be probed deeply, but a compliance-focused interviewer could ask for the actual tier structure.
  - Suggested fix: distinguish per-violation tier ($100-$50K) from the annual aggregate cap (~$1.5-2M) if precision is needed.

The threat model, defense-in-depth layering (MIG, network policy, RBAC, encryption, audit logging), and HIPAA compliance checklist are otherwise technically reasonable and not tied to any specific hardware numbers that could be independently fact-checked.

### chapter-09-cluster-operations-and-capacity-planning.md — POWER COST OFF BY 100x, CASCADES THROUGH THE ENTIRE COST MODEL

- [SEVERITY: high] Question 1's annual OpEx model has a 100x arithmetic error in the power cost line: "Power: 24 × 400W × 8,760 hrs × $0.15/kWh = $1.26M/year." The correct calculation: 24 GPUs × 400 W = 9,600 W = 9.6 kW; 9.6 kW × 8,760 hours = 84,096 kWh/year; 84,096 kWh × $0.15/kWh = **$12,614/year**, not $1.26M/year — the stated figure is roughly 100x too high (likely a kW/W or decimal-placement slip). Because power is the single largest line item in the stated OpEx total, this error inflates "Total OpEx: $2.78M/year" substantially (the corrected total is closer to $1.5M/year), which in turn inflates every downstream figure built on it: "Cost per GPU-hour: $13.30," "Cost per productive GPU-hour: $33/GPU-hour" (Question 1), and the entire utilization-improvement cost analysis in Question 3 ("$2.78M/year for 32 GPUs," "$33 → $23," "$2.08M/year" for a reduced fleet).
  - Evidence: "Power: 24 × 400W × 8,760 hrs × $0.15/kWh = $1.26M/year" and the downstream "Total OpEx: $2.78M/year" / "Cost per GPU-hour: $2.78M ÷ (24 GPUs × 8,760 hours) = $13.30/GPU-hour."
  - Why it matters for JR2018680: cost-per-GPU-hour and power-cost estimation is a realistic NVIDIA infra/capacity-planning interview topic, and this is the chapter's central worked cost model — every subsequent dollar figure in both Question 1 and Question 3 inherits this 100x error.
  - Suggested fix: recompute power cost as ≈$12.6K/year (or re-derive with a more realistic assumption if a different intent was meant, e.g., per-GPU power including cooling/PSU overhead), then propagate the corrected OpEx total through all dependent cost-per-GPU-hour and utilization-savings figures in both Question 1 and Question 3.

- [SEVERITY: medium] The 3-year procurement plan table's per-year CapEx figures don't reconcile with the stated GPU unit counts and the $40K/H100 unit price used elsewhere in the same answer. Year 1 adds 8 H100s ($320K, consistent with 8×$40K). Year 2's row states "Refresh A100s: 0 A100s, 16 H100s, 16 L40S, $560K (refresh 16 A100→H100, add 8)" — refreshing 16 A100s to H100 plus adding 8 more implies 24 new H100 purchases (24×$40K = $960K), not $560K. Year 3 states "$440K (add 16 H100s)," but 16 H100s at $40K/unit = $640K, not $440K. The "Total 3-year CapEx: $1.32M" simply sums these three inconsistent per-year figures rather than being independently re-derived from GPU unit counts.
  - Evidence: the procurement plan table rows for Years 1-3 and the "Total 3-year CapEx: $1.32M" line.
  - Why it matters for JR2018680: this is presented as the answer to "how do you size the cluster, plan hardware refreshes, and manage costs" — the chapter's flagship multi-year capacity-planning question — and the CapEx numbers don't hold up if an interviewer asks to see the math per line.
  - Suggested fix: rebuild the table from GPU unit deltas × $40K/H100, decide explicitly whether retired A100s have residual resale/trade-in value being netted out (if so, state that assumption), and recompute the 3-year total from the corrected per-year figures.

Question 2 (CECC incident response, drain/cordon/taint workflow, failure-mode matrix) is technically sound and not tied to any figures requiring independent verification.

### chapter-10-system-design-training-cluster.md

- [SEVERITY: high] The network-bandwidth AllReduce estimate has a bits/bytes conversion error, understating the result by 8x — the same order-of-magnitude error family confirmed in Chapter 3. "AllReduce time for 1GB gradient: 1000 Mbps ÷ 12.5 Gbps = 80ms" treats "1 GB" as "1000 Mb," but 1 GB (gigabyte) = 8 Gb = 8,000 Mb (bits, not bytes). Correct: 8,000 Mb ÷ 12,500 Mbps (12.5 Gbps) = 0.64 s = **640 ms**, not 80 ms — the stated figure is 8x too low. This changes the stated conclusion "AllReduce: 80ms = 1-8% overhead... acceptable" — at 640 ms, overhead against a 1-10 second compute window is roughly 6-64%, which is a materially different (and much less comfortable) trade-off, especially at the low end of the stated 1-second iteration time.
  - Evidence: "AllReduce time for 1GB gradient: 1000 Mbps ÷ 12.5 Gbps = 80ms" and "Alternative (cheaper): Oversubscribed 10:1... AllReduce time: 800ms per gradient" (which scales the same, now-confirmed-wrong, 80ms baseline by 10x).
  - Why it matters for JR2018680: this is the chapter's central network-topology justification for a fat-tree design over a cheaper oversubscribed one — the headline "1-8% overhead, acceptable" conclusion is built on an 8x-too-small number, and a candidate rehearsing this exact bandwidth conversion would be corrected immediately by an interviewer checking bits vs. bytes.
  - Suggested fix: recompute using 8,000 Mb for a 1 GB gradient (640 ms baseline, 6.4 s for the 10:1 oversubscribed alternative), and re-assess whether the fat-tree topology's cost premium is still justified against the corrected overhead range.

- [SEVERITY: medium] The final hardware budget in Phase 3 doesn't reconcile internally on two counts. First, the arithmetic: "600 L40S ($7.2M), 200 L4 ($500K), Network: $625K, Storage: $2.5M, Servers: $375K, Power/cooling: $1M / Total: $12.7M ✓" actually sums to $12.2M (7.2+0.5+0.625+2.5+0.375+1=12.2), not $12.7M. Second, and more structurally: the chapter's Phase 1 requirement analysis sets a target of "Allocate 1000 total (20% buffer for failed nodes, maintenance)," but the final adopted hardware plan only provides 800 GPUs (600 L40S + 200 L4) — the walkthrough never reconciles this 200-GPU (20%) shortfall against its own stated requirement.
  - Evidence: the "Total: $12.7M ✓" arithmetic above, and the gap between Phase 1's "Allocate 1000 total" and Phase 3's final "600 L40S + 200 L4" (800 GPUs) plan.
  - Why it matters for JR2018680: a candidate presenting this exact walkthrough could be asked "so you're proposing 800 GPUs against a 1000-GPU requirement — how do you square that?" and the model answer as written has no ready response.
  - Suggested fix: either explicitly state the design intentionally under-delivers Phase 1's GPU target and justify why (e.g., "prioritize budget compliance over raw count, plan to grow"), or adjust the final procurement numbers to reach 1000 GPUs within budget.

- [SEVERITY: low] The MTBF (mean time between failures) figure is computed inconsistently between Phase 5 and the "Common Follow-ups" section. Phase 5 states "Mean time between failures: 1000 GPU-days (1 failure per 1000/8 = 125 days at full capacity)" — dividing by 8 (GPUs per node) rather than the active cluster GPU count, which computes a per-node failure interval, not a cluster-wide one, despite being labeled "at full capacity." The Follow-ups section later correctly divides by the cluster-wide active GPU count ("Cluster size: 75 GPUs avg active... Failures/day: 75 ÷ 1000 = 0.075 failures/day," i.e., ~13.3 days between cluster-wide failures) — a materially different and more realistic way to reason about failure frequency at scale, but the two sections don't cross-reference or reconcile their different methodologies.
  - Evidence: "1 failure per 1000/8 = 125 days at full capacity" (Phase 5) vs. "Failures/day: 75 ÷ 1000 = 0.075" (Common Follow-ups).
  - Why it matters for JR2018680: minor, but a candidate could be asked to justify the 125-day figure and would need to notice it's actually a per-node number mislabeled as cluster-wide.
  - Suggested fix: use the cluster-wide-GPU-count method consistently in both places (as the Follow-ups section already does correctly).
