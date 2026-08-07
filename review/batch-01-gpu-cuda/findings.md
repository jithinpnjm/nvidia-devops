# Batch 01 — GPU & CUDA Fundamentals — Findings

(Summary to be added at top once review is complete.)

## Volume ZTH-01 — What Is AI Infrastructure

### chapter-01-what-is-ai-infrastructure.md
- [SEVERITY: low] No factual errors. Purely conceptual scene-setter; no numbers expected at this stage.
  - Why it matters for JR2018680: none — appropriate for chapter 1 of a bootcamp.
  - Suggested fix: none.

### chapter-02-why-cpus-became-insufficient.md
- No findings. Accurate, consistent with chapter 1.

### chapter-03-cpu-vs-gpu.md
- [SEVERITY: low] Chapter titled "CPU vs GPU" never cites a single concrete number (core counts, FLOPS, memory bandwidth e.g. HBM3 ~3TB/s vs DDR5 system memory ~100GB/s, SIMD width). Entirely qualitative.
  - Evidence: Deep Explanation and comparison table (lines 63-77) use only qualitative language ("many simpler parallel units", "high-bandwidth GPU memory").
  - Why it matters for JR2018680: "CPU vs GPU, with numbers" is a very common opening interview question; a candidate should be able to cite orders of magnitude (e.g., H100 ~67 TFLOPS FP32 / ~3TB/s HBM3 vs. a server CPU ~terabytes-per-second improbable, actually ~200-400GB/s DDR5, few TFLOPS).
  - Suggested fix: add a numbers callout box with representative FLOPS/bandwidth/core-count contrast (deferred to Volume 02/03 which do cover this — flagged here only because the chapter title implies it should already appear).

### chapter-04-what-happens-when-chatgpt-answers.md
- No findings. Good prefill/decode distinction, accurate mental model.

### chapter-05-ai-infrastructure-landscape.md
- No findings.

### chapter-06-modern-ai-factory.md
- No findings.

### chapter-07-nvidia-ecosystem-overview.md
- No findings. Correctly distinguishes GPU vs HGX vs DGX, correctly separates driver/CUDA/container-toolkit/device-plugin/GPU-Operator responsibilities.

### chapter-08-enterprise-ai-platforms.md
- No findings. MIG/time-slicing/dedicated-GPU tradeoff summary is accurate at this conceptual level.

### chapter-09-volume-01-summary.md
- No findings. Consolidation is accurate and consistent with prior chapters.

### labs/lab-01-inspect-an-ai-infrastructure-host.md
- No findings. Correct commands (`lscpu`, `free -h`, `lspci`, `nvidia-smi`), correct clarification that nvidia-smi's "CUDA Version" is the max driver-supported CUDA version, not the installed toolkit version — this is a commonly-missed interview detail and it's stated correctly.

### labs/lab-02-trace-an-ai-request-path.md
- No findings. Self-contained Python lab, technically sound, correct expected outputs.

**Volume ZTH-01 summary:** No medium/high severity findings. This volume is intentionally conceptual (pre-GPU-architecture); depth bar is consistent with itself and appropriately defers hard numbers to Volumes 02/03.

## Volume ZTH-02 — GPU Architecture

This volume is exceptional depth: worked numeric examples (SM counts, register-file math, occupancy calculations, HBM bandwidth math), real `nvidia-smi`/`dmon`/`ncu`/`nvcc -Xptxas=-v` command output tied to specific diagnostic decision trees, and first-person interview model answers. This matches (and in places exceeds) the "Volume 1 gold standard" bar. Spot-checked hardware facts are all correct: H100 = 132 SMs, compute capability 9.0; A100 = 108 SMs, compute capability 8.0; H100 SXM HBM3 ≈ 3.35 TB/s peak bandwidth; 65,536 (64K) 32-bit registers per SM / 2,048 max resident threads per SM (Ampere/Hopper); 13B params × 2 bytes (FP16) ≈ 26 GB — all correct.

### index.md
- No findings.

### chapter-01-why-gpu-architecture-evolved.md
- No findings. H100 SM count (132) and compute_cap (9.0) correct. Worked parallelism arithmetic (4096x4096 weight, batch 32) is correct.

### chapter-02-inside-a-modern-nvidia-gpu.md
- No findings. Register-file worked example (64K registers / 32 or 64 per thread) is correct and matches Ampere/Hopper SM specs.

### chapter-03-threads-warps-blocks-and-sms.md
- No findings. Warp size (32 threads), A100 (108 SMs) vs H100 (132 SMs) comparison is correct and the worked "grid sized for A100 underfills H100" example is technically sound.

### chapter-04-cuda-cores-tensor-cores-and-rt-cores.md
- No findings. FP32 vs FP16 byte-size math (67.1MB vs 33.6MB for 4096x4096) is correct. D = A×B+C Tensor Core description is accurate.

### chapter-05-gpu-memory-hierarchy.md
- No findings. HBM3 3.35 TB/s figure for H100 SXM is correct; 13B-model/26GB FP16 capacity math and the 7.8ms/token decode-bandwidth-floor calculation are both correct and a genuinely excellent worked example for interview prep.

### chapter-06-scheduling-occupancy-and-instruction-dispatch.md
- No findings. Occupancy worked example (65,536 registers / 40 vs 56 per thread → 75% vs 50% occupancy) is arithmetically correct.

### chapter-07-registers-shared-memory-and-local-memory.md
- No findings. Register spilling and local-memory-is-not-physically-local explanation is accurate; spill traffic worked example is sound.
