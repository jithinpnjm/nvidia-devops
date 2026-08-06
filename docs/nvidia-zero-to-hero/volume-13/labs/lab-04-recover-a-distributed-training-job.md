---
title: Lab 04 — Recover a Distributed Training Job
description: Create, interrupt, and restore a multi-rank training job from a validated checkpoint.
sidebar_position: 23
tags: [lab, recovery, checkpointing]
---

# Lab 04 — Recover a Distributed Training Job

## Objective

Prove that a distributed job can recover after a controlled rank or node failure without silently losing state.

## Workflow

1. Start a deterministic multi-rank job.
2. Save a checkpoint with model, optimizer, scheduler, RNG, and progress state.
3. Record checksum and metadata.
4. Terminate one rank or the job.
5. Relaunch from the checkpoint.
6. Compare resumed loss and progress with an uninterrupted control run.

## Observability

Capture per-rank logs, checkpoint duration, storage throughput, restart time, world size, and recovery errors.

## Failure Injection

Remove one checkpoint shard in a disposable copy. The restore should fail clearly rather than continue with incomplete state.

## Prevention

Automate restore tests, retention, checksums, and compatibility checks as part of the training platform release process.
