---
title: "Chapter 12 — NIM, vLLM, TensorRT-LLM and serving boundaries"
slug: "senior-deep-dive-3-nim-vllm-tensorrt-llm-and-serving-boundaries"
sidebar_position: 12
description: "Chapter 3 — NIM, vLLM, TensorRT-LLM and serving boundaries — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
An inference engine optimizes model execution; a serving product adds packaging, health, security, lifecycle and operational contracts. NVIDIA NIM for LLMs currently packages vLLM behind a production-oriented proxy with liveness/readiness, OpenAI-compatible inference endpoints and Prometheus-compatible metrics. TensorRT-LLM provides NVIDIA-optimized inference capabilities, while vLLM and SGLang are widely used engines with different feature/performance trade-offs. An SA should compare workloads and operational requirements rather than treating engines as interchangeable labels.

## Build from the normal path

```mermaid
flowchart LR
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["Model server layer, named"]
  n1["Triton"]
  n2["general-purpose serving platform, multi-framework/multi-backend"]
  n3["NIM"]
  n4["packages vLLM + production proxy (health, OpenAI API, metrics)"]
  n5["vLLM"]
  n6["the engine NIM packages; usable directly, without NIM's packaging"]
  n7["TensorRT-LLM"]
  n8["NVIDIA-optimized engine, different perf/feature profile than vLLM"]
  n9["SGLang"]
  n10["another engine, different scheduling/feature trade-offs"]
  n1 --> n2
  n3 --> n4
  n5 --> n6
  n7 --> n8
  n9 --> n10
```
**The one operational distinction worth stating precisely in an interview:** choosing "NIM" vs. "vLLM directly" is not choosing a different engine — it's choosing whether you want the production proxy layer (health probes, standardized API, metrics) built and maintained for you, or whether you'll build/maintain that layer yourself around the open-source engine. Conflating "engine choice" with "packaging choice" is the exact category error Chapter 4 warns against with "do not treat product names as the design."

**Diagram: NIM's packaging vs. raw vLLM — same engine, different build responsibility**
```mermaid
flowchart TB
    subgraph NIM["NIM"]
    direction TB
    N1["Production proxy (built/maintained by NVIDIA) - liveness/readiness, OpenAI-compatible API, Prometheus metrics"]
    N2["vLLM engine (the same execution core)"]
    N1 --> N2
    end
    subgraph Raw["Raw vLLM"]
    direction TB
    R1["vLLM engine (the same execution core)"]
    R2["Everything above this line (health probes, API compatibility layer, metrics format) is now YOUR team's build-and-maintain surface"]
    R2 --> R1
    end
```
The execution core is identical either way — the decision is entirely about who owns the operational proxy layer above it.
