---
title: "Chapter 6 — Comparing MIG, Time-Slicing, and vGPU"
sidebar_position: 6
description: "The Architect's decision matrix. Learn how to definitively choose the correct GPU sharing technology based on isolation, scale, and cost requirements."
---

# Chapter 6 — Comparing MIG, Time-Slicing, and vGPU

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Expert |
| Estimated reading time | 25 minutes |
| Primary audience | Solutions Architects, Platform Leaders |
| Core question | When a customer asks "How should I share my GPUs?", how do you formulate a mathematically and operationally defensible recommendation? |

## Introduction

You now understand the three pillars of GPU sharing: Time-Slicing, MIG, and vGPU. 

A Junior Engineer will pick the one they recently read a tutorial about. A Senior Solutions Architect will ask a series of brutal discovery questions (from Volume 8, Chapter 1) and map the constraints to a formal decision matrix.

This chapter provides the ultimate cheat sheet for evaluating GPU sharing architectures.

## 1. The Architectural Decision Matrix

When choosing a sharing strategy, you must evaluate three dimensions: **Fault Isolation** (Blast Radius), **Quality of Service** (Noisy Neighbors), and **Maximum Density** (Oversubscription).

| Feature | Software Time-Slicing | Multi-Instance GPU (MIG) | NVIDIA vGPU |
| :--- | :--- | :--- | :--- |
| **Layer of Abstraction** | Container / Process level | Hardware (Silicon) level | Hypervisor / VM level |
| **Maximum Density** | Very High (100+ logical slices) | Low (Max 7 slices per GPU) | High (Up to 32 VMs per GPU) |
| **Memory Isolation** | **None.** (OOMs crash neighbors) | **Strict.** (Hardware partitioned) | **Strict.** (Hypervisor enforced) |
| **Compute QoS** | **Poor.** (Context switching delays) | **Strict.** (Dedicated SMs) | **Variable.** (Depends on profile) |
| **Fault Isolation** | **Poor.** (Shared CUDA context) | **Strict.** (Independent PCIe errors) | **Strict.** (Independent Guest OS) |
| **Cost / Licensing** | Free (Included in driver) | Free (Included in silicon) | **High.** (Requires Enterprise License) |
| **Ideal Use Case** | Jupyter Notebooks, QA/Dev testing | Production Inference, Multi-tenant K8s | VDI, Traditional IT VM Infrastructure |

## 2. The Multi-Tenancy Trust Model

The decision almost entirely hinges on the concept of **Trust**.

*   **High Trust (Internal Teams):** If a single team of data scientists is sharing a GPU for prototyping, they trust each other. If Bob runs a bad script and OOM-crashes Alice's notebook, Alice can just yell at Bob across the office. **Time-Slicing is acceptable.**
*   **Low Trust (Different Departments):** If the Finance team and the HR team share a Kubernetes cluster, they do not trust each other. Finance cannot have their payroll inference job latency spike because HR is running an image classification batch job. **MIG is mandatory.**
*   **Zero Trust (Cloud Providers):** If you are selling compute to hostile strangers on the internet, you cannot even trust them on the same Host OS kernel. **vGPU or dedicated Bare-Metal (PCIe Passthrough) is mandatory.**

## Customer Scenario (Senior Level)

**The Situation:**
An enterprise is designing a new internal AI platform on Kubernetes. They have a massive budget for H100 GPUs. The Platform Lead states: "To maximize our investment, we are going to use MIG for the production inference workloads, and we are going to purchase NVIDIA vGPU licenses so we can use vGPU for the development workloads to give the developers better isolation than Time-Slicing."

**The Senior Architect Response:**
"Your strategy for production inference is correct, but your strategy for development workloads is unnecessarily complex and financially wasteful.

Using MIG for production inference is mathematically sound; it provides the hardware-level QoS required to guarantee API latency SLAs. 

However, introducing a hypervisor and purchasing vGPU licenses purely to isolate development workloads on a Kubernetes platform is an architectural anti-pattern. If you are already running Kubernetes on bare-metal, vGPU requires you to insert a virtualization layer (like ESXi or KVM) beneath Kubernetes. This introduces massive operational overhead, a hypervisor performance tax, and significant licensing costs. 

For development workloads in a trusted internal environment, density is more important than strict fault isolation. We should use **Software Time-Slicing** managed by the GPU Operator. This allows us to oversubscribe the H100s to 20 or 30 developers per GPU without paying a single dollar in virtualization licenses or adding a hypervisor layer to manage."

## Interview Preparation

**Conceptual:** Which GPU sharing technology would you recommend for a public cloud provider renting fractional GPUs to unknown customers, and why? *(Hint: vGPU or MIG-backed vGPU. You must have hypervisor-level Operating System isolation (Virtual Machines) when dealing with zero-trust, hostile multi-tenancy. Containers (Time-slicing/standard MIG) share the host kernel, which is a massive security vulnerability for public clouds).*

**Architecture:** A customer complains that their batch processing job causes extreme latency spikes for a real-time speech-to-text API running on the same GPU. They are currently using Time-Slicing. What is the fix? *(Hint: The fix is migrating to MIG. Time-Slicing shares the memory bandwidth and L2 cache, causing the batch job to starve the real-time API. MIG physically partitions the cache and bandwidth, guaranteeing that the API receives uninterrupted compute resources regardless of the batch job's behavior).*
