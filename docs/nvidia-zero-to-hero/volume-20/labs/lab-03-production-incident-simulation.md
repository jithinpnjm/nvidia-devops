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

### Exercise 1 Solution: NCCL Hang

**Timeline and Actions:**

| Time | Event | Action | Reasoning |
|------|-------|--------|-----------|
| 09:45 | AllReduce stalls | Check `nvidia-smi` and `dmesg` immediately | Stall detected at iteration 15, need quick triage |
| 09:47 | Enable NCCL_DEBUG | `export NCCL_DEBUG=TRACE` and attach to hanging process | Collect evidence without restarting (might get lucky) |
| 09:49 | Analyze trace | Last message: "GPU 2 send timeout" after 5 seconds | GPU 2 is the bottleneck |
| 09:50 | Decision point | Wait 1 more minute, then restart if not progressing | Acknowledge page and buy 60 more seconds to decide |
| 09:51 | Check GPU 2 metrics | `nvidia-smi -i 2 -q` shows temp 85°C, clock 1200 MHz | GPU 2 is thermal throttled! |
| 09:52 | Immediate fix | Reduce batch size by 50% to lower temp | Restart with reduced batch size |
| 09:53 | Restart training | `python train.py --batch-size 128 --gpu 0,1,3 # Skip GPU 2` | Restart without GPU 2 while investigating |
| 09:55 | Verification | Monitor for progress | Should see normal iteration times now |
| 10:00 | Root cause diagnosis | Schedule thermal investigation on GPU 2 | Fan, thermal paste, airflow issue |

**Expected outputs:**

```bash
# Step 1: NCCL_DEBUG output
$ NCCL_DEBUG=TRACE timeout 10 python train.py 2>&1 | head -50

ncclAllReduce: rank=0, nBytes=4MB, time=45us
ncclAllReduce: rank=1, nBytes=4MB, time=48us
ncclAllReduce: rank=2, nBytes=4MB, hanging...
[5 seconds of no output]
# TIMEOUT OR HANG DETECTED

# Step 2: GPU 2 investigation
$ nvidia-smi -i 2 -q | grep -E "Temperature|Clock|Throttle"
GPU Current Temp                    : 85 C
Graphics Clock                      : 1200 MHz  (throttled from 1980!)
Thermal Slowdown                    : Active
```

**Decision flow:**
- **Should we wait?** Max 60 seconds. After that, restarting is better than burning datacenter resources.
- **Which evidence to trust?** NCCL trace > nvidia-smi; NCCL shows exactly which GPU is stalled.
- **Prevention:** Set aggressive temperature alerts (> 75°C); restart jobs preemptively before thermal hang occurs.

### Exercise 2 Solution: Thermal Throttling Incident

**Timeline and Actions:**

| Time | Event | Expected Action | Verification |
|------|-------|-----------------|--------------|
| 14:30 | 40% perf drop detected | Check temperature: `nvidia-smi -q` | Should show 85°C if thermal |
| 14:32 | Confirmed thermal | Check if fan responds: run load test, monitor fan % increase | Fan should go to 100% if working |
| 14:35 | Fan is at 100% but temp not dropping | Hypothesis: fan failure OR thermal paste degraded OR airflow blocked | Inspect GPU physically; listen for fan noise |
| 14:40 | **Decision point: stop or continue?** | Temp 85°C is at throttle limit; risk of data corruption if stays > 87°C → **STOP job** | No point running if throttled; just burns power |
| 14:42 | **Mitigation: immediate** | Migrate job to spare GPU or reduce batch size to 25% | Restore training at reduced capacity while investigating |
| 14:45 | **Diagnosis: which layer failed?** | Run synthetic load on GPU 2 alone (no training data): `gpu-burn 30s` | Measure temperature rise rate |
| 14:50 | Analysis | Temperature rise rate determines issue: <br/>- 0.05°C/sec = normal, no issue<br/>- 0.25°C/sec = fan stuck or paste degraded<br/>- 0.50°C/sec = severe cooling failure | If rate > 0.2°C/sec → schedule immediate fan/paste replacement |
| 15:00 | **Long-term fix** | Order replacement part (fan assembly or full GPU) | Estimate lead time; plan hot-swap |

**Expected outputs:**

