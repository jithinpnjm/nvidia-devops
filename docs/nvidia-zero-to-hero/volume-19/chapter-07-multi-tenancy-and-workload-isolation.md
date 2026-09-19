---
title: "Chapter 7 — Multi-Tenancy and Workload Isolation"
sidebar_position: 7
description: "Secure the shared cluster. Learn how to enforce strict hardware, network, and data boundaries between competing AI teams."
---

# Chapter 7 — Multi-Tenancy and Workload Isolation

| Chapter metadata | Value |
|---|---|
| Volume | 19 — AI SRE and Operations |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | Platform Engineers, Security Architects |
| Core question | If the Marketing team and the Finance team are running models on the exact same physical server, how do you prevent Marketing from accidentally crashing Finance's API? |

## Introduction

As clusters grow, they inevitably become Multi-Tenant. 

You cannot afford to build a dedicated 100-GPU cluster for every department in a company. You must build a single 1,000-GPU cluster and force the departments to share. 

However, multi-tenancy introduces severe **Noisy Neighbor** and **Security Isolation** risks. If the Marketing team runs a massive, unoptimized batch job, they could saturate the shared parallel file system, causing the Finance team's latency-sensitive API to crash due to I/O starvation.

A Senior Architect must design rigid, impenetrable boundaries at three distinct layers: Compute, Network, and Storage.

## 1. Compute Isolation (MIG and Taints)

As discussed extensively in Volume 11, software Time-Slicing provides zero hardware isolation. 

*   **The MIG Mandate:** If two different trust domains (departments) must share a single physical GPU, you must use Multi-Instance GPU (MIG). MIG physically partitions the VRAM and the L2 cache at the hardware level, preventing the Marketing team's job from stealing memory bandwidth from the Finance team's API.
*   **Node Taints and Tolerations:** If you have strict compliance requirements (e.g., PCI/HIPAA data), you cannot share GPUs. You must use Kubernetes Taints to dedicate specific physical nodes exclusively to the secure department. 

## 2. Network Isolation (Micro-Segmentation)

In a default Kubernetes cluster, the Marketing pods can ping the Finance pods. 

*   **NetworkPolicies (Default Deny):** You must implement a CNI (like Calico or Cilium) and enforce a Default Deny policy on every namespace. The Finance pods should only be allowed to accept traffic from the specific internal API Gateway, and should be explicitly blocked from communicating with the Marketing namespace.
*   **SR-IOV for RDMA:** If the cluster uses InfiniBand/RoCE, standard Kubernetes NetworkPolicies cannot see or block the traffic, because RDMA bypasses the Linux kernel. You must use SR-IOV (Single Root I/O Virtualization) on the ConnectX NICs to slice the physical network card into isolated Virtual Functions (VFs) mapped to specific pods, enforcing hardware-level network isolation.

## 3. Storage Isolation (QoS and Namespaces)

This is the most frequently missed boundary. 

If both departments use the same Weka or Lustre storage array, the Marketing team can execute a massive checkpoint operation, consuming 100% of the storage IOPS and starving the Finance team.

*   **Storage QoS (Quality of Service):** You must configure the parallel file system to enforce hard IOPS and Bandwidth limits per tenant directory. The Finance directory must be guaranteed a minimum reserve of IOPS to ensure their API never stalls.
*   **Chroot / Namespace Isolation:** Pods must never be allowed to mount the root of the parallel file system. They must only mount their specific tenant subdirectory to prevent unauthorized data access.

## Customer Scenario (Senior Level)

**The Situation:**
A university builds a centralized HPC Kubernetes cluster for AI research. The cluster is shared among 500 students and 5 strict research labs. The IT team uses Kubernetes Namespaces and ResourceQuotas to manage access. A student writes a poorly optimized PyTorch script that enters an infinite loop, continuously allocating and deleting massive tensors. Within 5 minutes, 10 different research jobs belonging to the professors crash simultaneously across the cluster. The IT team is baffled because the student's namespace had a strict ResourceQuota of 1 GPU.

**The Senior Architect Response:**
"The student's script did not violate their Kubernetes ResourceQuota; it exploited a complete lack of physical hardware isolation in the shared environment.

Because the IT team relied purely on logical Kubernetes boundaries, they likely provisioned the cluster using standard software **Time-Slicing**. 

Time-slicing allows multiple containers to share the exact same physical pool of GPU VRAM. When the student's infinite loop rapidly allocated massive tensors, it maliciously (or accidentally) consumed 100% of the physical VRAM on that specific GPU. Because there are no hardware-enforced memory limits in Time-Slicing, the other 10 research jobs running on that exact same physical GPU instantly starved for memory and hard-crashed with `CUDA OOM` errors. 

To prevent a single noisy neighbor from destroying the stability of a shared cluster, we must immediately pivot to hardware-level isolation. 

We will reconfigure the GPUs using **Multi-Instance GPU (MIG)**. We will partition the A100s into seven mathematically rigid `1g.10gb` slices. 
By enforcing MIG, we configure strict base and limit registers on the physical VRAM and L2 cache. If a student's script goes rogue and attempts an infinite memory allocation, it will hit the hard 10GB physical wall of its specific MIG slice and crash itself, leaving the other 6 slices on that physical GPU completely isolated, safe, and performing at full speed."

## Interview Preparation

**Conceptual:** Why are Kubernetes Namespaces and ResourceQuotas insufficient for isolating hostile AI workloads sharing a single physical GPU? *(Hint: Namespaces only isolate logical API access. ResourceQuotas only limit how many logical resources a user can ask for. If the underlying sharing mechanism is software Time-Slicing, all users still share the same physical pool of VRAM and Cache. One user's memory leak will instantly OOM-crash all other users sharing that physical silicon).*

**Architecture:** Explain how SR-IOV (Single Root I/O Virtualization) provides network isolation for AI workloads. *(Hint: AI workloads use RDMA, which bypasses the host operating system's firewall (like iptables). You cannot use standard software to block them. SR-IOV solves this by slicing the physical Network Card (NIC) into multiple hardware-isolated Virtual Functions (VFs). Each container gets its own dedicated VF, ensuring strict, hardware-enforced network isolation that cannot be bypassed by software).*
