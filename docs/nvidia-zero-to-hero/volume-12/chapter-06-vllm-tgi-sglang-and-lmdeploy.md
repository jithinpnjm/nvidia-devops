---
title: Chapter 06 — vLLM, TGI, SGLang, and LMDeploy
description: Compare modern LLM serving engines by scheduler, cache, API, model support, and operational fit.
sidebar_position: 7
tags: [vllm, tgi, sglang]
---

# vLLM, TGI, SGLang, and LMDeploy

Serving engines implement different trade-offs around continuous batching, KV cache management, model compatibility, distributed execution, observability, and API conventions.

| Engine | Architectural question to evaluate |
|---|---|
| vLLM | How does paged KV cache and continuous batching fit the workload? |
| TGI | Does its model and deployment ecosystem match the platform? |
| SGLang | Do structured-generation and scheduler capabilities matter? |
| LMDeploy | Does its runtime and supported model set meet requirements? |

## Selection Framework

1. Verify model and quantization support.
2. Define API compatibility.
3. Measure time to first token and inter-token latency.
4. Measure memory efficiency at target context length.
5. Test failure, restart, and model-loading behavior.
6. Confirm metrics, logs, security, and upgrade lifecycle.

## Anti-Pattern

Do not choose an engine because one benchmark shows the highest throughput. Benchmark distributions, concurrency, prompt length, output length, hardware, and SLO must match production.

## Customer Perspective

Recommend an engine with stated assumptions and an exit path. Model-serving software evolves quickly; architecture should preserve portable APIs, observability, and artifact governance.
