---
title: "Multi-GPU Imbalance and Straggler Detection"
slug: "multi-gpu-imbalance-straggler-detection"
sidebar_position: 11
description: "Detect and diagnose performance imbalance across multiple GPUs, identify stragglers, and resolve load distribution issues."
---

## Symptoms

- Distributed training throughput 40-60% lower than expected on N GPUs
- One or two GPUs complete iterations 5-10x slower than others
- AllReduce latency varies 10x depending on which GPU initiates
- Iteration time histograms show bimodal distribution
- Specific GPU always waits for others in synchronization

## Evidence

### Key Metrics to Collect

- Per-GPU iteration timing from profiler
- Per-GPU throughput (samples/sec)
- AllReduce latency matrix (GPU_i → GPU_j)
- GPU utilization and memory usage across the cluster
- Thermal and power state differences between GPUs

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

