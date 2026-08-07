---
title: "Power Supply Issues and Brownout Scenarios"
slug: "power-supply-brownout-scenarios"
sidebar_position: 9
description: "Diagnose power delivery failures, voltage instability, and GPU behavior during power anomalies."
---

## Symptoms

- GPU power limit suddenly drops (e.g., 350W → 200W cap)
- Performance oscillates randomly during stable workload
- Xid errors coincide with high power demand spikes
- Multiple GPUs in system behave erratically
- `POWER_SUPPLY` errors in dmesg during peak GPU load

## Evidence

### Key Metrics to Collect

- GPU power consumption from DCGM
- Power limit from nvidia-smi
- System power supply output voltage (ripple, sag)
- Current draw correlation across GPUs
- dmesg power supply error logs

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

