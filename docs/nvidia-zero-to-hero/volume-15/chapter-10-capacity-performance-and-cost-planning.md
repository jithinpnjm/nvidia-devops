---
title: Chapter 10 — Capacity, Performance, and Cost Planning
description: Size AI storage for usable capacity, bandwidth, metadata, burst, retention, and growth.
sidebar_position: 11
tags: [capacity-planning, cost, storage]
---

# Capacity, Performance, and Cost Planning

Storage planning for AI workloads is fundamentally different from traditional storage. Capacity alone is not enough; throughput, metadata rate, burst handling, and cost per GPU-hour all factor into a decision. This chapter provides a framework and calculator.

| Chapter metadata | Value |
|---|---|
| Volume | 15 — AI Storage, Checkpointing, and Data Pipelines |
| Difficulty | Intermediate |
| Estimated reading time | 45 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | How much storage do I actually need, and what does it cost compared to leaving GPUs idle? |

## The Cost of Idle GPUs vs Storage Savings

**Scenario: 128-GPU A100 cluster**

```
Cost per hour:
- 128 GPUs × 4 KW × $0.10/kWh ≈ $51/hour in compute
- 128 GPUs × $3/hour (lease) ≈ $384/hour in lease cost
- Total: $435/hour

Storage cost:
- 1 PB parallel storage: $50K–$100K one-time + $10K/year maintenance
- Or: 10 TB NVMe per node × 128 nodes = 1.28 PB, $500K one-time

Question: If GPUs are idle 10% of the time due to data stalls, what's the impact?
- 10% idle = 2.4 hours per day idle
- Cost: 2.4 × $435 = $1,044/day
- Over 1 year: $380K in wasted compute

Storage cost to prevent that idle:
- An additional $100K in storage is 2.6% of the wasted compute cost
- Conclusion: **overspend on storage, not compute**
```

## Planning Framework: Six Dimensions

### 1. Usable Capacity

What must fit on storage?

```
Training datasets:          ___ GB
Fine-tuning datasets:       ___ GB
Model checkpoints (rolling): ___ GB (e.g., keep last 10)
Model checkpoints (archive): ___ GB
Inference models:           ___ GB
Logs and metadata:          ___ GB
Replication factor:         ___ x (if applicable)
Headroom (30%):             ___ GB

Total usable:               ___ GB
```

**Example for a 1.3B parameter model, 8 nodes, 100-epoch training:**
```
Training dataset:           500 GB
Checkpoint size per epoch:  100 GB (model + optimizer state)
Keep 20 rolling checkpoints: 100 × 20 = 2,000 GB
Keep 10 archive checkpoints: 100 × 10 = 1,000 GB
Model artifacts:            50 GB
Logs:                       10 GB
Subtotal:                   3,560 GB
Headroom (30%):             1,068 GB
Total:                      4,628 GB ≈ 5 TB minimum
```

### 2. Read Bandwidth

How fast must data arrive at the GPU?

```
Model file size:                    100 GB
Load time budget (before training):  30 seconds  ← Typical target

Required bandwidth:                  100 GB / 30s = 3.3 GB/s

Concurrent training jobs:            3 jobs
Per-job bandwidth needed:            3.3 GB/s
Total read bandwidth needed:         9.9 GB/s ≈ 10 GB/s

Storage system options:
- Lustre: 24 OSTs × 800 MB/s = 19.2 GB/s ✓ (headroom)
- BeeGFS: 8 storage nodes × 1.5 GB/s = 12 GB/s ✓ (minimal headroom)
- NFS: single server, 2 GB/s ✗ (not enough; 5x too slow)
```

### 3. Write Bandwidth

Checkpoint writes consume bandwidth; simultaneous training and checkpointing compete.

