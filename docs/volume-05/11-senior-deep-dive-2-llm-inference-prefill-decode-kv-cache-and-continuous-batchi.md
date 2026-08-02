---
title: "Chapter 11 — LLM inference: prefill, decode, KV cache and continuous batching"
slug: "senior-deep-dive-2-llm-inference-prefill-decode-kv-cache-and-continuous-batchi"
sidebar_position: 11
description: "Chapter 2 — LLM inference: prefill, decode, KV cache and continuous batching — AI Workloads and AI Platform Architecture."
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

## Build from the normal path


**Prefix caching → LLM-aware routing, made concrete (the paragraph's key sentence, unpacked):**
```mermaid
flowchart LR
    subgraph RR["Round-robin router"]
    direction LR
    A1["req1 (shares prefix with req0)"] --> A2["Sent to least-loaded worker"] --> A3["Prefix recomputed from scratch - full prefill cost paid again"]
    end
    subgraph KV["KV-cache-aware router"]
    direction LR
    B1["req1 (shares prefix with req0)"] --> B2["Sent to the worker that already holds req0's prefix KV cache"] --> B3["Only the NEW suffix needs prefill - TTFT drops sharply"]
    end
```
The tradeoff this introduces: KV-aware routing needs the router to track *which worker holds which prefix's cache*, and that map goes stale the instant a worker evicts cache under memory pressure or restarts — a routing decision based on stale cache-location state sends a request to a worker that has to recompute anyway, paying routing complexity cost without the latency win. This is precisely the "senior design question" the Deep Dive 4 text poses for Dynamo specifically, but it's true of any KV-aware router.

**Diagram: continuous batching — why it beats fixed/static batching**
```mermaid
flowchart LR
    subgraph Static["Static batching (wait for a fixed batch of 4, run together, all must finish)"]
    A["Batch: reqA, reqB, reqC, reqD"] --> B["Run together"] --> C["ALL 4 return together - even if reqA finished decoding early, its GPU slot sits idle until reqD ends"]
    end
```
```mermaid
flowchart TD
    S0["Step N: reqA, reqB, reqC, reqD"] --> S1["Step N+1: reqB, reqC, reqD, reqE - reqA finished & left, reqE admitted"]
    S1 --> S2["Step N+2: reqF, reqB, reqD, reqE - reqC finished, reqF admitted"]
```
Every step, the scheduler re-evaluates who's in the batch — no request holds a GPU slot idle waiting for the slowest peer, and new requests join without waiting for the whole batch to drain.
This is the mechanism behind "admitting and interleaving requests dynamically instead of waiting for fixed batches" — the GPU-utilization win comes from never leaving a slot idle just because one sequence in the batch finished before the others.
