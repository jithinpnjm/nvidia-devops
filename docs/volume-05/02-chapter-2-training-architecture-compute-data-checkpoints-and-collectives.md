---
title: "Chapter 2 - Training architecture: compute, data, checkpoints and collectives"
slug: "chapter-2-training-architecture-compute-data-checkpoints-and-collectives"
sidebar_position: 2
description: "Chapter 2 - Training architecture: compute, data, checkpoints and collectives — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
**Learning outcome:** Understand why distributed training depends on GPU topology, fabric, storage and scheduler behavior.

Training repeatedly loads batches, performs forward/backward computation, exchanges data across devices when distributed, and periodically writes checkpoints. The critical path can shift across phases. GPU utilization drops if data preprocessing starves the device; scaling efficiency drops if collective communication grows faster than useful compute.

## 2.1 Parallelism vocabulary for infrastructure

| Pattern | Infrastructure implication |
|---|---|
| Data parallel | replicas process different data; gradient synchronization creates collective traffic |
| Tensor/model parallel | single model split across GPUs; latency/bandwidth sensitivity to interconnect |
| Pipeline parallel | layers/stages distributed; pipeline bubbles and stage balance matter |
| Checkpointing | large writes + durability/restart time; storage path affects recovery |

➕ **Diagram: three parallelism patterns, same 4 GPUs, different split axis**
```
Data parallel:            Tensor parallel:           Pipeline parallel:
 GPU0 [full model]         GPU0 [layer-shard A]       GPU0 [layers 1-2]
 GPU1 [full model]  ──▶    GPU1 [layer-shard B]  ──▶  GPU1 [layers 3-4]
 GPU2 [full model]         GPU2 [layer-shard C]       GPU2 [layers 5-6]
 GPU3 [full model]         GPU3 [layer-shard D]       GPU3 [layers 7-8]
 each GPU: different       each GPU: same layer,      each GPU: different
 data shard, same          different slice of its     layers, same data,
 weights → AllReduce       weights → per-layer         flows stage-to-stage
 gradients after bwd       all-to-all/all-gather       → pipeline bubbles if
                           on every forward AND         stages are unbalanced
                           backward pass (latency-
                           sensitive to interconnect)
```
The infrastructure implication column in the table above is a direct consequence of which axis is split: data parallel trades bandwidth for gradient sync once per step, tensor parallel pays interconnect latency on every layer, pipeline parallel pays idle "bubble" time when stages aren't balanced.

## Worked scenario
**Situation:** A training job scales from 8 to 32 GPUs but throughput only doubles.

1. Calculate scaling efficiency rather than celebrating total throughput alone.
2. Compare GPU step time and collective/communication time at 8 versus 32 GPUs.
3. Check topology/fabric and placement: are workers crossing slower links or nodes unexpectedly?
4. Check data-loader/storage throughput; more GPUs may amplify input demand.
5. Check batch/global-batch changes and framework configuration before blaming hardware.

**Conclusion:** Distributed scaling is an efficiency curve; adding GPUs increases both compute capacity and coordination cost.

➕ **The training step timeline, made visible (what "step time" in the worked scenario is actually measuring):**
```
One training step, single GPU vs. data-parallel across N GPUs:

Single GPU:
|--- load batch ---|--- forward ---|--- backward ---|--- optimizer step ---|
        ↑ if this is longer than compute, the GPU starves (SM util < 100%)

Data-parallel, N GPUs, per step:
GPU0: |--load--|--fwd--|--bwd--|==AllReduce gradients==|--opt step--|
GPU1: |--load--|--fwd--|--bwd--|==AllReduce gradients==|--opt step--|
GPU2: |--load--|--fwd--|--bwd--|==AllReduce gradients==|--opt step--|
                                 ↑ every GPU blocks here until ALL
                                   peers finish backward AND the
                                   collective completes — one slow
                                   straggler stalls everyone
```
The AllReduce bar is the "coordination cost" the worked scenario's conclusion names abstractly — it does not shrink just because you added GPUs; it can grow if the fabric between the new GPUs is slower (cross-node vs. NVLink) or if gradient tensor size stays fixed while step count per GPU drops, making the fixed communication overhead a larger fraction of each step.

