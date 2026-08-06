---
title: Chapter 10 — Performance Metrics and Benchmarking
description: Benchmark inference with realistic traffic, latency percentiles, token metrics, and reproducible methodology.
sidebar_position: 11
tags: [benchmarking, latency, throughput]
---

# Performance Metrics and Benchmarking

A benchmark is useful only when it represents the production question.

## Core Metrics

- request throughput;
- average, p50, p95, and p99 latency;
- time to first token;
- inter-token latency or time per output token;
- tokens per second;
- queue time;
- batch size distribution;
- GPU utilization, memory, power, and errors;
- rejected and cancelled requests.

## Reproducibility

Record model, revision, precision, engine, hardware, driver, runtime, prompt distribution, output distribution, concurrency, warm-up, and measurement window.

## Load Shape

Open-loop tests send requests independently of response time and expose overload behavior. Closed-loop tests wait for responses and may hide queue growth. Use both deliberately.

## Anti-Pattern

Do not compare two systems with different model revisions, context lengths, quality settings, or batching policies and call the result a hardware comparison.

## Interview Question

How would you prove that an optimization improved user experience rather than only aggregate throughput?
