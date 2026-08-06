---
title: Lab 02 — Deploy and Validate a NIM Service
description: Deploy an approved NIM service and validate model readiness, GPU execution, metrics, and rollback.
sidebar_position: 21
tags: [lab, nim, kubernetes]
---

# Lab 02 — Deploy and Validate a NIM Service

## Objective

Deploy a small approved NIM service in an isolated namespace using pinned artifacts and scoped credentials.

## Prerequisites

Valid entitlement, approved model, compatible GPU node, Kubernetes access, secret-management path, registry access, and sufficient memory.

## Deployment

Use a version-controlled manifest or Helm release. Pin the image digest and explicitly configure resources, node selection, probes, storage, secrets, and service exposure.

## Validation

Confirm Pod startup, GPU assignment, service and model readiness, one deterministic request, metrics, and logs.

## Performance

Measure cold start, warm request latency, throughput at low concurrency, and GPU memory.

## Failure Injection

Deploy a test revision with an invalid model reference. Verify that readiness prevents traffic.

## Cleanup

Delete the namespace resources and revoke temporary credentials. Preserve the deployment manifest and evidence.
