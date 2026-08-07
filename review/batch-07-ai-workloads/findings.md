# Batch 07 — AI Workloads & Training — Findings

(Summary to be written at top once review is complete.)

## F-05 — docs/volume-05 (AI Workloads and AI Platform Architecture)

Overall: this volume has clearly already been through a depth-rework pass (dense "➕" annotated sections with worked scenarios, mermaid diagrams, annotated CLI output, and — critically — real arithmetic: KV-cache formula, cost-per-token math, checkpoint-stall percentages, fan-out amplification math). Quality is at or above the Volume-1 gold-standard bar. Findings below are the exceptions, not the norm.

### 01-chapter-1-classify-the-ai-workload-before-designing-infrastructure.md
- [SEVERITY: low] No issues found. Strong foundational chapter; weight-memory table (FP32/FP16/8-bit/4-bit bytes-per-param) checks out arithmetically (70B params → 280GB/140GB/70GB/35GB).

### 02-chapter-2-training-architecture-compute-data-checkpoints-and-collectives.md
- [SEVERITY: medium] Chapter covers AllReduce qualitatively (diagrams, `nvidia-smi dmon` stall signature, checkpoint-storm scenario) but never states the actual communication-volume formula for a collective (e.g., ring-AllReduce moves ≈ 2×(N-1)/N × gradient_size bytes per GPU, or the simpler "gradient size × 2" mental model for bandwidth-bound AllReduce cost).
  - Evidence: Section 2.1 and the worked scenarios discuss "coordination cost" and fabric speed only in qualitative/diagram form; no bytes-moved arithmetic appears anywhere in the chapter.
  - Why it matters for JR2018680: "communication volume per collective operation" is explicitly named as expected interview depth (AllReduce vs AllGather vs ReduceScatter bandwidth math) — this chapter has all the surrounding diagnostic material (dmon signatures, straggler discussion) but skips the one formula an interviewer is most likely to ask for directly.
  - Suggested fix: add a short worked example — e.g., "8×A100, 1GB gradient tensor, ring-AllReduce moves ~2×7/8×1GB ≈ 1.75GB per GPU over the fabric" — alongside the existing dmon/diagram material.

### 03-chapter-3-llm-inference-prefill-decode-batching-and-kv-cache.md
- [SEVERITY: low] No issues found. KV-cache formula (`2 × num_layers × num_kv_heads × head_dim × seq_len × batch × bytes_per_element`) is present and all worked numeric examples (320KB/token, 640MB @ 2K/batch1, 10.2GB @ 32K/batch1, 82GB @ 32K/batch8) check out arithmetically.

### 04-chapter-4-serving-frameworks-and-the-platform-boundary.md
- [SEVERITY: low] No issues found.

### 05-chapter-5-autoscaling-inference.md
- [SEVERITY: low] No issues found.

### 06-chapter-6-distributed-and-disaggregated-inference.md
- [SEVERITY: low] No issues found.

### 07-chapter-7-state-caches-and-rag-dependencies.md
- [SEVERITY: low] No issues found.

### 08-chapter-8-security-and-tenancy-for-ai-platforms.md
- [SEVERITY: low] No issues found. MIG vs time-slicing isolation comparison is accurate.

### 09-chapter-9-performance-and-cost-engineering.md
- [SEVERITY: low] No issues found. Cost-per-token arithmetic verified correct ($11.11 vs $8.33 per 1M tokens; 10 vs 17 replica fleet costs).

### 10-senior-deep-dive-1-training-systems-parallelism-collectives-and-checkpoint-eco.md
- [SEVERITY: low] No issues found. Correctly introduces expert-parallelism all-to-all as distinct from AllReduce; checkpoint-stall 40% math checks out.

### 11-senior-deep-dive-2-llm-inference-prefill-decode-kv-cache-and-continuous-batchi.md
- [SEVERITY: low] No issues found.

