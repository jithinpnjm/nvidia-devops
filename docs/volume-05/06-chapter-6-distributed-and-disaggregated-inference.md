---
title: "Chapter 6 - Distributed and disaggregated inference"
slug: "chapter-6-distributed-and-disaggregated-inference"
sidebar_position: 6
description: "Chapter 6 - Distributed and disaggregated inference — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand when multi-GPU/multi-node inference is necessary and what new failure/performance dependencies appear.


Large models may require tensor/model parallelism across GPUs. Very high-throughput systems may distribute work across replicas and specialized stages. Disaggregated architectures can separate prefill and decode pools, which creates explicit network/state-routing requirements. The benefit must outweigh added scheduling, routing, network and failure complexity.

For multi-node inference, capacity planning becomes topology-aware. A replica is not simply N interchangeable GPUs; it may require a specific connected set and communication characteristics.
