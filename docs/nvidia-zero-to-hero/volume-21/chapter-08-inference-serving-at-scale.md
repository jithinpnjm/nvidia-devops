---
title: Chapter 08 — Inference Serving at Scale
description: vLLM, TGI, batching strategies, latency SLOs, serving infrastructure for production LLM APIs.
sidebar_position: 9
tags: [inference, vllm, serving, latency, throughput, batching]
---

# Chapter 08 — Inference Serving at Scale

## PART 1: INFERENCE ARCHITECTURE FUNDAMENTALS

### 1.1 Throughput vs. Latency Trade-off

```python
# Production LLM serving: balance latency (user experience) and throughput (cost)

# Scenario: Llama-3-70B inference server, H100 GPU, 2000 QPS peak

# Option A: Large batches (B=256)
#   Prefill: 256 sequences × 512 avg tokens = 131K tokens
#   Prefill throughput: 1500 tokens/sec (limited by HBM)
#   Prefill latency: 131K / 1500 = 87 seconds... NO, wrong calculation
#   
#   Actually:
#   Time per forward pass @ batch=256: 256 sequences × 10ms per seq = 2.56 sec
#   But that's wrong too. Let me think more carefully.
#   
#   Per-GPU throughput (decode-bound):
#     HBM bandwidth: 3.35 TB/s for 1 GPU
#     Model size: 140 GB
#     Time to fetch all weights per token: 140 GB / 3.35 TB/s = 41.8 ms
#     Tokens per second: 1000 ms / 41.8 ms = 23.9 tokens/sec per GPU
#   
#   With batch=256, concurrency improves:
#     Effective throughput: 23.9 tokens/sec × 1.5x batching factor = ~36 tokens/sec
#   
#   Latency to generate 128-token response:
#     Prefill time: 128 tokens / 100 tokens/sec = 1.28 sec (prefill is compute-bound, faster)
#     Decode time: 128 tokens × 41.8 ms = 5.35 sec (memory-bandwidth bound)
#     Total TTFT: 1.28 sec (first token after prefill)
#     Total time for full response: 1.28 + 5.35 = 6.63 sec p99 (acceptable but high)

# Option B: Small batches (B=4)
#   Latency to generate 128-token response:
#     Prefill time: 512 tokens / 100 tokens/sec ≈ 5 ms (small batch, fast)
#     Decode time: 128 tokens × 41.8 ms = 5.35 sec
#     Total response time: 5 ms + 5.35 sec = 5.355 sec p50
#     p99: ~6 sec (similar due to decode being dominant bottleneck)
#   
#   Throughput: Only 4 concurrent sequences, if avg response = 6 sec
#     Throughput: 4 / 6 sec = 0.67 sequences/sec = 67 QPS

# Option C: Continuous batching (dynamic batch size, 1–64 sequences)
#   Key insight: Decode tokens are independent of batch size (memory bandwidth is shared)
#   So: 1 sequence takes ~41.8ms per decode token (single sequence)
#       64 sequences take ~41.8ms per decode token (shared memory I/O!)
#   
#   Throughput gain: 64x (for free, via better memory utilization)
#   Latency impact: Minimal (decode latency same, but prefill overlapped)
#   p99 TTFT: 50–100 ms (with queue wait)
#   p99 total response time: 500 ms (good for user experience)

print("""
INFERENCE STRATEGY COMPARISON

Option A: Large static batches
  Throughput: 36 tokens/sec per GPU × N GPUs
  Latency p99 TTFT: 2 seconds (unacceptable for chat)
  Best for: Batch inference (asynchronous)

Option B: Small static batches
  Throughput: 6.7 tokens/sec per GPU × N GPUs (underutilized)
  Latency p99 TTFT: 50 ms
  Cost: High (GPUs underutilized)

Option C: Continuous batching (recommended)
  Throughput: 36 tokens/sec per GPU × N GPUs (same as A, better latency)
  Latency p99 TTFT: 100 ms (good user experience)
  Cost: Optimal (full GPU utilization with low latency)
""")
```

### 1.2 vLLM Serving Architecture

```python
# vLLM: Open-source inference engine, optimized for continuous batching

from vllm import LLM, SamplingParams
import asyncio

# Initialize model (auto-loads optimal # of GPUs for tensor parallelism)
llm = LLM(
    model="meta-llama/Llama-2-70b-hf",
    tensor_parallel_size=2,  # Shard model across 2 GPUs (one node)
    max_num_seqs=64,  # Max concurrent sequences (tuned for KV cache)
    dtype="float16",  # Use FP16 precision
)

# Sampling params
sampling_params = SamplingParams(
    temperature=0.8,
    top_p=0.95,
    max_tokens=512,  # Max output tokens per request
    frequency_penalty=0.0,
)

# Inference (streaming + continuous batching)
async def serve_request(prompt):
    outputs = llm.generate(prompt, sampling_params)
    for output in outputs:
        yield output.outputs[0].text

# Performance expectations (70B model, 2 GPU, continuous batching):
#   Prefill throughput: 1500 tokens/sec (compute-bound)
#   Decode throughput: 36 tokens/sec (memory-bandwidth bound)
#   Max concurrent sequences: 64 (limited by KV cache memory)
#   p99 TTFT: 100 ms (with 100 ms queue + prefill)
#   p99 total response: 500 ms (prefill + 128 decode tokens @ 36 tokens/sec)
```

