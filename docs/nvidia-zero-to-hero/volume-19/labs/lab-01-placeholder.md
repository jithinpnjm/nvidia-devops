---
title: "Lab 1 - Upgrade Simulation: Rolling Update with Canary Promotion"
slug: "lab-1-upgrade-simulation-canary-promotion"
sidebar_position: 1
description: "Lab 1 - Design and execute a canary-gated driver upgrade across a simulated multi-node cluster, including a deliberate failure scenario."
---

# Lab 1 — Upgrade Simulation: Rolling Update with Canary Promotion

## Overview

This lab exercises the canary/promote/revert decision framework from Chapter 1 against three scenarios: a clean upgrade, a canary that should be rejected, and a promoted upgrade that fails on one node mid-rollout. You will practice making — and justifying — the revert-vs-continue decision with evidence, not instinct.

## Duration

120 minutes

## Prerequisites

- Chapter 1: Cluster Lifecycle and Upgrade Operations
- Access to a Kubernetes cluster with GPU nodes (or a simulated environment using the provided fixture data)
- Familiarity with `kubectl drain`/`cordon`/`uncordon` and `nvidia-smi`

## Lab Objectives

- Design a canary validation plan with explicit pass/fail criteria before looking at any results
- Correctly classify a canary result as pass, marginal, or fail using the evidence, not gut feeling
- Execute a staged promotion and respond to a mid-rollout node failure using the Chapter 1 decision tree
- Produce a written justification for a revert decision that would satisfy a skeptical reviewer

## Exercise 1: Design the Canary Plan (Before Seeing Any Data)

You are upgrading driver `550.90` → `550.142` across a 12-node A100 cluster running mixed training and inference workloads. **Before proceeding to Exercise 2, write down:**

1. Which 2 nodes you'd pick for canary, and why (consider failure domains, workload mix).
2. What metrics you'll compare against baseline, and by how much they're allowed to differ before you call it a fail.
3. How long you'll run the canary before deciding.
4. What would make you extend the canary window rather than promote or reject at the deadline.

**Do not read Exercise 2 until you've written this down** — the point of the exercise is to commit to criteria before you have result-driven hindsight bias.

## Exercise 2: Evaluate Canary Results

You canaried on node-03 (training workload, rack A) and node-09 (inference workload, rack C) for 48 hours. Results:

```
Metric                    node-03 (canary)   node-02 (baseline, same rack)
p99 training step time         198ms               196ms
GPU memory usage (same job)     71%                 70%
Driver warnings in dmesg          0                   0
Kernel oops                       0                   0

Metric                    node-09 (canary)   node-08 (baseline, same rack)
p99 inference latency          134ms               119ms
GPU utilization                 82%                 81%
Driver warnings in dmesg          2                   0
```

**Task:** Using the criteria you wrote in Exercise 1 (not new criteria invented after seeing this data), classify this canary as PASS, MARGINAL, or FAIL, and justify it in writing. Pay specific attention to the inference node's latency delta and the 2 driver warnings — do they meet your pre-committed threshold, or are you tempted to explain them away after the fact?

## Exercise 3: Mid-Rollout Node Failure

You classified the canary as MARGINAL and decided to proceed with a slower, more closely monitored promotion (a reasonable call if your criteria allowed it — if you classified it FAIL, work through this exercise as "what if you'd been overruled"). You're promoting 3 nodes/day. On day 2, node-06 fails to come back after the driver install:

```bash
$ ssh node-06 nvidia-smi
# hangs, no response after 30s

$ ssh node-06 dmesg | tail -20
[89234.123] NVRM: GPU 0000:07:00.0: RmInitAdapter failed! (0x62:0xffff:1785)
[89234.128] NVRM: GPU 0000:07:00.0: rm_init_adapter failed, device minor number 0
[89234.204] nvidia: probe of 0000:07:00.0 failed with error -1
```

**Task:**
1. Is this evidence of a fleet-wide problem or a node-specific one? What single piece of additional evidence would most change your answer?
2. Do you halt the rollout for the remaining 9 nodes, or continue while investigating node-06 in isolation?
3. Write the decision and the evidence-based reasoning, not just the conclusion.

## Exercise 1-3 Solutions and Discussion

**Exercise 1 (self-assessed):** A strong plan picks canary nodes across different failure domains AND different workload types (training vs. inference), since driver regressions can be workload-specific (as this lab's data shows). Criteria should include a numeric latency-delta threshold (e.g., "fail if >3% regression"), not just "check if it looks OK." 48 hours is a reasonable default window; a valid reason to extend is any metric sitting right at the threshold boundary rather than clearly inside or outside it.

**Exercise 2 solution:**
- node-03 (training): p99 198ms vs 196ms baseline = 1.0% delta — within a typical ±2-3% threshold. Clean pass on this node.
- node-09 (inference): p99 134ms vs 119ms baseline = **12.6% regression** — this should fail almost any reasonable pre-committed threshold. The 2 driver warnings (vs. 0 on baseline) are corroborating evidence, not just noise.
- **Correct classification: FAIL for the inference workload class specifically.** A common mistake here is averaging or "vibing" across both canary nodes into one overall verdict — the correct read is that this driver version is fine for training workloads and regressed for inference workloads, which is a materially different, more useful conclusion than a blanket pass/fail. The right next action is to investigate the inference-specific regression (check clock/power/thermal settings per Ch06/Ch10, and whether the driver changed a default persistence-mode or power-management behavior) before considering promotion to any inference-serving nodes — training-only promotion could reasonably proceed.

**Exercise 3 solution:**
1. One additional log line is decisive: check whether **any other already-promoted node** shows the same `RmInitAdapter failed` error. If node-04 and node-05 (promoted day 1) show zero such errors after 24+ hours of running the new driver, this is evidence pointing toward node-06-specific (likely BIOS/firmware compatibility, per Chapter 1's Scenario 1 pattern), not fleet-wide.
2. **Do not halt the remaining rollout** on this evidence alone — continue promoting the next batch while investigating node-06 in isolation, but tighten monitoring on the next batch (e.g., verify `nvidia-smi` responds immediately post-install before moving to the next node, rather than batch-installing 3 nodes and checking afterward). Halting the entire rollout on a single node's hardware-looking failure, when 5+ other nodes are running cleanly, overreacts to n=1 evidence and stalls a rollout that's otherwise working.
3. A strong written justification cites the comparison to already-promoted nodes explicitly, not just "it's probably just this node" — the difference between an evidence-based continue decision and an optimistic guess is exactly that comparison.

## Verification

Upon completion, verify your work with:
- Your Exercise 1 criteria were written before Exercise 2's data and were not edited afterward
- Your Exercise 2 classification correctly separates the training-workload result from the inference-workload result rather than blending them
- Your Exercise 3 answer identifies the specific comparison (other promoted nodes' error rate) that resolves the node-specific-vs-fleet-wide question, not just a general impression

## Discussion Questions

- If your organization doesn't have separate canary nodes per workload type, what's the risk, and how would you mitigate it with fewer resources?
- The inference regression in Exercise 2 could plausibly be explained away ("2 warnings is nothing, 12% could be noise") — what process guardrail prevents that rationalization from happening under real deadline pressure?
- How would your Exercise 3 decision change if node-06 were the *fourth* node in a row to show this exact error, rather than the first?

## Related Chapters

- Chapter 1: Cluster Lifecycle and Upgrade Operations
- Chapter 9: Monitoring and Observability at Scale (pre-committed thresholds vs. fleet-baseline-relative alerting)
- Chapter 12: On-Call Handoff and Operational Runbooks (documenting an in-progress canary for shift handoff)
