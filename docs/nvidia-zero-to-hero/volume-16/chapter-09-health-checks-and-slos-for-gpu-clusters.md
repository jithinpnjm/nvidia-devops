---
title: "Chapter 09 — Health Checks and SLOs for GPU Clusters"
slug: chapter-09-health-checks-and-slos-for-gpu-clusters
sidebar_position: 9
description: "How do you define 'the cluster is healthy'? Learn to set metrics-based SLOs and health checks that matter."
tags: [gpu, observability, slo, health-checks, operations]
---

# Chapter 09 — Health Checks and SLOs for GPU Clusters

Observability without targets is just noise. This chapter teaches how to define what "healthy" means for GPU clusters, set SLOs (Service Level Objectives) that matter, and build automated health checks that wake you up when reality diverges from targets.

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability and Operational Health |
| Difficulty | Intermediate |
| Estimated reading time | 40 minutes |
| Primary audience | Platform engineers, DevOps, SRE |
| Core question | How do you know if the cluster is meeting its commitments? |

## Learning Objectives

You will be able to:
- Define SLIs (Service Level Indicators) for GPUs
- Set SLOs (Service Level Objectives) that align with business commitments
- Build automated health checks that validate GPU readiness
- Create error budgets and use them to balance reliability with feature velocity
- Set alerts that distinguish "problem solved" from "problem masked"

## SLIs: What to Measure

| SLI | Definition | Measurement | Why It Matters |
|---|---|---|---|
| **GPU Availability** | % of time GPU is available (not in maintenance, not failed) | count(DCGM_FI_DEV_GPU_UTIL >= 0) / total GPUs | Job scheduling depends on GPU availability |
| **GPU Health** | % of GPUs passing health checks (temp &lt; 82°C, no throttle, no ECC errors) | count(GPUs passing all checks) / total | Predicts job success rate |
| **Job Completion Rate** | % of submitted jobs that complete without error | count(completed jobs) / total submitted | Business SLO: did we do the work customers paid for? |
| **Training Throughput** | Samples/sec sustained over 1 hour (p50, p99) | benchmark job throughput percentile | Capacity planning and performance regression detection |
| **All-Reduce Latency** | Time to complete distributed gradient sync | measure NCCL all-reduce time | Multi-GPU training efficiency |

## SLOs: The Commitments

**Example SLOs for a typical enterprise cluster:**

```yaml
# Cluster-level SLOs
GPU Cluster SLO:
  availability: 99.0%        # 7 hours of downtime/month acceptable
  all_gpus_healthy: 98%      # Up to 2% of GPUs can be failing
  job_completion_rate: 99.5% # 99.5% of submitted jobs complete
  p50_throughput: 2000 samples/sec  # Baseline performance
  p99_throughput: 1900 samples/sec  # Even in worst case, > 1900

# What these mean in practice:
# - 99% availability = 43 minutes of total downtime per month
# - 98% health = if you have 100 GPUs, up to 2 can be broken at any time
# - 99.5% job completion = 1 in 200 jobs can fail (due to hardware)
```

## Automated Health Checks

### Check 1: Per-GPU Readiness

```bash
#!/bin/bash
# Run on each GPU host daily

for gpu_id in $(nvidia-smi --list-gpus | awk '{print $2}' | tr -d '()'); do
  echo "Checking GPU $gpu_id..."
  
  # Check 1: Can we communicate?
  nvidia-smi -i $gpu_id -q > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "FAIL: GPU $gpu_id not responding"
    continue
  fi
  
  # Check 2: Temperature OK?
  temp=$(nvidia-smi -i $gpu_id -q --format=csv,noheader --query-gpu=temperature.gpu)
  if [ $temp -gt 82 ]; then
    echo "FAIL: GPU $gpu_id temp $temp°C (> 82°C threshold)"
  fi
  
  # Check 3: Power stable?
  power=$(nvidia-smi -i $gpu_id -q --format=csv,noheader --query-gpu=power.draw | cut -d' ' -f1)
  if [ ${power%.*} -lt 50 ]; then
    echo "FAIL: GPU $gpu_id power $power W (expected > 50W under load)"
  fi
  
  # Check 4: ECC healthy?
  ecc=$(nvidia-smi -i $gpu_id -q -d ECC | grep "Uncorrected" | tail -1 | awk '{print $NF}')
  if [ "$ecc" != "0" ]; then
    echo "FAIL: GPU $gpu_id has $ecc uncorrected ECC errors"
  fi
  
  # Check 5: DCGM can see it?
  dcgmi diag -r 1 2>&1 | grep -q "GPU $gpu_id.*PASS"
  if [ $? -ne 0 ]; then
    echo "FAIL: DCGM cannot reach GPU $gpu_id"
  fi
  
  echo "PASS: GPU $gpu_id is healthy"
done
```

**Real output (mixed):**

```
Checking GPU 0...
PASS: GPU 0 is healthy

Checking GPU 1...
FAIL: GPU 1 temp 85°C (> 82°C threshold)

Checking GPU 2...
FAIL: GPU 2 not responding

Checking GPU 3...
PASS: GPU 3 is healthy

Health Summary: 2/4 GPUs ready (50%)
```

### Check 2: Distributed Health (Multi-Node)

```bash
#!/bin/bash
# Run once per hour across the cluster

# Verify NCCL connectivity
export NCCL_DEBUG=INFO
mpirun -np 8 python -c "
import torch
import torch.distributed as dist
dist.init_process_group('nccl')
# Test collective communication
data = torch.ones(1024, device='cuda')
dist.all_reduce(data)  # This will timeout if network is broken
print('PASS: All-reduce works')
" 2>&1 | grep -E "PASS|timeout"
```

## Error Budgets: Balancing Reliability and Velocity

**If your SLO is 99% availability (7 hours downtime/month), your error budget is:**

```
Error budget = (1 - SLO%) × hours per month
             = (1 - 0.99) × 730
             = 7.3 hours per month

Interpretation:
- You can afford 7.3 hours of downtime
- Once you hit 7.3 hours, all remaining changes must be rolled back or paused
- Use error budget to decide: can we upgrade software? Can we reboot? Can we replace hardware?
```

**Real error budget tracking:**

```
Month: August 2026
Target SLO: 99% (7.3 hour budget)

Downtime events:
  - Aug 2: Firmware upgrade (planned) — 1.5 hours
  - Aug 8: GPU failure on node-03 (unplanned) — 2 hours
  - Aug 15: Network maintenance (planned) — 2 hours
  - Aug 22: Thermal incident (unplanned) — 0.5 hours

Used: 6 hours
Remaining budget: 1.3 hours

Status: Approaching error budget limit. New deployments frozen until Sept 1.
```

## SLO Violation and Impact

**Alert Levels:**

```yaml
# Level 1: Advisory (watch closely)
- Alert: GPU temperature trending toward 80°C
  Action: Monitor, no immediate action
  Impact: Minor; GPU still healthy

# Level 2: Warning (prepare for action)
- Alert: 1 GPU offline for > 1 hour
  Action: Schedule replacement or investigation
  Impact: Moderate; reduces available capacity, but other GPUs take load

# Level 3: Critical (SLO at risk)
- Alert: > 5 GPUs offline, cluster availability < 98%
  Action: Page on-call engineer, activate runbook
  Impact: Severe; cluster cannot meet SLO, customers affected

# Level 4: Catastrophic (SLO already violated)
- Alert: Cluster availability < 95%
  Action: Incident escalation, all hands on deck
  Impact: Critical; service degraded
```

## Cross-References

- Chapter 08: Common failure modes and detection
- **Next:** Chapter 10 covers production troubleshooting
