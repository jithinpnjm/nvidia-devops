---
title: Chapter 03 — NVIDIA NIM Architecture
description: Understand NIM packaging, runtime selection, model artifacts, APIs, health, and GPU execution.
sidebar_position: 4
tags: [nim, inference, microservices]
---

# NVIDIA NIM Architecture

NIM packages model-serving software, optimized runtimes, APIs, and operational conventions into a deployable microservice.

## Architecture

```mermaid
flowchart LR
    Client[Client]
    Gateway[Gateway]
    NIM[NIM Container]
    Runtime[Optimized Runtime]
    Model[Model Artifacts]
    GPU[GPU]
    Metrics[Health and Metrics]

    Client --> Gateway --> NIM --> Runtime --> GPU
    Model --> NIM
    NIM --> Metrics
```

## Why It Exists

Without packaging, teams must integrate a model, runtime, server, API, health behavior, optimization, and deployment conventions independently. NIM reduces that repeated integration work.

## Operational Boundary

The container still depends on model access, compatible GPU capacity, driver and runtime, storage, networking, security, and entitlement. Packaging narrows the integration surface; it does not eliminate it.

## Health Model

Separate container liveness, service readiness, model readiness, and application-level correctness.

## Troubleshooting

**Symptom:** the NIM Pod is Running but not Ready.

**Diagnosis:** inspect model download, entitlement, artifact cache, GPU memory, runtime compatibility, and readiness logs.
