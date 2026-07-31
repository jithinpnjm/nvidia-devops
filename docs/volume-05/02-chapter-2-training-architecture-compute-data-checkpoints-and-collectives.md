---
title: "Chapter 2 - Training architecture: compute, data, checkpoints and collectives"
slug: "chapter-2-training-architecture-compute-data-checkpoints-and-collectives"
sidebar_position: 2
description: "Chapter 2 - Training architecture: compute, data, checkpoints and collectives — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand why distributed training depends on GPU topology, fabric, storage and scheduler behavior.


Training repeatedly loads batches, performs forward/backward computation, exchanges data across devices when distributed, and periodically writes checkpoints. The critical path can shift across phases. GPU utilization drops if data preprocessing starves the device; scaling efficiency drops if collective communication grows faster than useful compute.

## 2.1 Parallelism vocabulary for infrastructure


<!-- source-table:2 -->

| Pattern | Infrastructure implication |
| --- | --- |
| Data parallel | replicas process different data; gradient synchronization creates collective traffic |
| Tensor/model parallel | single model split across GPUs; latency/bandwidth sensitivity to interconnect |
| Pipeline parallel | layers/stages distributed; pipeline bubbles and stage balance matter |
| Checkpointing | large writes + durability/restart time; storage path affects recovery |


## Worked scenario


<!-- source-table:3 -->

> Situation A training job scales from 8 to 32 GPUs but throughput only doubles.


**1\. Calculate scaling efficiency rather than celebrating total throughput alone.**

2\. Compare GPU step time and collective/communication time at 8 versus 32 GPUs.

3\. Check topology/fabric and placement: are workers crossing slower links or nodes unexpectedly?

4\. Check data-loader/storage throughput; more GPUs may amplify input demand.

5\. Check batch/global-batch changes and framework configuration before blaming hardware.


<!-- source-table:4 -->

> Conclusion Distributed scaling is an efficiency curve; adding GPUs increases both compute capacity and coordination cost.
