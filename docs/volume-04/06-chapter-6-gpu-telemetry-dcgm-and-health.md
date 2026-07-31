---
title: "Chapter 6 - GPU telemetry, DCGM and health"
slug: "chapter-6-gpu-telemetry-dcgm-and-health"
sidebar_position: 6
description: "Chapter 6 - GPU telemetry, DCGM and health — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Interpret hardware telemetry in the context of workload performance and distinguish demand, health and throttling.


DCGM provides health/telemetry/diagnostic capabilities for NVIDIA GPUs in data-center environments, and dcgm-exporter exposes metrics to Prometheus. Typical operational dimensions include utilization, framebuffer memory use, temperature, power, clocks and error/health counters. Device metrics need ownership labels so you can map them to node, Pod, namespace and workload.


<!-- source-table:2 -->

```text
# Prometheus-style examples vary by exporter version/config
DCGM_FI_DEV_GPU_UTIL
DCGM_FI_DEV_FB_USED
DCGM_FI_DEV_FB_FREE
DCGM_FI_DEV_POWER_USAGE
```


Autoscaling is a separate concern: device utilization helps explain hardware state, but inference demand may be better represented by request concurrency, queue delay, TTFT, throughput or tokens/s depending on the server.
