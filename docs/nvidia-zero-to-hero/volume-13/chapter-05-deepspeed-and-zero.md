---
title: Chapter 05 — DeepSpeed and ZeRO
description: Understand ZeRO stages, optimizer and parameter partitioning, offload, and production lifecycle trade-offs.
sidebar_position: 6
tags: [deepspeed, zero, distributed-training]
---

# Chapter 05: DeepSpeed and ZeRO

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Foundations |
| Difficulty | Advanced |
| Estimated reading time | 55 minutes |
| Primary audience | ML/Infrastructure Engineers, Platform Teams |
| Core question | How does DeepSpeed ZeRO achieve more aggressive memory reduction than FSDP, and what's the cost? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Explain the memory math difference between ZeRO stages 1, 2, and 3
- Calculate expected speedup/slowdown when using ZeRO on a specific model and cluster
- Diagnose ZeRO-specific failures (communication hangs, NVMe thrashing, config mismatches)
- Choose between FSDP and DeepSpeed based on workload and infrastructure constraints

## Why ZeRO Exists: Elimination of Redundancy

Before ZeRO (introduced by Microsoft in 2019), distributed training followed this pattern:

```
Every GPU holds:
  - Full model weights (replicated)
  - Full gradients (computed per-batch, then All-Reduced to sync)
  - Full optimizer states (one per GPU)

For a 10B-parameter model:
  Model:     10B × 4 bytes (FP32) = 40 GB
  Gradients: 10B × 4 bytes (FP32) = 40 GB
  Optimizer: 10B × 8 bytes (FP32 momentum + variance) = 80 GB
  ─────────────────────────────────────────────────
  Total per GPU: 160 GB (exceeds any single GPU)
```

Even with 8 GPUs in DDP, each GPU still needs all 160 GB. The redundancy is wasteful.

ZeRO's insight: **We don't need every GPU to hold a full copy of everything. We can partition (shard) the training state across GPUs, as long as communication brings the needed pieces together when necessary.**

## ZeRO Stage 1: Shard Optimizer States

```
Replicated on every GPU:
  Model weights (10B × 4 bytes) = 40 GB
  Gradients (10B × 4 bytes) = 40 GB

Sharded across N GPUs:
  Optimizer states (10B × 8 bytes) = 80 GB total → 80/N GB per GPU
```

**Memory per GPU (N=8):**
```
40 GB (weights) + 40 GB (gradients) + (80/8) GB (optimizer) = 90 GB
```

This still doesn't fit on an 80 GB GPU, so Stage 1 alone is rarely useful.

**When to use:** When you have ample GPU memory and want slightly more room for batch size increases without the complexity of stages 2+.

## ZeRO Stage 2: Shard Gradients + Optimizer States

```
Replicated on every GPU:
  Model weights (10B × 4 bytes) = 40 GB

Sharded across N GPUs:
  Gradients (10B × 4 bytes) = 40 GB total → 40/N GB per GPU
  Optimizer states (10B × 8 bytes) = 80 GB total → 80/N GB per GPU
```

**Memory per GPU (N=8):**
```
40 GB (weights) + (40/8) GB (gradients) + (80/8) GB (optimizer) = 50 GB
```

Now it fits on an 80 GB GPU with 30 GB headroom for activations!

**Communicat ion cost:** Instead of All-Reduce after backward (which is already necessary), we use Reduce-Scatter to collect gradients back to shards. This is slightly more efficient than All-Reduce, so Stage 2 has minimal communication overhead.

**When to use:** Most production training jobs use Stage 2. It's the sweet spot: meaningful memory savings (~4× reduction in persistent state per GPU) with minimal communication overhead.

## ZeRO Stage 3: Shard Everything

```
Sharded across N GPUs:
  Model weights (10B × 4 bytes) = 40 GB total → 40/N GB per GPU
  Gradients (10B × 4 bytes) = 40 GB total → 40/N GB per GPU
  Optimizer states (10B × 8 bytes) = 80 GB total → 80/N GB per GPU
```

**Memory per GPU (N=8):**
```
(40 + 40 + 80) / 8 = 20 GB
```

This is extreme: 8× memory reduction from base DDP!

**Communication cost:** Now we must All-Gather model weights before forward/backward (just like FSDP). Stage 3 has the highest communication overhead.

**When to use:** When you need to fit models so large that even Stage 2 doesn't work. Requires fast interconnect (NVLink or InfiniBand).

## The Memory Reduction Math: Side-by-Side Comparison

For a 10B-parameter model on 8 GPUs:

| Configuration | Memory per GPU | Reduction vs DDP |
|---|---|---|
| DDP (no sharding) | 160 GB | 1× (baseline) |
| ZeRO Stage 1 | 90 GB | 1.78× |
| ZeRO Stage 2 | 50 GB | 3.2× |
| ZeRO Stage 3 | 20 GB | **8× (!!)** |

