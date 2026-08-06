---
title: Chapter 08 — Checkpoint Architecture and Recovery
description: Design checkpoint consistency, sharding, staging, retention, replication, and restart validation.
sidebar_position: 9
tags: [checkpointing, recovery, storage]
---

# Checkpoint Architecture and Recovery

Checkpoint storage converts training progress into recoverable state. Its architecture must support synchronized writes, metadata, retention, and large recovery reads.

## Lifecycle

```mermaid
flowchart LR
    Ranks[Training Ranks]
    Serialize[Sharded Serialization]
    Stage[Local or Burst Staging]
    Durable[Durable Shared Storage]
    Catalog[Checkpoint Catalog]
    Validate[Restore Validation]

    Ranks --> Serialize --> Stage --> Durable --> Catalog --> Validate
```

## Consistency

A checkpoint should not be published as complete until all required shards and metadata are durable. Use temporary paths, manifests, checksums, and atomic publication patterns where supported.

## Retention

Balance frequent recovery points against storage cost. Retain known-good milestones separately from short-term rolling checkpoints.

## Troubleshooting

**Symptom:** training pauses grow longer over time.

**Diagnosis:** inspect checkpoint size, serialization, target fill level, metadata, network, retention cleanup, and background replication.

## Production Advice

Test restore on a schedule. A checkpoint that has never been restored is an unverified backup.
