---
title: Lab 03 — Build a NeMo Customization Workflow
description: Plan and execute a small model-customization workflow with lineage, checkpointing, evaluation, and packaging.
sidebar_position: 22
tags: [lab, nemo, customization]
---

# Lab 03 — Build a NeMo Customization Workflow

## Objective

Run a small approved customization job and preserve enough evidence to reproduce the resulting artifact.

## Workflow

1. Record base-model revision and license.
2. Version the curated dataset and preprocessing.
3. Pin container, framework, and configuration.
4. Run the job with GPU, network, and storage telemetry.
5. Save checkpoint and checksum.
6. Evaluate against a defined baseline.
7. Package the approved artifact for serving.

## Failure Injection

Interrupt the job after a checkpoint and prove restart. Then test an incompatible checkpoint copy in a disposable run.

## Validation

The final record includes lineage, metrics, checkpoint metadata, evaluation outcome, and deployment decision.
