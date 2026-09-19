---
title: "Chapter 3 — Data Parallelism and DDP"
sidebar_position: 3
description: "Master the foundation of distributed training. Learn how PyTorch DDP replicates models and synchronizes gradients via AllReduce."
---

# Chapter 3 — Data Parallelism and DDP

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Architecture |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | AI Infrastructure Engineers, MLOps |
| Core question | If you copy a model onto 8 GPUs and give them all different training data, how do they ensure they don't learn 8 completely different things? |

## Introduction

As established in Chapter 1, if a model fits inside the VRAM of a single GPU, but your dataset is 5 Terabytes, you have hit the Compute Wall. 

To break the Compute Wall, we use **Data Parallelism**. 
The concept is simple: 
1. Buy 8 GPUs. 
2. Put an exact replica of the neural network onto all 8 GPUs.
3. Take your 5TB dataset, chop it into 8 chunks, and feed one chunk to each GPU.

They will chew through the data 8 times faster. However, there is a massive mathematical problem. If GPU 1 is reading pictures of cats, it will adjust its weights to recognize cats. If GPU 2 is reading pictures of dogs, it will adjust its weights to recognize dogs. At the end of the epoch, you don't have one smart model; you have 8 different models with completely diverging weights.

To prevent this, they must synchronize. This is the job of **Distributed Data Parallel (DDP)**.

## 1. The Mechanics of PyTorch DDP

PyTorch DDP is the industry standard for basic distributed training. It launches one independent Python process per GPU.

**The Synchronization Loop:**
1.  **The Forward Pass:** GPU 0 through 7 look at their unique batch of data and calculate the loss. (Completely independent, no network traffic).
2.  **The Backward Pass:** GPU 0 through 7 calculate their Gradients (the direction they want to change their weights). (Completely independent).
3.  **The Communication Barrier (AllReduce):** Before any GPU is allowed to update its weights, they must stop. They use NCCL (NVIDIA Collective Communication Library) to execute an `AllReduce` operation over NVLink/InfiniBand. 
4.  **The Math:** `AllReduce` takes the gradients from all 8 GPUs, averages them together, and ensures that every single GPU receives the exact same averaged gradient.
5.  **The Optimizer Step:** All 8 GPUs apply the exact same averaged gradient to their local weights. 

Because they all started with the exact same weights, and they all applied the exact same averaged gradient, they all mathematically arrive at the exact same updated weights. They remain perfectly synchronized.

## 2. The Network Bottleneck of DDP

DDP is brilliantly simple, but it places extreme stress on the network.

If you are training a 7-Billion parameter model, the gradients are 14GB in size. 
At the end of *every single batch*, all 8 GPUs must transmit 14GB of data across the network to perform the `AllReduce` average. If you are doing 5 batches a second, that is massive, continuous network traffic.

If you run DDP across GPUs connected only by PCIe (no NVLink), or across servers connected by 10G Ethernet instead of 400G InfiniBand, the `AllReduce` step will take longer than the actual math. The GPUs will sit idle waiting for the network. 

## 3. Overlapping Communication and Compute

To mitigate network bottlenecks, PyTorch DDP is highly optimized. It does not wait for the entire backward pass to finish before starting the network transfer.

As the backward pass calculates gradients layer by layer (starting from the end of the model and moving to the front), DDP uses **Bucketing**. It groups the finished gradients into buckets (e.g., 25MB chunks) and immediately fires them across the network via NCCL while the GPU continues calculating the gradients for the earlier layers. This overlap hides the network latency behind the compute latency.

## Customer Scenario (Senior Level)

**The Situation:**
A team is training a 1B parameter model using DDP across two 8-GPU nodes (16 GPUs total). Node 1 and Node 2 are connected via standard 25GbE enterprise networking. The team reports that scaling from 8 GPUs to 16 GPUs actually made the training job *slower*. They blame PyTorch DDP for being inefficient. 

**The Senior Architect Response:**
"PyTorch DDP is not inefficient; your network architecture is physically starving the collective communication rings.

When you trained on 8 GPUs within a single node, the DDP `AllReduce` synchronization occurred entirely over the internal NVSwitch fabric at 900 GB/s. The gradient averaging happened instantly. 

When you expanded to 16 GPUs across two nodes, DDP was forced to expand the NCCL `AllReduce` ring across the physical network switch. Because you are using standard 25GbE networking without RoCEv2 (RDMA) and without PFC lossless configuration, you introduced two massive bottlenecks. First, 25Gbps is mathematically too slow to transfer gigabytes of gradients multiple times a second. Second, standard TCP/IP networking introduces micro-stutters and dropped packets, causing the NCCL rings to stall. 

Because DDP is a synchronous protocol, all 16 GPUs must wait for the absolute slowest network link to finish the `AllReduce` before they can proceed to the next batch. 

To fix this, we must either restrict training to a single 8-GPU node to utilize NVLink, or we must upgrade the inter-node network to 400G InfiniBand or properly tuned RoCEv2 Ethernet to handle the DDP gradient synchronization bandwidth."

## Interview Preparation

**Conceptual:** In PyTorch DDP, if every GPU processes different training data, how do they ensure their model weights remain identical at the end of every step? *(Hint: DDP enforces a synchronous `AllReduce` operation at the end of the backward pass. It gathers the gradients from all GPUs, averages them, and returns the averaged gradient to every GPU. Because every GPU applies the exact same averaged gradient, their weights update identically).*

**Architecture:** Why does DDP performance collapse if you run it across multiple servers connected by standard 10Gbps networking? *(Hint: DDP requires moving massive amounts of gradient data across the network constantly (the `AllReduce` phase). If the network is slow or lossy, the GPUs finish their compute instantly and sit completely idle waiting for the network synchronization to complete, destroying cluster efficiency).*
