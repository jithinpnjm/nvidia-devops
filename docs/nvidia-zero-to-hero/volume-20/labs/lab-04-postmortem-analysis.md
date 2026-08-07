---
title: "Lab 04 — Postmortem Analysis"
slug: "lab-04-postmortem-analysis"
sidebar_position: 4
description: "Analyze a real incident timeline and construct prevention strategies."
---

## Objective

Practice incident analysis: reconstruct what happened, identify root cause, and design prevention. Learn how to extract learning from failures.

## Duration

90 minutes

## Prerequisites

- Understanding of all 12 troubleshooting chapters
- Familiarity with postmortem methodology
- Knowledge of observability and monitoring systems

## Exercises

### Exercise 1: Fan Failure Incident Analysis

**Incident Timeline:**
```
2026-08-01 06:00 - GPU job starts (training, batch size 128)
2026-08-01 08:15 - Alert: GPU temperature exceeds 85°C
2026-08-01 08:20 - Oncall investigates, notices fan speed = 0 RPM
2026-08-01 08:21 - Fan replacement in progress
2026-08-01 08:35 - Fan replaced, GPU back online
2026-08-01 08:45 - Job resumes, runs until completion
```

**Postmortem Questions:**
1. What is the root cause? (Fan failure or detection system failure?)
2. Why wasn't this caught before the alert?
3. How long was the incident (detection latency + resolution time)?
4. What should have prevented this incident?
5. Design a prevention strategy:
   - What would you monitor?
   - What thresholds would trigger early warning?
   - How would you predict fan degradation before failure?

### Exercise 2: ECC Error Escalation

**Incident Timeline:**
```
2026-08-05 14:30 - Training job starts on GPU 0
2026-08-05 15:00 - DCGM detects 1 ECC error (correctable)
2026-08-05 15:30 - ECC error count: 50
2026-08-05 16:00 - ECC error count: 500
2026-08-05 16:15 - Training accuracy drops from 92% to 85%
2026-08-05 16:20 - Job stopped to prevent data corruption
2026-08-05 16:30 - GPU removed from cluster
```

**Postmortem Questions:**
1. When should you have stopped the job?
2. Was the accuracy drop from ECC errors or model convergence?
3. Design an ECC monitoring strategy:
   - What's the safe error rate?
   - At what point do you stop accepting errors?
   - How do you predict if errors will escalate?

### Exercise 3: NCCL Timeout Investigation

**Incident Timeline:**
```
2026-08-10 10:00 - 8-GPU training starts
2026-08-10 10:05 - GPU 4 lags (30ms AllReduce vs 12ms for others)
2026-08-10 10:10 - AllReduce latency: GPU 4 at 100ms
2026-08-10 10:15 - AllReduce timeout (300s no progress)
2026-08-10 10:16 - Job terminates
```

**Postmortem Questions:**
1. When did the problem actually start (detection latency)?
2. Was it NVLink failure, network issue, or GPU performance issue?
3. Why did it take 11 minutes to detect the timeout?
4. Design a prevention strategy:
   - How would you detect the 30ms latency anomaly (step 2)?
   - How would you prevent the timeout?
   - Should you have migrated to working GPUs?

## Expected Outcomes

- You can reconstruct incident timelines from raw data
- You understand the chain: degradation → detection → mitigation → resolution
- You can design monitoring and prevention strategies based on incidents

## Verification

Compare your postmortem analysis to real incident reports from GPU providers. Did you identify the critical decision points?

