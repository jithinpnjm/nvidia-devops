---
title: "ECC Errors and Memory Bit Flips"
slug: "ecc-errors-memory-bit-flips"
sidebar_position: 5
description: "Detect, diagnose, and respond to ECC errors, correctable/uncorrectable bit flips, and memory reliability issues."
---

## Symptoms

- DCGM reports correctable ECC errors (CECs)
- DCGM reports uncorrectable ECC errors (UECs) — GPU halts
- Random training loss spikes without code changes
- Model accuracy diverges from baseline
- Specific GPU exhibits unusual error rates

## Evidence

### Key Metrics to Collect

- DCGM ECC counters (correctable, uncorrectable, aggregate)
- ECC error rate trend (errors per GPU-hour)
- Which memory module (HBM0-9 on H100) exhibits errors
- Thermal history correlation
- Power supply ripple measurements

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

