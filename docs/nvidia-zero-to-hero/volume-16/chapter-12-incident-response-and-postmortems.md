---
title: "Chapter 12 — Incident Response and Postmortems"
slug: chapter-12-incident-response-and-postmortems
sidebar_position: 12
description: "When observability catches a problem, move to resolution efficiently. Learn incident response procedures and how to prevent recurrence."
tags: [gpu, observability, incident-response, operations, postmortem]
---

# Chapter 12 — Incident Response and Postmortems

Observability is only valuable if it leads to action. This chapter covers incident response (how to resolve problems quickly) and postmortems (how to ensure they don't repeat).

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability and Operational Health |
| Difficulty | Intermediate |
| Estimated reading time | 40 minutes |
| Primary audience | On-call engineers, SRE, team leads |
| Core question | When an alert fires, what do you do next, and how do you prevent it from firing again? |

## Learning Objectives

You will be able to:
- Respond to GPU alerts efficiently using runbooks
- Escalate problems when local fixes don't work
- Collect evidence during incidents for postmortem
- Write effective postmortems that prevent recurrence
- Build institutional memory around failure modes

## Incident Response Runbooks

A runbook is a decision tree in text form. When an alert fires, execute the runbook, not arbitrary commands.

### Runbook 1: GPU Thermal Throttle Alert

```yaml
Alert: GPUThermalThrottle
  condition: increase(DCGM_FI_DEV_THERMAL_VIOLATION[1h]) > 0
  Severity: Warning
  SLO_Impact: Performance degraded (clocks reduced)
  Estimated_Resolution_Time: 15-60 minutes

Response Steps:

1. Acknowledge Alert (1 min)
   - Log into alert dashboard
   - Click "Acknowledge"
   - This prevents escalation to second-level on-call

2. Identify Affected GPUs (2 min)
   $ ssh gpu-node-XX
   $ nvidia-smi -q | grep -A1 "Temperature\|Throttle"
   # Note which GPUs are throttled, current temp

3. Gather Context (5 min)
   $ kubectl logs -l gpu-workload=training --tail=50
   # Are jobs running normally, or crashing?
   
   $ dcgmi diag -r 1 2>&1 | grep -E "GPU|PASS|FAIL"
   # Confirm health status

4. Check Immediate Environment (5 min)
   $ sensors | grep -i "temp"  # System temp sensors
   $ ip link | grep -i "up\|down"  # Network links OK?
   $ df -h | grep -E "var|tmp"  # Disk space OK?

5. Check if Problem is Ephemeral (2 min)
   $ nvidia-smi dmon -s t -c 30
   # If temperature dropping back to < 75°C, no action needed
   # If staying at > 82°C, proceed to Step 6

6. Escalate to Facilities Team (1 min)
   - File ticket: "GPU node XX thermal incident"
   - Severity: "High"
   - Include: Node ID, affected GPU IDs, current temp, current power draw
   - Actions: Check heatsink, check ambient cooling, inspect fans

7. Interim Mitigation (optional, if impact is high)
   - Drain workload from affected node
   - Reduce GPU clocks manually (if safe): nvidia-smi -lgc <lower_clock_mhz>
   - Scale job to other nodes

Resolution:
  If Problem Solved: Close ticket, update runbook with findings
  If Problem Persists > 1 hour: Escalate to L2 (GPU vendor), consider removing node from service
```

### Runbook 2: GPU Memory OOM Alert

```yaml
Alert: GPUMemoryOOM
  condition: DCGM_FI_DEV_FB_USED > 95% for 10 min OR nvidia-smi reports CUDA:Out-of-Memory

Response Steps:

1. Identify Job (1 min)
   $ ps aux | grep python | grep -v grep
   $ kubectl get pods | grep -E "CrashLoopBackOff|OOMKilled"
   # Find the affected workload

2. Gather Memory Stats (2 min)
   $ nvidia-smi -q | grep -E "Memory|Processes"
   # Check which process is using most memory

3. Diagnosis (5 min)
   $ python -c "
   import torch
   print(f'Allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB')
   print(f'Reserved: {torch.cuda.memory_reserved() / 1e9:.2f} GB')
   "
   # If reserved >> allocated: memory fragmentation
   # If allocated close to GPU capacity: batch size too large

4. Resolution Options (pick one):

   Option A: Reduce Batch Size
     - Restart job with smaller batch_size
     - Throughput drops, but no OOM
     - Best if: Batch size was set aggressively

   Option B: Enable Gradient Checkpointing
     - Reduces intermediate tensor memory
     - Checkpoint memory drops 40-60%
     - Best if: Large model with many layers

   Option C: Use Lower Precision
     - FP32 → FP16: 50% memory savings
     - FP32 → TF32: 30% savings
     - Best if: Model allows lower precision without quality loss

   Option D: Restart Job (Clear Memory Fragmentation)
     - Stop and restart job
     - Clears allocator fragmentation
     - Temporary fix; original batch size will still OOM

5. Test Fix (5 min)
   - Restart job with chosen fix
   - Monitor memory for 3 steps
   - If stable, continue; if still OOM, proceed to next option

Resolution:
  If Problem Solved: Document fix in runbook (which option worked)
  If Problem Persists: Escalate to ML engineer (model may need restructuring)
```

### Runbook 3: Cluster Availability &lt; SLO

```yaml
Alert: ClusterAvailability
  condition: count(DCGM_FI_DEV_GPU_UTIL >= 0) / total_gpus < SLO_threshold

Response Steps:

1. Assess Scope (2 min)
   $ dcgmi diag -r 1 | grep -i "PASS\|FAIL" | sort | uniq -c
   # How many GPUs are down? How many failed?
   
   $ kubectl get nodes -L gpu | grep -E "NotReady|SchedulingDisabled"
   # How many nodes are down?

2. Triage Severity (1 min)
   - < 5% GPUs down: Can defer repairs (collect data, schedule)
   - 5-10% GPUs down: Should repair this week
   - > 10% GPUs down: CRITICAL incident (SLO at risk)

3. Gather Evidence (10 min)
   For each failed GPU:
   $ nvidia-smi -i <gpu_id>  # Can it respond?
   $ dmesg -T | grep -E "Xid|GPU" | tail -20  # Hardware errors?
   $ journalctl -k --since '-2 hours' | grep -i "gpu\|pcie"

4. Categorize Failures (5 min)
   a) GPU offline (Xid error, fell off bus): Hardware failure
   b) DCGM can't see GPU: Driver or daemon issue
   c) GPU running but slow: Performance degradation
   d) GPU overheat: Cooling system issue

5. Resolve by Category (varies)

   Category A (Hardware Failure):
   - Isolate node (disable GPU scheduling)
   - File RMA (Return Materials Authorization) for GPU
   - Replace with spare GPU if available
   - ETA: Hours to days (depends on hardware availability)

   Category B (Driver/Daemon Issue):
   - Restart DCGM daemon: systemctl restart nv-hostengine
   - If doesn't fix: Upgrade driver or DCGM version
   - Test with: dcgmi diag -r 1

   Category C (Performance Degradation):
   - Run profiler to understand bottleneck
   - If software: Rollback recent changes
   - If hardware aging: Plan replacement

   Category D (Overheat):
   - See Thermal Throttle runbook

6. Re-check SLO (5 min)
   - Verify GPU count returned to target
   - If not recovered, escalate to L2

Resolution:
  If SLO Recovered: Post-incident review (what caused 10% of cluster to fail at once?)
  If SLO Still at Risk: Page L2 on-call, escalate decision up the chain
```

## Postmortem Template

After an incident resolves, conduct a postmortem within 48 hours:

```markdown
# Postmortem: Training Cluster Thermal Incident
Date: 2026-08-15
Duration: 45 minutes (14:00 to 14:45 UTC)
Impact: 8 training jobs interrupted, 2 hours of work lost

## Timeline
14:00 — Alert fired: GPUThermalThrottle on gpu-node-03 (GPU 0, GPU 1)
14:02 — On-call engineer acknowledged alert
14:05 — Investigation started; found temp at 85°C
14:10 — Discovered cooling system failure (fan not spinning on rack)
14:30 — Facilities team began physical inspection
14:45 — Fan replaced; temperature returned to normal

## Root Cause
Cooling fan on gpu-node-03 failed (bearing failure, audible grinding). Thermal mass of GPU kept it cool for ~2 hours, but eventually heat accumulated and throttling triggered.

## Contributing Factors
1. No monitoring of fan speed (only temperature was monitored)
2. No predictive alert on "temperature rising rapidly" (only at absolute threshold)
3. No preventive maintenance schedule for cooling systems
4. Manual inspection of racks only quarterly

## What Went Well
- Alert triggered and paged engineer quickly
- Runbook provided diagnosis steps (engineer didn't waste time)
- Problem isolated to one node, didn't cascade to other nodes
- Jobs recovered after fix; no data loss

## What Could Be Better
1. Monitor fan speed actively
2. Add alert for "temperature rising > 2°C per minute" (early warning)
3. Check cooling system at first sign of thermal stress, not just at temperature threshold
4. Quarterly → Monthly preventive maintenance for server rooms

## Action Items
| Action | Owner | Deadline | Priority |
|---|---|---|---|
| Add fan speed monitoring to DCGM dashboard | Platform Team | 2026-08-22 | High |
| Add "temp rate of change" alert rule | Ops Team | 2026-08-22 | High |
| Schedule monthly fan maintenance on all GPU racks | Facilities | 2026-08-20 | Medium |
| Review thermal management runbook (was it sufficient?) | SRE | 2026-08-25 | Low |

## Learning
"Absolute temperature is a lagging indicator. Cooling system failures show up as rapid temperature rise first, then throttling. We should alert on the rate, not the absolute value."
```

## Preventing Recurrence

**Three types of preventive actions:**

1. **Alerts** — Catch the problem earlier next time
   - Before: Temperature > 82°C
   - After: Temperature rising > 2°C/min OR Fan speed = 0%

2. **Automation** — Prevent the problem automatically
   - Before: Manual fan inspection quarterly
   - After: Automated daily fan speed check; alert if inconsistent

3. **Architecture** — Redesign to make the failure impossible
   - Before: Single fan point-of-failure
   - After: Redundant fans with automatic failover

## Key Takeaways

1. **Runbooks are force multipliers** — they encode expert knowledge into executable steps; follow them.
2. **Postmortems should focus on "what can we prevent," not "who made the mistake"** — blamelessness enables honesty.
3. **Distinguish alerts (early warning) from thresholds (absolute limit)** — alert on trends and predictions, not just absolute breaches.
4. **Automate the easy stuff** — fan checks, disk space, DCGM daemon health should be automatic, not manual.
5. **Institutional memory is valuable** — document patterns; use them to catch similar problems before they happen.

## Cross-References

- Chapter 08: Common GPU failure modes
- Chapter 09: Health checks and SLOs
- Chapter 10: Production troubleshooting frameworks
