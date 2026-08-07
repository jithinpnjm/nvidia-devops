# Batch 01 — GPU & CUDA Fundamentals — Findings

## Summary (review complete — all 4 volumes: ZTH-01, ZTH-02, ZTH-03, F-04)

**Totals by severity:** High: 0. Medium: 0. Low: 2.

This batch (60 files: 43 ZTH chapters/labs across volumes 01-03, plus 14 F-04 chapters) is the strongest-reviewed content seen in the interview-prep curriculum. No factual/technical errors were found anywhere in the batch. Every checked hardware and software fact was correct: H100 (132 SMs, compute capability 9.0, ~3.35TB/s HBM3, ~900GB/s NVLink aggregate, 989 TFLOPS FP16 dense), A100 (108 SMs, compute capability 8.0), A10 (72 SMs), sm_80/86/90 architecture mappings, PCIe Gen4/Gen5 bandwidth figures, MIG profile geometries, and the full NVIDIA Xid error code table (13, 31, 43, 48, 63/64, 79).

**The 2 low-severity findings, both non-technical:**
1. ZTH-01 chapter-03 ("CPU vs GPU") is purely qualitative with no concrete FLOPS/bandwidth numbers, even though the chapter title implies a numeric comparison — low severity because Volumes 02/03 supply the numbers immediately after.
2. F-04 Chapter 1 duplicates CPU/GPU/CUDA/driver-toolkit foundational material already covered by ZTH-01 and ZTH-03 chapters 1-2 — low severity because F-04 itself acknowledges and cross-references this in its own "Senior Deep Dive 1" addendum.

**Top 5 findings most relevant to interview prep (JR2018680):**
1. **This is genuinely gold-standard interview-prep material.** ZTH-02/03 in particular consistently pair every claim with real command output (`nvidia-smi`, `dmon`, `ncu`, `nvcc -Xptxas=-v`, `nsys`, `compute-sanitizer`) and first-person "model answer" interview responses — this is exactly the mechanism-first, evidence-based reasoning a NVIDIA AI-infra interview probes for.
2. **GPU memory hierarchy and roofline reasoning are covered with real numbers**, not hand-waving: register-file residency math, HBM bandwidth-per-token decode-latency floors, and the compute-vs-memory-bound roofline crossover (ridge point) are each worked out arithmetically in both ZTH-02 and F-04's Senior Deep Dive 1 — a candidate who internalizes these worked examples can derive bottleneck classifications live in an interview rather than reciting definitions.
3. **The driver/CUDA-toolkit/container compatibility chain is taught correctly and repeatedly**, including the frequently-confused point that `nvidia-smi`'s "CUDA Version" field reports the driver's maximum supported CUDA version, not an installed toolkit version — this is a common real-world (and interview) trip-up and it's stated correctly in every volume that touches it.
4. **F-04's Xid/DCGM health-semantics table (Senior Deep Dive 6) is a standout, high-value asset** for the "hardware/bare-metal" portion of the interview loop — it correctly maps specific Xid codes to specific next actions (application-bug vs hardware-degradation vs immediate-drain), which is exactly the kind of on-call-experience knowledge a senior AI-infra interview tests for.
5. **Cross-curriculum consistency is strong.** ZTH-02/03 (CUDA-programming/microarchitecture-first) and F-04 (infrastructure/platform-ops-first) cover the GPU domain from genuinely different angles with no factual contradictions between them — the only meaningful overlap is F-04 Chapter 1's re-introduction of material ZTH-01 already covers, which F-04 itself flags for the reader.

---

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

## Volume ZTH-03 — CUDA Fundamentals

Same exceptional depth and style as ZTH-02: worked evidence chains, real command/error-message transcripts, and first-person interview model answers throughout.

### index.md
- No findings.

### chapter-01-why-cuda-exists.md
- No findings. Host/device heterogeneous model, CUDA capability table, and dependency-chain reasoning are accurate.

