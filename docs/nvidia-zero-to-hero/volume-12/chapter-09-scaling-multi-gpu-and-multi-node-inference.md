---
title: "Chapter 9 — Scaling Multi-GPU and Multi-Node Inference"
sidebar_position: 9
description: "Master distributed inference. Learn how to deploy models using Tensor Parallelism and Pipeline Parallelism across multiple GPUs and nodes."
---

# Chapter 9 — Scaling Multi-GPU and Multi-Node Inference

| Chapter metadata | Value |
|---|---|
| Volume | 12 — Inference Architecture and Optimization |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | AI Platform Architects, Operations Leads |
| Core question | If a model is too large to fit in the VRAM of a single GPU, how do you split the inference workload across an 8-GPU server without destroying latency? |

## Introduction

As model sizes grow to 70B, 100B, and 400B+ parameters, single-GPU inference becomes physically impossible. An 80GB H100 cannot hold a 140GB model. 

You must span the model across multiple GPUs. 
However, you cannot just chop the model in half randomly. If GPU A and GPU B must constantly pause to exchange massive amounts of data over the PCIe bus, the inference latency will be catastrophic. 

A Senior Architect must design distributed inference using the exact same topological physics used in distributed training: **Tensor Parallelism (TP)** and **Pipeline Parallelism (PP)**.

## 1. Tensor Parallelism (Intra-Node)

Tensor Parallelism (TP) is the primary method for splitting an LLM. 
It slices the mathematical matrices vertically. 
If a layer requires multiplying a massive matrix, GPU 0 calculates the left half of the matrix, and GPU 1 simultaneously calculates the right half.

**The Physics:**
Because they are calculating the same mathematical layer simultaneously, they must instantly share their results before they can proceed to the next layer. This requires an `AllReduce` operation. 

*Architectural Mandate:* Tensor Parallelism generates extreme, constant inter-GPU traffic. It **must** be executed across **NVLink**. If you attempt to run Tensor Parallelism across GPUs connected only by a PCIe bus (or across different physical servers over Ethernet), the `AllReduce` synchronization latency will destroy the TPOT (Time Per Output Token). 

*Rule of Thumb:* TP size (e.g., TP=2, TP=4, TP=8) should rarely exceed the number of GPUs inside a single physical server (because NVLink stops at the edge of the server).

## 2. Pipeline Parallelism (Inter-Node)

What if the model is so massive (e.g., a 400B parameter model) that it does not fit inside the VRAM of a single 8-GPU server? You must span it across multiple physical servers.

Because Tensor Parallelism cannot efficiently cross the network, we must use **Pipeline Parallelism (PP)**. 
Pipeline Parallelism slices the neural network horizontally by layers. 
*   Server 1 (GPUs 0-7) holds Layers 1-40. 
*   Server 2 (GPUs 8-15) holds Layers 41-80.

**The Physics:**
Server 1 processes the prompt through its layers. When it reaches layer 40, it transmits the intermediate activations over the network (via InfiniBand or RoCEv2) to Server 2. Server 2 then processes layers 41-80 and returns the final token. 

Because communication only happens at the boundary between layer 40 and 41, the network bandwidth requirements are vastly lower than Tensor Parallelism, making it suitable for crossing physical server boundaries via Ethernet/InfiniBand. 

## 3. Data Parallelism (Replication)

If the model fits on 1 GPU, and you buy 8 GPUs, you do not use TP or PP. You use **Data Parallelism**.
You load an independent, identical copy of the entire model onto all 8 GPUs. 
You place a load balancer in front of them. 
This scales throughput (concurrent users) linearly, but it does absolutely nothing to improve the latency (TTFT/TPOT) of a single request. 

## Customer Scenario (Senior Level)

**The Situation:**
A team is deploying Llama-3-70B. In FP16, it requires ~140GB of VRAM. The team provisions a server with 8x L40S PCIe GPUs (48GB VRAM each). They configure their serving engine with Tensor Parallelism = 4 (spanning the model across 4 GPUs to get 192GB of VRAM). The API successfully starts, but the Time Per Output Token (TPOT) is 150ms per token, making the text generation painfully slow. They blame the serving engine.

**The Senior Architect Response:**
"The serving engine is fine. You have deployed a tightly coupled parallel workload onto a fundamentally incompatible hardware topology.

By setting Tensor Parallelism (TP) to 4, you commanded the serving engine to slice the mathematical matrices across 4 distinct GPUs. This requires the GPUs to execute massive `AllReduce` synchronizations after nearly every single layer of the neural network.

You are running this on L40S GPUs. The L40S is a PCIe-only card; it does not possess NVLink connectors. Therefore, all of these massive, high-frequency synchronization microbursts are being forced over the motherboard's PCIe bus. The PCIe bus bandwidth is drastically lower, and the latency is drastically higher, than NVLink. The GPUs are finishing their math instantly and then spending the majority of their time blocked, waiting for data to traverse the PCIe bus. 

To achieve acceptable TPOT for a 70B model using Tensor Parallelism, we must migrate this workload to an **HGX server architecture (like H100 or A100)**. In an HGX system, the NVSwitch fabric provides 900 GB/s of non-blocking bandwidth between the GPUs, bypassing the PCIe bus entirely and allowing the Tensor Parallelism synchronizations to occur at near-zero latency."

## Interview Preparation

**Conceptual:** If you deploy a model with Tensor Parallelism (TP) = 8, what specific hardware interconnect is mandatory within the server to achieve acceptable performance? *(Hint: NVLink (or NVSwitch). TP requires massive, constant synchronization (`AllReduce`) between the GPUs. If forced over a standard PCIe bus, the synchronization latency will bottleneck the entire inference process).*

**Architecture:** Explain the difference between Tensor Parallelism and Pipeline Parallelism when deploying a massive 400B parameter model. *(Hint: Tensor Parallelism slices the individual mathematical matrices vertically, requiring constant synchronization, and must be confined to GPUs within the same server connected by NVLink. Pipeline Parallelism slices the model horizontally by layers, requiring communication only between specific layer boundaries. This lower communication overhead allows PP to span across multiple physical servers over an Ethernet or InfiniBand network).*
