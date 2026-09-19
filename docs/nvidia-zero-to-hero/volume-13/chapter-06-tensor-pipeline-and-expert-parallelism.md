---
title: "Chapter 6 — Tensor, Pipeline, and Expert Parallelism"
sidebar_position: 6
description: "Master 3D Parallelism. Learn how to slice massive models horizontally and vertically to span them across thousands of GPUs."
---

# Chapter 6 — Tensor, Pipeline, and Expert Parallelism

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Architecture |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | AI Infrastructure Architects, Systems Engineers |
| Core question | If FSDP solves the memory problem, why do frontier AI labs still use complex Tensor and Pipeline parallelism? |

## Introduction

FSDP/ZeRO-3 (sharding) is incredible. It allows you to train massive models by slicing memory and fetching it on the fly. 
However, for frontier models (100B+ parameters), relying solely on FSDP creates catastrophic network bottlenecks. The constant `AllGather` traffic saturates even the fastest InfiniBand networks. 

To train the world's largest models, you must combine multiple slicing strategies. This is known as **3D Parallelism** (or 4D with Expert Parallelism).

A Senior Architect must know exactly how to map these slicing strategies to the physical topology of the data center.

## 1. Tensor Parallelism (TP) - The Vertical Slice

As introduced in Volume 12, Tensor Parallelism (TP) physically slices the mathematical matrices of a single layer across multiple GPUs. 
GPU 0 does the left half of the math; GPU 1 does the right half.

**The Physics:**
They must instantly `AllReduce` their intermediate answers to finish the layer. 
*Architectural Mandate:* Because this synchronization happens constantly, TP must **only** be executed over NVLink. If you try to run TP across two physical servers connected by Ethernet, the training job will stall completely.
*   **TP domain size:** Usually 8 (limited to the GPUs inside a single server).

## 2. Pipeline Parallelism (PP) - The Horizontal Slice

Pipeline Parallelism (PP) slices the model by depth (layers).
If a model has 80 layers:
*   Server 1 (GPUs 0-7) holds Layers 1-20.
*   Server 2 (GPUs 8-15) holds Layers 21-40.

**The Physics:**
Server 1 processes a batch of data through its layers. It then transmits the activations to Server 2. 
Because communication only happens at the boundary between layer 20 and 21, the network bandwidth requirement is drastically lower than TP or FSDP. 
*Architectural Mandate:* PP is perfect for crossing physical server boundaries (over InfiniBand/RoCE). 

**The Bubble Problem:**
In naive PP, Server 2 sits completely idle while Server 1 does its math. To fix this, we use **Micro-batching**. Server 1 breaks a large batch into tiny chunks, processes chunk A, and passes it to Server 2. While Server 2 processes chunk A, Server 1 processes chunk B. This keeps all servers busy, but leaves a small "bubble" of idle time at the start and end of the pipeline.

## 3. Expert Parallelism (EP) - MoE

Modern LLMs (like Mixtral) use **Mixture of Experts (MoE)**. 
Instead of one massive neural network, the model contains a router and several smaller "expert" networks. For a specific token (word), the router only activates 2 out of the 8 experts.

**The Physics:**
Expert Parallelism places Expert 1 on Server A, and Expert 2 on Server B. 
When Server A encounters a token that requires Expert 2, it must instantly send that token across the network to Server B (an `AllToAll` operation). 
*Architectural Mandate:* EP requires absolutely massive, non-blocking network bandwidth, as every server is constantly firing random tokens at every other server based on the router's dynamic decisions.

## Customer Scenario (Senior Level)

**The Situation:**
A research team is training a 175B parameter model. They provision a cluster of 64 nodes (512 GPUs total) connected via 400G InfiniBand. The team blindly applies Tensor Parallelism (TP=64) to the workload. The training job starts, but the GPUs are sitting at 5% utilization. The InfiniBand network is completely saturated. They blame the InfiniBand switches for dropping packets.

**The Senior Architect Response:**
"The InfiniBand network is not dropping packets; it is functioning perfectly under a mathematically impossible load. You have deployed an intra-node slicing strategy across an inter-node topology.

By setting Tensor Parallelism to 64, you have instructed the PyTorch compiler to slice individual mathematical matrices across 64 distinct GPUs residing on 8 different physical servers. 

Tensor Parallelism requires constant, high-frequency `AllReduce` synchronizations after nearly every neural network layer. When confined to a single 8-GPU node, this traffic flows over the NVSwitch at 900 GB/s. However, because you set TP=64, these massive synchronizations are forced out of the server chassis and across the 400G InfiniBand network. While InfiniBand is fast, it cannot match the bandwidth or latency of internal NVLink. The GPUs are finishing their micro-calculations instantly and then spending 95% of their time blocked, waiting for the InfiniBand network to synchronize the math.

We must immediately refactor this job using **3D Parallelism**. 
We will restrict Tensor Parallelism (TP) to exactly 8. This guarantees that all TP synchronization stays trapped inside the individual 8-GPU servers utilizing NVLink. 
To scale across the remaining 64 nodes, we will implement Pipeline Parallelism (PP=8) to chunk the model layers across the servers, and Data Parallelism (DP) to replicate the pipeline. This perfectly maps the software matrix to the physical data center topology, restoring GPU utilization to 95%."

## Interview Preparation

**Conceptual:** In 3D Parallelism, why is Tensor Parallelism (TP) usually capped at 8? *(Hint: TP requires constant, extremely high-bandwidth synchronization (`AllReduce`). If it crosses a physical server boundary, the latency of the external Ethernet/InfiniBand network destroys performance. It is capped at 8 to ensure it only runs over the internal NVSwitch/NVLink fabric of a single 8-GPU server).*

**Architecture:** Explain how Pipeline Parallelism (PP) mitigates the 'idle' problem using micro-batching. *(Hint: If a pipeline spans 4 servers, naive execution means Server 4 sits idle while Servers 1, 2, and 3 do their work sequentially. Micro-batching breaks the training data into tiny chunks. Server 1 processes chunk A and passes it to Server 2. Server 1 immediately starts processing chunk B while Server 2 works on chunk A, creating an overlapping assembly line that keeps all servers busy).*
