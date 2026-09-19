---
title: "Chapter 1 — Why GPU Sharing Exists"
sidebar_position: 1
description: "Understand the financial and operational drivers behind GPU sharing. Learn why dedicating full GPUs to every workload is economically impossible."
---

# Chapter 1 — Why GPU Sharing Exists

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Intermediate |
| Estimated reading time | 25 minutes |
| Primary audience | Platform Engineers, FinOps, SREs |
| Core question | If an H100 GPU costs tens of thousands of dollars, why do we let data scientists leave them sitting idle at 5% utilization? |

## Introduction

In the previous volumes, we designed architectures for massive Distributed Data Parallel (DDP) training. In those scenarios, a single job consumes hundreds of GPUs, demanding 100% utilization and maximum NVLink bandwidth. 

However, enterprise AI is not just training massive foundational models. 

Enterprise AI includes data scientists running Jupyter notebooks that compute for 5 seconds and then sit idle while the user types. It includes inference microservices that process a burst of API requests and then sleep. It includes QA environments that only run test suites once a day.

If you dedicate a full, physical 80GB GPU to every single Jupyter notebook or small inference pod, your cluster utilization will plummet into the single digits, and your cloud bill will destroy your budget. 

To achieve a viable Return on Investment (ROI), a Senior Architect must implement **GPU Sharing**.

## 1. The Physics of Wasted Silicon

A modern GPU (like an A100 or H100) has two primary resources:
1.  **Compute Cores:** (Streaming Multiprocessors, Tensor Cores).
2.  **Memory:** (VRAM, e.g., 40GB or 80GB of HBM).

**The VRAM Bottleneck:**
If a developer loads a tiny 2-billion parameter model into a Jupyter notebook, it might only consume 4GB of VRAM. The remaining 76GB of VRAM sits perfectly empty. 

However, because native Kubernetes allocates resources exclusively (it assigns the entire `/dev/nvidia0` device to the container), no other pod on the cluster can use that remaining 76GB. The compute cores will sit at 0% utilization while the developer reads documentation, but the GPU is "Allocated." 

This is the classic **Allocation vs. Utilization** trap we discussed in Volume 10. 

## 2. The Three Paradigms of GPU Sharing

To solve this, NVIDIA provides three distinct technologies for sharing a single physical GPU across multiple workloads. You must memorize these and their specific use cases:

1.  **Time-Slicing (Software Sharing):** The simplest method. Multiple containers share the same physical GPU and memory space concurrently. The driver uses context-switching (time-slicing) to quickly swap between workloads. It offers no hardware isolation and no memory protection.
2.  **Multi-Instance GPU (MIG):** The hardware solution. The GPU silicon is physically partitioned into up to 7 isolated instances. MIG guarantees strict isolation of VRAM, cache, and compute bandwidth. If MIG A crashes, MIG B is completely unaffected.
3.  **vGPU (Enterprise Virtualization):** The hypervisor solution. Primarily used in VMware/KVM environments for Virtual Desktop Infrastructure (VDI) or heavy enterprise multi-tenancy, dividing the GPU at the VM level rather than the container level.

## Customer Scenario (Senior Level)

**The Situation:**
A CFO is threatening to halt all AI projects. The company bought 8x H100 GPUs (over $250,000 in hardware) for an internal R&D team. The R&D team consists of 20 data scientists. When the data scientists submit their Jupyter notebook pods to the Kubernetes cluster, 8 users get a pod (consuming all 8 GPUs), and the other 12 users are stuck in `Pending` state for hours, unable to work. The CFO looks at the Datadog dashboards and sees the 8 running GPUs are only averaging 6% utilization. 

**The Senior Architect Response:**
"The hardware is not bottlenecked; our resource allocation strategy is fundamentally broken.

Native Kubernetes is treating a massively parallel supercomputer (an H100) like a single, indivisible object. We are assigning an 80GB, 700-Watt processor to a single human typing Python code. 

To rescue the ROI of this cluster immediately, we will implement **GPU Time-Slicing** via the NVIDIA GPU Operator. 

We will configure the Kubernetes Device Plugin to mathematically oversubscribe the hardware. We will tell Kubernetes that every physical H100 actually represents '4 virtual GPUs'. 
This instantly increases our cluster capacity from 8 allocatable GPUs to 32 allocatable GPUs. All 20 data scientists will be able to launch their Jupyter notebooks simultaneously. 

Because human-driven R&D workloads are highly bursty and rarely overlap exactly in time, the underlying NVIDIA driver will seamlessly time-slice the CUDA context switching. The data scientists will not notice a performance drop, the 12 blocked users will get to work, and the physical utilization of the silicon will rise from 6% to a much healthier 40-50%."

## Interview Preparation

**Conceptual:** Why is dedicating a full GPU to an inference microservice often a massive waste of money? *(Hint: Many inference models are small. They might only require 2GB of VRAM and a fraction of the Tensor Cores to process requests. If you dedicate a full 80GB GPU to it, the remaining 78GB of VRAM is permanently locked and wasted because native Kubernetes uses exclusive allocation).*

**Architecture:** Name the three primary methods for sharing an NVIDIA GPU, in order from least isolated to most isolated. *(Hint: 1. Time-Slicing (software context switching, zero isolation). 2. MIG (hardware-level partition isolation for compute and memory). 3. vGPU (hypervisor-level virtualization for full VM isolation)).*
