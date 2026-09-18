---
title: "Chapter 6 — Training Accelerators: The Heavy Iron"
sidebar_position: 6
description: "Dissect the flagship NVIDIA data center GPUs. Understand the thermal, memory, and performance scaling from A100 to H100, H200, and B200."
---

# Chapter 6 — Training Accelerators: The Heavy Iron

| Chapter metadata | Value |
|---|---|
| Volume | 04 — Accelerator Architecture & Form Factors |
| Difficulty | Advanced |
| Estimated reading time | 35 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | Why does the definition of a "GPU" change fundamentally when you move into the SXM tier? |

## Introduction

When an enterprise announces a "10,000 GPU Cluster," they are not talking about PCIe cards plugged into Dell servers. They are talking about the **Heavy Iron**—the SXM-based, liquid-cooled, non-blocking powerhouses that serve as the backbone of modern AI foundries.

As a Senior AI Infrastructure Architect, you are responsible for the capacity planning and operational safety of these deployments. You must understand how Memory Capacity, Memory Bandwidth, and Thermal Design Power (TDP) scale across the flagship generations. 

## 1. Ampere: A100 (The Workhorse)

Released in 2020, the A100 remains one of the most widely deployed AI accelerators in the world. 
* **Variants:** 40GB (HBM2) and 80GB (HBM2e).
* **Bandwidth:** 1.5 TB/s (40GB) and 2.0 TB/s (80GB).
* **TDP:** 400W (SXM4).

**The Operational Reality:** The A100 is highly stable, entirely air-coolable in standard high-density racks, and introduced **MIG (Multi-Instance GPU)**. Today, the A100 is largely considered a "legacy" architecture for Frontier model training because it lacks the FP8 Transformer Engine, meaning it requires double the memory bandwidth to train or serve an LLM compared to Hopper.

## 2. Hopper: H100 & H200 (The LLM Standard)

Released in 2022, the H100 was explicitly designed to break the memory bandwidth bottleneck of Transformer models.

### The H100
* **Specs:** 80GB HBM3. 3.35 TB/s bandwidth. 
* **TDP:** 700W (SXM5).
* **The Paradigm Shift:** The jump to 700 Watts fundamentally changed data center design. 8-GPU servers now pulled over 10.2 kW. Traditional enterprise cooling struggled. The inclusion of the **Transformer Engine (FP8)** allowed the H100 to process LLMs up to 3x faster than the A100.

### The H200 Update
In 2023, NVIDIA released the H200. The compute silicon is *exactly the same* as the H100. The only difference is the memory.
* **Specs:** 141GB HBM3e. 4.8 TB/s bandwidth.
* **The Why:** As LLMs grew, the 80GB capacity of the H100 became a severe limitation. When serving LLMs, the **KV Cache** (storing conversation history) eats memory rapidly. The massive 141GB capacity of the H200 allows a single server to handle double the concurrent users before hitting an Out-Of-Memory (OOM) error, effectively cutting inference hosting costs in half.

## 3. Blackwell: B200 (The Multi-Die Monster)

Released in 2024, Blackwell represents the physical limit of single-die silicon manufacturing. 

* **The Multi-Die Design:** A single silicon chip can only be made so large before manufacturing defects ruin it (the Reticle Limit). To make a more powerful GPU, NVIDIA took two massive dies and bridged them together with a 10 TB/s chip-to-chip interconnect. To the software, it appears as a single GPU.
* **Specs:** 192GB HBM3e. 8.0 TB/s bandwidth. 
* **TDP:** 1,000W+ per GPU.
* **Precision:** Introduces **FP4 (4-bit)** math. 

## Architectural Comparison Matrix

| GPU | Architecture | Memory | Bandwidth | TDP (SXM) | Primary Upgrade Driver |
|---|---|---|---|---|---|
| **A100** | Ampere | 80 GB | 2.0 TB/s | 400 W | MIG (Hardware Partitioning) |
| **H100** | Hopper | 80 GB | 3.35 TB/s | 700 W | Transformer Engine (FP8) |
| **H200** | Hopper | 141 GB | 4.8 TB/s | 700 W | Extreme Memory Capacity (KV Cache) |
| **B200** | Blackwell | 192 GB | 8.0 TB/s | 1000W+ | FP4 & Multi-Die Scaling |

## Customer Scenario (Senior Level)

**The Situation:**
An enterprise is currently using 8-GPU A100 (80GB) servers to host a large language model API. Traffic is increasing. The pods are crashing with `CUDA OOM` errors because the KV Cache fills up. They are planning to double their fleet of A100 servers to handle the traffic. 

**The Senior Architect Response:**
"Doubling the A100 fleet will double your power consumption and hardware costs without solving the underlying architectural bottleneck efficiently.

LLM Inference concurrency is strictly bound by **VRAM Capacity** (to hold the KV Cache) and **Memory Bandwidth** (to generate tokens quickly). 

Instead of buying more A100s, you should upgrade the nodes to the **H200**. 
While the H100 offers faster compute, the H200 specifically offers 141GB of HBM3e memory. This massive increase in VRAM capacity per GPU allows you to store dramatically larger KV Caches. 
One H200 server can handle more concurrent users than two A100 servers, while consuming half the physical rack space and utilizing the Hopper FP8 Transformer Engine to lower response latency. Scaling vertically with memory capacity is far more cost-effective for LLM inference than scaling horizontally with outdated silicon."

## Interview Preparation

**Conceptual:** Why did NVIDIA release the H200 if the compute silicon is identical to the H100? *(Hint: LLM Inference is memory bound. By increasing the memory to 141GB HBM3e, the GPU can hold vastly more KV Cache, doubling concurrent user capacity).*

**Architecture:** What physical manufacturing limit forced the Blackwell B200 to use a "Multi-Die" design? *(Hint: The Reticle Limit. A silicon wafer can only yield chips of a certain physical size. To go bigger, NVIDIA had to connect two maximum-sized dies together using a 10 TB/s interconnect).*
