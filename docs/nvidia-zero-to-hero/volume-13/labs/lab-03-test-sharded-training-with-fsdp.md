---
title: Lab 03 — Test Sharded Training with FSDP
description: Compare DDP and FSDP memory, communication, checkpointing, and step time.
sidebar_position: 22
tags: [lab, fsdp, sharding]
---

# Lab 03 — Test Sharded Training with FSDP

## Objective

Run the same model with DDP and FSDP, compare peak memory and throughput, and validate a sharded checkpoint restore.

## Method

Keep model, data, precision, global batch, hardware, and software identical. Record wrapping policy and FSDP options.

## Measurements

Peak allocated memory, step time, all-gather and reduce-scatter time, CPU overhead, checkpoint duration, and restore time.

## Validation

Compare loss and model outputs within the expected numerical tolerance.

## Failure Injection

Attempt restore with a deliberately mismatched configuration in a disposable run. Capture the error and document required metadata.

## Cleanup

Remove test checkpoints after checksums, metadata, and findings are archived.
