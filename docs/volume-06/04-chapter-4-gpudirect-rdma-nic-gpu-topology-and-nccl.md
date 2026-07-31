---
title: "Chapter 4 - GPUDirect RDMA, NIC/GPU topology and NCCL"
slug: "chapter-4-gpudirect-rdma-nic-gpu-topology-and-nccl"
sidebar_position: 4
description: "Chapter 4 - GPUDirect RDMA, NIC/GPU topology and NCCL — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Connect GPU collectives to host topology and fabric evidence.


GPUDirect RDMA allows supported NICs to transfer data directly to/from GPU memory, reducing staging through host memory/CPU. The effective path depends on GPU/NIC PCIe topology and system configuration. NCCL implements GPU collective communication patterns and selects transports/topology based on environment.


<!-- source-table:2 -->

```text
nvidia-smi topo -m
env | grep -E '^NCCL_'
# NCCL debug is powerful but verbose; enable deliberately in a test/incident window.
export NCCL_DEBUG=INFO
```


## Worked scenario


<!-- source-table:3 -->

> Situation A 32-GPU distributed training job slows after one node replacement.


**1\. Compare the replacement node hardware, NIC/GPU topology, driver/firmware and link speed with peers.**

2\. Check RDMA link/counters and switch-side errors/drops/congestion for paths involving that node.

3\. Compare NCCL logs/collective benchmark performance node-by-node.

4\. Check CPU/NUMA affinity and PCIe link width/speed.

5\. Remove/replace the node in a controlled test to verify causal impact.


<!-- source-table:4 -->

> Conclusion A single topology/fabric outlier can slow synchronized distributed work.
