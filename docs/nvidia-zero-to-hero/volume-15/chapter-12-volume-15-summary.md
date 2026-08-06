---
title: Chapter 12 — Volume 15 Summary
description: Consolidate AI storage data paths, filesystems, checkpointing, capacity, and operations.
sidebar_position: 13
tags: [ai-storage, summary, architecture]
---

# Volume 15 Summary

AI storage is the complete path that keeps accelerators supplied and training progress recoverable.

## Architecture Summary

- Local NVMe accelerates cache, staging, and temporary work but requires lifecycle controls.
- GPUDirect Storage can reduce CPU staging on supported paths.
- Lustre and BeeGFS scale shared filesystem access through distributed services and targets.
- Object storage provides durable dataset and artifact distribution.
- Checkpoints require consistency, bandwidth, retention, and restore validation.
- Metadata and preprocessing can dominate workloads with small files.

## Quick Revision

| Symptom | First question |
|---|---|
| GPU starvation | Is the batch queue empty, and why? |
| Storage idle but job slow | Is metadata or CPU preprocessing dominant? |
| Checkpoint pause | Is serialization or durable write on the critical path? |
| Inconsistent nodes | Do client, NIC, topology, mount, and cache states match? |
| GDS regression | Is the workload actually using the supported direct path? |

## Production Checklist

Dataset layout, source of truth, cache policy, file and metadata profile, checkpoint RTO, restore test, topology, benchmark methodology, headroom, telemetry, and rollback must be documented.
