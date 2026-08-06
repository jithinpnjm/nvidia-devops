---
title: Lab 04 — Troubleshoot Entitlement and Runtime Failures
description: Separate registry, entitlement, platform, runtime, GPU, and model-readiness failures.
sidebar_position: 23
tags: [lab, troubleshooting, entitlement]
---

# Lab 04 — Troubleshoot Entitlement and Runtime Failures

## Objective

Diagnose a deployment that cannot pull or start an approved enterprise AI artifact.

## Diagnostic Order

1. Confirm exact image or model reference and digest.
2. Verify entitlement and token scope.
3. Test DNS, proxy, TLS, and registry reachability.
4. Verify image-pull secret or workload identity.
5. Inspect node runtime, driver, and GPU capacity.
6. Inspect container startup and model readiness.
7. Compare with a known-good deployment.

## Evidence

Collect Pod events, registry error, secret metadata without exposing values, runtime logs, GPU inventory, model logs, and compatibility versions.

## Failure Injection

Use an intentionally invalid test credential and confirm that the error is distinguishable from runtime incompatibility.

## Resolution

Repair the lowest failed layer, rerun the same pull and readiness checks, and restore traffic only after a deterministic inference test passes.
