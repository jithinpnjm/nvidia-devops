---
title: "Fan Failure and Cooling System Degradation"
slug: "fan-failure-cooling-degradation"
sidebar_position: 8
description: "Diagnose fan failures, predict cooling system degradation, and respond to thermal emergencies."
---

## Symptoms

- Fan speed stuck at 0 RPM despite high GPU temperature
- Temperature rises 2-3°C per minute under load
- DCGM reports fan speed abnormality
- Thermal throttling activates within minutes of starting GPU work
- Two or more fans failing simultaneously on multi-fan systems

## Evidence

### Key Metrics to Collect

- Fan speed from `nvidia-smi -q`
- GPU temperature rise rate
- DCGM fan speed anomaly reports
- Acoustic signature (no fan noise)
- Power supply fan speeds (if accessible)

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

