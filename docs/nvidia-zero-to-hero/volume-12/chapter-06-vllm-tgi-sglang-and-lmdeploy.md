---
title: "Chapter 6 — vLLM, TGI, SGLang, and LMDeploy"
sidebar_position: 6
description: "Navigate the fragmented LLM serving ecosystem. Learn when to use TensorRT-LLM versus open-source alternatives like vLLM or TGI."
---

# Chapter 6 — vLLM, TGI, SGLang, and LMDeploy

| Chapter metadata | Value |
|---|---|
| Volume | 12 — Inference Architecture and Optimization |
| Difficulty | Advanced |
| Estimated reading time | 25 minutes |
| Primary audience | MLOps, Solutions Architects |
| Core question | If TensorRT-LLM is the fastest option, why does half the industry use vLLM or HuggingFace TGI instead? |

## Introduction

TensorRT-LLM (TRT-LLM) provides the absolute maximum bare-metal performance for NVIDIA GPUs. However, it comes with a steep operational cost. Building TRT-LLM engines requires complex compilation steps, specific Docker containers, and a deep understanding of C++ configurations.

The open-source community responded by building a highly fragmented ecosystem of alternative LLM serving engines. These engines prioritize ease-of-use, rapid deployment, and multi-vendor hardware support, often sacrificing the absolute peak performance of TRT-LLM for operational simplicity.

A Senior Architect must understand the landscape to recommend the correct engine for the company's maturity level.

## 1. vLLM (The Open-Source Standard)

**vLLM** is currently the dominant open-source LLM serving engine. 
It was the project that originally invented and popularized **PagedAttention**.

*   **Pros:** Incredibly easy to use. You can launch an OpenAI-compatible API server in one command: `python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3-8b`. It does not require pre-compilation (unlike TRT-LLM); it loads the raw HuggingFace weights dynamically.
*   **Cons:** Because it relies heavily on Python and PyTorch at its core (though it uses custom CUDA kernels for PagedAttention), it generally cannot match the extreme high-throughput, low-latency performance of a fully compiled C++ TRT-LLM engine under massive concurrent load.

## 2. Text Generation Inference (TGI)

Built by HuggingFace, **TGI** is heavily optimized for integration with the HuggingFace ecosystem.

*   **Pros:** Native integration with HuggingFace Hub. It pioneered many early optimizations like FlashAttention and continuous batching. It uses a Rust-based web server for high performance and safety.
*   **Cons:** The licensing model changed, making it restrictive for some commercial deployments compared to Apache 2.0 licensed alternatives. Performance is excellent, but vLLM has largely overtaken it in community adoption.

## 3. SGLang and LMDeploy

The ecosystem is evolving rapidly to solve specific bottlenecks:

*   **SGLang:** Focuses on **RadixAttention**. In complex agentic workflows where a system sends the exact same massive system prompt over and over again, standard engines recalculate or redundantly store that prompt. SGLang caches the prompt's KV cache efficiently across multiple requests, drastically reducing TTFT for complex multi-turn prompts.
*   **LMDeploy:** A highly optimized engine from InternLM that focuses heavily on extreme quantization (e.g., AWQ, W4A16) and high throughput, often serving as a direct competitor to the performance of TRT-LLM but with an easier Python-centric deployment model.

## Customer Scenario (Senior Level)

**The Situation:**
A startup is building a rapid prototype of an AI agent using a fine-tuned Llama-3 model. They attempt to deploy the model using TensorRT-LLM. The small backend team spends two weeks fighting with Docker build environments, MPI compilation flags, and custom weight conversion scripts, delaying the product launch. The CTO is frustrated.

**The Senior Architect Response:**
"We have chosen the wrong abstraction layer for our current organizational maturity and phase of development. 

TensorRT-LLM provides maximum theoretical performance, but it requires a mature MLOps compilation pipeline. For a startup in the rapid prototyping phase, optimizing for extreme GPU throughput is secondary; optimizing for developer velocity is paramount. 

We must immediately pivot to **vLLM**. 
vLLM will allow the team to deploy the raw HuggingFace `.safetensors` model weights directly without any prior C++ compilation or complex engine building. We can stand up an OpenAI-compatible API endpoint in five minutes. While we might sacrifice 15-20% of the absolute peak throughput compared to a perfectly tuned TRT-LLM engine, vLLM still provides production-grade features like PagedAttention and Continuous Batching. 

Once the product achieves product-market fit and we are spending tens of thousands of dollars a month on GPU hosting, we will then invest the engineering cycles to build a proper TensorRT-LLM compilation pipeline to squeeze the maximum ROI out of the silicon. Architecture is about timing."

## Interview Preparation

**Conceptual:** What is the primary operational trade-off between using vLLM versus TensorRT-LLM? *(Hint: vLLM optimizes for developer velocity. It can load raw HuggingFace models dynamically with a single command, making it incredibly easy to deploy. TensorRT-LLM optimizes for maximum bare-metal performance, but requires a complex, time-consuming compilation step to build a hardware-specific `.plan` engine before the model can be served).*

**Architecture:** In what specific scenario would SGLang (with RadixAttention) drastically outperform standard vLLM? *(Hint: Complex Agentic Workflows or Few-Shot prompting, where the client repeatedly sends a massive, identical 'System Prompt' followed by a short user query. SGLang caches the KV states of the shared prefix across different API requests, completely eliminating the compute required to process the massive system prompt repeatedly).*
