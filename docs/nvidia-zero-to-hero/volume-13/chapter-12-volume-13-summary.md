---
title: Chapter 12 — Volume 13 Summary
description: Consolidate distributed training memory, parallelism, communication, recovery, and operations.
sidebar_position: 13
tags: [training, summary, architecture]
---

# Volume 13 Summary

Distributed training exchanges one-device limits for communication and coordination complexity.

## Architecture Summary

- DDP replicates model state and synchronizes gradients.
- FSDP and ZeRO shard state to reduce per-rank memory.
- Tensor, pipeline, and expert parallelism partition model computation.
- NCCL maps collectives onto GPU and network topology.
- Checkpointing makes progress recoverable.
- Multi-node training requires homogeneous, observable, qualified infrastructure.

## Quick Revision

| Symptom | First investigation |
|---|---|
| OOM in backward | activations, gradients, optimizer state |
| Poor multi-node scaling | collective and network paths |
| Random hang | rank divergence or failed peer |
| Periodic long pauses | checkpoint or data pipeline |
| One slow step | rank-level straggler evidence |

## Production Checklist

Pinned images, topology-aware launch, data baseline, NCCL benchmark, checkpoint restore test, per-rank telemetry, failure quarantine, and rollback are mandatory.
