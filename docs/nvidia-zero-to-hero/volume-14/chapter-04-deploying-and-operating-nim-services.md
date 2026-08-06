---
title: Chapter 04 — Deploying and Operating NIM Services
description: Design NIM deployment, scaling, security, observability, rollout, and rollback in production.
sidebar_position: 5
tags: [nim, kubernetes, operations]
---

# Deploying and Operating NIM Services

A production NIM service requires more than a Deployment manifest.

## Deployment Layers

- authenticated artifact and model access;
- GPU resource and node selection;
- persistent or warm model cache;
- secrets and workload identity;
- service, ingress, and network policy;
- liveness, readiness, and startup probes;
- queue and overload controls;
- telemetry, logs, and traces;
- canary rollout and rollback.

## Architecture

```mermaid
flowchart TD
    Git[Versioned Configuration]
    Deploy[Deployment Controller]
    Canary[Canary NIM]
    Test[Functional and Load Test]
    Gate{Acceptance Gate}
    Fleet[Production Replicas]
    Rollback[Rollback]

    Git --> Deploy --> Canary --> Test --> Gate
    Gate -->|Pass| Fleet
    Gate -->|Fail| Rollback
```

## Scaling

Scale on queue depth, request rate, latency, and active work rather than GPU utilization alone. Model load time and cache warm-up can make reactive autoscaling too slow.

## Troubleshooting

A new revision that is healthy but slower should fail the canary gate. Functional health is not sufficient for production acceptance.
