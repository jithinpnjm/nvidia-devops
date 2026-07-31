---
title: "Senior Deep Dive 6 — Host readiness for NVIDIA GPU nodes"
slug: "senior-deep-dive-6-host-readiness-for-nvidia-gpu-nodes"
sidebar_position: 12
description: "Senior Deep Dive 6 — Host readiness for NVIDIA GPU nodes — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
GPU nodes add a second dependency graph to the host: kernel version and modules, NVIDIA driver, device nodes, IOMMU/PCIe topology, container runtime integration, CUDA user-space compatibility, NIC/RDMA stack, firmware, time synchronization, storage mounts and Kubernetes operands. A node can be Ready in Kubernetes while being unusable for accelerated workloads.


<!-- source-table:1 -->

| Layer | Evidence | Common failure |
| --- | --- | --- |
| PCIe / device discovery | lspci -nn, nvidia-smi topo -m | device missing, link width/speed, bad topology |
| Driver | nvidia-smi, dmesg, lsmod | module mismatch, Xid, failed persistence/reset |
| Container runtime | nvidia-ctk, CDI specs, containerd config | GPU visible on host but not in container |
| RDMA | ibv_devinfo, rdma link, ethtool | wrong NIC/NUMA, MTU/QoS, driver mismatch |
| Kubernetes | node labels, device resources, operator pods | plugin/operator unhealthy, stale labels |
