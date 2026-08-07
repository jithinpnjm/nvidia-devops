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
