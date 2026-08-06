---
title: Chapter 02 — Platform Architecture and Support Boundary
description: Map NVIDIA, platform vendor, integrator, and customer responsibilities across the enterprise AI stack.
sidebar_position: 3
tags: [support-boundary, architecture, operations]
---

# Platform Architecture and Support Boundary

Supportability depends on knowing where responsibility changes.

## Responsibility Map

| Layer | Typical primary owner |
|---|---|
| Business application | Customer or application team |
| Model and data | Customer, model provider, or integrator |
| NIM or NeMo configuration | Platform and ML teams |
| NVIDIA AI Enterprise components | NVIDIA support boundary, subject to qualification |
| Kubernetes or hypervisor | Customer and platform vendor |
| OS, firmware, hardware | Customer, OEM, and NVIDIA by component |
| Network and storage | Customer and respective vendors |

## Architecture

```mermaid
flowchart LR
    Customer[Customer Operations]
    Integrator[Integrator]
    NVIDIA[NVIDIA]
    OEM[OEM]
    Platform[Platform Vendor]
    Evidence[Shared Diagnostic Evidence]

    Customer --> Evidence
    Integrator --> Evidence
    NVIDIA --> Evidence
    OEM --> Evidence
    Platform --> Evidence
```

The best support process begins before an incident. Define first contact, evidence bundle, escalation criteria, maintenance authority, and rollback ownership.

## Production Anti-Pattern

A team assumes the subscription makes every surrounding component NVIDIA’s responsibility. During an outage, network, storage, and platform evidence is missing, delaying isolation.

## Customer Perspective

A principal architect should state support boundaries honestly. Consolidated support reduces ambiguity but does not remove the need for customer operations and multi-vendor coordination.
