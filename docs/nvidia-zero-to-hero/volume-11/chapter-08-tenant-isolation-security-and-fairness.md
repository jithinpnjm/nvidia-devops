---
title: Chapter 08 — Tenant Isolation, Security, and Fairness
description: Design tenant boundaries across identity, scheduling, device sharing, networking, and data.
sidebar_position: 9
tags: [security, multi-tenancy, fairness]
---

# Tenant Isolation, Security, and Fairness

A shared accelerator is only one part of a multi-tenant boundary. Identity, secrets, network paths, storage, images, host access, scheduler policy, and telemetry must agree.

## Isolation Layers

| Layer | Control |
|---|---|
| Identity | SSO, service accounts, workload identity |
| Kubernetes | namespaces, RBAC, quotas, admission |
| Network | segmentation and NetworkPolicy |
| Storage | per-tenant credentials and paths |
| GPU | whole device, MIG, time-slicing, or vGPU |
| Host | hardened nodes and restricted privileges |

## Fairness

Fairness is not identical allocation. Teams may have different priorities, budgets, and SLOs. The platform should define queueing, preemption, quotas, borrowing, and chargeback explicitly.

## Security Warning

Time-slicing should not be presented as a hard security boundary. Choose a mechanism whose isolation properties match the threat model.

## Troubleshooting

**Symptom:** one tenant experiences repeated OOM events when another workload becomes active.

**Root cause:** shared memory pressure was not isolated or governed.

**Prevention:** use MIG or dedicated GPUs for the sensitive workload, enforce quotas, and alert on per-tenant memory behavior.