### chapter-02-cuda-software-stack.md
- No findings. Runtime API vs Driver API distinction, container/host driver boundary explanation, and the `NVIDIA_VISIBLE_DEVICES=none` / `libcudart.so` troubleshooting scenarios are realistic and technically correct.

### chapter-03-cuda-programming-and-execution-model.md
- No findings. Asynchronous-launch timing trap (host wall-clock vs `cudaEvent` timing) is a genuine, common CUDA pitfall correctly explained. A10 SM count (72) vs H100 (132) comparison for the "grid too small" example is correct.

### chapter-04-kernel-launch-configuration-and-indexing.md
- No findings. Ceiling-division vs bounds-check distinction is precisely and correctly explained (a genuinely subtle point many CUDA tutorials get muddled). A10 (72 SM) vs H100 SXM5 (132 SM) underfill table is correct.

### chapter-05-cuda-memory-management-and-data-movement.md
- No findings. Pageable-vs-pinned staging-copy mechanism is correct; KV cache worked formula (`2 x layers x batch x seq_len x hidden x bytes`) is dimensionally correct and explicitly marked illustrative; the `cudaMalloc`/`cudaFree` dominating-CUDA-API-time `nsys stats` example is a realistic and common production anti-pattern.

### chapter-06-synchronization-errors-and-correctness.md
- No findings. Synchronization scope table (thread/warp/block/stream/event/device/host) and the "blocking copy accidentally fixes a race" failure mode are both accurate and reflect genuine, common CUDA production incidents. The error-check overhead table (`cudaGetLastError` ~0.6% vs `cudaDeviceSynchronize` ~85% throughput loss) is a plausible, correctly-reasoned illustration.

### chapter-07-streams-events-and-asynchronous-execution.md
- No findings. Stream/event semantics, "async API name does not guarantee device overlap" warning, and the `nsys` timeline evidence for detecting fake vs real overlap are all technically accurate and reflect real CUDA debugging practice.

### chapter-08-pinned-memory-and-transfer-overlap.md
- No findings. Pageable-vs-pinned bandwidth comparison (3.61 GB/s vs 15.88 GB/s, ~4.4x) is consistent with PCIe Gen4 x16 practical ceilings (~20-25GB/s) vs staged-copy overhead; the NUMA cross-socket transfer penalty example (15.9GB/s local vs 9.1GB/s remote, ~1.75x) is a realistic and correctly reasoned illustration.

### chapter-09-unified-memory-and-demand-paging.md
- No findings. Managed-memory fault/migrate mechanics, oversubscription-thrashing example (working set crossing device capacity causing throughput collapse from 104GB/s to 9GB/s), and the "single CPU debug print costs 23x the kernel" example are all technically sound and reflect genuine Unified Memory production pitfalls.

### chapter-10-cuda-graphs-and-repeated-execution.md
- No findings. CUDA Graph node/edge/instantiation/replay model, stream-capture-safety caveats, and the "graphs fix submission overhead, not transfer/kernel time" distinction (backed by an `nsys` example showing 97.3% of time in one large `cudaMemcpyAsync`) are all accurate.

### chapter-11-compilation-binaries-and-compatibility.md
- No findings. PTX vs SASS distinction, JIT compilation and caching behavior, and the `cuobjdump --list-elf`/`--list-ptx` diagnostic sequence are accurate. sm_80 (A100), sm_86 (A10/A40), sm_90 (H100) compute-capability-to-architecture mappings are correct.

### chapter-12-profiling-and-production-troubleshooting.md
- No findings. Three-level profiling funnel (SLO -> system timeline -> kernel analysis) is a sound methodology. `compute-sanitizer` illegal-access example bounds math (thread 287, block 3906, blockDim 256 -> index 1,000,223) is arithmetically correct and consistent with the Chapter 4 bounds-check defect it references.

### chapter-13-volume-03-summary.md
- No findings. Consolidation is accurate and consistent with all prior chapters; the fault-isolation decision-tree diagram correctly maps symptom classes to the chapters that own them.