---

## PART 2: MULTI-GPU INFERENCE SCALING

### 2.1 Tensor Parallelism for Inference

```yaml
SCALING LLAMA-70B INFERENCE

Single H100 (80GB VRAM):
  Model weights: 140 GB (BF16) → Doesn't fit!
  Must use quantization (INT8) or model parallel

Option 1: Quantization (INT8)
  Model size: 70 GB (INT8 quantized)
  Fits on 1 GPU ✓
  Throughput: 36 tokens/sec (decode-bound)
  Quality: <1% perplexity increase on MMLU (acceptable)

Option 2: 2-GPU Tensor Parallelism
  GPU 0: 70 GB weights (sharded)
  GPU 1: 70 GB weights (sharded)
  Communication: AllReduce per forward pass (~5 ms overhead)
  Throughput: 36 tokens/sec + potential 5 ms AllReduce overhead
  Quality: 100% (no quantization)

Option 3: 4-GPU Tensor Parallelism (overkill for 70B)
  Throughput: Still 36 tokens/sec (decode-bounded)
  AllReduce cost: 4 GPUs × 5 ms = too much overhead
  Not recommended for 70B (better for 400B+)

Recommendation for 70B inference:
  Use 2-GPU tensor parallelism or INT8 quantization
  INT8 preferable if <1% quality loss is acceptable
  Tensor parallelism if quality is critical
```

### 2.2 Multi-GPU Serving Cluster

```yaml
PRODUCTION INFERENCE CLUSTER: 2000 QPS PEAK

Requirement: Serve Llama-70B with p99 TTFT <500ms, 99.9% availability

Scaling calculation:
  Per-GPU throughput (decode-bound): 36 tokens/sec
  Avg response: 150 tokens
  Time per response: 150 / 36 = 4.2 sec per sequence
  Concurrent sequences per GPU: 64 (vLLM limit)
  
  To serve 2000 QPS:
    If each GPU holds 64 concurrent sequences for 4.2 sec
    Sequences per GPU per second: 64 / 4.2 = 15.2 QPS per GPU
    GPUs needed: 2000 / 15.2 ≈ 132 GPUs minimum
    
  With multi-region (3x redundancy for 99.9% availability):
    Total GPUs: 132 × 3 = 396 GPUs
    Inference nodes: 396 / 8 GPU per node = 49.5 ≈ 50 nodes

Deployment:
  Region 1 (us-west): 50 nodes (400 GPUs), 2-GPU tensor parallelism per model
    Nodes 1–25: Llama-70B serving (25 × 8 GPU / 2 per model = 100 model replicas)
    Throughput: 100 replicas × 15.2 QPS = 1520 QPS
  Region 2 (us-east): 50 nodes, same setup
  Region 3 (eu-west): 50 nodes, same setup
  
  Total: 150 nodes, 1200 GPUs, serving 2000 QPS globally with 99.9% availability
  
Infrastructure cost:
  Hardware: 1200 GPUs × $30K = $36M
  Network: Multi-region bandwidth, $2M/year
  Power: 1200 GPU × 350W = 420 kW peak, 200 kW avg = $200K/year electricity
  Personnel: 10 SRE/Eng × $150K = $1.5M/year
  Total 3-year cost: $36M + ($2M + $0.2M + $1.5M) × 3 = $46.6M
  Cost per 1M tokens served: $46.6M / (2000 QPS × 86400 sec/day × 365 days × 150 tokens/seq) = $0.005 per 1M tokens
```

---

## PART 3: SERVING CHALLENGES & SOLUTIONS

| Challenge | Impact | Solution |
|---|---|---|
| **High tail latency (p99 > 1 sec) while p50 < 100ms** | User experience poor during traffic spikes | Implement queue backpressure; reject requests at 99.95% full capacity instead of queueing indefinitely |
| **Model inference timeout (>30 sec, triggers client disconnect)** | Requests dropped, user sees error | Implement per-request timeout budget; reject new requests if response cannot complete within SLA |
| **KV cache fragmentation (memory wasted by incomplete sequences)** | Max concurrent sequences drops 50% over time | Use paged KV cache (like virtual memory); reuse blocks across requests; periodic defragmentation |
| **Unbalanced multi-GPU load (one GPU at 100%, others at 40%)** | Worst GPU is bottleneck; others idle | Use load-aware request routing; distribute based on estimated tokens per response |
| **Quantization quality degradation (model perplexity +5%)** | User-facing output quality worse | Use mixed-precision: INT8 weights, FP8 activation, keep attention in FP16 |

---

## SUMMARY

Inference serving differs fundamentally from training:

1. **Latency SLA:** Target p99 TTFT <500ms, not max throughput.
2. **Continuous batching:** Dynamic batch size (1–64 sequences) achieves throughput of static large batches with latency of small batches.
3. **Scaling:** Memory-bandwidth bound (36 tokens/sec per H100 for decode); add GPUs for concurrency, not per-GPU speed.
4. **Multi-region:** Replicate clusters across regions for 99.9% SLA; cost-optimal at 2000+ QPS.

**In Chapter 9:** Multi-region deployment and failover mechanisms.
