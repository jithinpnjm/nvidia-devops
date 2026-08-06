---
title: Lab 02 — Benchmark Local NVMe and Shared Storage
description: Compare local and shared storage using controlled sequential, random, and metadata workloads.
sidebar_position: 21
tags: [lab, nvme, benchmarking]
---

# Lab 02 — Benchmark Local NVMe and Shared Storage

## Objective

Measure local NVMe and shared storage under patterns that resemble model load, training shards, checkpoints, and metadata-heavy datasets.

## Method

Use approved tools and disposable files. Record file size, block size, queue depth, concurrency, cache state, duration, and topology.

## Workloads

- large sequential read;
- large sequential write;
- random read where relevant;
- concurrent client read;
- create, stat, and delete small files;
- checkpoint-like burst.

## Validation

Monitor CPU, disk, network, filesystem, and node health during every test. Stop if production services are affected.

## Interpretation

Do not compare only peak throughput. Compare consistency, metadata rate, CPU overhead, and behavior under concurrency.

## Cleanup

Delete test files and confirm capacity and target health return to baseline.
