---
title: Lab 04 — Troubleshoot a Slow Inference Pipeline
description: Decompose latency and identify queueing, CPU, GPU, cache, or network bottlenecks.
sidebar_position: 23
tags: [lab, troubleshooting, inference]
---

# Lab 04 — Troubleshoot a Slow Inference Pipeline

## Objective

Diagnose a service whose average latency is acceptable but p99 latency violates the SLO.

## Evidence

Collect gateway timestamps, queue time, tokenizer CPU, batch size, model execution time, time to first token, inter-token latency, GPU metrics, cache occupancy, and network timings.

## Workflow

1. Reproduce with the same request distribution.
2. Separate client, gateway, queue, preprocessing, execution, and streaming time.
3. Compare a healthy and slow replica.
4. Inspect concurrency and cache pressure.
5. Verify hardware and distributed paths.
6. Change one variable and repeat.

## Failure Injection

Create a bounded queue delay or CPU constraint in a test environment and prove that GPU-focused dashboards alone miss the bottleneck.

## Resolution

Repair the limiting stage, rerun the identical load test, and verify both p99 latency and error rate.

## Prevention

Use distributed tracing, bounded queues, admission control, realistic canaries, and alerts on latency decomposition rather than aggregate latency alone.
