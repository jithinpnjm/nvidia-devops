---
title: Chapter 11 — Performance Engineering and Troubleshooting
description: Learn how to measure MFU/HFU, profile NCCL, use Nsight Systems, and identify training bottlenecks.
sidebar_position: 12
tags: [performance, profiling, troubleshooting, mfu]
---

# Performance Engineering and Troubleshooting

## The Problem: "It's Too Slow"

You have successfully launched a distributed training job across 512 GPUs. It runs without crashing. However, the data scientists complain that it is only processing 1,000 tokens per second, and the cloud bill is accumulating rapidly. 

The problem this solves is determining *why* the cluster is slow. Is the GPU starved for data? Is the network bottlenecked? Is the batch size too small? Performance engineering turns vague complaints into actionable hardware or software fixes.

## Key Metrics: MFU and HFU

To know if you are slow, you must know what "fast" looks like.

### Model Flops Utilization (MFU)

MFU measures how efficiently the model utilizes the theoretical maximum compute of the GPU, independent of hardware specifics (like Tensor Cores vs CUDA cores). 

$$ MFU = rac{	ext{Achieved FLOPs/sec}}{	ext{Peak Theoretical FLOPs/sec}} $$

If an H100 has a peak of 989 TFLOPs (FP16), and your job achieves 400 TFLOPs per GPU, your MFU is ~40%. For LLM training, 40-50% MFU is considered excellent. If your MFU is 15%, something is severely broken.

### Hardware Flops Utilization (HFU)

HFU measures the physical execution efficiency. While MFU focuses on the math the model requires, HFU includes the extra math done by the hardware (e.g., recomputation/activation checkpointing). HFU will always be higher than MFU.

## Profiling the Stack

You cannot guess where the bottleneck is. You must measure.

### Level 1: System Metrics (Prometheus/Grafana)
Look at macroscopic trends.
- **GPU Utilization:** If it's 100%, you are compute-bound.
- **Network TX/RX:** If it hits the theoretical max of your NICs, you are network-bound.
- **CPU Utilization / IO Wait:** If CPU is at 100% or IO wait is high, your dataloaders are too slow, starving the GPUs.

### Level 2: NCCL Profiling
If the network seems slow, use `NCCL_DEBUG=INFO` and `nccl-tests` (`all_reduce_perf`).
Compare the *Algorithm Bandwidth* (how fast the data actually moved) against the *Bus Bandwidth* (how efficiently the hardware was used). 

### Level 3: Micro-Profiling with Nsight Systems
When you need to see exactly what a single GPU is doing at the microsecond level, use NVIDIA Nsight Systems (`nsys`).

```bash
nsys profile -t cuda,nvtx,osrt,cudnn -o my_profile python train.py
```
This generates a timeline showing exactly when the GPU is calculating matrix multiplications (GEMMs) and when it is blocked waiting for memory or network (NCCL operations).

## Tradeoff: Batch Size vs Memory

The easiest way to increase MFU is to increase the batch size. Larger matrices allow Tensor Cores to run at maximum efficiency.

| Metric | Small Batch Size | Large Batch Size |
|---|---|---|
| **MFU** | Low (GPUs wait for next instruction) | High (Compute units are saturated) |
| **VRAM Usage** | Low | High (Risk of OOM) |
| **Communication Overhead**| High relative to compute | Low relative to compute |

## Check Your Understanding

**Question 1:** Why is 100% MFU impossible in practice?
*Answer:* 100% MFU assumes the GPU spends zero time loading data from memory, zero time communicating with other GPUs, and perfectly schedules every Tensor Core. Physics and software overhead make this impossible.

**Question 2:** Your Prometheus dashboard shows GPU utilization is fluctuating between 0% and 100% every 5 seconds. What is likely happening?
*Answer:* The GPU is likely waiting for data. It processes a batch instantly (100%), then goes idle (0%) while the CPU loads the next batch from the SSD. This is a dataloader bottleneck.

## Failure Scenarios

### Scenario 1: The Dataloader Bottleneck

**Symptom:** GPUs sit at 30% utilization. MFU is 10%. 
**Diagnosis:** The CPUs cannot read images/text from the disk fast enough to feed the GPUs. 
**Evidence vs. Proof:**
- *Evidence:* Low GPU util, high CPU IO wait.
- *Proof:* This proves the GPU is starved. It *does not* prove the disk is slow. The Python dataloader might be single-threaded or doing heavy image augmentations on the CPU.
**Resolution:**
Increase the number of dataloader workers (e.g., `num_workers=8` in PyTorch). Move augmentations to the GPU using libraries like NVIDIA DALI. Ensure datasets are stored on fast NVMe drives, not slow network mounts.

### Scenario 2: Severe Straggler

**Symptom:** You are running 64 nodes. Nsight Systems shows that all GPUs wait an extra 200ms during the All-Reduce phase.
**Diagnosis:** One node or one network link is slower than the rest. Because collectives are synchronous, the entire cluster runs at the speed of the slowest rank.
**Evidence vs. Proof:**
- *Evidence:* Nsight timeline shows long NCCL `Wait` states on 63 nodes.
- *Proof:* This proves 63 nodes are waiting for 1 node. You must identify which node is *not* waiting (it is the one doing the work slowly). 
**Resolution:**
Use a fabric manager or NCCL logs to find the node with high PCIe error rates or a degraded network link. Isolate and replace the bad hardware.

## Senior Interview Questions

**Q: Explain the difference between compute-bound and memory-bandwidth-bound operations.**
**A:** Compute-bound operations (like large matrix multiplications) are limited by the raw calculation speed of the GPU's ALUs/Tensor Cores. Memory-bound operations (like LayerNorm or activation functions) do very little math but require reading/writing large amounts of data to VRAM. They are limited by the VRAM bandwidth (e.g., 3 TB/s on A100).

**Q: What is Activation Checkpointing (Gradient Recomputation), and how does it affect HFU vs MFU?**
**A:** To save VRAM, you discard intermediate activations during the forward pass and recalculate them during the backward pass. This trades compute for memory. MFU decreases (because you take longer to step through the model), but HFU increases (because the hardware is doing more raw math, even if it's redundant).

## Glossary

- **MFU:** Model Flops Utilization. Efficiency of the model's math.
- **HFU:** Hardware Flops Utilization. Efficiency of the hardware's math (includes recomputation).
- **Straggler:** A single slow component that delays the entire distributed system.
- **nsys:** NVIDIA Nsight Systems, a profiling tool.

## Ready to Continue Checklist

- [ ] I can explain the difference between MFU and HFU.
- [ ] I know how to use `nsys` to profile a training loop.
- [ ] I understand how a slow dataloader impacts GPU utilization.
- [ ] I can identify the symptoms of a straggler node.








































































































































