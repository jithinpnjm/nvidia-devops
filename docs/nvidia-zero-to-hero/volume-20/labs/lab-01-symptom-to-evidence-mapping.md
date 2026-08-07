---
title: "Lab 01 — Symptom to Evidence Mapping"
slug: "lab-01-symptom-evidence-mapping"
sidebar_position: 1
description: "Given a symptom, construct the diagnostic queries and evidence collection workflow."
---

## Objective

Practice translating user-reported symptoms into concrete diagnostic evidence collection procedures. Learn the evidence hierarchy and when to use different tools.

## Duration

60 minutes

## Prerequisites

- Understanding of nvidia-smi, dcgmi, dmesg
- Basic knowledge of CUDA and GPU concepts
- Access to a GPU or simulator

## Exercises

### Exercise 1: GPU Slow — Map the Evidence

**Scenario:** User reports "my GPU job is slow but nvidia-smi shows good utilization."

Construct the evidence collection plan:
1. What metrics would you check first?
2. What profiling tool would you use?
3. What would cause "high utilization but low throughput"?
4. What is your hypothesis after each evidence step?

### Exercise 2: Distributed Training Stalls

**Scenario:** Four-GPU training stalls after 30 minutes.

Construct the evidence workflow:
1. Is this a GPU issue or communication issue? How do you distinguish?
2. Which GPU is stalled?
3. What NCCL_DEBUG output would you enable?
4. How do you differentiate hanging from slow?

### Exercise 3: Multiple Failure Modes

**Scenario:** GPU exhibits: thermal throttling, ECC errors, and NCCL hangs simultaneously.

Determine the evidence priority:
1. Which metric do you trust most in this scenario?
2. Which failure is the root cause?
3. How do you prove your hypothesis?

## Expected Outcomes

- You can translate any symptom into a concrete evidence collection plan
- You understand the hierarchy of evidence (weak → strong)
- You know which tool to use for each diagnostic question

## Verification

Compare your evidence plans to the chapter frameworks. Did you choose the right metrics and tools?