The memory savings are enormous, but Stage 3 communication overhead can be 2-3× higher than Stage 2.

## ZeRO-Offload: When GPU Memory Isn't Enough

Even with Stage 3, some models (e.g., 70B parameters) exceed aggregate GPU memory. DeepSpeed offers **ZeRO-Offload** to page state to CPU RAM or NVMe.

**Example: 70B model on 8 GPUs with ZeRO-3:**
```
Per-GPU memory needed: (70B × 12 bytes) / 8 = 105 GB
Available per GPU: 80 GB
Shortfall: 25 GB per GPU
```

**Solution: Offload to CPU:**
```
ZeRO-3 + CPU Offload:
  GPU memory used: 60 GB (keep most state in GPU)
  CPU memory used: ~800 GB (offload gradients and optimizer states to host RAM)
  
  Bandwidth limited by PCIe (Gen4: 32 GB/s, Gen5: 64 GB/s)
  This makes training 10-100× slower than pure GPU training
```

**Real observed throughput:**

```bash
# 70B model, 8 A100 GPUs, ZeRO-3 on GPU only
torchrun --nproc_per_node=8 train.py --use_offload false
Training speed: 8.5 tokens/sec
GPU memory per GPU: 79 GB (near full)

# Same model, 8 A100 GPUs, ZeRO-3 with CPU offload
torchrun --nproc_per_node=8 train.py --use_offload true
Training speed: 0.4 tokens/sec  ← 21× slower!
GPU utilization: 12%  ← GPUs waiting for PCIe transfers
CPU memory: 850 GB (system swap begins)
```

Offload is useful for fine-tuning or research, not production pre-training.

## Configuring ZeRO: The Config Dictionary

DeepSpeed training requires a configuration file (JSON):

```json
{
  "train_batch_size": 32,
  "train_micro_batch_size_per_gpu": 4,
  "gradient_accumulation_steps": 8,
  
  "zero_optimization": {
    "stage": 2,
    "allgather_partitions": true,
    "allgather_bucket_size": 5e8,
    "overlap_comm": true,
    "reduce_scatter": true,
    "reduce_bucket_size": 5e8,
    "contiguous_gradients": true,
    "cpu_offload": false
  },
  
  "optimizer": {
    "type": "AdamW",
    "params": {
      "lr": 1e-4,
      "betas": [0.9, 0.999],
      "eps": 1e-8,
      "weight_decay": 0.01
    }
  }
}
```

**Key parameters:**

| Parameter | Meaning | Typical value |
|---|---|---|
| stage | ZeRO stage (1, 2, or 3) | 2 |
| overlap_comm | Overlap communication with computation | true |
| reduce_bucket_size | Size of gradients to reduce at once | 5e8 |
| cpu_offload | Offload to CPU RAM | false |

## Troubleshooting: ZeRO-3 Communication Hangs

**Scenario: Training hangs after hours with no error message**

```bash
# Enable NCCL tracing
export NCCL_DEBUG=INFO
export NCCL_ASYNC_ERROR_HANDLING=1
export NCCL_TIMEOUT=1200

torchrun --nproc_per_node=8 train.py 2>&1 | tee train.log
```

**Observed output before hang:**

```
[14:23:40] Rank 0-7: Step 1-10 complete, avg loss: 4.52
[14:23:41] NCCL INFO All-Gather started for layer 15
[14:23:42] Rank 0: Waiting for All-Gather to complete
[14:23:42] Rank 1: All-Gather done
[14:23:42] Rank 2: All-Gather done
[14:23:42] Rank 3: All-Gather done
[14:23:42] Rank 4: All-Gather done
[14:23:42] Rank 5: All-Gather done
[14:23:42] Rank 6: All-Gather done
[14:23:47] Rank 7: SLOW in All-Gather (5 second delay)
[14:24:00] NCCL WARN All-Gather timeout after 20 seconds
[14:24:00] Error: NCCL operation aborted
```

**Diagnosis:** Rank 7's All-Gather is slow (could be disk I/O, network, or CPU throttle). Other ranks timeout waiting for it.

**Fix:**

```bash
# Check if rank 7's GPU or network is the bottleneck
ssh node7 nvidia-smi  # Check GPU utilization
ssh node7 iftop -n   # Check network throughput
ssh node7 iostat 1   # Check disk I/O

# If network is congested
ibstat  # Check InfiniBand link status
ibdiagnet  # Detailed InfiniBand diagnostics

# Increase timeout further (temporary workaround)
export NCCL_TIMEOUT=3600  # 1 hour
```

## The NVMe Thrashing Problem

**Scenario: Using ZeRO-Infinity on NVMe for a 70B model, but throughput is terrible**

