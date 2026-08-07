---
title: "Lab 03 — Production Incident Simulation"
slug: "lab-03-incident-simulation"
sidebar_position: 3
description: "Reproduce common failure scenarios and execute resolution procedures."
---

## Objective

Practice resolving GPU failures in realistic scenarios. Learn the sequence of actions, time pressure, and decision-making under incomplete information.

## Duration

120 minutes

## Prerequisites

- Understanding of all 12 troubleshooting chapters
- Ability to read profiler output and system logs
- Knowledge of GPU recovery procedures

## Exercises

### Exercise 1: NCCL Hang During Training (30 min)

**Timeline:**
- 09:15 - Training starts successfully
- 09:45 - Job stalls on AllReduce (no progress for 5 min)
- 09:50 - Oncall page fires

**Your job:**
1. Decide: wait longer or restart now?
2. Collect evidence (NCCL_DEBUG trace, per-GPU states)
3. Identify which GPU is slow
4. Execute resolution (restart vs. investigate vs. escalate)
5. Verification: job runs again, does it stall at same point?

**Decision Points:**
- How long do you wait before declaring "hang"?
- Which evidence do you trust under time pressure?
- How do you prevent this from happening again?

### Exercise 2: Thermal Throttling Incident (30 min)

**Timeline:**
- 14:00 - Job running normally (2000 samples/sec)
- 14:30 - Performance drops to 1200 samples/sec
- 14:45 - GPU at 85°C, fan 100%, no improvement
- 15:00 - Oncall page fires

**Your job:**
1. Verify it's thermal (confirm with metrics)
2. Determine: fan failure vs. cooling failure vs. ambient temp rise
3. Execute immediate mitigation (reduce batch size, migrate to spare GPU)
4. Long-term fix (replace fan, improve airflow, upgrade cooler)

**Decision Points:**
- When do you stop the job vs. reduce load?
- How do you determine if fan has failed (not just working hard)?
- What's the risk of continued operation?

### Exercise 3: ECC Error Storm (30 min)

**Timeline:**
- 10:00 - Running normally
- 10:15 - DCGM reports 1 ECC error
- 10:25 - 50 ECC errors accumulated
- 10:30 - Training accuracy diverges significantly

**Your job:**
1. Determine: is this stochastic noise or real memory failure?
2. Isolate which HBM module is failing
3. Decide: continue with reduced memory, or stop?
4. Execute resolution

**Decision Points:**
- At what error rate do you stop the job?
- Can you work around a failing memory module?
- How do you predict if errors will continue escalating?

## Expected Outcomes

- You can make decisions under time pressure with incomplete information
- You understand the tradeoffs between immediate mitigation and root cause diagnosis
- You know the escalation paths and when to involve hardware support

## Verification

Compare your decisions to the chapter's resolution procedures. Did you make the right calls in the right sequence?

