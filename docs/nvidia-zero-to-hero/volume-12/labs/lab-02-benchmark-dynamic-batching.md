---
title: Lab 02 — Benchmark Dynamic Batching
description: Measure how queue delay and preferred batch sizes change inference throughput and tail latency.
sidebar_position: 21
tags: [lab, batching, benchmarking]
---

# Lab 02 — Benchmark Dynamic Batching

## Objective

Benchmark one model with batching disabled and enabled, then identify the operating point that meets both throughput and latency objectives.

## Method

Hold model, image, hardware, precision, client, and input distribution constant. Warm the model before measurement.

## Measurements

- requests per second;
- p50, p95, and p99 latency;
- server queue time;
- realized batch-size distribution;
- GPU utilization and memory;
- rejected or timed-out requests.

## Deployment

Create three model configurations: no batching, conservative queue delay, and aggressive queue delay. Apply one configuration at a time.

## Validation

Confirm the model version and active configuration before every run.

## Failure Injection

Increase concurrency beyond the stable operating point. Observe queue growth and timeout behavior.

## Result

Produce a graph or table showing where throughput gains begin to violate the latency SLO. Recommend a configuration with headroom.

## Cleanup

Restore the production-like baseline and remove generated traffic.
