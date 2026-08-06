---
title: Lab 03 — Validate a GPUDirect Storage Design
description: Verify compatibility, topology, direct-path behavior, fallback, and comparative performance.
sidebar_position: 22
tags: [lab, gpudirect-storage, gds]
---

# Lab 03 — Validate a GPUDirect Storage Design

## Objective

Validate whether a proposed storage-to-GPU path is supported and whether it improves the target workload.

## Prerequisites

Supported GPU and driver, compatible storage or filesystem, required GDS components, approved benchmark, and non-production data.

## Verification

```bash
nvidia-fs --version 2>/dev/null || true
cat /proc/driver/nvidia-fs/status 2>/dev/null || true
nvidia-smi topo -m
```

Record filesystem, mount, NIC or NVMe, GPU, driver, CUDA, and topology.

## Benchmark

Compare the supported direct path and conventional path using the same file, request sizes, alignment, GPU buffers, and cache state.

## Observability

Measure throughput, latency, CPU utilization, memory bandwidth, GPU wait, and fallback indicators.

## Failure Injection

Use an intentionally unsupported alignment or configuration in a test environment and observe fallback or failure behavior.

## Result

Recommend GDS only if the measured workload benefits and the operational compatibility can be maintained.
