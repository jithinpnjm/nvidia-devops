---
title: "Chapter 1 - Distributed systems performance for GPU jobs"
slug: "chapter-1-distributed-systems-performance-for-gpu-jobs"
sidebar_position: 1
description: "Chapter 1 - Distributed systems performance for GPU jobs — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
**VOLUME 6**

**HPC, Networking and Storage for AI**

Distributed communication, RDMA fabrics, storage paths, Slurm and performance troubleshooting


<!-- source-table:1 -->

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> Learning outcome Build a scaling-efficiency model that separates compute, communication, synchronization and I/O.


A single GPU can run independently. Multiple GPUs introduce coordination. Within a node, peer links/topology matter; across nodes, the network fabric and collective library matter. Scaling efficiency falls when communication/synchronization consumes an increasing fraction of step time.


<!-- source-table:3 -->

```text
speedup = throughput_N / throughput_1
efficiency = speedup / N
# Example: 8 GPUs give 6.4x throughput -> 80% scaling efficiency
```


Do not treat efficiency loss as automatically “network.” Input pipelines, CPU preprocessing, imbalance and framework configuration can all create idle time. Profile the phase that grew with scale.
