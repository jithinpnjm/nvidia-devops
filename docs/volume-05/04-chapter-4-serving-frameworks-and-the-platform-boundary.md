---
title: "Chapter 4 - Serving frameworks and the platform boundary"
slug: "chapter-4-serving-frameworks-and-the-platform-boundary"
sidebar_position: 4
description: "Chapter 4 - Serving frameworks and the platform boundary — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Place Triton, NIM, vLLM and application gateways in an architecture without treating product names as the design.


A model server owns model execution, batching/scheduling and model-specific runtime behavior. NVIDIA Triton provides a general inference serving platform; NIM packages optimized model inference into standardized service containers/APIs; vLLM is a popular LLM-serving engine. The gateway layer can handle authentication, routing, quotas, request logging, canary/version routing and tenant controls independently of the model server.

Benchmark engines on the target model, precision, GPU and request distribution. Do not choose an engine solely from a public benchmark with a different workload.


<!-- source-table:2 -->

```text
# Example Kubernetes resource boundary (illustrative)
resources:
  requests:
    nvidia.com/gpu: 1
    cpu: "4"
    memory: 16Gi
  limits:
    nvidia.com/gpu: 1
    memory: 24Gi
```
