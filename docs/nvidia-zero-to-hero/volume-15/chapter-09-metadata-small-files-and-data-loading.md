---
title: Chapter 09 — Metadata, Small Files, and Data Loading
description: Diagnose metadata pressure, small-file amplification, preprocessing, and loader starvation.
sidebar_position: 10
tags: [metadata, data-loading, small-files]
---

# Metadata, Small Files, and Data Loading

Datasets with millions of small files often fail to use available bandwidth because every sample requires path lookup, permission checks, open, read, and close operations.

## Pipeline

```mermaid
flowchart LR
    Index[Dataset Index]
    Meta[Metadata Lookup]
    Open[Open File]
    Read[Read Payload]
    Decode[Decode or Transform]
    Batch[Batch Queue]
    GPU[GPU]

    Index --> Meta --> Open --> Read --> Decode --> Batch --> GPU
```

## Mitigations

- package samples into larger shard formats;
- maintain deterministic manifests;
- increase controlled loader concurrency;
- cache frequently reused data;
- move expensive transforms offline;
- pin workers and memory with NUMA awareness;
- prefetch without unbounded memory use.

## Troubleshooting

If the GPU waits while storage bandwidth looks low, measure files opened per second, metadata latency, CPU decode, worker queue depth, and batch-ready time.
