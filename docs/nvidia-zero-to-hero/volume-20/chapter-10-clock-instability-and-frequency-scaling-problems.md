---
title: "Clock Instability and Frequency Scaling Problems"
slug: "clock-instability-frequency-scaling"
sidebar_position: 10
description: "Diagnose GPU clock instability, frequency scaling failures, and performance variability from clocking issues."
---

## Symptoms

- GPU clock speed fluctuates wildly (2.0 GHz → 0.5 GHz → 2.0 GHz) during steady workload
- Performance oscillates 30-40% without code changes
- Frequency stalls at low clock speeds despite low temperature and power headroom
- Specific GPU in cluster exhibits unstable clocks while others are stable

## Evidence

### Key Metrics to Collect

- GPU clock speed over time (Nsight Systems, DCGM)
- Power state from nvidia-smi (P0 vs P8)
- Temperature and power consumption (should be stable if workload is)
- Frequency scaling driver logs
- BIOS power management settings

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

