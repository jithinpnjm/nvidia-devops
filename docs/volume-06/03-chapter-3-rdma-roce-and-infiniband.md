---
title: "Chapter 3 - RDMA, RoCE and InfiniBand"
slug: "chapter-3-rdma-roce-and-infiniband"
sidebar_position: 3
description: "Chapter 3 - RDMA, RoCE and InfiniBand — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Explain remote memory operations, queue pairs and why loss/congestion configuration matters.


![](pathname:///img/generated/volume-06-01.png)

Figure 1. GPUDirect RDMA can shorten the GPU-to-network data path on supported systems.

RDMA enables direct access to registered memory with reduced CPU-copy overhead. InfiniBand is a purpose-built fabric supporting RDMA. RoCE carries RDMA semantics over Ethernet. RoCE deployments require careful fabric design because packet loss/congestion characteristics affect transport behavior; modern designs may use ECN/congestion control and, in some environments, PFC depending on architecture.

Do not memorize “RoCE needs lossless Ethernet” as a sufficient design answer. Ask which RoCE generation/transport, congestion control, switch/NIC design, oversubscription and vendor reference architecture are in use.


<!-- source-table:2 -->

```text
rdma link
ibv_devinfo
ibstat
# Perftest tools such as ib_write_bw / ib_read_bw may be used in controlled labs.
```
