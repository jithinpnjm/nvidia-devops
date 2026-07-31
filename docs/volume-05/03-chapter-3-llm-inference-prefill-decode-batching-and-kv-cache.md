---
title: "Chapter 3 - LLM inference: prefill, decode, batching and KV cache"
slug: "chapter-3-llm-inference-prefill-decode-batching-and-kv-cache"
sidebar_position: 3
description: "Chapter 3 - LLM inference: prefill, decode, batching and KV cache — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Connect model-serving mechanics to memory, latency, throughput and scaling decisions.


Autoregressive inference has a prompt-processing phase (prefill) and iterative token generation (decode). Prefill can be compute-heavy; decode repeatedly accesses model/KV state and is sensitive to memory behavior. Continuous batching lets a server combine work from multiple requests. KV cache stores attention state for active sequences and can become a major memory consumer as concurrency/context grows.

![](pathname:///img/generated/volume-05-01.png)

Figure 1. The model server is one stage in a production request system with routing, state/caches, GPU and observability.


<!-- source-table:2 -->

| Metric | Interpretation |
| --- | --- |
| TTFT | how quickly the first token arrives; includes queue + prefill + overhead |
| TPOT / inter-token latency | decode responsiveness |
| tokens/s | throughput / capacity outcome |
| queue duration/depth | demand versus service capacity |
| concurrency | active requests and memory pressure |
| GPU memory | model + KV cache + runtime workspace headroom |


## Practitioner lens


<!-- source-table:3 -->

> Anshul Jindal: production inference spans mechanics and operations Public material for an NVIDIA GTC session links prefill/decode and KV-cache behavior to NIM/vLLM deployment, aggregated/disaggregated inference, API gateways, cost/token tracking and Prometheus/Grafana/Loki/Tempo. The useful lesson is that platform design starts with serving mechanics, then adds operational layers.


[Public source](https://de.linkedin.com/in/ansjin)
