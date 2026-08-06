---
title: Chapter 06 — Tensor, Pipeline, and Expert Parallelism
description: Partition model computation across devices and understand communication, bubbles, and load balance.
sidebar_position: 7
tags: [tensor-parallelism, pipeline-parallelism, expert-parallelism]
---

# Tensor, Pipeline, and Expert Parallelism

When a model cannot fit or execute efficiently on one device, its computation can be partitioned.

## Comparison

| Parallelism | Partition | Main cost |
|---|---|---|
| Tensor | Operations within layers | Frequent collective communication |
| Pipeline | Groups of layers | Pipeline bubbles and stage imbalance |
| Expert | Mixture-of-experts routing | All-to-all traffic and expert imbalance |

## Hybrid Parallelism

Large systems combine data, tensor, pipeline, sequence, and expert parallelism. The topology should align frequent communication with the fastest links.

## Production Risk

A mathematically balanced partition can be physically unbalanced when stages have different kernels, memory, or network paths.

## Troubleshooting

Measure per-stage time, bubble fraction, all-reduce or all-to-all traffic, expert token distribution, and rank placement.
