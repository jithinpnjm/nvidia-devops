---
title: "Chapter 3 - LLM inference: prefill, decode, batching and KV cache"
slug: "chapter-3-llm-inference-prefill-decode-batching-and-kv-cache"
sidebar_position: 3
description: "Chapter 3 - LLM inference: prefill, decode, batching and KV cache — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
**Learning outcome:** Connect model-serving mechanics to memory, latency, throughput and scaling decisions.

Autoregressive inference has a prompt-processing phase (prefill) and iterative token generation (decode). Prefill can be compute-heavy; decode repeatedly accesses model/KV state and is sensitive to memory behavior. Continuous batching lets a server combine work from multiple requests. KV cache stores attention state for active sequences and can become a major memory consumer as concurrency/context grows.

![](pathname:///img/generated/volume-05-01.png)

Figure 1. The model server is one stage in a production request system with routing, state/caches, GPU and observability.

| Metric | Interpretation |
|---|---|
| TTFT | how quickly the first token arrives; includes queue + prefill + overhead |
| TPOT / inter-token latency | decode responsiveness |
| tokens/s | throughput / capacity outcome |
| queue duration/depth | demand versus service capacity |
| concurrency | active requests and memory pressure |
| GPU memory | model + KV cache + runtime workspace headroom |

## Practitioner lens
**Anshul Jindal: production inference spans mechanics and operations**
Public material for an NVIDIA GTC session links prefill/decode and KV-cache behavior to NIM/vLLM deployment, aggregated/disaggregated inference, API gateways, cost/token tracking and Prometheus/Grafana/Loki/Tempo. The useful lesson is that platform design starts with serving mechanics, then adds operational layers.

[Public source](https://de.linkedin.com/in/ansjin)

➕ **The prefill/decode timeline, made visible (the single diagram worth memorizing for this whole volume):**
```
Request timeline for one LLM request, single sequence:

t=0        queue wait         prefill (parallel over        decode (sequential, one
           (server busy       all prompt tokens at once)     token per step, autoregressive)
           with other reqs)
|---queue---|======prefill======|--tok1--|--tok2--|--tok3--|--tok4--|...→ stream to client
            ↑                   ↑        ↑        ↑        ↑
            TTFT starts here    KV cache  each step reads   each gap here
            (client sees        populated ALL prior KV      is one TPOT/
            nothing yet)        for whole  + weights from    ITL sample
                                 prompt     GPU memory
            |←────────────── TTFT ──────────────→|
                                         |←ITL→|←ITL→|←ITL→|
```
Prefill is compute-bound and embarrassingly parallel across prompt tokens (matrix-multiply heavy, scales with prompt length² in attention cost) — it looks like a training forward pass. Decode is one token at a time, memory-bandwidth-bound (every step re-reads the full KV cache and all weights to produce a single new token), and does not get faster by adding more compute — this is exactly why prefill and decode want different hardware/pool shapes, the motivation behind Chapter 6's disaggregation and Senior Deep Dive 4's Dynamo material.

➕ **KV cache growth — the memory-pressure mechanism the metrics table only names abstractly:**
```
KV cache size ≈ 2 × num_layers × num_kv_heads × head_dim × seq_len × batch × bytes_per_element

Example: Llama-3-70B-class model, 80 layers, 8 KV heads (GQA), head_dim=128, fp16 (2 bytes)
Per-token, per-sequence KV cache = 2 × 80 × 8 × 128 × 2 bytes = 327,680 bytes ≈ 320 KB/token

  seq_len=2K,  batch=1  →   ~640 MB   (comfortable)
  seq_len=32K, batch=1  →  ~10.2 GB   (one long-context sequence alone)
  seq_len=32K, batch=8  →  ~82 GB     (exceeds a single 80GB GPU before weights are even loaded)
```
This is the concrete arithmetic behind "KV cache can become a major memory consumer as concurrency/context grows" — the growth is *linear in both sequence length and batch size simultaneously*, which is why long-context + high-concurrency is the specific combination that causes OOM, not either factor alone.

➕ **Sample vLLM/NIM metrics endpoint output during a load test, annotated:**
```
$ curl -s http://localhost:8000/metrics | grep -E "vllm:(num_requests|gpu_cache|time_to_first|time_per_output)"

vllm:num_requests_running{model="llama3-70b"} 12          ← currently in decode/prefill on GPU
vllm:num_requests_waiting{model="llama3-70b"} 47           ← queued — demand exceeding admitted concurrency
vllm:gpu_cache_usage_perc{model="llama3-70b"} 0.94         ← KV cache pool 94% full — near admission limit
vllm:time_to_first_token_seconds_sum{model="llama3-70b"} 812.4
vllm:time_to_first_token_seconds_count{model="llama3-70b"} 620
                                                            ← mean TTFT = 812.4/620 ≈ 1.31s — check this
                                                              against p95/p99 histogram buckets, never just the mean
vllm:time_per_output_token_seconds_sum{model="llama3-70b"} 45.9
vllm:time_per_output_token_seconds_count{model="llama3-70b"} 58000
                                                            ← mean TPOT ≈ 0.79ms/token → ~1265 tok/s per sequence
```
`gpu_cache_usage_perc` at 94% with 47 requests waiting is the tell: the server isn't CPU- or GPU-compute-starved, it's KV-cache-capacity-starved — new requests can't be admitted into a running batch because there's no cache room, so they queue, and queue time is exactly what inflates TTFT even though decode itself is fast. This is the metric that answers "why is TTFT bad when GPU utilization looks fine."

➕ **Extra worked scenario — long-context KV OOM in production:**
> **Situation:** A chatbot service that historically handled 2K-token conversations starts supporting a new "upload a document and ask questions" feature with prompts up to 30K tokens. Within a day, the service starts throwing CUDA OOM errors under normal traffic that previously had headroom.
> 1. Compute KV cache footprint at the new max sequence length using the arithmetic above — for a 15x longer average prompt, KV cache per sequence grows ~15x, not linearly with "one more feature."
> 2. Check `gpu_cache_usage_perc` and `num_requests_waiting` before and after the feature launch — a jump in waiting requests with cache usage pinned near 100% confirms cache exhaustion, not a code regression.
> 3. Fix directions with explicit tradeoffs: reduce max concurrent sequences to leave more cache per sequence (lowers throughput), enable prefix caching if documents are reused across questions (saves recompute + cache, but adds routing complexity per Senior Deep Dive 2), or move long-context requests to a separate pool sized specifically for large KV footprints (isolates the blast radius from the short-prompt chat traffic).
> **Conclusion:** A feature that only changes prompt length, with no code change to the serving path, can still cause OOM — because KV cache is workload-shape-dependent memory, not a fixed per-replica cost.

➕ **Shortcut/mnemonic:** *"Prefill is compute, decode is bandwidth, KV cache is the rent you pay per token per sequence for as long as it's alive."* If asked to name the single number that predicts KV OOM risk fastest: `gpu_cache_usage_perc` trending toward 100% while `num_requests_waiting` climbs — that pair, not raw GPU utilization.

➕ **Interview-ready line:** *"TTFT and TPOT decompose into different bottlenecks — TTFT is queue-plus-prefill, mostly compute and admission-control bound; TPOT is decode, mostly memory-bandwidth and KV-cache-capacity bound — so I diagnose them with different signals, not one 'latency is bad' investigation."*

➕ **Chapter drill questions (chapter-specific, additive):**
1. A service reports P50 TTFT of 200ms but P99 TTFT of 4 seconds, with GPU compute utilization steady at 60%. Using only the metrics table and the vLLM metrics sample above, name the two most likely explanations and the one metric that discriminates between them.
2. Using the KV cache formula, compute the maximum concurrent 8K-token sequences a single 80GB GPU can hold if the model weights consume 40GB and per-token KV cost is 320KB — state your headroom assumption for runtime workspace.
