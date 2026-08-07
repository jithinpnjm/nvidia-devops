---
title: Chapter 11 — Performance Engineering and Troubleshooting
description: Learn how to measure MFU/HFU, profile NCCL, use Nsight Systems, and identify training bottlenecks.
sidebar_position: 12
tags: [performance, profiling, troubleshooting, mfu]
---

# Chapter 11: Performance Engineering and Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Foundations |
| Difficulty | Expert |
| Estimated reading time | 80 minutes |
| Primary audience | Performance Engineers, Infrastructure Specialists, ML Platform Teams |
| Core question | How do we measure and optimize GPU utilization in distributed training? |

## WHY

You have successfully launched a distributed training job across 512 GPUs. It runs without crashing. However, the data scientists complain that it is only processing 1,000 tokens per second, and the cloud bill is accumulating rapidly. 

The problem this solves is determining *why* the cluster is slow. Is the GPU starved for data? Is the network bottlenecked? Is the batch size too small? Performance engineering turns vague complaints into actionable hardware or software fixes.

## WHAT

To know if you are slow, you must know what "fast" looks like. We use two key metrics:

### Model Flops Utilization (MFU)
MFU measures how efficiently the model utilizes the theoretical maximum compute of the GPU, independent of hardware specifics. 
`$$ MFU = \frac{Achieved FLOPs/sec}{Peak Theoretical FLOPs/sec} $$`
For LLM training, 40-50% MFU is considered excellent. If your MFU is 15%, something is severely broken.

### Hardware Flops Utilization (HFU)
HFU measures the physical execution efficiency. While MFU focuses on the math the model requires, HFU includes the extra math done by the hardware (e.g., recomputation). HFU will always be higher than MFU.

## HOW

You cannot guess where the bottleneck is. You must measure it in layers.

### Level 1: System Metrics (Prometheus/Grafana)
Look at macroscopic trends.
- **GPU Utilization:** If it's 100%, you are compute-bound.
- **Network TX/RX:** If it hits the theoretical max of your NICs, you are network-bound.
- **CPU Utilization:** If CPU is at 100% or IO wait is high, dataloaders are too slow.

### Level 2: Micro-Profiling with Nsight Systems
When you need to see exactly what a single GPU is doing at the microsecond level, use NVIDIA Nsight Systems (`nsys`). It generates a timeline showing exactly when the GPU is calculating matrix multiplications and when it is blocked waiting for memory or network.

## WHEN

You apply performance engineering techniques *when* setting up a new cluster, *when* transitioning to a new model architecture, or *when* unexplained performance degradations appear in production. Do not wait for a full job to finish before optimizing.

## TRADEOFFS

The easiest way to increase MFU is to increase the batch size. Larger matrices allow Tensor Cores to run at maximum efficiency.

| Metric | Small Batch Size | Large Batch Size |
|---|---|---|
| **MFU** | Low (GPUs wait for next instruction) | High (Compute units are saturated) |
| **VRAM Usage** | Low | High (Risk of OOM) |
| **Communication Overhead**| High relative to compute | Low relative to compute |

## PRODUCTION

In a production setting, you must automate the detection of stragglers. Because collectives are synchronous, the entire cluster runs at the speed of the slowest rank.

**Q: Explain the difference between compute-bound and memory-bandwidth-bound operations.**
**A:** Compute-bound operations (like large matrix multiplications) are limited by the raw calculation speed of the GPU's ALUs/Tensor Cores. Memory-bound operations (like LayerNorm) do very little math but require reading/writing large amounts of data to VRAM. They are limited by VRAM bandwidth.

## TROUBLESHOOTING

### Scenario 1: The Dataloader Bottleneck

**Symptom:** GPUs sit at 30% utilization. MFU is 10%. 
**Diagnosis:** The CPUs cannot read images/text from the disk fast enough to feed the GPUs. 
**Evidence vs. Proof:** Low GPU util, high CPU IO wait is evidence. This proves the GPU is starved. It *does not* prove the disk is slow. The Python dataloader might be single-threaded.
**Resolution:** Profile the Python process and increase the number of dataloader workers. Move augmentations to the GPU.
```bash
# Check CPU IO wait percentages
iostat -x 1
# Nsys profiling to confirm CPU wait
nsys profile -t cuda,osrt,nvtx -o dataloader_trace python train.py
```

### Scenario 2: Severe Straggler Node

**Symptom:** You are running 64 nodes. Nsight Systems shows that all GPUs wait an extra 200ms during the All-Reduce phase.
**Diagnosis:** One node or one network link is slower than the rest. 
**Evidence vs. Proof:** Nsight timeline shows long NCCL `Wait` states on 63 nodes. This proves 63 nodes are waiting for 1 node. You must identify which node is *not* waiting (it is the one doing the work slowly).
**Resolution:** Use `nccl-tests` across node pairs or inspect dmesg to identify hardware degradation like PCIe AER errors, then cordon the node.
```bash
# Check for Advanced Error Reporting (AER) PCIe hardware errors
dmesg | grep -i "AER"
# Cordon the node in Kubernetes to prevent scheduling
kubectl cordon node-14-straggler
```
