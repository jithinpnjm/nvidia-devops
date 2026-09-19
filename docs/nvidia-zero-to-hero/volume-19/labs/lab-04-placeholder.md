---
title: "Lab 4 - Troubleshooting Challenge: Multi-Fault Scenario Diagnosis"
slug: "lab-4-troubleshooting-challenge-multi-fault"
sidebar_position: 4
description: "Lab 4 - Diagnose a production incident with two simultaneous, unrelated faults layered together — the capstone challenge for this volume."
---

# Lab 4 — Troubleshooting Challenge: Multi-Fault Scenario Diagnosis

## Overview

Real incidents are rarely one clean textbook fault. This capstone lab presents a single incident with **two independent, simultaneous root causes** — one that would be caught by Chapter 4's methodology and one by Chapter 6's — layered so that fixing one makes the symptom picture confusing rather than clean. The skill being tested is not diagnosing either fault individually (you've done that in earlier chapters/labs) but recognizing when a partial fix means "there's still something else," rather than "the diagnosis was wrong."

## Duration

150 minutes

## Prerequisites

- Chapters 1-12 of this volume (this lab draws on multiple chapters)
- Comfort reading `nvidia-smi`, `dcgmi`, and Kubernetes resource output without step-by-step guidance

## Lab Objectives

- Diagnose a multi-symptom incident without assuming a single root cause
- Recognize when a partial fix indicates a second, independent fault rather than a failed diagnosis
- Prioritize which fault to address first when multiple issues are found simultaneously
- Write an incident summary that correctly attributes symptoms to their respective causes

## The Incident

**08:41 UTC** — Alert fires: `training-job-large-42` (16 GPUs, 2 nodes) reports step time regression from 340ms baseline to 890ms, and separately, cost dashboard flags `team-research` namespace at 40% over its typical weekly GPU-hour burn with no corresponding increase in completed work.

You are the on-call engineer. Both signals arrived within the same 10-minute window and might be related, or might not be. **Work through this incident as you would live — decide what to check first, and don't assume the two alerts share a cause until you have evidence.**

## Exercise 1: Initial Triage

Given only the alert text above, write down:
1. Do you treat these as one incident or two, initially?
2. What's the first piece of evidence you'd pull for each, and why that one first?

## Exercise 2: Evidence Set 1 — The Step Time Regression

```bash
$ python profile_step_breakdown.py --job training-job-large-42 --steps 20

Layer               Avg (ms)   % of step   vs. baseline
data_transfer          9.1        1.0%       8.8ms (unchanged)
forward               138.2       15.5%     139.1ms (unchanged)
backward              201.4       22.6%     198.7ms (unchanged)
optimizer              41.2        4.6%      39.8ms (unchanged)
communication         500.1       56.2%      52.9ms  <- massive regression
```

```bash
$ /opt/nccl-tests/build/all_reduce_perf -b 128M -e 128M -f 2 -g 16 --nnodes 2 2>&1 | tail -6
# rank    bandwidth (GB/s)
    0        188.4
    1        187.9
    ...
   14        189.1
   15        188.6
Avg bus bandwidth: 188.2 GB/s   # healthy, matches fleet baseline
```

**Task:** Communication time regressed 10x but per-rank NCCL bandwidth is completely healthy across all 16 ranks — this rules out the Chapter 5 fabric-degradation pattern. What else causes a communication-layer regression with healthy raw bandwidth? (Hint: think about what else besides link health affects collective duration — check what's scheduled on the same nodes.)

## Exercise 3: Evidence Set 2 — Checking Node Co-tenancy

```bash
$ kubectl get pods -A -o wide --field-selector spec.nodeName=gpu-node-14

NAMESPACE       NAME                        NODE           GPU-REQ
team-research   training-job-large-42-0     gpu-node-14    8
team-research   exploratory-sweep-88        gpu-node-14    4   <- unexpected co-tenant
```

`exploratory-sweep-88` is a hyperparameter sweep job from the same team, scheduled onto the same node as the large training job. Node-14 has 8 physical GPUs; both jobs are requesting GPUs from the same pool.

```bash
$ ssh gpu-node-14 nvidia-smi --query-gpu=index,utilization.gpu,memory.used --format=csv

index, utilization.gpu, memory.used
0, 98%, 71234 MiB    <- training-job-large-42
1, 97%, 70890 MiB
...
6, 45%, 12100 MiB    <- exploratory-sweep-88, sharing GPUs 6-7 via time-slicing
7, 52%, 11800 MiB
```

**Task:** Does this fully explain the communication regression? Consider: NCCL's AllReduce is synchronous across all 16 ranks in the job. If `exploratory-sweep-88` is time-slicing GPUs 6-7 with two of `training-job-large-42`'s ranks, what happens to those two ranks' step time, and what happens to the *entire* collective as a result?

## Exercise 4: Applying the Fix and Finding the Second Fault

You isolate `exploratory-sweep-88` off node-14 (per Chapter 7's isolation framework — this node should have been in a dedicated pool for the large job, not shared).

```bash
$ kubectl cordon gpu-node-14  # temporarily, to force sweep job elsewhere
$ kubectl delete pod exploratory-sweep-88 -n team-research
# Job reschedules automatically onto other nodes
```

```bash
$ python profile_step_breakdown.py --job training-job-large-42 --steps 20   # after fix

Layer               Avg (ms)   % of step   vs. baseline
data_transfer          9.0        2.4%       8.8ms
forward               138.5       36.6%     139.1ms
backward              200.9       53.1%     198.7ms
optimizer              41.0        6.5%      39.8ms  (rounding — sums approx)
communication           ~2.1       0.6%       52.9ms  <- fully recovered, even better than baseline?
--------------------------------------------------
Total step time:      ~378ms (baseline: 340ms, down from 890ms)
```

**Task:** Step time improved from 890ms to 378ms — the communication fault is fixed. But 378ms is still 11% above the 340ms baseline. Is this within normal variance, or is there a second, independent issue? What would you check next, and how does this connect to the *other* alert from the original incident (the cost/GPU-hour burn anomaly)?

## Exercise 5: The Second Fault — Connecting Back to the Cost Alert

```bash
$ python check_request_vs_actual.py --namespace team-research --window 7d --min-gpus 2

Job                      Requested   Peak Used   Avg Used   Waste
exploratory-sweep-88          4         1.2        0.8       80%
exploratory-sweep-85          4         1.1        0.7       82%
exploratory-sweep-91          4         1.3        0.9       78%
```

**Task:** Connect the two original alerts. `exploratory-sweep-88` (and apparently a pattern of similar sweep jobs) is: (a) the direct cause of the communication regression via node co-tenancy, AND (b) independently, a Chapter 6-style over-provisioning waste pattern explaining the cost alert — requesting 4 GPUs, using under 1 on average. **These are two distinct problems with the same root job type, not one problem with two symptoms.** Write the two-part fix: one for the immediate incident (isolation), one for the underlying waste pattern (right-sizing).

## Exercise 1-5 Solutions and Discussion

**Exercise 1:** A defensible initial approach treats them as *possibly* related but investigates independently rather than assuming a shared cause — the step-time regression needs a layer-1 breakdown (Chapter 11) regardless, and the cost alert needs a request-vs-actual check (Chapter 6) regardless. Assuming they're the same incident too early risks anchoring the investigation and missing that they may need two different fixes (which, per Exercise 5, they do — related but distinct).

**Exercise 2-3:** The communication regression with healthy raw bandwidth is the signature of **co-tenancy contention, not fabric degradation** — a different failure mode than Chapter 5's worked example, testing whether the reader over-applies a familiar pattern. Because NCCL's AllReduce is synchronous, if `exploratory-sweep-88`'s time-slicing on GPUs 6-7 slows down those two specific ranks' compute (competing for SM cycles even though NCCL bandwidth itself is fine), the *entire* 16-rank collective waits for the slowest rank — exactly the same synchronous-collective mechanism from Chapter 5, but the bottleneck is compute contention on two ranks, not a network link.

**Exercise 4:** 378ms vs. 340ms baseline (11% above) after fixing the co-tenancy issue is **not** normal variance for a job that showed 0 variance in every other layer before and after — this is evidence of a second, independent issue, most likely worth checking the same profiling data more closely: is forward/backward *itself* now the marginal difference (138.5+200.9=339.4ms combined, already close to the entire 340ms baseline, suggesting overhead elsewhere — communication went from 2.1ms measured to a nonzero baseline overhead, or there's now a small residual scheduling/sync overhead). The correct instinct here is **don't declare victory at "mostly fixed"** — an 11% gap after a clean fix for the dominant fault deserves the same rigor as the original 262% regression did, even though it's much smaller in absolute terms. (This is intentionally left slightly open — a strong answer identifies that a second cause needs the *same* Chapter 11 layered methodology re-applied, not assumed away as noise, and proposes concretely re-measuring against a job with zero possible cross-tenant contention to establish a clean current baseline before concluding the gap is real.)

**Exercise 5:** The connection is subtle and is the whole point of the lab: `exploratory-sweep-88` isn't one bug wearing two symptoms — it's one job (and a pattern of similar sweep jobs from the same team) that happens to cause two genuinely separate problems: (1) an acute incident via node co-tenancy contention with a synchronous collective job, which needs immediate isolation (dedicated node pools per Chapter 7, so sweep jobs never land on nodes running large gang-scheduled training), and (2) a chronic, unrelated cost-waste pattern (80%+ over-provisioning across multiple sweep jobs) which needs a Chapter 6 right-sizing fix (profile-before-schedule, request 1 GPU instead of 4). **Fixing the isolation problem (dedicated pools) does not fix the waste problem (over-provisioned requests) — they need two separate remediations even though they share a root job type.** A common mistake is treating "found the cause" as "found the fix" — here there are two fixes required for what initially looked like it might be one root cause.

## Verification

Upon completion, verify your work with:
- Your Exercise 2/3 answer correctly identifies co-tenancy contention (not fabric degradation) as the communication regression's cause, with the synchronous-collective mechanism explained, not just asserted
- Your Exercise 4 answer does not dismiss the residual 11% gap as noise without proposing a concrete way to verify that
- Your Exercise 5 answer proposes two distinct fixes (isolation + right-sizing) rather than one, and correctly explains why one fix doesn't address the other's problem

## Discussion Questions

- What admission-control or scheduling policy change would have prevented `exploratory-sweep-88` from ever landing on the same node as a gang-scheduled 16-GPU training job in the first place?
- If the second fault in Exercise 4 turned out to be real (not noise), what's your hypothesis for what it might be, and what's the next diagnostic step per Chapter 11's methodology?
- How would you write the handoff note (Chapter 12 format) for this incident at the end of your shift, given that one part is resolved (isolation) and one part is still open (waste pattern, needs a policy fix that will take longer than one shift)?

## Related Chapters

- Chapter 5: Network Reliability and Fabric Validation (ruling out the fabric-degradation pattern)
- Chapter 6: Cost Optimization and Resource Efficiency (the over-provisioning waste pattern)
- Chapter 7: Multi-Tenancy and Workload Isolation (dedicated node pools as the isolation fix)
- Chapter 11: Performance Debugging and Bottleneck Identification (the layered methodology applied throughout)
- Chapter 12: On-Call Handoff and Operational Runbooks (writing up a partially-resolved multi-fault incident)
