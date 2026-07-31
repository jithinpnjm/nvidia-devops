---
title: "Senior Deep Dive 4 — NVIDIA Dynamo: system-level inference optimization"
slug: "senior-deep-dive-4-nvidia-dynamo-system-level-inference-optimization"
sidebar_position: 13
description: "Senior Deep Dive 4 — NVIDIA Dynamo: system-level inference optimization — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
![](pathname:///img/generated/volume-05-03.png)

_Figure B. Disaggregated serving separates resource shapes and turns KV transfer into a first-class data path._

NVIDIA Dynamo became GA in 2026 as a distributed inference platform. It adds system-level capabilities around inference engines: request routing, KV cache management, disaggregated serving, data transfer, scaling and Kubernetes-native deployment. The key mental model is that the engine optimizes execution on GPUs while Dynamo coordinates the distributed system around those engines.

Disaggregated serving separates prefill and decode worker pools. This helps when their resource shapes diverge—long prompts make prefill expensive, while high concurrency and long outputs stress decode and KV memory. It is not automatically faster: KV transfer becomes a critical path. On-node NVLink can make transfer cheap; cross-node designs require high-performance data movement, often RDMA, and careful placement.

Dynamo also introduces KV-aware routing: route requests where useful cache already exists while balancing load. The senior design question is when cache locality improves TTFT enough to justify additional routing/state complexity, and how failures or worker turnover invalidate that state.
