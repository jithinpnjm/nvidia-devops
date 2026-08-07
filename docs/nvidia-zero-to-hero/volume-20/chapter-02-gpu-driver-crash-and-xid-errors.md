---
title: "GPU Driver Crash and Xid Errors"
slug: "gpu-driver-crash-xid-errors"
sidebar_position: 2
description: "Understand and recover from GPU driver crashes, Xid error codes, and unrecoverable GPU errors."
---

## Symptoms

- Xid error messages in `dmesg` output
- CUDA context suddenly becomes invalid
- GPU processes terminate abruptly
- `nvidia-smi` becomes unresponsive or reports GPU as "Not Supported"
- NCCL hangs with "unhandled cuda error"

## Evidence

### Key Metrics to Collect

- Xid error code and full dmesg output
- GPU state before/after crash
- Power consumption at time of error
- Temperature readings
- ECC error counters

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

