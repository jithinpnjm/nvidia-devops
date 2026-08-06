---
title: Chapter 09 — Scaling Multi-GPU and Multi-Node Inference
description: Scale inference with replicas, tensor parallelism, pipeline parallelism, and distributed routing.
sidebar_position: 10
tags: [multi-gpu, scaling, inference]
---

# Scaling Multi-GPU and Multi-Node Inference

Inference scales in two fundamentally different ways: replicate independent model servers or partition one model across several GPUs.

## Scale-Out Replicas

Replicas improve availability and concurrency when the model fits on one device or node. Routing must consider warm state, model version, cache locality, and health.

## Model Partitioning

Tensor or pipeline parallelism allows larger models to fit and may increase throughput. It also introduces communication into the request path and creates a larger failure domain.

| Strategy | Strength | Risk |
|---|---|---|
| Replicas | Simple scaling and failure isolation | Full model copy per replica |
| Tensor parallelism | Larger model and faster execution | Communication every layer or token |
| Pipeline parallelism | Stage distribution | Bubbles and stage imbalance |
| Multi-node serving | Very large models | Network latency and wider failure domain |

## Production Design

Use topology-aware placement, health-aware routing, spare capacity, controlled model rollout, and consistent runtime versions.

## Troubleshooting

If one-node performance is healthy but multi-node performance is poor, inspect collective paths, NIC locality, network counters, rank placement, and synchronization.
