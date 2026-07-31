---
title: "Chapter 1 - Distributed systems performance for GPU jobs"
slug: "chapter-1-distributed-systems-performance-for-gpu-jobs"
sidebar_position: 1
description: "Chapter 1 - Distributed systems performance for GPU jobs — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
**VOLUME 6**

**HPC, Networking and Storage for AI**

Distributed communication, RDMA fabrics, storage paths, Slurm and performance troubleshooting

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises

Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.

**Learning outcome:** Build a scaling-efficiency model that separates compute, communication, synchronization and I/O.

A single GPU can run independently. Multiple GPUs introduce coordination. Within a node, peer links/topology matter; across nodes, the network fabric and collective library matter. Scaling efficiency falls when communication/synchronization consumes an increasing fraction of step time.

```
speedup = throughput_N / throughput_1
efficiency = speedup / N
# Example: 8 GPUs give 6.4x throughput -> 80% scaling efficiency
```

Do not treat efficiency loss as automatically "network." Input pipelines, CPU preprocessing, imbalance and framework configuration can all create idle time. Profile the phase that grew with scale.

➕ **The step-time decomposition the formula above hides — this is the model an interviewer wants you to draw:**
```
step_time = compute_time + communication_time + sync_wait_time + data_load_wait_time

At N=1:  step_time ≈ compute_time                    (nothing to communicate or sync)
At N=8:  step_time = compute_time/8*  + comm_time(N) + sync_wait(N) + data_wait(N)
                      *if compute scales linearly, which is the best case, not the default

efficiency_loss = 1 - (step_time(N) / N) / step_time(1)
```
The single most useful move in this chapter: **efficiency is a symptom, not a diagnosis.** "80% efficiency" tells you nothing about *which* term in the right-hand side grew. You have to instrument each term separately — that's the whole content of this chapter, restated as an equation.

➕ **ASCII view of where each term actually lives in the training loop:**
```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────┐
│  data_load   │────▶│   compute     │────▶│  communicate   │────▶│  sync_wait   │
│ (CPU/storage)│     │ (GPU forward/ │     │ (AllReduce over │     │ (barrier —   │
│ dataloader   │     │  backward)    │     │  NIC/fabric)    │     │  wait for    │
│ workers      │     │               │     │                 │     │  slowest rank)│
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────┘
     ▲                                                                    │
     └────────────────────── next step begins ─────────────────────────┘
```
Each box has a distinct tool: `nvidia-smi dmon` / GPU util for compute, `nccl-tests` / NIC counters for communicate, per-rank step-time variance for sync_wait, and `iostat`/dataloader worker queue depth for data_load. A profiler that only reports "GPU util 62%" collapses all four boxes into one number — the job in this chapter is to separate them again.

➕ **Sample `nccl-tests` output, annotated** (the first thing you'd actually run to separate "compute" from "communicate"):
```
$ ./build/all_reduce_perf -b 8M -e 8M -f 2 -g 8
#      size    count   type   redop     time   algbw   busbw  #wrong
        8388608  2097152  float    sum      3821    2.19    3.84       0   ← 8 GPUs, single node
#
# Out-of-place hack: time in us, algbw/busbw in GB/s
```
`busbw` (bus bandwidth — normalized for the AllReduce ring's 2x data-movement factor) is the number to compare against the fabric's theoretical max, not `algbw`. If `busbw` is far below the NIC's line rate (e.g. 3.84 GB/s on a 200Gb/s = 25GB/s NIC), that gap is your `communication_time` term inflating — run this in isolation from the actual training job specifically so you're not also measuring `compute_time` and `data_load_wait_time` in the same number.

➕ **Diagram: why the barrier makes the mean lie**
```
rank0  compute ██████████████████ | idle waiting at barrier ░░░░░░░░░░
rank1  compute ██████████████████ | idle waiting at barrier ░░░░░░░░░░
rank2  compute ██████████████████ | idle waiting at barrier ░░░░░░░░░░
rank3  compute ████████████████████████████████████████████ (straggler)
                                                              ▲
                                                     barrier releases here —
                                                     every other rank paid
                                                     for rank3's slowness
```
Average GPU utilization across the four ranks looks moderate, but step_time is set entirely by the slowest rank. This is why "check the mean" hides the exact fault the triage below is built to find.

➕ **Worked scenario — the "80% efficiency, which term?" triage, made concrete:**
> **Situation:** Scaling from 1 to 8 nodes (64 GPUs), measured efficiency drops from 100% to 71%. The on-call engineer's first instinct is "check the network."
> 1. Capture per-step GPU utilization time series across all 64 GPUs, not the cluster average — a 71% *average* efficiency could be 8 nodes all uniformly slower (fabric-wide issue) or 1 node dramatically slower dragging the barrier (straggler — see Deep Dive 1).
> 2. Run `nccl-tests all_reduce_perf` node-pair-by-node-pair at the actual message size the model uses (not the tool's default) — isolates `communication_time` from the live job's `compute_time` and `data_load_wait_time`.
> 3. If `nccl-tests` numbers look fine in isolation but the live job still shows the gap, suspect `sync_wait_time` (one rank slow) or `data_load_wait_time` (dataloader workers under-provisioned as GPU count — and therefore CPU demand — increased 8x).
> 4. Only if `nccl-tests` itself degrades at scale do you have a genuine fabric/topology problem — and now you have a reproducible, isolated number to hand to the network team instead of "training is slower."
> **Interview-ready line:** "Scaling efficiency is the aggregate signal — I never diagnose from it directly, I use it to decide which of four separate measurements to take next."

➕ **Shortcut — the one-line mental model for fast recall:** *"Compute scales with GPUs, communication scales with the fabric, and sync_wait scales with your worst node — always suspect the max, not the mean."*

## Practice
➕ 1. Given per-step GPU utilization traces for 8 nodes where 7 show 95% and 1 shows 40%, write the one-sentence hypothesis you'd test first, and the exact command to test it.
➕ 2. A team reports "scaling efficiency dropped after we doubled batch size per GPU." Explain why this is expected to change `compute_time` and `data_load_wait_time` simultaneously, and how you'd isolate which one moved.
