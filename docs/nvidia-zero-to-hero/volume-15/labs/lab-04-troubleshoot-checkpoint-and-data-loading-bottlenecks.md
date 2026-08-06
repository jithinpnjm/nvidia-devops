---
title: Lab 04 — Troubleshoot Checkpoint and Data-Loading Bottlenecks
description: Separate application serialization, metadata, client, network, target, and GPU symptoms.
sidebar_position: 23
tags: [lab, troubleshooting, checkpointing]
---

# Lab 04 — Troubleshoot Checkpoint and Data-Loading Bottlenecks

## Objective

Diagnose a job that alternates between low GPU utilization during data loading and long pauses during checkpoints.

## Evidence Bundle

Collect application step phases, loader queue, worker CPU, file count and size, client I/O, network counters, filesystem metadata, target utilization, checkpoint size and duration, and GPU telemetry.

## Workflow

1. Mark data-wait and checkpoint intervals in the application log.
2. Correlate with CPU, client, network, and storage metrics.
3. Compare a healthy node and slow node.
4. Test one representative shard and one checkpoint copy.
5. Identify the first saturated or serialized stage.
6. Apply one bounded change and repeat.

## Failure Injection

Create a small-file version of a test dataset or reduce loader concurrency. Observe how the bottleneck signature changes.

## Resolution Examples

Package files into shards, rebalance targets, change striping, increase controlled loader concurrency, move transforms offline, stage checkpoints locally, or separate checkpoint traffic.

## Cleanup

Delete test data, restore settings, and attach before-and-after evidence to the runbook.
