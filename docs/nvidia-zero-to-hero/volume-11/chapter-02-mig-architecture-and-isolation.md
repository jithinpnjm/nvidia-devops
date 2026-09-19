---
title: "Chapter 2 — MIG Architecture and Isolation"
sidebar_position: 2
description: "Master Multi-Instance GPU (MIG). Understand how hardware-level partitioning guarantees Quality of Service (QoS) and fault isolation for AI workloads."
---

# Chapter 2 — MIG Architecture and Isolation

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Platform Engineers, Cloud Architects |
| Core question | If two competing inference models share a single GPU, how do you mathematically guarantee that a spike in traffic to Model A will not slow down Model B? |

## Introduction

Time-slicing (discussed conceptually in Chapter 1) is great for development, but it is toxic for production inference. 

If you time-slice a GPU, the workloads share the same memory bandwidth, the same L2 cache, and the same compute cores. If Workload A (a massive batch processing job) suddenly saturates the memory bandwidth, Workload B (a low-latency API) will suffer massive latency spikes (the "Noisy Neighbor" problem). Furthermore, if Workload A causes a fatal CUDA memory error, it can crash the entire physical GPU, taking Workload B down with it.

For production, you need absolute, guaranteed **Quality of Service (QoS)** and strict **Fault Isolation**. 

This requires **Multi-Instance GPU (MIG)**.

## 1. The Physical Reality of MIG

MIG is not software virtualization. MIG is a hardware feature baked into the silicon of Hopper (H100) and Ampere (A100) architectures. 

When you enable MIG, you physically instruct the silicon to partition itself. 
You divide the VRAM, the L2 cache, the memory controllers, and the Streaming Multiprocessors (SMs) into physically distinct slices called **GPU Instances**.

**The Maximums:**
*   An A100 or H100 can be partitioned into a maximum of **7 MIG instances**. 
*   To the host operating system and to Kubernetes, these 7 instances appear as 7 completely independent, physically separate PCIe devices. 
*   Instance 1 cannot see Instance 2's memory. Instance 1 cannot access Instance 2's L2 cache.

## 2. Fault Isolation (The Blast Radius)

Because MIG is enforced at the hardware level, the fault domains are completely separated. 

If a data scientist writes terrible C++ code and causes a catastrophic memory leak that hard-crashes MIG Instance 1, generating an XID error... MIG Instances 2 through 7 do not care. They continue processing inference traffic at full speed without a single dropped frame. 

The NVIDIA Device Plugin detects the XID error, marks *only* MIG Instance 1 as Unhealthy, and Kubernetes evicts the broken pod while leaving the other 6 production workloads completely untouched. 

## 3. Predictable Performance (QoS)

Because the memory controllers and L2 cache are physically partitioned, the "Noisy Neighbor" problem is eliminated. 

If MIG Instance 1 is running a massive data processing loop at 100% utilization, its memory bandwidth is physically capped by the silicon boundaries of that specific MIG slice. It physically cannot steal bandwidth from MIG Instance 2. 

Therefore, if you deploy a latency-sensitive LLM serving pod onto MIG Instance 2, you can mathematically guarantee its P99 latency SLA, regardless of what any other tenant on that physical server is doing. 

## Customer Scenario (Senior Level)

**The Situation:**
A retail company is deploying an AI system to their warehouse edge servers. The server has a single H100 GPU. They need to run three models simultaneously: 
1. A real-time video analytics model for forklift safety (Requires strict under 50ms latency, 10GB VRAM).
2. A batch barcode scanning model (High throughput, 20GB VRAM).
3. A predictive maintenance model (Low priority, runs nightly).
The engineering team used Time-Slicing to fit all three on the GPU. Now, when the nightly batch job runs, the forklift safety cameras stutter and miss frames, violating OSHA safety requirements. 

**The Senior Architect Response:**
"By using software Time-Slicing for a latency-critical safety application, you have violated the foundational rule of QoS. Time-slicing allows the massive batch job to flood the L2 cache and saturate the memory bandwidth, starving the video analytics model of the data it needs to meet its 50ms deadline. 

We must immediately reconfigure this H100 to use **Multi-Instance GPU (MIG)**. 

We will wipe the Time-Slicing configuration and partition the silicon at the hardware level. We will carve out a dedicated MIG slice (e.g., a `1g.10gb` profile) exclusively for the forklift safety model. We will carve out a larger slice (e.g., `2g.20gb`) for the barcode scanner, and use the remainder for the nightly job. 

By enforcing MIG, the forklift safety model receives a physically dedicated portion of the L2 cache and SMs. It is mathematically impossible for the nightly batch job to steal its bandwidth. The camera latency will remain locked below 50ms, restoring compliance with safety regulations."

## Interview Preparation

**Conceptual:** What is the fundamental difference between Time-Slicing and MIG? *(Hint: Time-slicing is a software mechanism where workloads share the entire GPU concurrently; it offers no isolation against noisy neighbors or crashes. MIG is a hardware mechanism that physically partitions the silicon's cache, memory, and compute cores, guaranteeing strict QoS and fault isolation between instances).*

**Architecture:** Why is MIG highly recommended for Multi-Tenant Cloud environments, but rarely used for Distributed Training? *(Hint: In a multi-tenant cloud, you don't trust the users; you need MIG to prevent User A from crashing User B or reading their memory. In Distributed Training, a single massive job needs the entire GPU and maximum NVLink bandwidth. MIG physically partitions the GPU and disables NVLink between the slices, making it useless for large training runs).*
