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

### Exercise 1 Solution: Fan Failure Postmortem

**Root Cause Analysis:**

| Question | Answer | Evidence |
|----------|--------|----------|
| Root cause? | Fan bearing seized (mechanical failure) | Fan speed 0 RPM under any load condition |
| Why not caught earlier? | **No proactive fan monitoring** | System only reacted when temp exceeded threshold |
| Detection latency | 2 hours 15 minutes | Job started 06:00, alert at 08:15 when temp hit 85°C |
| Resolution time | 20 minutes (08:15 to 08:35) | But 2hr 15min already wasted on unnecessary workload |
| Total incident impact | 2h 35m compute time wasted | Job restarts from previous checkpoint, loses iteration work |

**Timeline Reconstruction:**

```
06:00 - Job starts, GPU healthy, fan running normally
06:00-08:15 - Fan bearing gradually degrading (imperceptible to user)
           - Temperature rising 0.05°C/min (very slow)
08:15 - Temperature reaches 85°C threshold → Alert fires
       - First indication that something is wrong
08:16 - Oncall pages, checks nvidia-smi
       - Discovers fan at 0 RPM (should be 50%+ at this load)
08:20 - Diagnosis: fan failure
       - Decision: stop job, replace fan (vs. hope it recovers)
08:35 - Fan replaced, GPU confirmed healthy
08:45 - Job resumes (restarts from last checkpoint)
```

**Prevention Strategy:**

```bash
#!/bin/bash
# PROACTIVE FAN MONITORING (should run weekly)

for gpu in {0..7}; do
  # Synthetic load test
  timeout 30 cuda-burn &
  sleep 25  # Let it heat up
  
  # Measure temperature rise rate
  baseline_temp=$(nvidia-smi -i $gpu --query-gpu=temperature.gpu --format=csv,noheader)
  sleep 5
  final_temp=$(nvidia-smi -i $gpu --query-gpu=temperature.gpu --format=csv,noheader)
  rise_rate=$(echo "scale=3; ($final_temp - $baseline_temp) / 5" | bc)
  
  # Measure fan response
  fan_speed=$(nvidia-smi -i $gpu --query-gpu=fan.speed --format=csv,noheader)
  
  # Health criteria:
  # - Rise rate should be 0.05-0.1°C/sec (normal fan cooling)
  # - Fan speed should be 50%+ when temp rises above baseline
  
  if (( $(echo "$rise_rate > 0.2" | bc -l) )); then
    echo "GPU $gpu: FAN DEGRADATION DETECTED (rise rate: $rise_rate°C/sec)"
    echo "  Action: Schedule fan replacement within 1 week"
  fi
done

# Alert rule (Prometheus)
alert: FanDegradation
expr: rate(gpu_temp[1m]) > 0.15  # °C per second
for: 10m  # Sustained high temp rise rate
annotations:
  summary: "GPU {{ $labels.gpu }} showing signs of fan degradation"
  action: "Schedule preventive fan replacement"
```

**Why this prevents future incidents:**
- Weekly test detects fan degradation 2+ weeks before failure
- Allows scheduling replacement during maintenance window
- Avoids emergency hardware replacement during production job

### Exercise 2 Solution: ECC Error Escalation Postmortem

**Timeline Analysis:**

| Time | ECC Errors | Error Rate | Accuracy | Status |
|------|-----------|-----------|----------|--------|
| 15:00 | 1 | 1/hour baseline | 92% | Running |
| 15:30 | 50 | 100/hour | 92% | Running (errors not yet visible) |
| 16:00 | 500 | 300/hour | 92% | **CRITICAL** |
| 16:15 | 600+ | 400/hour | 85% | **STOP** |
| 16:20 | Job stopped | - | 85% (corrupted) | Decision made too late |

**Decision: When should you have stopped?**

```
Answer: At 15:30 (when error rate exceeded 10/hour)

Reasoning:
- 1 error at 15:00 = noise, acceptable
- 50 errors by 15:30 = 100/hour rate
  → At this rate, will have 500 errors by 16:00
  → GPU memory is degrading rapidly
  → Stop and diagnose before accuracy corrupts

Rule of thumb:
  Error rate < 1/hour: monitor only
  Error rate 1-10/hour: reduce workload, plan replacement
  Error rate > 10/hour: STOP immediately
```

**Detection latency analysis:**

```
The accuracy drop (92% → 85%) at 16:15 is the LATE warning.
By then, 600+ errors have corrupted training state.

Better indicators:
- At 15:30: error rate 50/30min = 100/hour → 30x normal
- This should have triggered automated job stop

Why it wasn't automated:
- DCGM was monitoring errors (good)
- But no automated action on rate acceleration (bad)
- Oncall had to manually review logs and make decision (slow)
```

**Prevention Strategy:**

