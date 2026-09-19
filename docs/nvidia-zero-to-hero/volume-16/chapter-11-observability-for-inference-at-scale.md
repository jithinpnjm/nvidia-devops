---
title: "Chapter 11 — Observability for Inference at Scale"
sidebar_position: 11
description: "Master the telemetry of production serving. Learn how to track Token Generation, KV Cache pressure, and Continuous Batching efficiency."
---

# Chapter 11 — Observability for Inference at Scale

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability, Profiling, and Diagnosis |
| Difficulty | Advanced |
| Estimated reading time | 25 minutes |
| Primary audience | MLOps Engineers, Performance SREs |
| Core question | When your cluster serves 10,000 LLM requests per second, how do you track latency down to the individual token? |

## Introduction

Monitoring a training job is about ensuring the hardware is 100% busy for 3 months.
Monitoring inference is entirely different. It is about tracking the microsecond-level journey of a user's prompt as it fights through queues, batchers, and execution engines to return a response before the user abandons the application.

Standard APM tools (like Datadog tracing) stop at the API gateway. A Senior Architect must extend the tracing pipeline deep into the inference server (Triton/vLLM) to extract the highly specific metrics of Generative AI: Tokens, Batch Sizes, and KV Cache saturation.

## 1. The Generative AI Golden Signals

For LLM inference, you do not just alert on "Latency." You must decompose latency into the specific phases of text generation (as discussed in Volume 12).

You must configure Prometheus to scrape and alert on these specific engine metrics:
1.  **TTFT (Time To First Token):** Tracks the compute-heavy prefill phase. If this spikes, your GPU compute cores (SMs) are saturated.
2.  **TPOT (Time Per Output Token):** Tracks the memory-bound generation phase. If this spikes, your memory bandwidth is saturated, or your Continuous Batching engine is struggling.
3.  **Tokens Per Second (Throughput):** The total aggregate output of the server. 

## 2. Monitoring the KV Cache

The most critical telemetry point in an LLM deployment is not the GPU compute utilization; it is the **KV Cache Memory Utilization**.

As multiple users chat with the model, their conversation history consumes VRAM (the KV Cache). 
If the KV Cache hits 100% capacity, the inference server (e.g., vLLM or Triton) must start evicting users, or incoming requests will be placed into a massive queue, destroying TTFT.

**The Alerting Strategy:**
An SRE must build an alert on `kv_cache_usage_percentage`. 
*   **Warning (75%):** The cluster is getting hot. The autoscaler (HPA) should be spinning up new GPU pods immediately.
*   **Critical (90%):** The cluster is at physical capacity. The API gateway should immediately begin shedding load (HTTP 429 Too Many Requests) to protect the active users from being evicted.

## 3. Tracing the Request (OpenTelemetry)

To diagnose exactly why a request missed its SLA, you must use Distributed Tracing. 
Triton natively supports **OpenTelemetry (OTel)**.

When a request enters the API Gateway, a unique `TraceID` is generated. This ID is passed to Triton. Triton logs the exact timestamps for:
*   Time spent in the HTTP/gRPC receiver.
*   Time spent waiting in the Dynamic Batch queue.
*   Time spent executing the CUDA kernel on the GPU.

An SRE can open an interface like Jaeger or Zipkin, paste the `TraceID`, and see a beautiful waterfall diagram proving exactly which phase of the inference server caused the 500ms delay.

## Customer Scenario (Senior Level)

**The Situation:**
A retail company launches a massive GenAI holiday campaign. They deploy a 70B model on 10 nodes using vLLM. Traffic is steady, but users complain that sometimes the chatbot responds instantly, and sometimes it takes 15 seconds to reply. The platform team checks the API gateway metrics, which confirm the extreme latency variance. They check the GPU utilization, which is steady at 60%. They conclude the network is dropping packets.

**The Senior Architect Response:**
"The network is not dropping packets. You are experiencing the classic symptom of **Continuous Batching Starvation**. 

By looking only at API Gateway metrics and generic GPU utilization, you are completely blind to the internal state machine of the LLM serving engine. 

We must immediately check the Prometheus metrics exposed directly by vLLM, specifically focusing on the **Queue Depth** and the **KV Cache Allocation**. 

Here is what is actually happening: The GPU compute is only at 60%, meaning the hardware has plenty of mathematical power left. However, the KV Cache memory (VRAM) is hitting 100% capacity because users are submitting incredibly long prompts. 

Because the KV Cache is full, vLLM physically cannot accept any new requests into the continuous batching pool. When a new user submits a prompt, vLLM places it into a software queue. The user must wait 15 seconds for an active user to finish their conversation and free up a block of KV Cache VRAM before their request is allowed to enter the GPU. 

To fix this, we must configure our Kubernetes Horizontal Pod Autoscaler (HPA) to trigger scaling based on the custom metric `vllm:gpu_cache_usage_perc` rather than CPU or GPU compute utilization. This will instantly provision new nodes when memory gets tight, eliminating the queueing latency and stabilizing the user experience."

## Interview Preparation

**Conceptual:** Why is TTFT (Time To First Token) often tracked separately from TPOT (Time Per Output Token) in LLM observability? *(Hint: They represent entirely different physical bottlenecks. TTFT is the compute-heavy phase where the GPU ingests the massive initial prompt; if it is slow, the GPU's streaming multiprocessors (compute) are saturated. TPOT is the generation phase where the GPU outputs one word at a time; if it is slow, the GPU's memory bandwidth is saturated. Tracking them separately allows SREs to know exactly which resource is bottlenecking).*

**Architecture:** What happens to an LLM inference server when its KV Cache hits 100% capacity, and how do you monitor for this? *(Hint: When the KV Cache is full, the server physically cannot accept new users into the active generation batch. It must either reject new requests (HTTP 429) or place them in a waiting queue, causing massive latency spikes. An SRE must scrape the specific cache utilization metrics directly from the serving engine (e.g., Triton or vLLM) via Prometheus and alert aggressively before capacity reaches 100%).*
