---
title: "Chapter 8 — Tenant Isolation, Security, and Fairness"
sidebar_position: 8
description: "Master multi-tenant GPU security. Learn the mathematical boundaries of memory isolation, side-channel attacks, and execution fairness."
---

# Chapter 8 — Tenant Isolation, Security, and Fairness

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | Security Architects, DevSecOps, Platform SREs |
| Core question | If two competing companies' code runs on the exact same physical piece of silicon, how do you mathematically prove they cannot steal each other's data? |

## Introduction

As AI infrastructure consolidates into massive, centralized clusters, Multi-Tenancy becomes the default operational model. 
A single H100 GPU might host an inference API for the Finance department, a data scraping tool for Marketing, and a highly classified R&D script.

If you architect GPU sharing incorrectly, you introduce catastrophic security vulnerabilities. 
If Tenant A can read Tenant B's GPU memory, they can steal proprietary model weights, API keys, and raw user data (like PII or medical records). 
A Senior Architect must understand the exact physical and software boundaries of Time-Slicing, MIG, and vGPU to sign off on a security audit.

## 1. Time-Slicing: The Security Nightmare

As established, software Time-Slicing provides **zero hardware isolation**. 
All processes running on a time-sliced GPU share the same global memory space. 

**The Threat Vector:**
While standard CUDA APIs attempt to prevent processes from reading unallocated memory, this is a software-level protection. 
If a malicious user on Tenant A writes a custom, low-level CUDA C++ kernel, they can potentially execute out-of-bounds memory reads, scanning the physical VRAM to extract data belonging to Tenant B's process. Furthermore, because they share the L2 cache, Tenant A can execute sophisticated side-channel timing attacks to infer what Tenant B is computing.

*Architectural Rule:* Never use Time-Slicing for mixed-classification data or hostile multi-tenancy.

## 2. MIG: Hardware Partitioning and Security

Multi-Instance GPU (MIG) fundamentally alters the security posture. 

When you configure MIG, the NVIDIA silicon physically configures distinct base and limit registers for memory controllers and the L2 Cache. 
*   MIG A physically cannot address the memory space of MIG B. It is enforced in hardware. 
*   MIG A physically cannot read the L2 cache of MIG B.
*   PCIe Peer-to-Peer (P2P) communication between MIG slices is disabled at the hardware level.

**The Threat Vector:**
MIG provides excellent fault isolation and data confidentiality *within the GPU silicon*. 
However, both MIG slices are still being fed by the same Host Operating System. If Tenant A compromises the host Linux kernel (e.g., via a container escape vulnerability), they gain root access to the entire machine, bypassing MIG entirely. 

*Architectural Rule:* MIG is secure for internal enterprise multi-tenancy (where users are trusted not to maliciously attack the host kernel), but it is not sufficient for public cloud zero-trust environments without an additional virtualization layer.

## 3. vGPU and PCIe Passthrough: Absolute Isolation

For true zero-trust environments (like selling cloud compute to strangers), you must insert a Hypervisor boundary.

Using NVIDIA vGPU or PCIe Passthrough, Tenant A is locked inside a Virtual Machine. Tenant B is locked inside a separate Virtual Machine. 
To steal data, Tenant A must:
1.  Execute a VM escape exploit against the Hypervisor (e.g., ESXi or KVM).
2.  Gain root access to the Hypervisor Host.
3.  Reverse-engineer the vGPU manager to read the physical silicon memory state of VM B.

This chain of exploits is astronomically difficult. This is why hyperscalers rely entirely on hypervisor-level boundaries (often backed by BlueField DPUs, as discussed in Volume 9) for public cloud GPU sharing.

## Customer Scenario (Senior Level)

**The Situation:**
A healthcare startup is building a SaaS platform. They allow independent hospitals to upload proprietary patient data and train custom AI models. To save money, the startup built a bare-metal Kubernetes cluster. They use software Time-Slicing to run Hospital A's training job and Hospital B's training job concurrently on the same physical A100 GPU. A compliance auditor reviews the architecture and threatens to revoke their HIPAA certification. The engineering team argues that Kubernetes namespaces provide sufficient isolation.

**The Senior Architect Response:**
"The compliance auditor is entirely correct to revoke the certification. This architecture is a critical data breach waiting to happen. 

Kubernetes namespaces isolate logical API resources (like Secrets and ConfigMaps). They do absolutely nothing to isolate physical hardware memory. 

By using software Time-Slicing on a bare-metal GPU, you have placed Hospital A's highly regulated Patient Health Information (PHI) in the exact same contiguous physical memory space as Hospital B's PHI. Because Time-Slicing relies solely on cooperative software context-switching, a malicious or poorly written CUDA kernel submitted by Hospital A could execute out-of-bounds memory reads directly against the A100's HBM (High Bandwidth Memory) and silently extract Hospital B's raw patient data.

To regain HIPAA compliance, we must immediately implement strict hardware boundaries. 
At a minimum, we must reformat the A100 GPUs using **MIG (Multi-Instance GPU)**. MIG establishes strict, hardware-enforced base and limit registers on the VRAM and L2 Cache, physically preventing cross-tenant memory reads at the silicon layer. 
For absolute compliance in a multi-tenant SaaS environment, we should migrate off bare-metal entirely and use Hypervisor-level isolation (VMs with vGPU or Passthrough) to ensure OS-level kernel separation between the competing hospitals."

## Interview Preparation

**Conceptual:** Why is Kubernetes Namespace isolation insufficient for securing a Time-Sliced GPU? *(Hint: Kubernetes Namespaces are logical constructs enforced by the Linux kernel on the host CPU. They have no authority over the internal memory architecture of the GPU silicon. Processes in different namespaces sharing a time-sliced GPU run in the same global VRAM pool, making them vulnerable to out-of-bounds memory reads).*

**Architecture:** Contrast the security boundaries of MIG vs. vGPU. *(Hint: MIG provides hardware-level memory and cache isolation *on the GPU*, but the workloads still share the same Host Operating System kernel. If the host OS is compromised, MIG is bypassed. vGPU provides isolation *at the Hypervisor level*, meaning workloads run in entirely separate Guest Operating Systems, providing a much stronger, zero-trust security boundary).*
