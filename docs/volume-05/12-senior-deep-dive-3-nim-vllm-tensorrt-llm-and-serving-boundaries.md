---
title: "Senior Deep Dive 3 — NIM, vLLM, TensorRT-LLM and serving boundaries"
slug: "senior-deep-dive-3-nim-vllm-tensorrt-llm-and-serving-boundaries"
sidebar_position: 12
description: "Senior Deep Dive 3 — NIM, vLLM, TensorRT-LLM and serving boundaries — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
An inference engine optimizes model execution; a serving product adds packaging, health, security, lifecycle and operational contracts. NVIDIA NIM for LLMs currently packages vLLM behind a production-oriented proxy with liveness/readiness, OpenAI-compatible inference endpoints and Prometheus-compatible metrics. TensorRT-LLM provides NVIDIA-optimized inference capabilities, while vLLM and SGLang are widely used engines with different feature/performance trade-offs. An SA should compare workloads and operational requirements rather than treating engines as interchangeable labels.

## Senior addendum

➕ **Cross-reference:** this is the named-products version of Chapter 4's platform-boundary diagram — read Chapter 4 first for the mechanism (gateway vs. model server vs. GPU resource boundary); this Deep Dive just maps real product names onto that diagram's middle layer:
```mermaid
flowchart TD
  Layer["Model-server layer: similar names, different boundaries"]
  Layer --> Triton["Triton — general-purpose serving platform; multi-framework and multi-backend"]
  Layer --> NIM["NIM — packages vLLM with a production proxy for health, OpenAI API, and metrics"]
  Layer --> VLLM["vLLM — the engine NIM packages; also usable directly without NIM packaging"]
  Layer --> TRT["TensorRT-LLM — NVIDIA-optimized engine with a different performance/feature profile from vLLM"]
  Layer --> SGLang["SGLang — another engine with different scheduling and feature trade-offs"]
```
➕ **The one operational distinction worth stating precisely in an interview:** choosing "NIM" vs. "vLLM directly" is not choosing a different engine — it's choosing whether you want the production proxy layer (health probes, standardized API, metrics) built and maintained for you, or whether you'll build/maintain that layer yourself around the open-source engine. Conflating "engine choice" with "packaging choice" is the exact category error Chapter 4 warns against with "do not treat product names as the design."

➕ **Diagram: NIM's packaging vs. raw vLLM — same engine, different build responsibility**
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
