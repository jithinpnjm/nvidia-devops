---
title: Chapter 03 — Local NVMe and Data Staging
description: Use local NVMe for caches, staging, shuffle, temporary data, and checkpoint acceleration.
sidebar_position: 4
tags: [nvme, data-staging, cache]
---

# Local NVMe and Data Staging

Local NVMe places high-throughput storage near the GPU node. It reduces shared-fabric demand and can absorb bursty temporary I/O.

## Appropriate Uses

- dataset cache for repeated epochs;
- temporary preprocessing output;
- shuffle and spill space;
- model and container cache;
- checkpoint staging before durable copy;
- local inference model cache.

## Architecture

```mermaid
flowchart LR
    Durable[Durable Shared Storage]
    Stage[Staging Controller]
    NVMe[Node-Local NVMe]
    Loader[Data Loader]
    GPU[GPU]
    Flush[Asynchronous Flush]

    Durable --> Stage --> NVMe --> Loader --> GPU
    GPU --> NVMe --> Flush --> Durable
```

## Trade-offs

Local storage improves performance but creates data-placement, eviction, durability, and node-failure concerns. The source of truth must remain explicit.

## Production Design

Use checksums, cache keys, capacity limits, cleanup policy, warm-up observability, and failure-safe fallback. Do not let unbounded caches consume the operating-system disk.

## Troubleshooting

If some nodes are fast and others slow, compare NVMe health, filesystem, fill level, NUMA locality, cache state, and background flush activity.
