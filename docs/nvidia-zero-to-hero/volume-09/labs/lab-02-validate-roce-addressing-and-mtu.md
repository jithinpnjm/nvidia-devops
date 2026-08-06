---
title: Lab 02 — Validate RoCE Addressing and MTU
description: Prove GID, VLAN, route, priority, and MTU consistency between RoCE endpoints.
sidebar_position: 21
tags: [lab, roce, mtu]
---

# Lab 02 — Validate RoCE Addressing and MTU

| Field | Value |
|---|---|
| Difficulty | Intermediate |
| Estimated time | 60 minutes |
| Platform | Two RoCE-capable hosts |
| Lab type | Validation |

## 1. Objective

Validate the network and RDMA identities used by a selected endpoint pair.

## 2. Background

Basic IP reachability does not validate the GID, traffic class, MTU, or queue used by RoCE.

## 3. Learning Outcomes

You will select the intended interface/GID, verify the route, and run a minimal host-memory RDMA test.

## 4. Architecture

```mermaid
flowchart LR
    H1[Host 1 GID] --> Fabric[Ethernet / IP Fabric]
    Fabric --> H2[Host 2 GID]
```

## 5. Prerequisites

RoCE-capable adapters, working Ethernet/IP, supported RDMA tools, and read access to switch configuration.

## 6. Environment

Record VLAN, subnet, route, interface MTU, switch MTU, GID index/type, DSCP/PCP, and firmware.

## 7. Components

IP interface, GID table, RDMA device, VLAN, route, switch queue, and path MTU.

## 8. Deployment Steps

Inspect `rdma link`, `ibv_devinfo`, GID tables, `ip route get`, and interface MTU. Use a supported RDMA point-to-point tool with explicit device, port, and GID selection.

## 9. Validation

Confirm both endpoints use the intended address family, VLAN, GID type, and traffic class.

## 10. Verification

Run small and large-message host-memory RDMA tests and confirm clean completions.

## 11. Observability

Capture NIC and switch counters, PFC, ECN, and drops during the test.

## 12. Performance Measurements

Report repeatable latency and bandwidth ranges; do not compare with GPU-buffer tests yet.

## 13. Failure Injection

Use a reversible test-process selection of the wrong GID or interface. Do not change shared MTU or switch policy.

## 14. Troubleshooting

If ping works but RDMA fails, inspect GID, route, P_Key where exposed, MTU, priority mapping, and completion status.

## 15. Cleanup

Stop test servers and restore environment variables.

## 16. Summary

You proved the routed Ethernet and RDMA identity path.

## 17. Challenge Exercises

Repeat across VLAN or routed boundaries and document differences.

## 18. Further Reading

- [RoCEv2](../chapter-03-rocev2-and-rdma-over-ethernet)
- [Production Troubleshooting](../chapter-11-production-troubleshooting)
