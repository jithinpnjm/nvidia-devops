---
title: Chapter 04 — FSDP and Parameter Sharding
description: Understand parameter, gradient, and optimizer sharding with Fully Sharded Data Parallel.
sidebar_position: 5
tags: [fsdp, sharding, pytorch]
---

# FSDP and Parameter Sharding

FSDP reduces per-rank memory by sharding training state and materializing parameters when needed.

## Conceptual Flow

```mermaid
flowchart LR
    Shards[Parameter Shards]
    Gather[All-Gather Parameters]
    Compute[Forward or Backward Compute]
    Reduce[Reduce-Scatter Gradients]
    State[Sharded Optimizer State]

    Shards --> Gather --> Compute --> Reduce --> State
```

## Trade-off

Sharding makes larger models possible but increases communication and lifecycle complexity. Wrapping policy, prefetching, mixed precision, CPU offload, and state-dict strategy all influence memory and performance.

## Checkpointing

A distributed checkpoint must preserve enough metadata to reconstruct sharded state. Consolidating all state on one rank may become a memory and time bottleneck.

## Troubleshooting

**Symptom:** the model fits with FSDP but trains slower than DDP.

**Diagnosis:** inspect all-gather and reduce-scatter time, wrapping granularity, communication overlap, CPU offload, and small shard inefficiency.

**Root cause:** memory savings were achieved at excessive communication cost.
