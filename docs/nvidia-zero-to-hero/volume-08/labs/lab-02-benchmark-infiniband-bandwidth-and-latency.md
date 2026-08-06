---
title: Lab 02 — Benchmark InfiniBand Bandwidth and Latency
description: Establish point-to-point RDMA baselines across representative fabric paths.
sidebar_position: 21
tags: [lab, infiniband, benchmark]
---

# Lab 02 — Benchmark InfiniBand Bandwidth and Latency

| Field | Value |
|---|---|
| Difficulty | Intermediate |
| Estimated time | 75 minutes |
| Platform | Two or more InfiniBand hosts |
| Lab type | Performance validation |

## 1. Objective

Measure latency and bandwidth across same-leaf and cross-fabric paths using controlled RDMA tests.

## 2. Background

Point-to-point baselines isolate endpoint and route health before collective testing.

## 3. Learning Outcomes

You will run read/write/send tests, vary message size, inspect counters, and report repeatable ranges.

## 4. Architecture

```mermaid
flowchart LR
    A[Host A] <--> L1[Leaf]
    L1 <--> S[Spine]
    S <--> L2[Leaf]
    L2 <--> B[Host B]
```

## 5. Prerequisites

Compatible `perftest` or vendor-supported tools, known port identities, and an approved test window.

## 6. Environment

Record CPU affinity, HCA port, MTU, firmware, link speed, route, and tool version.

## 7. Components

QP transport, registered memory, HCA, links, switches, routing, and completion processing.

## 8. Deployment Steps

Run the server side of `ib_send_bw`, `ib_write_bw`, or `ib_read_bw`, then the matching client. Run `ib_send_lat` or the appropriate latency test. Use explicit device and port selection.

## 9. Validation

Confirm both endpoints use the expected HCA, port, MTU, and route.

## 10. Verification

Test small and large messages and repeat each case. Compare same-leaf and cross-leaf results.

## 11. Observability

Collect HCA and switch counter deltas during each run.

## 12. Performance Measurements

Report median, variation, and payload rate. Do not present one best run as the baseline.

## 13. Failure Injection

Use a safe alternate path or lower test queue depth to demonstrate methodology effects. Do not change shared switch policy.

## 14. Troubleshooting

If tests fail, verify addressing, P_Keys, MTU, route, firewall or host policy, QP state, and receiver readiness.

## 15. Cleanup

Stop test servers and archive commands, outputs, and counters.

## 16. Summary

You established reusable point-to-point fabric baselines.

## 17. Challenge Exercises

Automate a matrix across all representative rack pairs and flag outliers.

## 18. Further Reading

- [Routing and Oversubscription](../chapter-06-routing-topologies-and-oversubscription)
- [Production Troubleshooting](../chapter-10-production-troubleshooting)
