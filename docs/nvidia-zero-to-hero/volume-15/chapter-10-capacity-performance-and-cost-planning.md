---
title: Chapter 10 — Capacity, Performance, and Cost Planning
description: Size AI storage for usable capacity, bandwidth, metadata, burst, retention, and growth.
sidebar_position: 11
tags: [capacity-planning, cost, storage]
---

# Capacity, Performance, and Cost Planning

Storage planning must combine capacity and service behavior.

## Planning Dimensions

| Dimension | Example requirement |
|---|---|
| Usable capacity | datasets, models, checkpoints, replicas, headroom |
| Read bandwidth | concurrent training workers |
| Write bandwidth | synchronized checkpoints |
| Metadata | files, opens, creates, deletes, listings |
| Latency | model startup and random sample access |
| Recovery | restore throughput and RTO |
| Durability | replication, erasure coding, backup |
| Cost | media, network, software, operations, power |

## Tiering

Use object storage for durable source data, parallel storage for shared high-throughput access, local NVMe for cache and staging, and archive tiers for long-term retention when appropriate.

## Headroom

Reserve capacity and performance for failure, rebuild, maintenance, growth, and burst. A filesystem at extreme utilization often behaves worse before it becomes completely full.

## Customer Question

Why not buy only the cheapest capacity? Because idle GPUs can cost more than the storage savings, and recovery time has business value.
