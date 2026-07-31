---
title: "Senior Deep Dive 5 — Autoscaling inference from work, not only CPU"
slug: "senior-deep-dive-5-autoscaling-inference-from-work-not-only-cpu"
sidebar_position: 14
description: "Senior Deep Dive 5 — Autoscaling inference from work, not only CPU — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
CPU utilization is usually a weak signal for GPU inference. Better scaling signals include queue depth, pending tokens, request concurrency, TTFT/ITL SLOs, KV pressure and engine-specific utilization. Scaling too slowly violates latency; scaling too aggressively incurs model-load cost and wastes scarce GPUs. Model load time can be minutes, so predictive capacity, warm pools and staged rollout may outperform reactive HPA alone.

Run:ai and similar workload managers add scheduling and allocation capabilities above Kubernetes. Current NVIDIA enterprise reference architecture material demonstrates scaling NIM workloads and fractional GPU scheduling as a utilization/TCO lever. Treat results as workload-specific; validate your model, sequence-length distribution, concurrency and SLO.
