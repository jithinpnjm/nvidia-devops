---
title: "Chapter 9 — Checkpointing and Recovery"
sidebar_position: 9
description: "Master fault tolerance. Learn how to save the state of a 10,000 GPU cluster without taking down the entire storage network."
---

# Chapter 9 — Checkpointing and Recovery

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Architecture |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Storage Architects, Platform Engineers |
| Core question | If a training job takes 3 months to run, and a physical GPU dies in month 2, how do you prevent the company from losing millions of dollars of compute time? |

## Introduction

At scale, hardware failure is not a possibility; it is a statistical guarantee. 
If you train a model on 10,000 GPUs for 90 days, multiple GPUs will suffer ECC memory errors, optical cables will fail, and nodes will kernel panic. 

When a single GPU dies, the entire 10,000-GPU synchronized training job hard-crashes. 

If you do not have a robust **Checkpointing and Recovery** architecture, that crash means you have permanently lost 60 days of progress. A Senior Architect must design a storage system capable of saving the exact state of the entire cluster frequently enough to minimize lost compute time, without saturating the network.

## 1. The Physics of Checkpointing

A checkpoint is not just the model weights. To resume a training job, you must save:
1.  The Model Weights.
2.  The Optimizer States (Momentum, Variance).
3.  The Dataloader State (Exactly which batch of data the job was reading).

For a 70B parameter model, a single full checkpoint can be roughly 1 Terabyte of data. 

**The Storage Incast Problem:**
If you save a checkpoint every 4 hours, and you use DDP (where GPU 0 holds the entire state), GPU 0 must write 1TB of data to the parallel file system. 
If you use FSDP (where the state is sliced across 1,000 GPUs), and you trigger a checkpoint, 1,000 GPUs will *simultaneously* attempt to write 1GB each to the network storage drive. This massive write burst will instantly saturate the storage network. 

## 2. Synchronous vs. Asynchronous Checkpointing

**Synchronous Checkpointing (The Default):**
The training job pauses. The GPUs execute the math to serialize their tensors. The GPUs write the data to the network drive over the storage network. The training job resumes. 
*The Flaw:* During this process (which can take minutes), 10,000 GPUs sit completely idle, burning thousands of dollars.

**Asynchronous Checkpointing:**
The training job triggers a checkpoint. The GPUs copy the state from VRAM into the Host CPU's local RAM. The GPUs *immediately resume training the next batch*. The Host CPU slowly trickles the data from its RAM out to the network storage drive in the background. 
*The Benefit:* The GPUs never stop crunching math. 

## 3. Distributed Checkpointing (Distributed Sharded State)

With massive models using FSDP or Megatron (ZeRO), you cannot ask a single node to gather the entire 1TB model back together just to write it to disk. That causes an OOM error.

Modern frameworks (like PyTorch Distributed Checkpoint or Megatron) use **Distributed Sharded Checkpointing**. 
Each GPU simply writes its tiny specific mathematical shard directly to disk as a separate file. 
If you have 1,000 GPUs, you get 1,000 small files. 
When the cluster reboots after a crash, the 1,000 GPUs read their exact shards back into memory independently. You only stitch the 1,000 files together into a single cohesive `.safetensors` file at the very end of the 3-month training run when you are preparing for inference.

## Customer Scenario (Senior Level)

**The Situation:**
A startup is training a foundation model on a 128-node cluster. They configure their PyTorch Lightning script to save a checkpoint every hour to a standard AWS EFS (NFS) share. They notice that every time the hour strikes, the training job completely freezes for 15 minutes. The GPUs drop to 0% utilization. Over a 24-hour period, they are losing 6 hours of expensive compute time just saving files.

**The Senior Architect Response:**
"You have architected a severe storage bottleneck. You are executing Synchronous Checkpointing against a low-performance generic network file system.

When the hour strikes, all 128 nodes pause their training loops and attempt to write massive tensor files directly to the NFS share. EFS is not a parallel file system; it cannot handle massive, simultaneous burst throughput from 128 nodes. The storage network congests, the IOPS hit a ceiling, and the GPUs sit completely idle waiting for the Linux `write()` commands to return. 

To reclaim this lost compute time, we must redesign both the software and the storage layer.

First, we will transition the storage architecture from a basic NFS share to a high-performance **Parallel File System** (e.g., Lustre or Weka) that is specifically designed to absorb massive write bursts from thousands of clients simultaneously. 

Second, we must modify the PyTorch Lightning configuration to use **Asynchronous Checkpointing**. Instead of halting the GPU execution, the framework will copy the tensors into the Host CPU's pinned memory and instantly resume the next training step. The Host CPUs will flush the data to the Lustre file system in the background. This will completely eliminate the 15-minute GPU idle periods, returning 25% of your daily compute budget."

## Interview Preparation

**Conceptual:** Why is saving a checkpoint during training fundamentally more complex and space-consuming than saving a model for inference? *(Hint: An inference model only consists of static model weights. A training checkpoint must also include the massive Optimizer States (which are often 2x to 4x larger than the weights) and the specific state of the Dataloader to ensure the training job can resume exactly where it crashed without skipping or repeating data).*

**Architecture:** Explain how Asynchronous Checkpointing prevents GPU idle time. *(Hint: In standard checkpointing, the GPUs pause doing math while they wait for the massive files to be written over the network to storage. In Asynchronous Checkpointing, the GPUs quickly dump the data into the Host CPU's RAM and immediately resume training. The Host CPU handles the slow network transfer in the background, keeping the expensive GPU compute cores utilized).*
