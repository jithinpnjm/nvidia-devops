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

### chapter-08-global-memory-l1-l2-and-hbm.md
- No findings. H100 SXM 3.35TB/s bandwidth-utilization worked example (16GB/6ms ≈ 2,667 GB/s, ~80% of peak) is correct.

### chapter-09-divergence-coalescing-and-bottleneck-reasoning.md
- No findings. Sector/transaction amplification example (32-byte sector granularity, 8x amplification) is architecturally sound and standard.

### chapter-10-gpu-topology-peer-access-and-data-paths.md
- No findings. `nvidia-smi topo -m` output/legend (NV4, PIX, SYS) is accurate; NVLink (~900GB/s) vs cross-socket PCIe Gen4 x16 (~25-32GB/s) bandwidth comparison and the resulting ~30x latency gap for a 500MB all-reduce is correct order-of-magnitude reasoning.

### chapter-11-building-a-gpu-performance-model.md
- No findings. H100 ridge-point calculation (989 TFLOPS FP16 dense / 3.35 TB/s ≈ 295 FLOPs/byte) is correct and a strong interview-caliber worked roofline example.

### chapter-12-volume-02-architecture-summary.md
- No findings. Consolidation is consistent with all prior chapters; continuous-batching justification (26GB/token bandwidth floor amortized across 50 concurrent users) is correct.

**Volume ZTH-02 summary (chapters 1-12 + index):** Zero medium/high severity findings. This is the strongest technical volume reviewed in this batch — every hardware figure checked (SM counts, register file sizes, HBM bandwidth, NVLink bandwidth, PCIe bandwidth) is accurate, and the worked-number style (introduced starting chapter 1) is exactly the kind of first-principles, evidence-based reasoning a NVIDIA AI-infra interview would probe. Recommend this volume's style as the template other batches should be measured against, alongside actual Volume 1 gold standard.

### labs/lab-01-inspect-gpu-architecture-and-topology.md
- No findings. Commands, `nvidia-smi topo -m` legend, PCIe Gen5 x16 (32GT/s) LnkCap/LnkSta interpretation, and NUMA distance reasoning are all technically accurate.

### labs/lab-02-inspect-gpu-engine-and-memory-behavior.md
- No findings. H100 deviceQuery output is internally consistent: 132 SMs x 128 CUDA cores/SM = 16,896 CUDA cores (correct), 5120-bit memory bus, ~50MB L2 cache (52,428,800 bytes), compute capability 9.0 — all accurate for H100. `docker run --gpus all` vs missing `--gpus` NVML failure distinction is correct and a common real-world container GPU troubleshooting scenario.

### labs/lab-03-profile-memory-and-warp-efficiency.md
- No findings. CUDA microbenchmark code compiles logically sound (contiguous vs strided copy), Nsight Compute metric usage (`l1tex__average_t_sectors_per_request`, L2 hit rate, achieved occupancy) is correctly interpreted, and the lab explicitly models good scientific practice (separating coalescing effect from modulo-arithmetic overhead, illustrative-vs-actual value framing).

### labs/lab-04-build-a-topology-aware-gpu-placement-plan.md
- No findings. Topology-group design (2x NV4 pairs on separate NUMA nodes with locally-attached NICs) is coherent and cross-validated across `nvidia-smi topo -m`, sysfs `numa_node`, and `lspci`. `nvidia-smi nvlink --status` per-link bandwidth (~26.5 GB/s) is consistent with H100 4th-gen NVLink specs (18 links, ~900GB/s aggregate bidirectional).

**Volume ZTH-02 labs summary:** All 4 labs are technically sound, commands and expected outputs are accurate, and the labs consistently reinforce the "evidence over assumption" methodology from the chapters. No findings requiring fixes.
