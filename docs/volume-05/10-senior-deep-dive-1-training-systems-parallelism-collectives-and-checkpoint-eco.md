---
title: "Senior Deep Dive 1 — Training systems: parallelism, collectives and checkpoint economics"
slug: "senior-deep-dive-1-training-systems-parallelism-collectives-and-checkpoint-eco"
sidebar_position: 10
description: "Senior Deep Dive 1 — Training systems: parallelism, collectives and checkpoint economics — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
Distributed training is a pipeline of compute, communication and data movement. Data parallelism replicates the model and exchanges gradients; tensor parallelism splits tensor operations across devices; pipeline parallelism splits layers/stages; expert parallelism distributes mixture-of-experts experts. These choices change the required GPU topology, collective patterns, memory pressure and sensitivity to stragglers.

Checkpointing is reliability architecture. Decide checkpoint size, frequency, synchronous versus asynchronous write behavior, target storage and restore time objective. A checkpoint every five minutes is not useful if it stalls training for two minutes. Measure application throughput and storage behavior together.
