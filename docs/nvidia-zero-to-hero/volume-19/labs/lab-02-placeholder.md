---
title: "Lab 2 - Incident Simulation: Network Failure Detection and Recovery"
slug: "lab-2-incident-simulation-network-failure"
sidebar_position: 2
description: "Lab 2 - Diagnose and recover from a simulated fabric degradation incident during a live training run."
---

# Lab 2 — Incident Simulation: Network Failure Detection and Recovery

## Overview

This lab simulates the fleet-wide throughput regression scenario from Chapter 5, but with incomplete information — you have to figure out which evidence to collect, not just read a pre-built diagnosis. It also tests the incident-response discipline from Chapter 2: detection speed, isolation speed, recovery speed.

## Duration

100 minutes

## Prerequisites

- Chapter 2: Incident Response and Game Day Execution
- Chapter 5: Network Reliability and Fabric Validation
- Familiarity with `nccl-tests`, `ibstat`, and NCCL debug output

## Lab Objectives

- Detect a fabric-related regression from monitoring alerts alone, without being told the cause
- Choose the correct sequence of diagnostic commands to isolate the affected node/link
- Distinguish a genuine fabric degradation from a workload-side or scheduling-side red herring
- Execute an isolation-and-recovery decision under a simulated time-pressure constraint

## Exercise 1: Alert Triage

You receive this alert at 03:14 UTC while on-call:

```
ALERT: NCCLCollectiveSlowdown
avg_over_time(nccl_allreduce_duration_ms[1d]) = 267ms
(baseline 7d avg: 201ms, +33%)
Job: distributed-pretrain-run-19, 32 nodes, 256 GPUs
```

**Task:** Before running any commands, write down your first three diagnostic actions in order, and what result from each would send you down a different branch. (Reference Chapter 5's decision tree, but write your own reasoning, not just the diagram's labels.)

## Exercise 2: Evidence Collection (Simulated)

You run your Exercise 1 plan. Here is the simulated evidence, revealed in the order you'd actually receive it:

```bash
$ nsys profile summary (last 20 steps, provided): 
AllReduce: 41.2% of step time (baseline: 30.8%) — regression confirmed in collectives

$ /opt/nccl-tests/build/all_reduce_perf -b 128M -e 128M -f 2 -g 8 --nnodes 32
# rank    bandwidth (GB/s)
    0-17     186-189 (healthy range)
   18         42.1    <- degraded
  19-31     185-190 (healthy range)

$ ssh node18 'ibstat mlx5_0 | grep -E "State|Rate"'
State: Active
Physical state: LinkUp
Rate: 400
```

**Task:** Rank 18 is degraded, but its `ibstat` output shows a fully healthy link — Active, LinkUp, correct Rate (400, matching NDR expectation). This contradicts the simple "check Rate" pattern from Chapter 5's worked example. What do you check next? List at least two hypotheses and how you'd distinguish them.

## Exercise 3: The Red Herring

One of your hypotheses from Exercise 2 was "check for elevated port error counters even though Rate is correct." Here's that result:

```bash
$ ssh node18 'perfquery -x $(ibstat mlx5_0 | grep "Base lid" | awk "{print \$3}")' | grep -E "PortRcvErrors|SymbolErrorCounter|LinkDowned"
PortRcvErrors: 0
SymbolErrorCounter: 0
LinkDowned: 0
```

Clean. No hardware-layer errors of any kind. **Task:** Given that the link is healthy at every hardware layer you've checked, what's left? Consider: is this necessarily a hardware problem at all? What software/scheduling-layer explanation would produce exactly this signature (one rank slow, healthy hardware everywhere)?

**Hint:** Check what else is running on node18.

```bash
$ ssh node18 'nvidia-smi --query-compute-apps=pid,used_memory,process_name --format=csv'
pid, used_memory [MiB], process_name
48213, 71234 MiB, python (training rank 18)
48910, 6120 MiB, python (unrelated: leftover process from a different, already-completed job)
```

## Exercise 1-3 Solutions and Discussion

**Exercise 1 (self-assessed against the pattern below):** A strong plan follows Chapter 5's structure: (1) confirm the regression is isolated to NCCL ops via profiling, not compute — because if compute is also slower, this isn't a fabric problem at all and the rest of the plan is wrong; (2) run per-rank `nccl-tests` to find whether one rank is disproportionately slow, since synchronous collectives run at the slowest participant's speed; (3) only then drill into that specific rank's hardware. Jumping straight to `ibstat` on a guessed node without first confirming which rank is actually slow wastes time and risks investigating the wrong node entirely.

**Exercise 2 solution:** The healthy `ibstat` output means this is *not* the Chapter 5 worked-example failure mode (wrong-generation link speed) — that's important to recognize rather than forcing the evidence to fit the pattern you already know. Two reasonable next hypotheses: (a) rising error/retry counters despite correct negotiated rate — a "marginal" link that hasn't fully degraded its negotiated speed yet but is dropping/retrying packets; (b) something non-hardware on that node consuming resources that compete with the NCCL process — CPU contention affecting the HCA's ability to service the collective, GPU contention from an unrelated process, or a misconfigured NUMA/IRQ affinity. The distinguishing test for (a) is port error counters (which Exercise 3 shows); the distinguishing test for (b) is checking what else is running on the node.

**Exercise 3 solution:** With hardware confirmed clean at every layer (state, rate, error counters), the fabric hypothesis is exhausted — this is not the same failure class as Chapter 5's worked example, and forcing it into that pattern would be a misdiagnosis. The `nvidia-smi` output reveals the actual cause: a leftover process from a completed, unrelated job is still holding 6GB of GPU memory and, more importantly, is likely still consuming SM cycles or contending for the GPU's DMA engine, which slows down node18's ability to service its NCCL rank's communication — producing exactly the "one rank slow, hardware clean" signature. **This is the value of the exercise: a fabric-shaped symptom (one slow rank in a synchronous collective) does not always have a fabric root cause.** The fix is killing the leftover process and adding a pre-job GPU-cleanliness check to the scheduling pipeline (a node shouldn't accept a new job's rank if it has orphaned processes from a prior job still holding GPU resources), not a network remediation at all.

## Verification

Upon completion, verify your work with:
- Your Exercise 1 plan correctly sequences "confirm it's the collective, not compute" before drilling into per-rank hardware
- Your Exercise 2 hypotheses include at least one non-hardware explanation, not just "try a different hardware check"
- Your Exercise 3 conclusion correctly identifies this as a scheduling/hygiene issue, not a fabric issue, despite the fabric-shaped symptom that triggered the investigation

## Discussion Questions

- What pre-job admission check would have prevented node18 from ever accepting the new job's rank while an orphaned process was still present?
- The alert that triggered this lab (`NCCLCollectiveSlowdown`) fired correctly in both this scenario and Chapter 5's genuine-fabric-degradation scenario. Should the alerting or the runbook differentiate these cases earlier, and how?
- How would this exercise change if the "leftover process" had been a legitimate but misconfigured job with an unusually high priority stealing resources, rather than an orphaned process?

## Related Chapters

- Chapter 2: Incident Response and Game Day Execution
- Chapter 5: Network Reliability and Fabric Validation
- Chapter 7: Multi-Tenancy and Workload Isolation (orphaned-process/cleanliness admission checks)
