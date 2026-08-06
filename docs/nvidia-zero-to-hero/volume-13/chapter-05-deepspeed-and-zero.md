---
title: Chapter 05 — DeepSpeed and ZeRO
description: Understand ZeRO stages, optimizer and parameter partitioning, offload, and production lifecycle trade-offs.
sidebar_position: 6
tags: [deepspeed, zero, distributed-training]
---

# DeepSpeed and ZeRO

ZeRO removes redundant training state across data-parallel ranks in stages.

| Stage | Partitioned state |
|---|---|
| ZeRO-1 | Optimizer state |
| ZeRO-2 | Optimizer state and gradients |
| ZeRO-3 | Optimizer state, gradients, and parameters |

Greater partitioning reduces memory per rank but increases communication and state-management complexity.

## Offload

CPU or NVMe offload can extend capacity but moves the bottleneck into host memory, PCIe, CPU, or storage. Benchmark end-to-end step time rather than only GPU memory reduction.

## Production Design

Version configuration with code, validate checkpoint restore, pin framework and communication dependencies, and test representative failure recovery.

## Troubleshooting

If GPU utilization is low with heavy offload, inspect host CPU, memory bandwidth, PCIe, NVMe queueing, and prefetch behavior.