### 12-senior-deep-dive-3-nim-vllm-tensorrt-llm-and-serving-boundaries.md
- [SEVERITY: medium] Claim that NIM "currently packages vLLM behind a production-oriented proxy" is an oversimplification/possible inaccuracy. NVIDIA NIM for LLMs supports multiple backend engines (TensorRT-LLM optimized profiles for supported GPU/model combos, with vLLM/other backends as broader-compatibility fallbacks) selected per deployment profile — it is not accurately described as "packaging vLLM." This also mildly contradicts Chapter 1 of this same volume, which more accurately says "Profiles can encode backend, precision, tensor/pipeline parallelism" (implying backend choice, not a fixed vLLM wrapper).
  - Evidence: "NVIDIA NIM for LLMs currently packages vLLM behind a production-oriented proxy with liveness/readiness, OpenAI-compatible inference endpoints and Prometheus-compatible metrics."
  - Why it matters for JR2018680: NIM architecture (TensorRT-LLM vs vLLM backend selection via profiles) is a plausible direct interview question given the NVIDIA-specific product focus; stating it always wraps vLLM would be a wrong answer.
  - Suggested fix: revise to state NIM selects among multiple optimized backends (TensorRT-LLM, vLLM, etc.) via deployment profiles, rather than "packages vLLM."

### 13-senior-deep-dive-4-nvidia-dynamo-system-level-inference-optimization.md
- [SEVERITY: low] "NVIDIA Dynamo became GA in 2026" is a time-sensitive claim that should be verified against current NVIDIA documentation before an interview (unverifiable from repo content alone as of this review). Rest of the KV-aware-routing failure/staleness mechanism is technically sound.

### 14-senior-deep-dive-5-autoscaling-inference-from-work-not-only-cpu.md
- [SEVERITY: low] No issues found.

### 15-senior-deep-dive-6-rag-vector-search-and-stateful-dependencies.md
- [SEVERITY: low] No issues found.

### 16-senior-deep-dive-7-agentic-and-multimodal-infrastructure.md
- [SEVERITY: low] No issues found. Fan-out amplification math (100 req/s × 10 × 1.3 = 1300) checks out.

### 17-senior-deep-dive-8-production-benchmark-design.md
- [SEVERITY: low] No issues found.

## ZTH-12 — docs/nvidia-zero-to-hero/volume-12 (AI Inference)

Overall: this volume is already at gold-standard depth (matches or exceeds ZTH Volume 1) — every chapter follows a WHY/WHAT/HOW/TRADEOFFS/PRODUCTION/TROUBLESHOOTING/SENIOR-INTERVIEW-QUESTIONS structure with worked math, annotated CLI/log output, and named production incidents. All arithmetic spot-checked below is correct.

### index.md
- [SEVERITY: low] No issues found.

### chapter-01-why-inference-infrastructure-is-different.md
- [SEVERITY: low] No issues found. Verified math: HBM read time 140GB/3350GB/s ≈ 41.7ms/token → ~24 tok/s decode ceiling; KV cache 2×80×8×128×4096×2 = 1,342,177,280 bytes ≈ 1.34GB/sequence; 64 concurrent → 85.76GB; 100 concurrent + weights + overhead = 284.2GB total (interview Q&A section). All internally consistent and consistent with F-05's KV-cache formula and numbers.

### chapter-02-the-end-to-end-inference-request-path.md
- [SEVERITY: low] No issues found. Strong chapter on non-GPU latency sinks (tokenization GIL contention, pageable vs pinned memory, Nginx SSE buffering) with concrete before/after benchmark numbers.

### chapter-03-triton-inference-server-architecture.md
- [SEVERITY: low] No issues found. Verified math: 8×9.5GB=76GB instance-group VRAM oversubscription example; 2×9.5GB=19GB corrected config.

### chapter-04-tensorrt-optimization-and-engine-lifecycle.md
- [SEVERITY: low] No issues found. Verified math: 128×3×4096×4096×4 bytes ≈ 25.7GB workspace example checks out; 8×9.5GB / 2×9.5GB instance-group examples check out.

