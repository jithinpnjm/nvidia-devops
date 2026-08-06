---
title: Chapter 10 — Observability and SLOs for Shared GPUs
description: Measure shared GPU health, contention, tenant experience, and service guarantees.
sidebar_position: 11
tags: [observability, slos, dcgm]
---

# Observability and SLOs for Shared GPUs

A node can show high utilization while tenants receive poor service. Shared GPU observability must connect hardware metrics to workload identity and service objectives.

## Metric Layers

- physical GPU health, power, thermals, ECC, and XID events;
- per-instance or per-process memory and utilization where available;
- scheduler queue time and Pending reasons;
- application throughput, latency, and errors;
- tenant allocation and quota use;
- profile inventory and fragmentation.

## SLO Examples

| Service | Useful SLO |
|---|---|
| Best-effort development | access within target queue time |
| MIG inference | p95 and p99 latency per profile |
| Shared batch | completed work per reserved hour |
| vGPU desktop | session availability and frame latency |

## Troubleshooting

If hardware looks healthy but the SLO fails, inspect simultaneous tenants, memory pressure, logical-to-physical oversubscription, throttling, and scheduler placement.

## Production Advice

Label metrics with stable tenant and workload identifiers, but avoid uncontrolled cardinality. Preserve node and profile topology so incidents can be reconstructed.
