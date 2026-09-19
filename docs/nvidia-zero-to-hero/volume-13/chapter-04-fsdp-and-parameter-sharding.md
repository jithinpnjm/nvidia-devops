---
title: "Chapter 4 — FSDP and Parameter Sharding"
sidebar_position: 4
description: "Break the Memory Wall. Learn how Fully Sharded Data Parallel (FSDP) scatters the model across multiple GPUs to train massive LLMs."
---

# Chapter 4 — FSDP and Parameter Sharding

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Architecture |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | AI Platform Engineers, Distributed Systems Architects |
| Core question | If a 70-Billion parameter model requires 140GB of VRAM, and your GPU only has 80GB, how do you train it without rewriting the entire neural network code? |

## Introduction

In Chapter 3, we discussed Distributed Data Parallel (DDP). DDP solves the Compute Wall by replicating the model. 
But DDP assumes that the model actually fits inside a single GPU. 

What happens when you want to train a 70B parameter model? The Model Weights, Gradients, and Optimizer States require roughly 1 Terabyte of VRAM. An H100 has 80GB. If you try to run DDP, it will crash instantly on GPU 0, because it tries to load the entire 1TB state onto the single 80GB card.

To train massive models, we must stop replicating memory and start **Sharding** (splitting) memory. This is the domain of **Fully Sharded Data Parallel (FSDP)**.

## 1. The Core Concept of Sharding

FSDP is a native PyTorch feature that mathematically slices the VRAM burden across the cluster. 

Instead of putting a full copy of the model on GPU 0, and a full copy on GPU 1, FSDP chops the model in half. 
*   GPU 0 stores the first 50% of the Model Weights, Gradients, and Optimizer States.
*   GPU 1 stores the second 50%.

If you have 8 GPUs, each GPU only stores 1/8th of the total memory footprint. Suddenly, that 1 Terabyte VRAM requirement is distributed across eight 80GB cards (640GB total VRAM), making it mathematically possible to train.

## 2. The Physics of FSDP Execution

If GPU 0 only owns the first 1/8th of the model weights, how does it calculate the math for the entire forward pass?

It borrows the weights from its neighbors, uses them, and immediately throws them away.

**The FSDP Forward Pass:**
1.  GPU 0 needs to execute Layer 1. GPU 0 happens to own the weights for Layer 1. It does the math.
2.  GPU 0 needs to execute Layer 2. GPU 1 owns the weights for Layer 2.
3.  **AllGather:** GPU 0 requests the weights for Layer 2 from GPU 1 over the NVLink network.
4.  GPU 0 receives the weights, calculates the math for Layer 2, and *immediately deletes the weights from its VRAM* to save space. 
5.  This process repeats for every layer. 

**The Trade-off:**
FSDP solves the Memory Wall, but it creates a massive Communication Wall. 
In DDP, communication only happens once at the end of the backward pass (`AllReduce` gradients). 
In FSDP, communication happens constantly during the forward pass (`AllGather` weights) and the backward pass (`ReduceScatter` gradients). 

## 3. FSDP Wrapping and Tuning

FSDP is not a magic button. You must tell FSDP exactly *how* to chop up the model. This is called **Wrapping**.

If you wrap the entire model as one giant block, FSDP will request all the weights at once, instantly causing an OOM crash. 
A Senior Architect must configure FSDP to wrap the model at the *Transformer Block* level. This tells FSDP: "Only gather the weights for Transformer Layer 1, do the math, delete them, and then gather the weights for Transformer Layer 2."

## Customer Scenario (Senior Level)

**The Situation:**
A team is trying to fine-tune Llama-3-70B on a single 8xH100 node. They implement standard PyTorch FSDP. The model successfully fits in VRAM, but the training speed is abysmal. The GPUs are sitting at 40% utilization. The team suspects the NVLink fabric is broken because they see massive network traffic spikes.

**The Senior Architect Response:**
"The NVLink fabric is not broken; it is being saturated by an inefficient FSDP Sharding Strategy.

By default, FSDP uses `FULL_SHARD`. This means it chops the model weights, the gradients, and the optimizer states into 8 tiny pieces and scatters them perfectly across all 8 GPUs. While this maximizes memory savings, it maximizes network communication. Every single GPU is constantly executing `AllGather` operations over NVLink to fetch weights for every single layer. The GPUs are starving for data because the network cannot feed the weights fast enough.

We must tune the FSDP Sharding Strategy based on our actual VRAM overhead. 

Since an 8xH100 node has 640GB of total VRAM, and Llama-3-70B only strictly requires roughly 250-300GB for fine-tuning, we do not need to shard everything perfectly. 
We will change the FSDP strategy to **HYBRID_SHARD** or **SHARD_GRAD_OP**. 

`SHARD_GRAD_OP` will keep full copies of the Model Weights on all 8 GPUs (saving massive `AllGather` network traffic during the forward pass), but it will shard the massive Optimizer States and Gradients across the GPUs. This perfectly balances the VRAM reduction required to prevent OOM errors, while eliminating the network communication bottleneck, returning GPU utilization to 95%."

## Interview Preparation

**Conceptual:** What is the fundamental difference in memory usage between DDP and FSDP? *(Hint: DDP replicates the entire model, gradients, and optimizer states onto every single GPU, wasting massive amounts of VRAM. FSDP sharded (slices) these components and scatters them across the GPUs, drastically reducing the VRAM footprint per GPU and allowing massive models to fit in memory).*

**Architecture:** How does FSDP execute a forward pass if a GPU only holds a fraction of the model's weights? *(Hint: It uses an `AllGather` network operation. Just before executing a specific layer, the GPU fetches the missing weights from the other GPUs over NVLink. It executes the math, and then immediately discards those borrowed weights from VRAM to keep memory usage low).*
