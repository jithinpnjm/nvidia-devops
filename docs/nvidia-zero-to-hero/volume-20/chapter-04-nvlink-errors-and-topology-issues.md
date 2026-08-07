---
title: "NVLink Errors and Topology Issues"
slug: "nvlink-errors-topology-issues"
sidebar_position: 4
description: "Diagnose and resolve NVLink communication failures, degraded links, and topology misconfigurations."
---

## Symptoms

- NVLink error counters increment in DCGM
- GPU-to-GPU communication falls back to PCIe (10x slower)
- `nvidia-smi topo -m` shows no NVLink connections between GPUs expected to be connected
- Specific GPU pairs fail to communicate efficiently
- AllReduce latency 2-3x worse than expected

## Evidence

### Key Metrics to Collect

- DCGM NVLink error counters
- `nvidia-smi topo -m` output
- Physical topology validation
- AllReduce latency per GPU pair
- dmesg for PCIe errors

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

