---
title: Lab 01 — Run Multi-GPU DDP Training
description: Launch a deterministic DDP job, validate rank mapping, throughput, and gradient synchronization.
sidebar_position: 20
tags: [lab, ddp, multi-gpu]
---

# Lab 01 — Run Multi-GPU DDP Training

## Objective

Run a small approved PyTorch DDP workload across multiple GPUs, prove rank-to-device mapping, compare one- and multi-GPU throughput, and clean up.

## Architecture

```mermaid
flowchart LR
    Launcher[torchrun]
    R0[Rank 0 and GPU 0]
    R1[Rank 1 and GPU 1]
    NCCL[NCCL All-Reduce]
    Data[Distributed Sampler]

    Launcher --> R0
    Launcher --> R1
    Data --> R0
    Data --> R1
    R0 <--> NCCL <--> R1
```

## Prerequisites

Two or more GPUs, pinned container, matching driver and framework, a deterministic sample model, and no competing workloads.

## Deployment

Launch with `torchrun` using one process per GPU. Log global rank, local rank, device ID, batch assignment, and loss.

## Validation

Confirm unique data shards, identical model state after synchronization, stable loss, and expected device mapping.

## Performance

Measure samples per second and scaling efficiency from one to the available GPU count.

## Failure Injection

Terminate one rank in a disposable run and observe how the process group fails.

## Troubleshooting

Inspect rank logs, environment variables, NCCL output, sampler behavior, and process exit codes.
