---
title: Chapter 09 — Checkpointing and Recovery
description: Design consistent, scalable checkpoints and prove restart behavior before production failure.
sidebar_position: 10
tags: [checkpointing, recovery, storage]
---

# Checkpointing and Recovery

A training platform is not reliable until it can restart from validated state.

## Checkpoint Contents

Model parameters, optimizer state, scheduler state, random-number state, scaler state, data-loader position, parallelism metadata, and framework version may all be required.

## Architecture

```mermaid
flowchart LR
    Ranks[Distributed Ranks]
    Serialize[Sharded Serialization]
    Storage[Checkpoint Storage]
    Catalog[Metadata and Retention]
    Restore[Restore Validation]

    Ranks --> Serialize --> Storage --> Catalog --> Restore --> Ranks
```

## Trade-offs

Frequent checkpoints reduce lost work but increase storage traffic and step interruption. Asynchronous and sharded checkpoints reduce pauses but complicate consistency and recovery.

## Troubleshooting

**Symptom:** checkpoints write successfully but restore fails at a different world size.

**Root cause:** the checkpoint format or metadata assumes the original sharding and parallelism layout.

## Prevention

Test restore regularly, retain checksums and metadata, monitor duration, and include checkpoint load in release acceptance.
