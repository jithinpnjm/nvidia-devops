---
title: "Thermal Throttling and Cooling Degradation"
slug: "thermal-throttling-cooling-degradation"
sidebar_position: 6
description: "Diagnose thermal throttling events, monitor cooling system health, and resolve temperature-related performance loss."
---

## Symptoms

- GPU clock speed drops from 2.5 GHz to 1.8 GHz during load
- Performance degrades 15-30% mid-training without code changes
- Temperature rises to 85°C (throttle threshold)
- DCGM reports thermal slowdown events
- Fan speed maxes at 100% but temperature still rising

## Evidence

### Key Metrics to Collect

- GPU temperature trend (`nvidia-smi dmon`)
- Clock speed before/after throttle
- Fan speed and fan health
- Thermal events from DCGM
- Ambient temperature
- Power consumption

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