```python
# Real-time ECC monitoring with automated response
class ECCMonitor:
    def __init__(self):
        self.errors_per_minute = deque(maxlen=60)  # Last 60 minutes
        self.safe_rate = 1/60  # 1 error/hour
        self.warning_rate = 10/60  # 10 errors/hour
        self.critical_rate = 100/60  # 100 errors/hour
        
    def check_ecc(self):
        current_errors = dcgmi.get_ecc_errors()
        rate = current_errors - self.prev_errors
        self.errors_per_minute.append(rate)
        
        avg_rate = np.mean(self.errors_per_minute)
        
        if avg_rate > self.critical_rate:
            print("CRITICAL: Stopping job to prevent data corruption")
            self.stop_job()  # Kill training process
            self.drain_gpu()  # Remove from cluster
        elif avg_rate > self.warning_rate:
            print("WARNING: High ECC rate, will stop if continues")
            self.reduce_workload()  # Lower batch size
            self.set_escalation_timer(600)  # Stop in 10min if rate persists
```

### Exercise 3 Solution: NCCL Timeout Postmortem

**Incident Reconstruction:**

```
Root cause (likely): NVLink to GPU 4 degraded (Gen3 x8 instead of Gen4 x16)

Timeline of degradation:
10:00 - Training starts, all GPUs healthy, AllReduce latency 12ms
10:05 - NVLink link training issue occurs (imperceptible at first)
        GPU 4's communication is now slower (30ms instead of 12ms)
        But training continues (not yet timeout)
10:10 - Latency grows (100ms) as more data accumulates
10:15 - AllReduce call blocks, waits for GPU 4
        300-second timeout expires
10:16 - Job terminates (timeout)

Total wasted compute: 16 minutes from start to failure
```

**Critical timeline gaps:**

| When | What Should Happen | What Actually Happened | Why Missed |
|------|-------------------|------------------------|------------|
| 10:05 | Detect 30ms latency anomaly | Undetected | No per-GPU AllReduce latency monitoring |
| 10:05-10:15 | Preemptive action (migrate or restart) | None | No automated escalation trigger |
| 10:15 | Detect timeout starting | 5 minutes later at 10:20 | No realtime timeout alerts |
| 10:16 | Quick diagnosis (which GPU slow?) | Manual analysis needed | No integration between NCCL and GPU monitoring |

**Prevention Strategy:**

```bash
# 1. Real-time AllReduce latency monitoring (per GPU pair)
for i in {0..7}; do
  for j in {0..7}; do
    if [[ $i != $j ]]; then
      latency_ij=$(measure_p2p_latency $i $j)
      if [[ $latency_ij -gt 30 ]]; then  # Baseline 12ms, threshold 30ms = 2.5x
        echo "ALERT: GPU $i ↔ GPU $j latency: ${latency_ij}ms (expected 12ms)"
        # Auto-action: drain these GPUs from training cluster
      fi
    fi
  done
done

# 2. AllReduce timeout detection and preemption
export NCCL_DEBUG=TRACE
export NCCL_DEBUG_SUBSYS=COLL

# Wrapper that monitors for timeouts
python train.py 2>&1 | tee -a training.log &
job_pid=$!

# Monitor NCCL_DEBUG output for hangs
tail -f training.log | while read line; do
  if echo "$line" | grep -q "hanging\|TIMEOUT"; then
    echo "AllReduce hang detected at $(date)"
    # Kill job and notify oncall
    kill $job_pid
    send_alert "AllReduce timeout, killing job"
    break
  fi
done

# 3. Prometheus alert for latency variance
alert: NCCLLatencyAnomaly
expr: |
  max(nccl_allreduce_latency) / min(nccl_allreduce_latency) > 2.5
for: 1m
annotations:
  summary: "NCCL latency imbalanced by {{ $value }}x across GPUs"
  action: "Drain affected GPUs, restart job"
```

**Expected outcomes of prevention:**
- **Without:** 16 minutes wasted, job fails at 10:16
- **With:** Latency anomaly detected at 10:06, job restarts at 10:08 with working 7 GPUs

## Expected Outcomes

- You can reconstruct incident timelines from raw data
- You understand the chain: degradation → detection → mitigation → resolution
- You can design monitoring and prevention strategies based on incidents
- You understand cost of delayed detection (hours of wasted compute, user frustration)

## Verification Rubric

**Exercise 1:** You identified fan degradation as root cause, recognized 2h 15m detection latency as the problem, and designed proactive fan monitoring to catch degradation 2+ weeks early ✓
**Exercise 2:** You correctly calculated that stopping should happen at 15:30 (when rate hit 100/hour), and designed automated escalation based on error rate (not just count) ✓
**Exercise 3:** You identified NVLink degradation as likely cause, realized 10-minute wasted compute before timeout, and designed real-time per-GPU AllReduce latency monitoring to detect at 10:05 instead of 10:15 ✓

