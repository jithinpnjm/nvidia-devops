---
title: "Senior Deep Dive 3 — NIM, vLLM, TensorRT-LLM and serving boundaries"
slug: "senior-deep-dive-3-nim-vllm-tensorrt-llm-and-serving-boundaries"
sidebar_position: 12
description: "Senior Deep Dive 3 — NIM, vLLM, TensorRT-LLM and serving boundaries — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
An inference engine optimizes model execution; a serving product adds packaging, health, security, lifecycle and operational contracts. NVIDIA NIM for LLMs currently packages vLLM behind a production-oriented proxy with liveness/readiness, OpenAI-compatible inference endpoints and Prometheus-compatible metrics. TensorRT-LLM provides NVIDIA-optimized inference capabilities, while vLLM and SGLang are widely used engines with different feature/performance trade-offs. An SA should compare workloads and operational requirements rather than treating engines as interchangeable labels.