➕ **Sample `nvidia-smi dmon` output during a data-parallel step, annotated for exactly this diagnosis:**
```
$ nvidia-smi dmon -s pucm -c 5
# gpu   pwr  gtemp  mtemp    sm   mem   enc   dec  mclk  pclk
# Idx     W      C      C     %     %     %     %   MHz   MHz
    0   410     68     71    97    88     0     0  2619  1980   ← healthy: compute-bound
    0    95     61     64    12     9     0     0  2619  1980   ← SM=12%: GPU is WAITING, not computing
    0    88     60     63     8     6     0     0  2619  1980   ← this is the AllReduce/collective wait window
    0   405     67     70    96    89     0     0  2619  1980   ← back to compute — step resumed
    0   402     67     70    95    87     0     0  2619  1980
```
Two consecutive low-`sm%` rows sandwiched between high-`sm%` rows is the signature of collective-communication stall, not data-loader starvation — a data-loader stall usually shows a longer, less regular low-utilization stretch and correlates with `iostat`/page-cache-miss evidence instead of a fixed periodic pattern tied to step boundaries. Distinguishing these two is exactly what the worked scenario's steps 2-4 are asking you to do with instrumentation instead of guessing.

➕ **Extra worked scenario — checkpoint storm, a training-specific failure mode the original scenario doesn't cover:**
> **Situation:** A 256-GPU pretraining job checkpoints every 30 minutes. A transient network blip causes the job to restart. On restart, all 256 workers simultaneously attempt to read the last checkpoint shard set from shared storage within the same few seconds.
> 1. Storage throughput required at restart = (checkpoint shard size × 256) delivered near-simultaneously — a completely different I/O profile than the steady periodic *write* pattern storage was sized for.
> 2. If storage was sized for "256 workers writing 30-minute-interval checkpoints" (a smoothed, staggered load) but not for "256 workers reading the same checkpoint generation within one restart window," the read burst can saturate the storage backend, and restart time balloons — sometimes taking longer than the training interval it's protecting.
> 3. Fix directions: shard/replicate checkpoint reads (each worker reads only its own shard, not a shared monolith), stagger read start times, or use a storage tier with burst read bandwidth headroom sized for the *restart* case, not just the steady-state write case.
> 4. This is also why "restore time objective," named explicitly in Senior Deep Dive 1, has to be measured under realistic full-job-restart conditions, not extrapolated from a single-worker checkpoint read test.
> **Conclusion:** Checkpoint storage capacity planning has two distinct load profiles — steady-state write and simultaneous full-fleet read — and sizing for only one silently breaks the other.

➕ **Diagram: checkpoint storm — write profile vs. restart-read profile**
```
Steady-state (sized for this):
 worker000 ─write─▶┐
 worker001 ─write───┼─▶ storage  (staggered over 30-min interval, smooth)
   ...     ─write───┘
 worker255 ─write─▶┘

Restart burst (the profile that breaks under-sized storage):
 worker000 ─read─▶┐
 worker001 ─read─▶┤
 worker002 ─read─▶┼─▶ storage  ← all 256 workers read within seconds
   ...     ─read─▶┤             of each other, same time window
 worker255 ─read─▶┘
                    ↑ burst read bandwidth, not steady write
                      bandwidth, is the number that matters here
```

➕ **Shortcut/mnemonic:** *"Scaling efficiency = useful compute ÷ (useful compute + coordination) — and coordination cost is a function of fabric speed, tensor size, and straggler variance, not GPU count alone."* When throughput doesn't scale linearly, the three things to check in order are: (1) is a straggler forcing everyone to wait, (2) is the fabric between the new GPUs slower than the fabric within the original set, (3) did global batch size change in a way that shifted the compute/communication ratio.

➕ **Chapter drill questions (chapter-specific, additive):**
1. Given `nvidia-smi dmon` shows a regular, step-periodic dip in `sm%` to near-zero on every worker simultaneously, name the two most likely root causes and the one command/log correlation that distinguishes them.
2. A checkpoint write takes 90 seconds and happens every 5 minutes on a job whose step time is 2 seconds. Compute the percentage of wall-clock training time lost to checkpointing, and state at what step-time-to-checkpoint-time ratio you would recommend asynchronous/non-blocking checkpoint writes instead of synchronous ones.
