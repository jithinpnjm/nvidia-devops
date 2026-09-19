---
title: "Chapter 4 — GPU Memory and Utilization Troubleshooting"
sidebar_position: 4
description: "Master advanced diagnostics. Learn how to definitively prove whether a performance drop is caused by hardware degradation or software inefficiency."
---

# Chapter 4 — GPU Memory and Utilization Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 19 — AI SRE and Operations |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Performance Engineers |
| Core question | If `nvidia-smi` shows the GPU running at 100%, how do you prove it's actually just spinning in an infinite software loop doing zero useful AI math? |

## Introduction

In Volume 16, we introduced the concept that `GPU-Util` is a misleading metric. 

When a multi-million dollar training job suddenly slows down by 30%, the AI researchers will invariably blame the infrastructure. They will say the GPUs are degraded, or the network is broken. 

As a Senior SRE, you cannot argue with researchers using opinions. You must argue using silicon telemetry. This chapter provides the exact diagnostic workflows required to conclusively isolate memory fragmentation, thermal throttling, and fake utilization.

## 1. Debunking "100% Utilization"

If `nvidia-smi` shows 100% utilization, but the epoch time is slow, the GPU is suffering from a stall condition. 

You must query DCGM:
*   **The PCIe Stall:** Check `DCGM_FI_PROF_PCIE_RX_BYTES`. If this is maxed out, the GPU is spending 100% of its time copying data from the CPU across the slow PCIe bus. The code is missing `pin_memory=True` or transferring data batch-by-batch instead of using GPU Direct Storage.
*   **The Precision Stall:** Check `DCGM_FI_PROF_PIPE_FP16_ACTIVE` vs `FP32_ACTIVE`. If FP32 is high and FP16 is zero, the data scientists forgot to enable Automatic Mixed Precision (AMP). The GPU is forcing the slow standard CUDA cores to do heavy math, completely bypassing the ultra-fast Tensor Cores. 

## 2. Memory Fragmentation and OOMs

An Out-of-Memory (OOM) error usually doesn't mean the GPU is full; it means the memory is fragmented.

PyTorch allocates memory in large blocks. If it allocates, deletes, and allocates hundreds of tensors rapidly (e.g., during the forward pass), the 80GB VRAM becomes swiss cheese. 
There might be 20GB of total "free" memory, but it consists of ten thousand tiny 2MB gaps. When PyTorch requests a single contiguous 5GB block for the next layer, the allocator fails, and the job hard-crashes with a `CUDA OOM`.

**The Diagnostic Proof:**
Tell the researchers to print the PyTorch memory summary: `print(torch.cuda.memory_summary())`. 
Look at the `Max Reserved` vs `Max Allocated` stats. If Reserved is 80GB but Allocated is only 40GB, PyTorch is holding massive amounts of fragmented, unusable memory hostage from the OS. 

**The Fix:**
Force the researchers to implement `torch.cuda.empty_cache()` at strategic points (though this hurts performance), or properly configure **Activation Checkpointing** to prevent the fragmentation entirely.

## 3. Hardware Degradation (The Silent Throttler)

Sometimes, the researchers are right. The hardware is broken.

GPUs run incredibly hot. If a fan fails in a server chassis, or the data center HVAC glitches, the GPU temperature will climb rapidly.
NVIDIA GPUs are designed to protect themselves. When they hit a specific thermal threshold (e.g., 85°C), they do not crash. They instantly, silently drop their clock speed (e.g., from 1500 MHz down to 500 MHz). 

The `nvidia-smi` utilization will still show 100%. The job will not crash. But the math will take 3 times longer to execute. 

**The Diagnostic Proof:**
You must constantly monitor `DCGM_FI_DEV_CLOCK_THROTTLE_REASONS`. 
If this metric registers `HW_SLOWDOWN` or `THERMAL_SYNC`, you have absolute proof of hardware degradation. 

## Customer Scenario (Senior Level)

**The Situation:**
A trading firm runs a latency-critical reinforcement learning model on bare-metal A100 nodes. Every afternoon at 2:00 PM, the training iteration time unpredictably spikes by 40%. The researchers blame the infrastructure team, claiming the network switches are congested. The network team proves the switches are mostly idle. The teams are deadlocked.

**The Senior Architect Response:**
"The network team is correct; the bottleneck is not the InfiniBand switches. We are suffering from **Thermal Throttling caused by Data Center Environmental variations**.

Because this issue occurs predictably at 2:00 PM every day, it strongly correlates with peak external environmental temperatures, which often strain the data center's HVAC cooling capacity. 

To prove this, we will query Prometheus for the deep DCGM hardware telemetry during the 2:00 PM window. We will specifically overlay the `DCGM_FI_DEV_GPU_TEMP` (GPU Temperature) metric with the `DCGM_FI_DEV_CLOCK_THROTTLE_REASONS` metric.

We will immediately see that at exactly 2:00 PM, the GPU temperatures hit the hard thermal limit (e.g., 85°C). In response, the NVIDIA driver aggressively engaged a `HW_SLOWDOWN`, intentionally slashing the GPU clock speeds to prevent the silicon from melting. Because the clock speeds were halved, the reinforcement learning matrix math took twice as long to execute, causing the 40% spike in iteration time. 

The application is completely healthy, and the network is fine. We must immediately escalate this to the Data Center Facilities Management team to resolve the localized HVAC cooling failure in that specific server rack."

## Interview Preparation

**Conceptual:** If a PyTorch training job crashes with a `CUDA Out of Memory` error, but standard monitoring tools showed 15GB of free VRAM right before the crash, what happened? *(Hint: Memory Fragmentation. The 15GB of free VRAM was not contiguous; it was chopped up into thousands of tiny gaps. When PyTorch requested a single large block of memory for the next mathematical operation, the allocator could not find a large enough continuous space, causing the OOM crash despite the total 'free' capacity).*

**Architecture:** Why is relying on `nvidia-smi` to detect a thermal issue dangerous for an SRE? *(Hint: `nvidia-smi` is a point-in-time snapshot tool. Thermal throttling events can happen in microsecond bursts, causing severe application latency without pushing the average temperature up permanently. SREs must use continuous telemetry (DCGM Exporter) to actively monitor the `CLOCK_THROTTLE_REASONS` register, which mathematically records exactly when and why the hardware was forced to downclock itself).*