```bash
# Step 1: Temperature check
$ nvidia-smi -i 2 -q | grep -A 5 "Temperature"
GPU Current Temp                    : 85 C
GPU Max Operating Temp              : 87 C  <- Very close to limit

# Step 2: Fan check
$ nvidia-smi -i 2 --query-gpu=fan.speed --format=csv,noheader
100

# Step 3: Load test (synthetic, no training data)
$ gpu-burn 30
Temperature @ start: 55°C
Temperature @ 10s:   65°C
Temperature @ 20s:   75°C
Temperature @ 30s:   83°C
Rise rate: (83-55)/30 = 0.93°C/sec → **FAN FAILURE**

# Compare to baseline (healthy system):
# Expected: 0.05°C/sec under same load
```

**Decision criteria:**
- **Temp > 85°C + fan 100% = STOP immediately** (risk > benefit)
- **After fix:** Verify temperature stabilizes below 80°C before resuming production load

### Exercise 3 Solution: ECC Error Storm

**Timeline and Actions:**

| Time | Event | Action | Decision Logic |
|------|-------|--------|-----------------|
| 10:15 | 1 ECC error | Monitor and log | Single errors can be cosmic rays; not actionable yet |
| 10:25 | 50 ECC errors in 10 min | **Alert: escalating rate** | Calculate error rate: 50/10min = 5/min = unsustainable |
| 10:30 | Accuracy diverges | **STOP job immediately** | ECC errors corrupting training data; continued run will waste compute |
| 10:31 | Isolate failing module | Run memory test to locate bad address range | `cuda-memtest --stress --stress_iterations 5 -d 2` |
| 10:35 | Memory test results | If errors in specific range, HBM module failing; if scattered, broader issue | Determines if we can work around it |
| 10:40 | **Decision: salvage or replace?** | If errors in &lt; 5% of HBM, can relocate GPU workload; otherwise replace GPU | Cost-benefit: days to workaround vs. 2-4hr hardware RMA |
| 10:45 | **Mitigation: immediate** | Drain GPU from cluster; add to maintenance pool | Prevents cascading failures on other jobs |
| 11:00 | **Long-term** | Escalate to hardware team for GPU replacement | RMA process and lead time |

**Expected outputs:**

```bash
# Step 1: Monitor ECC error rate
$ dcgmi dmon -s emcr -c 5

# Expected output (healthy):
# ECC Errors: 0, 0, 0, 0, 0

# Expected output (failing):
# ECC Errors: 1, 5, 12, 21, 35  <- Accelerating rate!

# Calculate rate:
rate = errors[4] - errors[0] = 35 - 1 = 34 errors in 4 samples (≈1 min)
# Extrapolate: if rate continues, 34 × 60 = 2040 errors/hour
# → Unacceptable. Memory is failing rapidly.

# Step 2: Memory test to isolate
$ cuda-memtest --stress --stress_iterations 5 -d 2 2>&1 | grep -i "error\|fail"

Possible output:
Test 1 (Write + Read): FAIL @ address 0x12345678
Test 2 (Verify): FAIL @ address 0x12345678
Test 3: PASS
Test 4: PASS
Test 5: PASS

Analysis: Error concentrated at 0x12345678 → specific memory cell or page
→ Could potentially workaround by pinning that address as "bad"
→ But unlikely to be worth the engineering effort

# Step 3: Alternative test (if can pinpoint module)
$ nvidia-smi -i 2 -q | grep -i "memory"
# If error_rate > 10/hour per module → module failing
```

**Decision criteria:**
- **Error rate &lt; 1/hour:** Monitor, maybe continue
- **Error rate 1-10/hour:** Reduce load, plan replacement
- **Error rate > 10/hour:** **STOP immediately**, escalate

**Why stop at 50 errors:**
- 50 errors in 10 minutes = 300/hour
- At this rate, model accuracy will degrade significantly
- Continuing wastes compute and GPU resources
- Better to stop, diagnose, and restart on healthy GPU

## Expected Outcomes

- You can make decisions under time pressure with incomplete information
- You understand the tradeoffs between immediate mitigation and root cause diagnosis
- You know the escalation paths and when to involve hardware support
- You can quantify "is this bad enough to stop?" using error rates and impact analysis

## Verification Rubric

**Exercise 1:** You identified GPU 2 as the bottleneck (from NCCL_DEBUG trace), recognized thermal throttling as the root cause, and made the decision to restart without GPU 2 ✓
**Exercise 2:** You correctly measured temperature rise rate (0.2+°C/sec = fan failure), decided to stop the job (safety > performance), and planned for hardware replacement ✓
**Exercise 3:** You calculated ECC error rate (50/10min = 5/min unsustainable), decided to stop at 50 errors, and escalated for GPU replacement ✓

