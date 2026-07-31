---
title: "Chapter 6 - Storage for AI: datasets, checkpoints and model distribution"
slug: "chapter-6-storage-for-ai-datasets-checkpoints-and-model-distribution"
sidebar_position: 6
description: "Chapter 6 - Storage for AI: datasets, checkpoints and model distribution — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Design storage by access pattern, concurrency, locality and recovery behavior.


<!-- source-table:2 -->

| Pattern | Infrastructure concern |
| --- | --- |
| Millions of small files | metadata operations, directory traversal, client concurrency |
| Large sequential dataset shards | aggregate throughput and client parallelism |
| Frequent checkpoints | write bursts, durability, checkpoint time, restart path |
| Model startup | artifact size, cache locality, parallel pulls, cold-start SLO |
| Vector/RAG stores | query latency, index durability, update pattern |


Parallel filesystems and high-performance object/file layers are common in AI/HPC, but no product name removes the need to measure the workload. Cache/local NVMe can absorb hot artifacts or preprocessing, while durable shared storage provides persistence. Model startup can become a fleet-wide network/storage event during scale-out.

## Worked scenario


<!-- source-table:3 -->

> Situation GPU utilization oscillates: 100% for a few seconds, then near zero while training continues.


**1\. Compare GPU duty cycle with data-loader and storage metrics.**

2\. Measure step timeline: does the idle interval align with batch fetch/preprocessing?

3\. Check CPU worker saturation, page cache behavior and storage latency/throughput.

4\. Test larger prefetching/local cache or dataset sharding in a controlled run.

5\. Only after data supply is ruled out should you focus on GPU kernel inefficiency.


<!-- source-table:4 -->

> Conclusion Starved GPUs can be a storage/CPU input-pipeline problem.
