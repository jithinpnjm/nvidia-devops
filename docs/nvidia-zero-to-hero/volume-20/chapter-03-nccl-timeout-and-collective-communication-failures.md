---
title: "NCCL Timeout and Collective Communication Failures"
slug: "nccl-timeout-communication-failures"
sidebar_position: 3
description: "Diagnose and resolve NCCL hangs, timeouts, and communication failures in distributed training."
---

## Symptoms

- NCCL AllReduce hangs indefinitely
- `NCCL operation timed out` error after several minutes
- Distributed training stalls on collective operations
- One GPU in a ring hangs the entire collective
- `ncclInternalError` with cryptic message

## Evidence

### Key Metrics to Collect

- NCCL_DEBUG=TRACE output from hang
- NCCL timeout value set
- Network bandwidth measurements
- Ring topology from `nvidia-smi topo -m`
- Per-GPU iteration timing from profiler

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

