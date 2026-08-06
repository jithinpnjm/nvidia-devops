---
title: Chapter 03 — Data Parallelism and DDP
description: Understand replicated models, gradient synchronization, bucketization, and DistributedDataParallel operations.
sidebar_position: 4
tags: [ddp, data-parallelism, pytorch]
---

# Data Parallelism and DDP

Data parallelism places a model replica on each rank, gives each rank different input data, and synchronizes gradients so replicas remain consistent.

## Sequence

```mermaid
sequenceDiagram
    participant R0 as Rank 0
    participant R1 as Rank 1
    participant N as NCCL
    R0->>R0: Forward and backward
    R1->>R1: Forward and backward
    R0->>N: Gradient bucket
    R1->>N: Gradient bucket
    N-->>R0: Reduced gradients
    N-->>R1: Reduced gradients
    R0->>R0: Optimizer step
    R1->>R1: Optimizer step
```

## Why DDP Works

Each GPU performs useful compute on a local batch. Collective communication combines gradients. Overlapping gradient reduction with backward computation can hide part of the communication cost.

## Limits

Every rank stores a full model and optimizer state. DDP therefore improves throughput but does not solve models that cannot fit on one rank.

## Production Concerns

- identical software and model state across ranks;
- deterministic rank and device mapping;
- distributed sampler correctness;
- one slow rank delaying all others;
- collective timeout and failure behavior.

## Troubleshooting

A hang after several steps often indicates a rank divergence: one process exited, skipped a collective, hit different control flow, or lost network connectivity.
