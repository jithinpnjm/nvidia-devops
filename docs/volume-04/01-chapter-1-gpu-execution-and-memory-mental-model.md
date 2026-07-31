---
title: "Chapter 1 - GPU execution and memory mental model"
slug: "chapter-1-gpu-execution-and-memory-mental-model"
sidebar_position: 1
description: "Chapter 1 - GPU execution and memory mental model — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
**VOLUME 4**

**GPU and Accelerated Computing Foundations**

Hardware, memory paths, drivers, CUDA, operators, sharing and operational health


<!-- source-table:1 -->

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> Learning outcome Explain why GPUs favor throughput parallelism and how compute, HBM bandwidth and data movement become separate bottlenecks.


CPUs optimize low-latency general-purpose execution with sophisticated control flow and relatively few powerful cores. GPUs dedicate much more silicon to parallel execution and memory throughput. For infrastructure work, you do not need to write CUDA kernels to reason about the system, but you must distinguish compute occupancy from memory bandwidth, device memory capacity and host/device transfer costs.


<!-- source-table:3 -->

| Resource | Question |
| --- | --- |
| Compute/SMs | Are execution units busy doing useful kernels? |
| HBM capacity | Does the model/batch/KV cache fit? |
| HBM bandwidth | Is performance limited by moving data inside device memory? |
| PCIe/NVLink | Is inter-device/host-device transfer the bottleneck? |
| NIC/fabric | Are distributed collectives/network transfers limiting scale? |


## 1.1 Utilization is not a complete performance model

A GPU can report high utilization while throughput is poor because the active kernel is inefficient, memory-bound, serialized by communication, or serving tiny batches with poor economics. Conversely, an interactive low-latency service may intentionally keep headroom. Always pair device metrics with workload outcomes such as samples/s, tokens/s, TTFT, step time or queue delay.

**First host-level orientation**


<!-- source-table:4 -->

```text
nvidia-smi
nvidia-smi dmon -s pucvmet
nvidia-smi topo -m
```