```bash
# Observe iostat during training
iostat -dx 1

avg-cpu:  %user   %nice %system %iowait
           15.0    0.0   20.0    65.0  ← CPU waiting for I/O!

Device             r/s     w/s    rMB/s    wMB/s
nvme0n1         8000   6000    2000     1500  ← Disk pegged at max
nvme1n1         7800   5900    1900     1400

Training speed: 0.1 tokens/sec (50× slower than GPU-only)
```

**Diagnosis:** GPUs are idle 95% of the time, waiting for the NVMe to page in optimizer states and gradients. The PCIe bus is the bottleneck.

**Fix:**

```json
// Offload ONLY optimizer states, not parameters
"zero_infinity": {
  "offload_optimizer_param_to_cpu": false,
  "offload_activations": false,
  "pin_memory": true,
  "nvme_offload_dir": "/mnt/nvme_raid0"  // Must be fast NVMe RAID0
}
```

Or simply don't use NVMe offload; scale horizontally (more GPUs) instead.

## Production Monitoring: ZeRO-Specific Metrics

```bash
# Check if All-Gather is overlapped with compute (should be invisible if overlapped)
watch -n 5 'grep "overlap" train.log | tail -1'

# Monitor per-rank step time (should be identical; divergence = bottleneck)
tail -n 100 train.log | awk '/step_time/ {print}'
```

| Signal | Healthy | Red flag |
|---|---|---|
| Communication % of step time | 15-30% | > 50% (communication bottleneck) |
| Per-rank step time variance | < 5% | > 10% (unbalanced load) |
| Loss convergence | Smooth, decreasing | Noisy or divergent (indicate numerical issues) |

## Interview Preparation

**Conceptual:** "Why does ZeRO-2 have less communication overhead than ZeRO-3, even though both shard the model state?"

**Model Answer:** "ZeRO-2 replicates the model weights on every GPU, so it doesn't need All-Gather during forward/backward. It only needs to synchronize gradients and optimizer states, which it does with Reduce-Scatter and All-Reduce—operations that are already necessary for any distributed training. ZeRO-3, on the other hand, shards the weights too, so it needs an additional All-Gather before every forward pass and another All-Gather before every backward pass (or rather, it needs to gather parameters as needed layer by layer). This adds communication volume, making ZeRO-3 slower on networks with limited bandwidth, but more memory-efficient if you have bandwidth to spare and need to fit very large models."

**Tradeoffs:** "You have a 50B-parameter model. Your cluster has two options: 8 GPUs with ZeRO-3, or 16 GPUs with ZeRO-2 (both setups available). Which would you choose, and why?"

**Model Answer:** "I'd need to know the network topology and cost constraints. If the cluster has high-bandwidth interconnect (NVLink or InfiniBand), 8 GPUs with ZeRO-3 might be faster because we save the expense of 8 extra GPUs and the All-Gather overhead is small. If the network is slow (Ethernet, congested), 16 GPUs with ZeRO-2 would be better: more memory per GPU means less aggressive sharding, which means less communication. From a cost perspective, 8 GPUs is cheaper. From an efficiency perspective, if the 16-GPU setup can achieve 15× speedup (94% efficiency), that's better than 8 GPUs achieving only 6× speedup (75% efficiency due to ZeRO-3 communication overhead). The decision hinges on whether communication overhead is negligible (good network) or dominant (slow network)."

**Deep dive:** "Explain the memory math for a 30B model with Adam optimizer using ZeRO-2 on 16 GPUs."

**Model Answer:** "A 30B model in mixed precision: 30B × 12 bytes = 360 GB total state. With ZeRO-2 on 16 GPUs: we replicate weights but shard gradients and optimizer states. Weights alone are 30B × 4 bytes (FP32) = 120 GB. Gradients and optimizer are 30B × 8 bytes = 240 GB, sharded across 16 = 15 GB per GPU. Total per GPU: 120 GB (weights) + 15 GB (sharded gradient/optimizer) = 135 GB. This is too large for an 80 GB GPU, so we'd need activation checkpointing or mixed precision (keep weights in FP16, 60 GB). With FP16 weights: 60 GB + 15 GB = 75 GB, which fits."

## Related Chapters

- **Previous:** [Chapter 4 — FSDP and Parameter Sharding](./chapter-04-fsdp-and-parameter-sharding.md)
- **Next:** [Chapter 6 — Tensor, Pipeline, and Expert Parallelism](./chapter-06-tensor-pipeline-and-expert-parallelism.md)
- **FSDP Alternative:** [Chapter 4](./chapter-04-fsdp-and-parameter-sharding.md) covers PyTorch native FSDP, which is architecturally similar to ZeRO-3 but integrated natively into PyTorch
