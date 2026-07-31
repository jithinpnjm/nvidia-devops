---
title: "Chapter 6 - AI inference architecture questions"
slug: "chapter-6-ai-inference-architecture-questions"
sidebar_position: 6
description: "Chapter 6 - AI inference architecture questions — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Use workload metrics, serving mechanics and SLOs to justify GPU count, sharing and scaling.


<!-- source-table:2 -->

| Prompt | What interviewer wants to hear |
| --- | --- |
| Scale an LLM service | queue/concurrency/TTFT/TPOT/tokens + cold start + GPU granularity, not CPU-only HPA |
| MIG vs time slicing | workload fit, isolation, latency variance, hardware support, operational complexity |
| Triton/NIM/vLLM | benchmark target model/hardware; distinguish model server from gateway/platform |
| Low GPU utilization | could be low demand, input starvation, batching issue, CPU/network/storage bottleneck |


When asked for a number of GPUs, state that capacity is benchmark-derived. You can explain the formula: required throughput divided by measured per-replica throughput at SLO, rounded for replica/GPU granularity, then add availability/peak headroom.
