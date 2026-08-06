---
title: Lab 02 — Benchmark NCCL Collectives
description: Benchmark all-reduce across GPU counts and nodes, record topology, and identify degraded paths.
sidebar_position: 21
tags: [lab, nccl, benchmarking]
---

# Lab 02 — Benchmark NCCL Collectives

## Objective

Establish a repeatable collective-communication baseline for one node and multiple nodes.

## Baseline

```bash
nvidia-smi topo -m
ibstat 2>/dev/null || true
ip -br link
```

## Benchmark

Run `all_reduce_perf` over a representative message-size range. Record algorithm bandwidth, bus bandwidth, errors, and variance.

## Validation

Compare all nodes and GPU counts. A single outlier suggests topology, link, placement, or health differences.

## Failure Injection

In a test environment, bind traffic to a slower or unintended interface and observe the changed curve.

## Troubleshooting

Verify rank placement, interface selection, RDMA, MTU, link rate, counters, and GPU-NIC locality.
