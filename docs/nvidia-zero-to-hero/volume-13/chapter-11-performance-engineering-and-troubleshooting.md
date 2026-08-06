---
title: Chapter 11 — Performance Engineering and Troubleshooting
description: Decompose step time, diagnose stragglers, and resolve compute, communication, data, and checkpoint bottlenecks.
sidebar_position: 12
tags: [performance, troubleshooting, training]
---

# Performance Engineering and Troubleshooting

Training optimization begins with step-time decomposition.

## Step-Time Model

```mermaid
flowchart LR
    Data[Data Wait]
    Forward[Forward]
    Backward[Backward]
    Comm[Communication]
    Optimizer[Optimizer]
    Checkpoint[Checkpoint]

    Data --> Forward --> Backward --> Comm --> Optimizer --> Checkpoint
```

Measure each stage and overlap rather than relying on aggregate GPU utilization.

## Stragglers

Synchronized jobs progress at the speed of the slowest rank. Compare rank-level kernel time, collective time, CPU load, storage wait, network counters, thermals, and error events.

## Common Root Causes

- data loader or metadata bottleneck;
- rank mapped to wrong GPU or NIC;
- one degraded link;
- collective algorithm mismatch;
- power or thermal throttling;
- checkpoint serialization;
- software version drift;
- background workload contention.

## Incident Workflow

Capture launch configuration, world size, topology, logs by rank, NCCL debug output, GPU telemetry, fabric counters, and storage metrics before restarting.
