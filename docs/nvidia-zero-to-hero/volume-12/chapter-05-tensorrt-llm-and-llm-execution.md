---
title: "Chapter 5 — TensorRT-LLM and LLM Execution"
sidebar_position: 5
description: "Understand the physics of Large Language Models. Learn how TensorRT-LLM handles KV caching, continuous batching, and extreme optimization."
---

# Chapter 5 — TensorRT-LLM and LLM Execution

| Chapter metadata | Value |
|---|---|
| Volume | 12 — Inference Architecture and Optimization |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | AI Infrastructure Engineers, MLOps |
| Core question | If standard TensorRT is so fast, why did NVIDIA have to build a completely separate tool (TensorRT-LLM) just for ChatGPT-style models? |

## Introduction

In Chapter 4, we discussed standard TensorRT. Standard TensorRT is brilliant for models with fixed input and output sizes (like ResNet for image classification). 

Large Language Models (LLMs) break all the rules of standard inference. 
An LLM takes a prompt of variable length and generates a response of unknown length, one single word (token) at a time. The computation graph is entirely dynamic. Furthermore, LLMs require massive amounts of memory to store the context of the conversation as it generates text (the KV Cache). 

Standard TensorRT cannot handle this dynamic, memory-hungry, sequential execution efficiently. 

To solve this, NVIDIA built **TensorRT-LLM**, an entirely separate, highly specialized library dedicated purely to the physics of Large Language Model inference.

## 1. The KV Cache Bottleneck

To understand TensorRT-LLM, you must understand the KV (Key-Value) Cache.

When an LLM generates Token 50, it must look back at Tokens 1-49 to understand the context. It does this by performing complex matrix math. 
If the model recalculated the math for Tokens 1-49 every single time it generated a new word, it would be catastrophically slow. 

Instead, the model calculates the math for Tokens 1-49 once, and stores the resulting matrices (the Keys and Values) in the GPU's VRAM. This is the **KV Cache**. 

**The Memory Crisis:**
As the conversation gets longer, the KV Cache grows massively. If you have 100 concurrent users chatting with a 70B parameter model, the KV Cache can quickly consume 100GB+ of VRAM. You will run out of memory due to the KV Cache long before you run out of memory due to the model weights.

## 2. In-Flight (Continuous) Batching

As discussed in Chapter 3, standard Triton uses Dynamic Batching: it waits for 10 requests, runs them all at once, and returns the answers. 

This fails for LLMs. What if Request A is a 5-word answer ("Yes, the sky is blue"), and Request B is a 500-word essay?
If you batch them together, Request A finishes in 100ms, but the GPU holds it hostage, forcing the user to wait 5 seconds for Request B's essay to finish generating. 

TensorRT-LLM introduces **In-Flight Batching** (or Continuous Batching). 
It operates at the *token level*, not the request level. As soon as Request A finishes its 5 words, TensorRT-LLM immediately kicks it out of the GPU and dynamically swaps in Request C to take its place in the batch, while Request B continues generating its essay without interruption. This maximizes GPU utilization and minimizes latency for short requests.

## 3. PagedAttention

Standard KV Cache allocation is naive. The system guesses how long the conversation will be and pre-allocates a massive, contiguous block of VRAM. Because conversations are unpredictable, this results in massive memory fragmentation (wasted VRAM).

TensorRT-LLM utilizes **PagedAttention**. 
Borrowed from classic operating system memory management, PagedAttention breaks the KV Cache into tiny, fixed-size blocks (pages). It dynamically allocates these pages non-contiguously in VRAM only when they are actually needed. This completely eliminates memory fragmentation, allowing you to fit 2x-4x more concurrent users on the exact same GPU.

## Customer Scenario (Senior Level)

**The Situation:**
An AI team deploys Llama-3-70B using standard PyTorch via a basic web API. They can only handle 15 concurrent users on an 8-GPU HGX node before the system crashes with a CUDA OOM error. The CFO is horrified at the cost per user and threatens to cancel the project. 

**The Senior Architect Response:**
"The project is financially unviable because the software architecture is naively managing the complex physics of LLM memory allocation.

By using standard PyTorch, you are suffering from severe **KV Cache Fragmentation**. The system is blindly pre-allocating massive, contiguous blocks of VRAM for every user's chat session, anticipating worst-case conversation lengths. Because the conversations are actually short, 70% of your VRAM is permanently locked and empty, causing the OOM crashes at merely 15 users.

Furthermore, because you lack advanced batching, users asking short questions are artificially delayed while the GPU finishes generating long essays for other users. 

We must immediately rip out the Python wrapper and deploy the model using **Triton Inference Server backed by TensorRT-LLM**. 

TensorRT-LLM will implement **PagedAttention**, physically breaking the KV Cache into tiny blocks and dynamically allocating them only when tokens are actually generated. This eliminates VRAM fragmentation. Concurrently, it will implement **In-Flight Batching**, dynamically swapping requests in and out of the GPU matrix at the token level. 

By managing memory and batching at the silicon level, TensorRT-LLM will allow us to scale from 15 concurrent users to over 150 concurrent users on the exact same hardware, rescuing the unit economics of the project."

## Interview Preparation

**Conceptual:** What is the fundamental difference between standard Dynamic Batching and Continuous (In-Flight) Batching? *(Hint: Standard batching waits for a group of requests, executes them all, and waits for the longest request to finish before returning any answers. Continuous batching operates at the token level; the moment a short request finishes generating its final word, it is ejected from the batch and a new request is instantly swapped in, dramatically increasing throughput and reducing latency for short responses).*

**Architecture:** Explain how PagedAttention solves the KV Cache memory crisis in LLM serving. *(Hint: Naive KV Cache management pre-allocates massive contiguous blocks of memory based on guessed conversation lengths, leading to severe fragmentation and wasted VRAM. PagedAttention chops the cache into small, non-contiguous pages, allocating them dynamically only when necessary. This eliminates fragmentation and allows 2x-4x more concurrent users to fit into the GPU's memory).*
