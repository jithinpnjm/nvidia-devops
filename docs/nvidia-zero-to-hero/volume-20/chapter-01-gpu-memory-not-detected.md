---
title: "GPU Memory Not Detected"
slug: "gpu-memory-not-detected"
sidebar_position: 1
description: "Diagnose and resolve scenarios where GPU memory is unavailable, undetected, or unavailable to CUDA applications."
---

## Symptoms

- CUDA applications report insufficient memory despite GPU having ample capacity
- `nvidia-smi` shows `0 MiB` memory available
- `cudaGetDeviceProperties()` returns `totalGlobalMem = 0`
- Job fails during GPU memory allocation phase

## Evidence

### Key Metrics to Collect

- Memory reported by `nvidia-smi -q`
- CUDA API memory queries (`cudaMallocManaged`, `cudaGetDeviceProperties`)
- Memory fragmentation state
- GPU reset history
- Driver version compatibility

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

