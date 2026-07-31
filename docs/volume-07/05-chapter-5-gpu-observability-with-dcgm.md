---
title: "Chapter 5 - GPU observability with DCGM"
slug: "chapter-5-gpu-observability-with-dcgm"
sidebar_position: 5
description: "Chapter 5 - GPU observability with DCGM — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Separate device health/utilization from workload demand and performance.


DCGM Exporter can expose GPU utilization, framebuffer memory, temperature, power and error/health-related metrics to Prometheus. Add Kubernetes ownership labels/joins so engineers can answer “which workload owns this GPU?” rather than staring at GPU index numbers.

For inference autoscaling, queue/demand metrics from the serving layer may be stronger triggers. For training, step time and collective/network behavior should be correlated with device utilization. The operational model is multi-layer.

## Practitioner lens


<!-- source-table:2 -->

> Sagar Desai: GPU utilization is not service saturation A public post illustrates the distinction between DCGM hardware metrics and inference-server queue/request metrics. Use GPU telemetry to understand the device; use service telemetry to understand user demand and SLO saturation.


[Public source](https://www.linkedin.com/posts/sagar-s-desai_kubernetes-gpu-nvidia-activity-7413160079337684992-fOZI)