**Volume ZTH-03 summary:** Zero medium/high severity findings across all 13 chapters. Consistent with ZTH-02's exceptional depth — real command transcripts, correct hardware/software facts (A100/H100 SM counts and compute capabilities, sm_80/86/90 mappings, PCIe/NVLink bandwidth figures, KV-cache and register-residency math), and first-person interview answers throughout.

### labs/lab-01-inspect-and-validate-a-cuda-environment.md
- No findings. PCI vendor/device ID (10de:20b0 for GA100/A100) is correct. Layered evidence chain (PCI -> driver -> device nodes -> libraries -> toolkit -> program) is technically sound and matches the chapter's fault-isolation model.

### labs/lab-02-build-and-validate-a-cuda-vector-pipeline.md
- No findings. Complete, compilable CUDA vector-add program with correct ceiling-division/bounds-check pattern. 1024 max-threads-per-block limit cited for the "invalid configuration argument" failure injection is correct for current NVIDIA architectures. The underlaunch-vs-out-of-bounds failure signatures (zero-valued mismatches vs illegal memory access) are correctly distinguished.

### labs/lab-03-build-an-overlapped-cuda-pipeline.md
- No findings. Complete, compilable double-buffered pinned-memory pipeline with correct wait-collect-refill ownership ordering. Failure-injection math checks out: index 4,194,304 in Failure B is exactly `chunkElements` (1<<22), correctly identified as the first element of the second chunk.

### labs/lab-04-profile-and-diagnose-a-cuda-application.md
- No findings. Three regression scenarios (device-wide sync, tiny chunks, pageable buffers) are all realistic and the reasoning behind each measured slowdown is technically sound. Consistent use of the Chapter 12 profiling funnel methodology.

**Volume ZTH-03 labs summary:** All 4 labs are technically sound, self-consistent, and reinforce the volume's evidence-based troubleshooting methodology. No findings requiring fixes.

## Volume F-04 (docs/volume-04) — GPU and Accelerated Computing Foundations

This volume has a visibly different structure than ZTH-01/02/03: each chapter is a short "core" section (source docx-derived) followed by heavily-marked "➕" addition blocks (diagrams, annotated command output, worked scenarios, interview lines, practice questions) that appear to be a later depth-rework pass layered onto an original document. The style is more conversational/annotated ("Reading order that matters...", "Interview-ready line:") vs ZTH's structured chapter template, but technical content is consistently accurate where checked.

### 01-chapter-1-gpu-execution-and-memory-mental-model.md
- [SEVERITY: low] This chapter substantially duplicates ZTH-01 (why CPUs insufficient, CPU vs GPU) and ZTH-02 chapter 1 (why GPU architecture evolved) and ZTH-03 chapters 1-2 (why CUDA exists, software stack layers, driver vs toolkit vs runtime) — covering nearly identical ground (spreadsheet/parallel analogy, host/device model, nvidia-smi CUDA-Version-is-not-installed-toolkit caveat, driver/toolkit/runtime layering, container/host driver dependency).
  - Evidence: Compare "What CUDA actually is (and the three things beginners conflate)" (lines 54-78) with ZTH-03 chapter-01/02's driver/toolkit/runtime treatment, and "The NVIDIA software stack, layer by layer" (lines 150-170) with ZTH-01 chapter-07's ecosystem layer table.
  - Why it matters for JR2018680: this is the cross-curriculum duplication the review brief specifically asks to flag — a candidate studying both curricula sequentially will re-read the same foundational material (CPU-vs-GPU, driver/toolkit split) three times without gaining additional depth in this instance, though F-04's version does add Kubernetes/container-operator context ZTH-01 lacks.
  - Suggested fix: no factual error to fix inline; flag for a follow-up authoring pass to either cross-reference ZTH-01/03 instead of re-deriving the same explanations, or clearly differentiate F-04's angle (ops/Kubernetes-first) from ZTH's (CUDA-programming-first) in the chapter framing.
