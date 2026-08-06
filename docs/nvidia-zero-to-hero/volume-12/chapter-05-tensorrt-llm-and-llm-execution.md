---
title: Chapter 05 — TensorRT-LLM and LLM Execution
description: Understand optimized LLM execution, parallelism, inflight batching, quantization, and engine planning.
sidebar_position: 6
tags: [tensorrt-llm, llm, inference]
---

# TensorRT-LLM and LLM Execution

Large language model inference combines model execution, autoregressive token generation, cache management, and communication across GPUs.

## Execution Path

```mermaid
flowchart LR
    Prompt[Prompt Tokens]
    Prefill[Prefill]
    Cache[KV Cache]
    Decode[Decode Loop]
    Sample[Sampling]
    Token[Output Token]

    Prompt --> Prefill --> Cache --> Decode --> Sample --> Token
    Token --> Decode
```

Prefill processes the input context and is often compute-intensive. Decode generates tokens iteratively and is sensitive to memory bandwidth, cache access, and scheduler efficiency.

## Parallelism

Tensor parallelism, pipeline parallelism, and multi-GPU execution allow larger models to fit or serve faster, but communication can become part of every generated token.

## Quantization

Quantization reduces memory and may improve throughput, but changes accuracy and sometimes kernel availability. Validate with representative prompts and quality metrics.

## Troubleshooting

If time to first token is poor, inspect queueing, tokenization, prefill, and model loading. If inter-token latency is poor, inspect decode scheduling, memory bandwidth, cache pressure, and communication.
