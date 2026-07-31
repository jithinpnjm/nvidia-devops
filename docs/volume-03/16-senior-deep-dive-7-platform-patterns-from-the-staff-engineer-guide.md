---
title: "Senior Deep Dive 7 — Platform patterns from the Staff Engineer guide"
slug: "senior-deep-dive-7-platform-patterns-from-the-staff-engineer-guide"
sidebar_position: 16
description: "Senior Deep Dive 7 — Platform patterns from the Staff Engineer guide — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
Several microservice patterns in your Staff Engineer guide become platform requirements when operated at scale. Circuit breakers protect dependencies but can hide sustained failure if telemetry is weak. Bulkheads isolate queues, worker pools or tenants. Sidecars move cross-cutting behavior next to the workload at the cost of resource and lifecycle complexity. Externalized configuration enables safe promotion. Event-driven systems decouple producers but introduce ordering, lag and replay semantics.


<!-- source-table:1 -->

| Pattern | Platform implementation question | Failure to design for |
| --- | --- | --- |
| Gateway | Where are auth, rate limit, retries and routing owned? | duplicate policy, retry storms |
| Circuit breaker | Who emits breaker state and dependency health? | silent partial outage |
| Bulkhead | What is the isolation unit: tenant, queue, node pool, GPU pool? | one workload exhausts shared capacity |
| Sidecar | Does helper lifecycle match the app and resource budget? | proxy/log agent breaks readiness or capacity |
| Event-driven | What are ordering, idempotency and replay contracts? | duplicate effects, unbounded consumer lag |