### chapter-05-tensorrt-llm-and-llm-execution.md
- [SEVERITY: medium] Internal arithmetic inconsistency in the KV-cache worked example. Text states "2 * 80 * 8 * 128 * 2 bytes = 327,680 bytes/token" (correct) and then "For a 4,096 token sequence length: M_KV_per_seq = 327.68 KB * 4096 = 1.342 GB" is NOT what's printed — the chapter actually prints "consumes 1.31 GB per user session," which is arithmetically wrong. 327,680 bytes × 4096 = 1,342,177,280 bytes ≈ 1.34 GB (decimal) — matching this same volume's Chapter 01 (which computes "1,342,177,280 bytes ≈ 1.34 GB" for the identical scenario) and Chapter 08 (which computes "1,310,720 KiB ≈ 1.25 GiB," correct in binary units). Chapter 05's "1.31 GB" figure matches neither the decimal-GB convention used elsewhere in this same chapter nor the binary-GiB convention used in Chapter 08.
  - Evidence: "For a 4,096 token sequence length: ... A sequence of 4,096 tokens consumes 1.31 GB per user session." (should be ≈1.34 GB decimal, or ≈1.25 GiB binary — either is internally consistent with sibling chapters; 1.31 GB is neither).
  - Why it matters for JR2018680: this exact KV-cache sizing calculation is flagged in the task brief as core interview material; an interviewer who has this document open could catch the inconsistency, and a candidate who memorized "1.31 GB" from this page would be corrected by their own Chapter 1/Chapter 8 numbers.
  - Suggested fix: correct "1.31 GB" to "1.34 GB" (or convert consistently to "1.25 GiB") to match Chapter 01 and Chapter 08 of this same volume.
- [SEVERITY: low] Positive note: this chapter includes the AllReduce communication-volume formula that F-05 Chapter 2 (docs/volume-05) lacks: "Data Volume = 2 * ((TP - 1) / TP) * B * S * H * BytesPerElement" — this is the standard ring-AllReduce bytes-moved formula and is correct. Worth cross-referencing from F-05 in a future authoring pass.

### chapter-06-vllm-tgi-sglang-and-lmdeploy.md
- [SEVERITY: medium] The LMDeploy GitHub reference link appears incorrect. The chapter cites "**LMDeploy TurboMind Engine Documentation:** https://github.com/ModelFoundry/lmdeploy" — LMDeploy is developed and hosted by the InternLM/OpenMMLab organization (github.com/InternLM/lmdeploy), not an org called "ModelFoundry." The chapter body text itself correctly attributes LMDeploy to "OpenMMLab."
  - Evidence: final References section, item 4.
  - Why it matters for JR2018680: a broken/wrong citation is low-stakes technically but is the kind of detail an NVIDIA interviewer familiar with the OSS serving ecosystem would notice; also a structural-integrity issue (dead/wrong link).
  - Suggested fix: correct the URL to `https://github.com/InternLM/lmdeploy`.

### chapter-07-continuous-and-dynamic-batching.md
- [SEVERITY: low] No issues found. Padding-waste and chunked-prefill token-budget formulas are standard and correctly presented; block-count math (24000/16=1500) checks out.

### chapter-08-kv-cache-memory-and-concurrency.md
- [SEVERITY: low] No issues found — and notably this chapter's KV-cache arithmetic (327,680 bytes/token, 1.25 GiB @ S=4096, 39.06 GiB @ S=128,000) is internally correct and uses binary GiB units consistently, unlike Chapter 05's error (see above). Capacity-matrix concurrency numbers (C_max) are reasonable approximations given the stated formula.

### chapter-09-scaling-multi-gpu-and-multi-node-inference.md
- [SEVERITY: low] No issues found. "2 AllReduce per layer × 80 layers = 160 AllReduce calls per token" is a correct and interview-relevant derivation; NVLink vs PCIe vs InfiniBand bandwidth/latency table and the TP-must-stay-intra-node guidance are technically sound.
