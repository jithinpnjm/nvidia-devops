---
title: "Senior Deep Dive 2 — Topology: PCIe, NVLink, NVSwitch and NUMA"
slug: "senior-deep-dive-2-topology-pcie-nvlink-nvswitch-and-numa"
sidebar_position: 9
description: "Senior Deep Dive 2 — Topology: PCIe, NVLink, NVSwitch and NUMA — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
Topology is performance architecture. PCIe connects GPUs, NICs and CPUs through a tree of root complexes and switches. NVLink provides high-bandwidth GPU-to-GPU connectivity; NVSwitch creates a switched fabric across GPUs in supported systems. For multi-GPU communication, the fastest path depends on which devices are peers and how the topology is wired. A scheduler that knows only “8 GPUs free” can still make a poor placement if the workload requires tightly connected devices.

**Topology evidence on a GPU node**

nvidia-smi topo -m
nvidia-smi topo -p2p r
nvidia-smi nvlink --status
lspci -tv
numactl --hardware

NIC locality matters for distributed jobs. GPUDirect RDMA is most effective when GPU and high-speed NIC placement avoids unnecessary CPU/socket crossings. CPU feeder threads, pinned memory, interrupts and storage traffic also interact with NUMA locality. Think of the node as a topology graph, not a bag of identical GPUs.
