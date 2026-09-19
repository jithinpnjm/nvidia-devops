---
title: "Chapter 7 — Continuous and Dynamic Batching"
sidebar_position: 7
description: "A deep dive into request queueing. Understand the mathematical difference between static, dynamic, and continuous batching algorithms."
---

# Chapter 7 — Continuous and Dynamic Batching

| Chapter metadata | Value |
|---|---|
| Volume | 12 — Inference Architecture and Optimization |
| Difficulty | Advanced |
| Estimated reading time | 25 minutes |
| Primary audience | Performance Engineers, Backend Developers |
| Core question | If the GPU can process 100 requests simultaneously, how do you actually group 100 random user requests arriving at different milliseconds? |

## Introduction

Inference math (Matrix Multiplication) is blindingly fast on an NVIDIA GPU. The challenge is feeding the beast. 

If User A clicks a button, and you send that single request to the GPU, you will utilize 2% of the Tensor Cores. The GPU will finish in 5ms and go back to sleep. 
If you want to achieve high ROI on a $30,000 piece of hardware, you must ensure that every time the GPU executes a matrix multiplication, it is processing 50, 100, or 256 requests simultaneously. 

This requires sophisticated software buffering and grouping known as **Batching**.

## 1. Static Batching (The Legacy Approach)

In early AI deployments, engineers hardcoded the batch size. 
If the batch size was 16, the server would wait until exactly 16 requests arrived, send them to the GPU, and return the answers.

**The Fatal Flaw:** If only 5 users are using the website, the server waits indefinitely for 11 more users to show up. The 5 users sit staring at a loading screen forever. Static batching is useless for interactive web traffic.

## 2. Dynamic Batching (Triton Standard)

Dynamic Batching solves the idle problem. 

The inference server (like Triton) defines two rules:
1.  **Maximum Batch Size:** (e.g., 64).
2.  **Maximum Queue Delay:** (e.g., 5 milliseconds).

When User 1's request arrives, Triton starts a 5ms timer. It catches incoming requests from Users 2 through 10. When the 5ms timer expires, Triton takes whatever it caught (a batch of 10), sends it to the GPU, and returns the answers. 

This guarantees a maximum wait time (5ms) while dynamically grouping traffic based on the current load.

## 3. Continuous / In-Flight Batching (LLM Specific)

As covered briefly in Chapter 5, Dynamic Batching fails for Generative AI (LLMs) because the generation time is unpredictable. 

If Triton batches a short response ("Yes") and a long response (a 500-word essay) together, the GPU must hold the "Yes" answer in memory until the 500-word essay finishes generating. 

**Continuous Batching** breaks the batch at the *token level*. 
The inference engine (vLLM or TensorRT-LLM) maintains a dynamic pool of active requests. 
1. The GPU generates 1 token for all active requests.
2. The engine checks if any requests hit their `<EOS>` (End of Sequence) token.
3. If a request is finished, it is immediately ejected from the pool, and the result is returned to the user.
4. A new request from the waiting queue is instantly injected into the active pool to replace it.
5. The GPU generates the next token.

This continuous rotation ensures the GPU matrix is always full, and short requests are never held hostage by long requests.

## Customer Scenario (Senior Level)

**The Situation:**
A team deploys a standard BERT model (non-generative) on Triton. Traffic is heavy. The model processes a single request in 2ms. They enable Dynamic Batching, setting `max_batch_size: 256` and `max_queue_delay_microseconds: 50000` (50ms). Users are complaining that the API latency feels sluggish (around 60ms). The DevOps team looks at the GPU and sees it is only running at 30% utilization.

**The Senior Architect Response:**
"Your configuration has prioritized theoretical batch size over practical latency, artificially starving the GPU.

Because the model is incredibly fast (2ms execution), setting a `max_queue_delay` of 50ms is forcing the first request in the queue to sit completely idle for 50ms waiting for more friends to arrive. You are artificially introducing 50ms of pure queueing latency into a 2ms operation. 

Furthermore, because you set the queue delay so high, the server eventually gathers a massive batch, fires it at the GPU, the GPU finishes it in 5ms, and then the GPU sits completely idle for another 50ms while Triton builds the next batch. This causes the low 30% GPU utilization.

To fix this, we must tune the Dynamic Batcher to the physics of the model. 
We must aggressively lower the `max_queue_delay_microseconds` down to `2000` (2ms) or `5000` (5ms). Triton will build smaller batches, but it will fire them at the GPU much more frequently. The client latency will drop from 60ms down to ~8ms, and the GPU utilization will smooth out and increase because it is constantly being fed data rather than waiting for massive, infrequent bursts."

## Interview Preparation

**Conceptual:** Explain the mathematical flaw of applying standard Dynamic Batching to a Large Language Model (LLM). *(Hint: Standard Dynamic Batching groups requests and waits for the entire batch to finish before returning any results. Because LLMs generate responses of highly unpredictable lengths, grouping a 5-token response with a 500-token response forces the fast request to wait idly in GPU memory for the slow request to finish, destroying latency and wasting VRAM).*

**Architecture:** How do you tune Triton's `max_queue_delay_microseconds` for a high-traffic, low-latency API? *(Hint: You must balance batch size against SLA. If the delay is too high, you introduce artificial queueing latency. If the delay is too low (e.g., 0ms), Triton never builds a batch, sending requests sequentially and destroying GPU throughput. The optimal delay is usually set slightly higher than the average execution time of a single batch).*
