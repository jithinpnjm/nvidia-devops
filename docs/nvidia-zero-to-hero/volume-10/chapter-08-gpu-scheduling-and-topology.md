---
title: "Chapter 8 — GPU Scheduling and Topology"
sidebar_position: 8
description: "Master the intersection of Kubernetes and hardware physics. Learn why NVLink topology matters and how NUMA alignment affects performance."
---

# Chapter 8 — GPU Scheduling and Topology

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Kubernetes Schedulers, Performance Engineers |
| Core question | If a node has 8 GPUs, and your pod requests 4 GPUs, how do you guarantee Kubernetes doesn't pick 4 GPUs that are physically isolated from each other? |

## Introduction

As discussed in Volume 7, the physical wires on a motherboard matter. 
If GPU 0 needs to talk to GPU 1, and they are connected by a 900 GB/s NVLink bridge, the communication is instant. If they are not bridged, the data must travel over the slow PCIe bus, and performance collapses.

Native Kubernetes is completely topology-blind. 
If a Pod requests 4 GPUs, the kubelet will grab the first 4 available GPUs it finds (e.g., GPU 0, 3, 5, and 7). If those specific GPUs are not connected via NVLink, the training job will run at a fraction of its potential speed.

A Senior Architect must bridge the gap between Kubernetes scheduling and hardware physics using **Topology Management**.

## 1. The NUMA Penalty

A modern AI server usually has two CPUs (NUMA nodes). 
*   GPUs 0-3 are wired to CPU 0 (NUMA 0).
*   GPUs 4-7 are wired to CPU 1 (NUMA 1).

If Kubernetes assigns a Pod to CPU 0, but allocates GPUs 4, 5, 6, and 7, the data must constantly cross the slow UPI link between the two CPUs. This introduces massive latency. 

We must align the resources. The Pod's CPU cores, Memory, GPUs, and Network Interface Cards (NICs) must all physically reside on the exact same NUMA node.

## 2. Kubernetes Topology Manager

To solve the NUMA problem, Kubernetes introduced the **Topology Manager**. It is a component within the kubelet.

You must configure the kubelet with a specific topology policy (e.g., via kubelet flags or a kubelet config file).
*   `none` (Default): Topology-blind. Terrible for AI.
*   `best-effort`: Tries to align resources, but allows the Pod to start even if it fails.
*   `restricted`: Will reject the Pod (TopologyAffinityError) if it cannot align the resources perfectly.
*   `single-numa-node`: The strictest policy. Demands that all CPU, Memory, GPUs, and NICs fit entirely within a single physical NUMA node.

For high-performance AI, `single-numa-node` or `restricted` is mandatory.

## 3. NVLink and NVML Topology

NUMA alignment solves the CPU-to-GPU problem. But what about GPU-to-GPU connections (NVLink)?

In an 8-GPU DGX/HGX system, all 8 GPUs are connected via NVSwitches in a full mesh. Topology doesn't matter much because every GPU can talk to every other GPU at 900 GB/s. 

However, in cheaper servers using PCIe GPUs and physical NVLink Bridge clips, usually only pairs of GPUs are connected (e.g., GPU 0 is linked to GPU 1). 
If a Pod requests 2 GPUs, it *must* receive GPU 0 and GPU 1. If it receives GPU 0 and GPU 2, the NVLink bridge is useless.

The NVIDIA Device Plugin handles this intelligently. It reads the NVLink topology via NVML. When the kubelet asks for 2 GPUs, the Device Plugin will mathematically select a pair that shares an NVLink bridge, ensuring optimal allocation.

## Customer Scenario (Senior Level)

**The Situation:**
A research team deploys a massive language model for inference across a cluster of dual-CPU servers containing 8x L40S PCIe GPUs each. They configure the Pods to request 4 CPU cores and 1 GPU each. The application team complains that the inference latency is wildly inconsistent. Sometimes a request takes 50ms, sometimes it takes 200ms, even under identical load.

**The Senior Architect Response:**
"The hardware is identical, but the physical data paths are not. You are experiencing inconsistent **Cross-NUMA Latency Penalties**. 

Because the default Kubernetes Topology Manager policy is `none`, the kubelet is randomly assigning hardware. 
For Request A, the kubelet might have assigned a CPU core on NUMA 0 and a GPU physically wired to NUMA 0. The data path is short and fast (50ms). 
For Request B, the kubelet might have assigned a CPU core on NUMA 0, but a GPU physically wired to NUMA 1. The data must cross the Intel UPI link on the motherboard, hitting a massive bandwidth bottleneck and increasing latency (200ms).

To guarantee deterministic, low latency, we must align the hardware. 
We must reconfigure the kubelet on all GPU nodes to use `--topology-manager-policy=restricted`. This will force the kubelet to negotiate with the CPU manager and the NVIDIA Device Plugin to ensure that the assigned CPU cores and the assigned GPU physically reside on the exact same NUMA node before allowing the Pod to start."

## Interview Preparation

**Conceptual:** What is a NUMA node, and why does Kubernetes need to care about it for GPU workloads? *(Hint: A NUMA node is a physical CPU and its directly attached memory and PCIe slots. If a Pod's assigned CPU is on NUMA 0, but its assigned GPU is on NUMA 1, data must cross the slow interconnect between the CPUs, killing performance. Kubernetes must align these resources physically).*

**Architecture:** How do you prevent Kubernetes from ignoring hardware topology and randomly assigning misaligned CPUs and GPUs? *(Hint: You must configure the kubelet's Topology Manager policy to a strict setting like `restricted` or `single-numa-node`. This forces the kubelet to align all resources to the same physical hardware boundaries before starting the container).*
