---
title: Chapter 12 — Volume 11 Summary
description: Consolidate the architecture and operational principles of GPU sharing.
sidebar_position: 13
tags: [gpu-sharing, summary, architecture]
---

# Volume 11 Summary

GPU sharing is a service design, not merely a device-plugin setting.

## Architecture Summary

- **Time-slicing** increases access but provides weak performance and memory isolation.
- **MIG** creates profile-based hardware partitions on supported GPUs.
- **vGPU** integrates GPU sharing into a virtual-machine lifecycle.
- **Whole-GPU allocation** remains appropriate for strict performance, large memory, and sensitive workloads.

## Decision Sheet

| Requirement | Preferred starting point |
|---|---|
| Best-effort bursty development | Time-slicing |
| Predictable partition and memory boundary | MIG |
| VM-centric enterprise isolation | vGPU |
| Maximum performance or strict determinism | Whole GPU |

## Production Checklist

- workload classes documented;
- sharing guarantees explicit;
- node pools standardized;
- quotas and admission enforced;
- profile inventory monitored;
- SLOs tied to application outcomes;
- reconfiguration and rollback tested;
- capacity includes maintenance and failure reserve.

## Interview Notes

Be prepared to explain why utilization alone is not a sharing strategy, how MIG fragmentation occurs, why time-slicing is not hard isolation, and how Kubernetes policy expresses different service classes.

## Next Volume

Volume 12 moves from resource sharing to production AI inference, where batching, memory, queueing, and serving runtimes determine user-visible latency and throughput.
