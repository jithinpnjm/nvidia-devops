---
title: "Volume 07 — GPU Networking and Data Paths"
slug: "/nvidia-zero-to-hero/volume-07/index"
sidebar_position: 1
description: "Master the data paths of the AI Factory. Trace data from the GPU silicon, across the motherboard, and out into the cluster network."
---

# Volume 07 — GPU Networking and Data Paths

## Introduction

In the first six volumes, we focused intensely on compute. We explored the physics of the GPU silicon, the CUDA execution stack, and the dense, liquid-cooled chassis that house them.

But a single GPU, no matter how powerful, is insufficient for modern Artificial Intelligence. Frontier models require tens of thousands of GPUs working in perfect, simultaneous harmony. 

**When a workload scales beyond a single server, the network becomes the computer.**

If you build a 10,000-GPU cluster, but the network introduces a 10-microsecond delay, 9,999 GPUs will halt their calculations and sit idle, waiting for data. You will have built the world's most expensive space heater.

In Volume 07, we explore the arteries of the AI Factory. We will trace the exact physical and software path a tensor takes to escape a GPU, cross a motherboard, and fly across a data center.

## What You Will Learn

1. **The PCIe and NUMA Bottlenecks:** Why plugging a GPU into the wrong PCIe slot on a motherboard will destroy 80% of your cluster's performance.
2. **NVLink and NVSwitch:** How NVIDIA created a proprietary, 900+ GB/s fabric to connect GPUs *inside* a server, entirely bypassing the PCIe bus.
3. **Kernel Bypass and RDMA:** Why standard TCP/IP networking (and the Linux Kernel) is physically incapable of handling AI traffic, and how Remote Direct Memory Access (RDMA) solves it.
4. **GPUDirect RDMA and Storage (GDS):** How network cards and storage arrays push data *directly* into the GPU's memory (HBM) without the host CPU ever knowing.
5. **Topology-Aware Placement:** How to configure Kubernetes to respect physical hardware boundaries, ensuring Pods are pinned to the correct CPU sockets.
6. **Multi-Node Collectives (NCCL):** How the NVIDIA Collective Communications Library dynamically routes traffic, and how **SHARP** allows the network switches to perform math on the fly.
7. **Production Troubleshooting:** How Senior SREs use `ib_write_bw` and `nccl-tests` to mathematically prove whether a bottleneck is a dirty fiber optic cable or a software misconfiguration.

## Why This Matters for Senior Architects

Junior engineers treat the network as an abstraction. They deploy a Kubernetes Pod and assume the CNI (Container Network Interface) will magically handle the routing. 

In AI infrastructure, abstraction is fatal. 

A Senior AI Infrastructure Architect must visualize the exact physical path of the electrons. You must know if data is crossing an Intel UPI link, if it is bouncing through a CPU memory buffer, or if it is flowing cleanly over a PCIe switch to a ConnectX-7 NIC. 

Volume 07 provides the strict architectural knowledge required to design, debug, and defend the highest-bandwidth, lowest-latency data center networks on earth.

## Chapter Progression

*   **Chapter 1:** Why GPU Networking Exists
*   **Chapter 2:** PCIe, NUMA, and Host Data Paths
*   **Chapter 3:** NVLink and NVSwitch
*   **Chapter 4:** DMA, RDMA, and Peer-to-Peer
*   **Chapter 5:** GPUDirect RDMA
*   **Chapter 6:** GPUDirect Storage
*   **Chapter 7:** ConnectX and GPU Network Adapters
*   **Chapter 8:** Topology-Aware Placement
*   **Chapter 9:** Multi-Node Collectives and NCCL Paths
*   **Chapter 10:** Performance Bottlenecks and Benchmarking
*   **Chapter 11:** Production Design Scenarios
*   **Chapter 12:** Volume 07 Summary