```
Checkpoint size:                    100 GB
Checkpoint write budget:             5 minutes (don't block training too long)

Required write bandwidth:            100 GB / 300s = 333 MB/s

Parallel checkpoint (all ranks write simultaneously):
- 8 ranks × 333 MB/s per rank = 2.7 GB/s network demand
- Lustre write capacity: 24 OSTs × 400 MB/s = 9.6 GB/s ✓
- BeeGFS write capacity: 8 nodes × 1.5 GB/s = 12 GB/s ✓
- Both have headroom; checkpoint won't block training
```

### 4. Metadata Rate

Small-file workloads require metadata capacity.

```
Dataset file count:        1.2 million small images (100 KB each)
Metadata operations per epoch:  1.2M opens + 1.2M closes + 2.4M stats
Total metadata ops:        4.8M per epoch

Training pace (batches per sec):  100
Each batch may open 10–100 files: 256-image batch = 256 opens
Metadata op rate:           256 opens × 100 batches/sec = 25.6K opens/sec

Storage system metadata capacity:
- Lustre single MDS:  50K ops/sec ✓ (enough)
- Lustre 2 MDTs:      100K ops/sec ✓ (overhead)
- BeeGFS single MDS:  50K ops/sec ✓ (enough)
- NFS:                5K ops/sec ✗ (too slow by 5x)

Caveat: These are for directly accessed files. WebDataset or tar packaging reduces ops by 1000x.
```

### 5. Burst Handling

Training can be bursty (checkpoints, epoch start scans, cleanup).

```
Baseline data rate:         1 GB/s (sustained)
Checkpoint burst:           5 GB/s (for 5 minutes)
Concurrent training:        1 GB/s
Total during checkpoint:    5 + 1 = 6 GB/s (peaks)

Storage network capacity (aggregate):
- If designed for 10 GB/s sustained, burst to 6 GB/s is OK (60% utilization)
- If designed for 5 GB/s sustained, burst to 6 GB/s will stall something

Recommendation: Overbuild bandwidth by 2x sustained for 1x burst headroom
Sustained: 3 GB/s → Buy: 6 GB/s capacity
Sustained: 10 GB/s → Buy: 20 GB/s capacity
```

### 6. Cost Per GPU-Hour

The true metric: what does it cost to keep one GPU productive for one hour?

```
Option A: Minimal Storage (2 TB NVMe, no Lustre)
- 128 GPUs × 2 TB NVMe = 256 TB total
- Cost: $500K one-time, $5K/year
- Performance: Dataset loading stalls GPUs 5% of time
- Effective waste: 128 GPUs × 5% × $435/hour = $2,784/hour
- Annual cost of waste: $2,784 × 8760 = $24.4M
- Total annual: $5K + $24.4M = $24.4M

Option B: Balanced Storage (Lustre 1 PB + NVMe cache)
- Lustre: $80K one-time, $10K/year
- NVMe: $500K one-time, $5K/year
- Performance: Dataset loading stalls GPUs less than 1% of time
- Effective waste: 128 GPUs × 1% × $435/hour = $558/hour
- Annual cost of waste: $558 × 8760 = $4.9M
- Total annual: $80K + $10K + $500K + $5K + $4.9M = $5.5M

Difference: $24.4M − $5.5M = $18.9M/year saved by investing in better storage!
```

## Tiering Strategy

Use multiple storage tiers for different workloads:

| Tier | Media | Latency | Throughput | Use case | Cost |
|---|---|---|---|---|---|
| **Hot** | NVMe | under 1ms | 3 GB/s per drive | Active dataset cache, checkpoint staging | $5/GB |
| **Warm** | Parallel FS (Lustre/BeeGFS) | 1–5ms | 1–2 GB/s per server | Training datasets, active checkpoints | $0.50/GB |
| **Cold** | Object storage (S3/GCS) | 50–100ms | 0.1–1 GB/s (egress limits) | Source data, archive checkpoints | $0.02/GB |
| **Archive** | Glacier/Tape | hours | — | Long-term retention | $0.001/GB |

