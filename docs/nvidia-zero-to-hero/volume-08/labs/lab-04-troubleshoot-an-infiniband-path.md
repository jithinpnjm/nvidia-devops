---
title: Lab 04 — Troubleshoot an InfiniBand Path
description: Diagnose a controlled identity, route, or endpoint configuration failure.
sidebar_position: 23
tags: [lab, infiniband, troubleshooting]
---

# Lab 04 — Troubleshoot an InfiniBand Path

| Field | Value |
|---|---|
| Difficulty | Advanced |
| Estimated time | 90 minutes |
| Platform | Nonproduction InfiniBand lab |
| Lab type | Failure and troubleshooting |

## 1. Objective

Apply the physical-to-application incident method to a reversible path failure.

## 2. Background

The lab emphasizes evidence preservation and layer isolation rather than random restart or replacement.

## 3. Learning Outcomes

You will identify the first failing layer, repair it, verify recovery, and produce a concise incident report.

## 4. Architecture

```mermaid
flowchart LR
    App[RDMA Test] --> HCA1[HCA 1]
    HCA1 --> Fabric[IB Fabric]
    Fabric --> HCA2[HCA 2]
    HCA2 --> Peer[Peer Memory]
```

## 5. Prerequisites

Completed Labs 01–03 and permission to change only endpoint-level test configuration.

## 6. Environment

Capture healthy link, subnet, route, partition, counters, and benchmark output.

## 7. Components

Port state, LID/GID, P_Key, QP configuration, MTU, route, and completion status.

## 8. Deployment Steps

Create one safe fault: choose an incorrect test port, use an incompatible partition in an isolated lab, or select a wrong GID/index supported by the tool. Record the expected symptom.

## 9. Validation

Confirm the fault affects only the test process.

## 10. Verification

Reproduce the failure and capture completion or timeout evidence.

## 11. Observability

Collect endpoint state, manager logs, route/path information, and counter deltas before changing anything.

## 12. Performance Measurements

Use the healthy benchmark as the recovery target.

## 13. Failure Injection

Keep the change reversible and avoid physical disruption to shared links.

## 14. Troubleshooting

Check physical link, Active state, negotiated rate, manager health, identity, P_Key, path, QP completion, and test parameters in order.

## 15. Cleanup

Restore the healthy configuration and rerun the baseline.

## 16. Summary

You isolated and repaired a path failure using layered evidence.

## 17. Challenge Exercises

Write a decision tree and a support bundle script.

## 18. Further Reading

- [Production Troubleshooting](../chapter-10-production-troubleshooting)
- [Volume 08 Summary](../chapter-12-volume-08-summary)
