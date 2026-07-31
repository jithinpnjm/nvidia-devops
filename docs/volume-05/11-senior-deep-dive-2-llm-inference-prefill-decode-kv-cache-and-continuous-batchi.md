---
title: "Senior Deep Dive 2 — LLM inference: prefill, decode, KV cache and continuous batching"
slug: "senior-deep-dive-2-llm-inference-prefill-decode-kv-cache-and-continuous-batchi"
sidebar_position: 11
description: "Senior Deep Dive 2 — LLM inference: prefill, decode, KV cache and continuous batching — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
Prefill processes the input prompt and creates KV cache state; decode generates output tokens iteratively using that state. Prefill tends to reward compute throughput and grows with input length. Decode repeatedly reads weights and KV state and is often sensitive to memory bandwidth, KV capacity and concurrency. Continuous batching improves GPU utilization by admitting and interleaving requests dynamically instead of waiting for fixed batches.

KV cache is operational state. Longer context, higher concurrency and more layers increase memory consumption. Prefix caching can avoid recomputing shared prompt prefixes, but it changes routing: a worker that already owns relevant cache may be a better destination than the least-loaded worker. This is one reason LLM-aware routing is different from round-robin HTTP load balancing.


<!-- source-table:1 -->

| Metric | What it captures | Primary pressure |
| --- | --- | --- |
| TTFT | request arrival -> first output token | queue + prefill + network |
| ITL / TPOT | spacing/time per output token | decode scheduling + memory bandwidth |
| End-to-end latency | complete request duration | queue + prefill + decode length |
| Tokens/s | throughput | batching, parallelism, utilization |
| Concurrent users | capacity at SLO | memory/KV + latency budget |