- No factual errors found. H100 PCI device ID (10de:2330), nvidia-smi output format, and driver/toolkit/CUDA-Version distinction are all correct.

### 02-chapter-2-pcie-nvlink-and-topology.md
- No findings. `nvidia-smi topo -m` legend (NV#, PHB, SYS), NUMA distance interpretation, and GPUDirect RDMA double-copy-avoidance mechanism are all accurate. Overlaps with ZTH-02 chapter-10 topology content but from a Kubernetes/NCCL-operations angle rather than architecture-education angle — less concerning duplication since the framing differs materially (rank placement, NCCL_DEBUG diagnosis).

### 03-chapter-3-driver-cuda-runtime-and-container-stack.md
- No findings. Driver-sets-CUDA-ceiling compatibility direction is correctly stated; the `docker run` failure example ("please update your driver") is a realistic and correct error message pattern.

### 04-chapter-4-kubernetes-device-plugins-and-gpu-operator.md
- No findings. Device-plugin registration flow, GFD labeling, and MIG resource-name-changes-the-scheduling-contract explanation are accurate. The "Kubernetes memory limits do not see GPU memory" callout is an important and correctly-stated distinction.

### 05-chapter-5-gpu-sharing-mig-time-slicing-mps-and-vgpu.md
- No findings. MIG profile names (3g.40gb, 1g.10gb) and instance counts are consistent with real A100 80GB MIG geometries. MPS cooperative-isolation description (shared server process, no hard fences) is accurate.

### 06-chapter-6-gpu-telemetry-dcgm-and-health.md
- No findings. DCGM field names, `dcgmi diag -r 2` vs `-r 3` tier distinction, and the demand-vs-health-vs-throttling decision framework are all accurate and represent a genuinely important interview-relevant distinction (utilization-based autoscaling under thermal throttling).

### 07-chapter-7-capacity-and-failure-domain-design.md
- No findings. Fleet-shape-vs-GPU-count reasoning and N+1 node-level (not GPU-level) reserve sizing argument are sound and correctly tied to the NVSwitch-node failure-domain concept from Chapter 2.

### 08-senior-deep-dive-1-gpu-execution-model-without-cuda-programming-overload.md
- [SEVERITY: low] Heavy duplication with Chapter 1 (arithmetic intensity/roofline, prefill vs decode) is explicitly acknowledged and cross-referenced in-text by the document itself ("Rather than duplicate, this addendum adds only what's genuinely new..."), which is good practice, but the underlying chapter-vs-deep-dive split still means a reader covers prefill/decode arithmetic-intensity reasoning up to 3 times across F-04 Ch1 + this Deep Dive + ZTH-02 chapter-11's ridge-point treatment.
  - Why it matters for JR2018680: not a technical error, just redundant reading load; the self-aware cross-referencing here is actually a good model for how the earlier volumes could have handled overlap.
  - Suggested fix: none required; content is accurate and the self-referential note already mitigates the concern.
- No factual errors. Roofline model (balance point = peak FLOPS / peak HBM bandwidth) is correct and consistent with ZTH-02 chapter-11's identical calculation.

### 09-senior-deep-dive-2-topology-pcie-nvlink-nvswitch-and-numa.md
- No findings. `nvidia-smi topo -p2p r` (OK/NS) and `nvidia-smi nvlink --status` per-link bandwidth output are accurate and correctly distinguished from the `topo -m` NV/PHB/SYS matrix (intended wiring vs actual live link health).

### 10-senior-deep-dive-3-driver-cuda-compatibility-and-container-integration.md
- No findings. CDI spec file path (`/var/run/cdi/nvidia.com-gpu.json`) and `modinfo nvidia`/`ctr -n k8s.io` diagnostic commands are accurate; CDI-vs-legacy-hook path distinction is correct.

### 11-senior-deep-dive-4-gpu-operator-as-a-dependency-reconciler.md
- No findings. ClusterPolicy operand dependency ordering (Driver -> Toolkit -> device plugin -> DCGM/GFD/MIG manager) is accurate.

### 12-senior-deep-dive-5-sharing-mig-time-slicing-mps-and-vgpu.md
- No findings. Requirement-driven decision tree is logically sound; `nvidia-smi vgpu -q` expected-failure-on-bare-metal explanation is correct.

### 13-senior-deep-dive-6-dcgm-xid-ecc-and-health-semantics.md
- No findings. Xid code table is accurate against NVIDIA's published Xid error reference: Xid 13 (graphics engine exception), Xid 31 (GPU memory page fault), Xid 43 (GPU stopped processing), Xid 48 (double-bit ECC error), Xid 63/64 (row-remapping pending/failed), Xid 79 (GPU fallen off the bus) — all correctly described with appropriate next actions. This is a genuinely high-value, interview-relevant table.

### 14-senior-deep-dive-7-fleet-lifecycle-upgrades-draining-and-known-good-validation.md
- No findings. Lifecycle state model (provision -> validate -> admit -> observe -> drain -> upgrade -> revalidate -> return) and the canary-node-first rollout pattern are sound operational practice, consistent with the rest of the volume's evidence-based approach.

**Volume F-04 summary:** Across all 14 chapters, one low-severity cross-curriculum duplication finding (Chapter 1 vs ZTH-01/ZTH-03's CPU/GPU/CUDA/driver foundational material — largely self-mitigated by F-04's own Deep-Dive-1 cross-reference table). No technical/factual errors found in any chapter. Xid code table (Deep Dive 6) and the MIG/time-slicing/MPS/vGPU decision framework (Chapter 5 / Deep Dive 5) are particularly strong, interview-ready material.

## Cross-curriculum check: ZTH-02/ZTH-03 vs F-04

- **Contradictions found: none.** All overlapping factual claims (H100 SM count and specs, NVLink/PCIe bandwidth figures, driver-vs-CUDA-toolkit-vs-runtime layering, `nvidia-smi` CUDA-Version-is-a-ceiling-not-installed-version caveat, MIG/time-slicing/MPS isolation semantics, Xid/ECC health signals) are consistent across both curricula.
- **Duplication assessment:** ZTH-02/ZTH-03 and F-04 cover substantially different territory in practice despite both being "GPU foundations" volumes. ZTH-02/03 are CUDA-programming/GPU-microarchitecture-first (warp scheduling, register allocation, memory coalescing, CUDA API mechanics, kernel launch geometry) — essentially a hardware-and-programming-model curriculum. F-04 is infrastructure/platform-operations-first (Kubernetes device plugins, GPU Operator, DCGM/Xid triage, MIG-as-a-scheduling-resource, fleet lifecycle) — essentially an SRE/platform-engineer curriculum that happens to open with the same "why GPUs exist" material ZTH-01 covers.
- **The one real overlap worth flagging:** F-04 Chapter 1 ("GPU execution and memory mental model") reintroduces the CPU-vs-GPU/CUDA-vs-driver-vs-toolkit material that ZTH-01 and ZTH-03 chapters 1-2 already cover in comparable or greater depth. This is flagged as a low-severity finding under F-04 Chapter 1 above. Volume-04 Chapter 2 (topology) also covers similar ground to ZTH-02 chapter-10, but from a distinctly different angle (NCCL/Kubernetes operations vs GPU-architecture education) that adds rather than merely repeats.
- **Depth-bar comparison:** Both curricula reach a very high, evidence-based depth bar (real command output, worked numeric examples, first-person interview answers / "interview-ready lines"). ZTH-02/03 is slightly more rigorous in its consistent chapter template (Learning Objectives, Big Picture, Internal Working, Architecture, Production Troubleshooting, Interview Preparation sections every chapter); F-04 is organized as short core sections plus "➕" addendum blocks that read like a later depth-rework layered onto a shorter original document — the effect is very similar total depth but a less uniform structure within F-04 itself.
