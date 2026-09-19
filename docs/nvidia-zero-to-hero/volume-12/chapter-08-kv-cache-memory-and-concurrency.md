---
title: "Chapter 8 — KV Cache, Memory, and Concurrency"
sidebar_position: 8
description: "Master LLM memory management. Calculate exact VRAM requirements, understand context windows, and optimize concurrent user scaling."
---

# Chapter 8 — KV Cache, Memory, and Concurrency

| Chapter metadata | Value |
|---|---|
| Volume | 12 — Inference Architecture and Optimization |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Capacity Planners, MLOps, Performance Engineers |
| Core question | A 70B parameter model weights 140GB in FP16. If you load it onto two 80GB GPUs (160GB total), why does the server crash when the 5th user connects? |

## Introduction

In traditional web architecture, scaling means adding more CPU instances. In LLM architecture, scaling is almost entirely dictated by VRAM.

A Senior Architect must be able to perform the brutal mathematics of GPU memory allocation on a whiteboard. If you miscalculate the memory requirements for a production LLM deployment, the system will fail spectacularly under load, throwing OOM (Out Of Memory) errors and bringing down the entire service.

VRAM consumption in LLM inference is divided into two distinct buckets: **Model Weights** and **The KV Cache**.

## 1. Calculating Model Weight Memory

The physical size of the model weights is fixed. It is determined by the number of parameters and the precision (data type).

**The Math:**
*   `Parameters * Bytes_per_Parameter = VRAM Required`
*   **FP32 (32-bit):** 4 bytes per parameter.
*   **FP16/BF16 (16-bit):** 2 bytes per parameter.
*   **INT8 (8-bit):** 1 byte per parameter.
*   **INT4/AWQ (4-bit):** 0.5 bytes per parameter.

*Example:* Llama-3 70B running in standard FP16.
70,000,000,000 * 2 bytes = **140 GB** of VRAM just to load the model. (This physically will not fit on a single 80GB H100).

## 2. The KV Cache: The Silent Killer

Once the model weights are loaded, the remaining VRAM is entirely dedicated to the KV Cache (the memory required to store the context of the active conversations, as discussed in Chapter 5). 

Unlike model weights, the KV Cache grows dynamically based on three variables:
1.  **Sequence Length:** How long is the conversation? (A 10,000 token document requires vastly more memory than a 10 token prompt).
2.  **Batch Size / Concurrency:** How many users are chatting simultaneously?
3.  **Model Architecture:** How many layers, attention heads, and hidden dimensions does the model have?

**The VRAM Reality:**
If you load a 140GB model onto two 80GB GPUs (160GB total), you only have 20GB of free VRAM remaining for the KV Cache. 
If a single user with a massive 32,000 token context window connects, their specific KV Cache might consume 4GB of VRAM. 
Therefore, if 6 users connect simultaneously, the KV Cache demands 24GB of VRAM. You only have 20GB available. The server crashes with an OOM error.

## 3. Techniques to Survive the KV Cache

Architects use several strategies to prevent the KV Cache from destroying the cluster:

1.  **Quantization:** Shrink the model weights (e.g., to INT8 or INT4). By shrinking a 140GB model down to 70GB, you free up massive amounts of VRAM, allowing the KV Cache to grow much larger, supporting more concurrent users.
2.  **KV Cache Quantization:** Modern engines (like TRT-LLM) can quantize the KV cache itself (storing the conversation context in 8-bit precision instead of 16-bit), halving the memory footprint per user.
3.  **Tensor Parallelism:** Spread the model across 4 GPUs instead of 2. You now have 320GB of total VRAM, leaving 180GB available for a massive KV Cache pool.

## Customer Scenario (Senior Level)

**The Situation:**
A legal tech company is deploying an open-source 8B parameter model to summarize legal contracts. The model weights take roughly 16GB of VRAM. They deploy it on a single A100-40GB GPU. They test it with short prompts and it easily handles 100 concurrent users. However, in production, users begin uploading 50-page PDF contracts (approx 20,000 tokens). The API instantly crashes with `CUDA OOM` when merely 3 users hit the system simultaneously. 

**The Senior Architect Response:**
"We have failed to calculate the mathematical relationship between extreme Sequence Length and the KV Cache.

When you tested the system with short prompts, the KV Cache per user was negligible (a few megabytes). The 24GB of free VRAM on the A100 easily supported 100 concurrent users.

However, the KV Cache scales linearly with the sequence length. When a user uploads a 20,000-token contract, the self-attention mechanism must store the Keys and Values for all 20,000 tokens. For this specific model architecture, a 20,000-token context might consume roughly 10GB of VRAM per user. 

When 3 users upload contracts simultaneously, the KV Cache attempts to allocate 30GB. We only have 24GB available. The system crashes.

To fix this, we must restrict the maximum sequence length allowed by the API to protect the VRAM pool, or we must scale the hardware. We will deploy the model using vLLM to utilize **PagedAttention** (preventing any VRAM fragmentation), and we will explicitly configure the engine to cap the `max_model_len` to a mathematically safe threshold based on our available VRAM, returning a clean HTTP 400 error if a user exceeds the limit, rather than hard-crashing the entire GPU and dropping all other users."

## Interview Preparation

**Conceptual:** A customer wants to run a 30B parameter model in FP16 precision. How much VRAM is required just to load the model weights, before any users connect? *(Hint: 30 Billion parameters * 2 bytes per parameter (FP16) = 60 Gigabytes of VRAM. This will easily fit on a single 80GB GPU, leaving roughly 20GB free for the KV Cache).*

**Architecture:** Why does an LLM inference server crash if too many users connect, even if the GPU compute cores are only at 50% utilization? *(Hint: LLM concurrency is entirely memory-bound. Every active user requires a dedicated chunk of VRAM to store their conversation history (the KV Cache). If the sum of all active users' KV Caches exceeds the available physical VRAM, the application suffers an Out-of-Memory (OOM) error, regardless of how idle the actual compute cores are).*
