---
title: "Senior Deep Dive 2 — RDMA: InfiniBand versus RoCE"
slug: "senior-deep-dive-2-rdma-infiniband-versus-roce"
sidebar_position: 10
description: "Senior Deep Dive 2 — RDMA: InfiniBand versus RoCE — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
RDMA allows direct memory operations with low CPU overhead. InfiniBand provides an integrated RDMA fabric with its own link/network architecture. RoCE carries RDMA over Ethernet. RoCE therefore inherits Ethernet operational concerns and usually needs intentional congestion management, QoS and loss behavior. “The link is up” is not enough; validate MTU, queue configuration, ECN/PFC behavior where used, path symmetry and error/retry counters.

GPUDirect RDMA reduces unnecessary copies through host memory by enabling direct data movement between GPU memory and compatible NICs. It increases the importance of PCIe/NUMA topology and software compatibility. Think end-to-end: GPU -> PCIe/NVLink -> NIC -> fabric -> remote NIC -> remote GPU.
