---
title: "Lab 02 — Root Cause Analysis"
slug: "lab-02-root-cause-analysis"
sidebar_position: 2
description: "Given raw metric data, trace the chain from symptom to root cause."
---

## Objective

Practice analyzing real metric data to narrow down root cause from multiple possible explanations. Learn when correlations mislead and how to distinguish root causes from symptoms.

## Duration

90 minutes

## Prerequisites

- Understanding of GPU metrics (utilization, memory, temperature, power)
- Familiarity with profiler output (Nsight Systems, PyTorch profiler)
- Knowledge of distributed training concepts

## Exercises

### Exercise 1: Thermal or Power?

You observe:
- GPU utilization: 95% (stable)
- GPU memory: 70% (stable)
- GPU temperature: 80°C (rising)
- GPU clock speed: 1.8 GHz (down from 2.5 GHz)
- GPU power: 250W (down from 350W)
- Fan speed: 100%

Is this thermal throttling or power limiting? Construct your evidence chain.

### Exercise 2: Which GPU is the Straggler?

Four GPUs in AllReduce:
- GPU 0: 12ms AllReduce latency
- GPU 1: 12ms AllReduce latency
- GPU 2: 125ms AllReduce latency (stalled)
- GPU 3: 12ms AllReduce latency

Evidence available:
- NVLink topology matrix
- Per-GPU iteration timing
- NCCL_DEBUG trace (partial)

Determine: Is GPU 2 slow, or is GPU 2 waiting for something else?

### Exercise 3: The Intermittent Failure

Job sometimes slow, sometimes fast. No consistent pattern.

Given metrics:
- Utilization: always 85-95%
- Temperature: 65-70°C (healthy)
- Memory: stable
- Power: stable
- Performance: varies 50% (1000 samples/sec → 500 samples/sec)

What is your hypothesis? What evidence would you collect to distinguish between causes?

## Expected Outcomes

- You can analyze metric data and eliminate false hypotheses
- You understand the causal chain from root cause to symptom
- You know when correlation ≠ causation

## Verification

Compare your analysis to the chapter's diagnostic procedures. Did you reach the correct root cause?

