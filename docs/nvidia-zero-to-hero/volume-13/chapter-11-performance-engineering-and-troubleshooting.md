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

### Worked Example: Computing MFU for a 70B Model on 8 H100s

Take the standard approximation that training a transformer costs roughly `6 × N × tokens` FLOPs per step (2N for the forward pass, 4N for the backward pass, where N is non-embedding parameter count — a widely used rule of thumb, not an exact count, since it ignores attention's quadratic term and embedding/lm_head costs).

**Before optimization** (this is the dataloader-bottlenecked run from Scenario 1 below): measured throughput is 3,200 tokens/sec aggregate across 8 GPUs.

```
Achieved FLOPs/sec = 6 × 70×10⁹ params × 3,200 tokens/sec ≈ 1.34 × 10¹⁵ = 1,344 TFLOPS

Peak theoretical (8× H100 SXM, BF16 Tensor Core, dense, no sparsity):
  ~989 TFLOPS/GPU × 8 = ~7,912 TFLOPS
  (989 TFLOPS is NVIDIA's published dense BF16 figure for H100 SXM;
   treat it as approximate since exact numbers vary slightly by SKU/clock)

MFU = 1,344 / 7,912 ≈ 17%
```

17% MFU with healthy-looking GPU utilization numbers (Scenario 1 below shows GPUs pegged at 30%, which is itself the tell — low GPU utilization directly caps achievable MFU) is a clear signal of a non-compute bottleneck, consistent with a dataloader starving the GPUs of work.

**After fixing the dataloader bottleneck** (more workers, GPU-side augmentation): measured throughput rises to 9,000 tokens/sec.

```
Achieved FLOPs/sec = 6 × 70×10⁹ × 9,000 ≈ 3.78 × 10¹⁵ = 3,780 TFLOPS
MFU = 3,780 / 7,912 ≈ 48%
```

48% MFU is squarely in the "excellent" range this chapter's WHAT section describes — this is the kind of before/after number a performance engineer should be able to produce to justify the dataloader fix to a data science team asking "why did the cluster bill just look better."

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

### Scenario 3: High GPU Utilization, Low MFU

**Symptom:** `nvidia-smi` reports 98-100% GPU utilization on every rank — by the naive read, the GPUs look maximally busy — yet the MFU calculation (as in the worked example above) comes out to only 22%, and step time is roughly double what the model's FLOP count would predict at a reasonable MFU.

**Diagnosis:** `nvidia-smi`'s utilization metric measures the fraction of time *any* kernel is running on the GPU, not how efficiently that kernel uses the GPU's compute units — a GPU can show 100% utilization while running small, memory-bound kernels (e.g., many tiny matrix multiplications from a poorly batched or non-fused attention implementation) that never come close to saturating the Tensor Cores. This is a common trap: engineers see 100% `nvidia-smi` utilization and conclude the GPU is the bottleneck, when the real issue is *how* it's being used, not *whether* it's busy.

**Evidence vs. Proof:** High `nvidia-smi` utilization is evidence the GPU is not idle. It is not proof the GPU is doing useful, well-shaped work — that requires a kernel-level breakdown, not a coarse utilization percentage.

**Resolution:** Use `nsys profile` with CUDA kernel tracing to see the actual kernel launch pattern; look for excessive numbers of small kernel launches (a sign of missing operator fusion) or Tensor Core utilization specifically (via Nsight Compute, `ncu`, which reports achieved vs. peak Tensor Core throughput per kernel, unlike `nsys` or `nvidia-smi`).

```bash
# Coarse timeline: confirms *when* the GPU is busy, not *how efficiently*
nsys profile -t cuda,nvtx -o mfu_trace python train.py

# Kernel-level: reports achieved Tensor Core throughput vs. peak per kernel
ncu --metrics sm__throughput.avg.pct_of_peak_sustained_elapsed python train.py
```

## Interview Preparation

**Conceptual:** "A colleague says '`nvidia-smi` shows 100% GPU utilization, so we're fully compute-bound and there's nothing left to optimize.' Do you agree?"

**Model Answer:** "Not necessarily, and this is a common misreading of that metric. `nvidia-smi`'s utilization number just means the GPU had at least one kernel executing during the sampling window — it says nothing about how much of the GPU's Tensor Core or ALU capacity that kernel actually used. A GPU can be at 100% utilization while running small, unfused, memory-bound kernels that leave most of the Tensor Cores idle within each kernel call. The metric that actually answers 'are we compute-bound and efficient' is MFU — achieved FLOPs per second divided by the hardware's theoretical peak. I'd compute that using the model's known FLOPs-per-token cost and measured tokens/sec, and if MFU is well below the 40-50% range considered good for LLM training despite 100% `nvidia-smi` utilization, that's actually a strong signal of a kernel-efficiency problem — missing operator fusion, suboptimal tile sizes, or too small a batch size to saturate the Tensor Cores — not evidence there's nothing to optimize."

**Architecture:** "You're asked to build a standard performance-debugging playbook for a team that will run this on every new large training job. What's the order of investigation, and why that order?"

**Model Answer:** "I'd structure it from cheapest-to-check and most-likely to least-likely, which also happens to go from macro to micro. First, system-level metrics — Prometheus/Grafana dashboards for GPU utilization, network TX/RX, and CPU/IO-wait — because these are already being collected and can rule out entire categories in seconds: if GPU utilization is low and CPU IO-wait is high, it's almost certainly a dataloader problem, not a kernel or network issue. Second, if GPU utilization is high but MFU (computed from throughput and the model's known FLOP cost) is low, that points at kernel efficiency, and I'd reach for Nsight Compute to check achieved Tensor Core throughput on the hot kernels. Third, if GPU utilization is high and MFU is genuinely good but wall-clock step time is still worse than expected, I'd suspect a straggler or communication bottleneck, and use `nsys` to look at per-rank timelines for long `Wait` states in collectives. Doing it in this order avoids the common mistake of jumping straight to microsecond-level `nsys`/`ncu` profiling before ruling out simple, high-probability causes like a starved dataloader."

**Troubleshooting:** "MFU was steady at 45% for the first several hours of a training run, then gradually declined to 28% over the next day with no configuration changes. What's your hypothesis?"

**Model Answer:** "A gradual decline over hours, rather than a sudden drop, points at something accumulating or degrading over time rather than a one-time misconfiguration — which rules out most of the static causes like a bad parallelism config, since those would show up as a wrong number from the very first step. My first hypothesis is thermal throttling: as the room or rack heats up under sustained full load, GPUs can clock down to stay within thermal limits, which directly reduces achieved FLOPs/sec while leaving `nvidia-smi` utilization looking unchanged — I'd check `nvidia-smi -q -d TEMPERATURE,CLOCK` history for a correlated decline in SM clock speed. Second, I'd check for a slowly growing straggler — a GPU with degrading ECC error rates or a marginal NVLink connection sometimes gets progressively slower rather than failing outright, and because collectives run at the speed of the slowest rank, that alone would show up in the aggregate MFU number. Third, I'd rule out a storage-side cause: if checkpoint writes are getting progressively slower (e.g., filesystem fragmentation or growing contention from other tenants, as in Chapter 9's checkpoint-slowdown scenario) and checkpointing isn't fully asynchronous, that overhead compounds into the aggregate throughput number over the course of a day."

## Related Chapters

- **Previous:** [Chapter 10 — Multi-Node Training Architecture](./chapter-10-multi-node-training-architecture.md)
- **Next:** [Chapter 12 — Volume 13 Summary](./chapter-12-volume-13-summary.md)
- **Related:** [Chapter 9 — Checkpointing and Recovery](./chapter-09-checkpointing-and-recovery.md) — checkpoint write time as a contributor to aggregate throughput