**Example tiering for the 1.3B model:**
```
Hot (NVMe cache):     100 GB  (current working set)            × $5/GB  = $500
Warm (Lustre):        2.5 TB  (active datasets + checkpoints) × $0.50 = $1.25K
Cold (S3):            5 TB    (source data, old checkpoints)   × $0.02 = $100
Archive (Glacier):    10 TB   (historical checkpoints)         × $0.001= $10

Total: $1,860/year (very reasonable for a $24M/year training budget)
```

## Capacity Planning Calculator

Before provisioning, fill in this table:

```
INPUTS:
Number of GPU nodes:           [__]
GPUs per node:                 [__]
Model size (weights + optim):  [__] GB
Batch size:                    [__]
Epochs:                        [__]
Checkpoints per epoch:         [__]
Keep rolling checkpoints:      [__] (number to retain)
Keep archive checkpoints:      [__] (number to retain)
Dataset size:                  [__] GB
Concurrent training jobs:      [__]

CALCULATIONS:
Total GPUs:                    [__] = Nodes × GPUs/node
Checkpoint size:               [__] = Model size × 2 (optimizer state)
Total checkpoint storage:      [__] = Checkpoint size × (rolling + archive)
Headroom (30%):                [__]
Total usable capacity:         [__] = Dataset + checkpoints + headroom

Read bandwidth needed:         [__] GB/s = Dataset / (load_time_budget_sec) × Concurrent_jobs
Write bandwidth needed:        [__] GB/s = Checkpoint / (checkpoint_time_budget_sec) × Concurrent_jobs
Metadata ops needed:           [__] ops/sec = (Files × Opens/file) / Epoch_duration_sec

STORAGE SELECTION:
For capacity [__] GB and [__] GB/s read: _______________
For write bandwidth [__] GB/s: _______________
For metadata [__] ops/sec: _______________
```

## Headroom Budgeting

Always reserve capacity and performance beyond baseline:

- **Capacity headroom:** 30% (filesystem performs worse as fill approaches 90%)
- **Bandwidth headroom:** 50% (for bursts, maintenance, other jobs)
- **Metadata headroom:** 40% (metadata ops scale non-linearly)
- **Rebuild time:** Reserve space so failed disk/node can rebuild within 24 hours

## Interview-Ready Answer

**Q: You need to outfit a 256-GPU cluster for distributed training. Datasets are 5 TB, checkpoints 500 GB, and 100 concurrent training jobs planned. What storage do you buy, and why?**

A: "First, I calculate capacity: 5 TB datasets + (500 GB checkpoints × 20 rolling × 100 jobs) + 30% headroom = 5 TB + 1 TB + 1.8 TB = 7.8 TB minimum. But raw capacity is not enough. Next, bandwidth: 100 jobs × (5 TB / 60 sec load time) = 8.3 GB/s sustained read, plus checkpoint bursts at 5 GB/s write. So I need a filesystem that delivers 10–15 GB/s sustained read and 8–10 GB/s sustained write with headroom. That rules out NFS (2 GB/s) and suggests a parallel filesystem like Lustre (24 OSTs, ~19 GB/s aggregate) or BeeGFS (8 nodes, ~12 GB/s). Third, metadata: 5 TB of data packaged as WebDataset (1000 shards) means 100K opens per epoch (well within 50K MDS capacity with headroom). Storage choice: Lustre 12-node cluster (8 OST nodes + 2 MDS + 1 backup + 1 MGS) with 12 TB SSD per OST = 96 TB raw, 80 TB usable at 2x replication = well above 7.8 TB needed. Cost: ~$100K hardware + $10K/year maintenance. This is less than 5% of the annual wasted compute if I undersized storage."

---

## Practice

1. **Calculate your requirements:** Fill in the capacity planning calculator above for your next training run. What are your bottleneck dimensions (capacity, read, write, metadata)?

2. **Cost-compare:** Calculate the cost of idle GPUs if storage causes 5% stall time. Compare to the cost of buying better storage. Make a recommendation.

3. **Design a tiering strategy:** If you have 10 TB of data, how would you split it between NVMe cache, Lustre warm storage, and S3 cold storage? Calculate cost and performance tradeoff.
