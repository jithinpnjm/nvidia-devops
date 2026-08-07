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
