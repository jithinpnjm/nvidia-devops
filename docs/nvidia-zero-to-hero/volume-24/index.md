---
title: "Volume 24 — Capstone Projects: Building Real GPU Systems"
slug: "volume-24"
sidebar_position: 24
description: "12 hands-on capstone projects matching Volume 23 interview topics. Each project validates mastery of GPU systems engineering through realistic scenarios and constraints."
---

## Overview

Volume 24 provides capstone projects for each Volume 23 interview chapter. Projects range from small technical exercises (Chapters 1–6) to large system design projects (Chapters 10–12).

Each project includes:
- **Problem statement** with realistic constraints
- **Starter code** (where applicable)
- **Success criteria** (what proves you solved it correctly)
- **Discussion questions** (follow-ups to deepen understanding)
- **Solution walkthrough** (reasoning and key decisions)

## Projects

### Project 1: CUDA Kernel Optimization
**Problem:** Optimize a given kernel to achieve 80%+ of peak GPU throughput.  
**Constraints:** H100 hardware specs, memory bandwidth limits, occupancy rules.  
**Validation:** Profile with Nsight Compute, demonstrate occupancy and efficiency.

### Project 2: AllReduce Algorithm Design
**Problem:** Implement ring AllReduce for 8-GPU cluster.  
**Constraints:** Real NVLink topology, finite bandwidth, realistic latencies.  
**Validation:** Benchmark latency, compare to theoretical optimal, profile communication.

### Project 3: Distributed Training with Fault Tolerance
**Problem:** Train ResNet-50 on 4 GPUs with checkpoint/resume capability.  
**Constraints:** Simulate one GPU failure mid-training, validate recovery.  
**Validation:** Model converges to target accuracy, recovery happens without manual intervention.

### Project 4: Observability System Design
**Problem:** Design monitoring for a 100-GPU cluster.  
**Constraints:** 30-second scrape interval, keep storage &lt; 1TB/month.  
**Validation:** Detect 5 common failure scenarios from metrics alone.

### Project 5: Troubleshooting Incident Response
**Problem:** Diagnose and resolve a production incident (given metrics and logs).  
**Constraints:** Time pressure, incomplete information.  
**Validation:** Identify root cause, implement fix, prevent recurrence.

### Project 6: MIG Configuration for Multi-Tenant Workloads
**Problem:** Partition H100 for 3 competing workloads with different SLOs.  
**Constraints:** Total throughput target, latency requirement per workload.  
**Validation:** All workloads meet SLOs simultaneously.

### Project 7: Kubernetes GPU Scheduling
**Problem:** Schedule 20 jobs on 8-GPU cluster with fairness constraints.  
**Constraints:** 3 job types (training, inference, research), 3 users.  
**Validation:** All jobs get GPU time, priority job completes first, no resource hoarding.

### Project 8: Security Architecture Audit
**Problem:** Audit a multi-tenant GPU cluster for security issues.  
**Constraints:** 3 workloads from different organizations, cost-sensitive.  
**Validation:** Identify 5+ isolation vulnerabilities, propose fixes.

### Project 9: Capacity Planning Forecast
**Problem:** Plan GPU capacity for a startup growing 3x over 2 years.  
**Constraints:** Cost budget, SLO targets, hardware refresh cycles.  
**Validation:** Forecast accuracy within 10%, cost within budget, SLOs maintained.

### Project 10: Training Cluster Design
**Problem:** Design a 100-GPU training cluster from scratch.  
**Constraints:** $5M budget, low-latency AllReduce, 24/7 operations.  
**Validation:** Justify every hardware choice, calculate expected throughput, demonstrate operability.

### Project 11: Inference Serving Design
**Problem:** Design multi-tenant inference service for 3 LLMs.  
**Constraints:** p99 latency &lt; 500ms, throughput 1000 req/sec, cost &lt; $0.001 per request.  
**Validation:** All constraints met simultaneously, handle traffic spike gracefully.

### Project 12: Research Infrastructure Design
**Problem:** Design GPU cluster for academic research lab with competing workloads.  
**Constraints:** Fair allocation, maximize utilization, minimize cost per research group.  
**Validation:** 5+ concurrent jobs coexist, no starvation, resource allocation transparent.

## How to Use

- **Solo practice:** Pick a project, solve independently, compare to solution walkthrough
- **Interview prep:** Solve Projects 10–12 as timed design exercises
- **Team exercises:** Discuss Projects 1–3 with peers, debate tradeoffs
- **Learning validation:** Complete project → read solution → identify gaps

## Evaluation Rubric

Each project is graded on:
- **Correctness:** Does the solution actually work?
- **Reasoning:** Can you justify every decision?
- **Depth:** Have you considered edge cases and tradeoffs?
- **Communication:** Can you explain it clearly?

## Cross-References

Each project links back to relevant Volume 23 interview chapters and underlying Volumes 1–21 theory.

