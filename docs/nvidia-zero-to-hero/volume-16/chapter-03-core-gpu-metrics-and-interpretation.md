---
title: "Chapter 3 — Core GPU Metrics and Interpretation"
sidebar_position: 3
description: "Decode the telemetry. Learn how to interpret GPU utilization, memory bandwidth, SM occupancy, and thermal throttling indicators."
---

# Chapter 3 — Core GPU Metrics and Interpretation

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability, Profiling, and Diagnosis |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Performance Engineers |
| Core question | If `nvidia-smi` shows the GPU is at 100% utilization, but the Tensor Cores are at 5% utilization, what is the GPU actually doing? |

## Introduction

Extracting metrics from the GPU is easy. Understanding what those metrics actually mean is the hallmark of a Senior Architect.

Junior engineers look at a single metric: `GPU Utilization`. If it says 100%, they assume the system is healthy. This is a catastrophic misinterpretation of hardware telemetry. 

To diagnose AI performance bottlenecks, you must decompose the GPU into its functional blocks: the Streaming Multiprocessors (SMs), the Tensor Cores, the Memory Controllers, and the PCIe/NVLink interconnects.

## 1. The Fallacy of "GPU Utilization"

When you run `nvidia-smi`, the metric labeled `GPU-Util` is highly misleading. 

**What it actually means:** The percentage of time over the past sample period during which *one or more kernels were executing on the GPU*. 

If you write a terrible Python script that transfers a 1MB file to the GPU, executes a tiny addition operation, and copies the result back, `GPU-Util` might show 100%. The GPU is "active." But because the math is so tiny, 99% of the billions of transistors on the die are completely idle. 

You must look deeper at **SM Utilization** and **Tensor Core Activity**. 

## 2. The Core Diagnostic Metrics (DCGM)

When querying Prometheus (via DCGM Exporter), focus on these specific metrics:

### Compute Metrics
*   `DCGM_FI_PROF_SM_ACTIVE`: What percentage of the Streaming Multiprocessors actually have work assigned to them? (This is the true measure of compute utilization).
*   `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE`: What percentage of the time are the specialized Tensor Cores actually performing matrix multiplication? (If this is low during an LLM training run, you are using the wrong data types, e.g., FP32 instead of FP16/BF16, and the Tensor Cores are being bypassed).

### Memory Metrics
*   `DCGM_FI_DEV_MEM_COPY_UTIL`: How heavily are the memory controllers being taxed reading/writing to VRAM? (If this is 100% but SM Active is low, you are Memory Bandwidth Bound).
*   `DCGM_FI_PROF_PCIE_TX_BYTES` / `RX_BYTES`: Traffic over the PCIe bus. (If this is pinned at maximum, the Host CPU is likely bottlenecking the GPU by acting as a bounce buffer, as discussed in Volume 15).

### Environmental Metrics (The Silent Killers)
*   `DCGM_FI_DEV_GPU_TEMP`: The core temperature. 
*   `DCGM_FI_DEV_CLOCK_THROTTLE_REASONS`: This is critical. If the GPU gets too hot, it will instantly downclock itself (HW Slowdown) to prevent melting. The GPU will still report 100% utilization, but it is running at half speed.

## Customer Scenario (Senior Level)

**The Situation:**
A data science team submits a ticket stating that their PyTorch training job is running 3x slower than expected on a new A100 cluster. They provide a screenshot of `nvidia-smi` showing all GPUs running at 100% `GPU-Util`. They request that the infrastructure team upgrade the storage array, assuming data starvation is the issue.

**The Senior Architect Response:**
"The screenshot of `nvidia-smi` is insufficient evidence to demand a million-dollar storage upgrade. `GPU-Util` only proves the GPU is awake; it does not prove it is doing useful math.

We will bypass `nvidia-smi` and query the deep hardware metrics stored in Prometheus via the **DCGM Exporter**. 

First, we will look at `DCGM_FI_PROF_PCIE_RX_BYTES`. If the PCIe bus bandwidth is low, the storage array is not the bottleneck; the GPU already has the data. 
Next, we will look at the compute execution metrics: `DCGM_FI_PROF_SM_ACTIVE` and `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE`. 

We discover that the SMs are highly active, but the Tensor Core activity is near 0%. 

This reveals the true root cause: A software configuration error. The data science team has written their PyTorch code using standard 32-bit floating-point (FP32) precision. The A100's massive computational power comes from its Tensor Cores, which natively accelerate 16-bit (FP16/BF16) math. Because the code is demanding FP32, the workload is bypassing the Tensor Cores entirely and falling back to the standard, much slower CUDA cores. 

The infrastructure is healthy. We must instruct the data science team to enable **Automatic Mixed Precision (AMP)** in their PyTorch training loop. This simple software change will route the matrix math to the Tensor Cores, instantly tripling their training speed without touching the storage array."

## Interview Preparation

**Conceptual:** Why is the `GPU-Util` metric in `nvidia-smi` often misleading when diagnosing performance bottlenecks? *(Hint: `GPU-Util` simply measures the percentage of time a kernel was active on the GPU. It does not measure how many of the GPU's billions of transistors were actually used. A poorly optimized script can show 100% `GPU-Util` while leaving the specialized Tensor Cores and memory bandwidth completely idle).*

**Architecture:** If an AI training job is running slowly, but GPU compute utilization is high, which specific DCGM metric would you check to rule out thermal issues? *(Hint: You must check `DCGM_FI_DEV_CLOCK_THROTTLE_REASONS`. If a GPU overheats, it will automatically throttle its clock speed to prevent physical damage. The GPU will still appear to be at 100% utilization, but it is processing math at a fraction of its normal speed. Monitoring the throttle reason mathematically proves whether cooling is the bottleneck).*
