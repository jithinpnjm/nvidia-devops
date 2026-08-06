---
title: Chapter 06 — Data Center Bridging and QoS
description: Design traffic classification, queueing, ETS, and loss controls for mixed AI Ethernet fabrics.
sidebar_position: 7
tags: [dcb, qos, ethernet]
---

# Data Center Bridging and QoS

AI Ethernet fabrics often carry RoCE, storage, service, and management traffic. Data Center Bridging (DCB) features provide traffic classes, priority-based flow control, and bandwidth allocation. The goal is controlled sharing—not making every class lossless.

## Learning Objectives

Explain classification, priority mapping, Enhanced Transmission Selection (ETS), queue isolation, and configuration consistency.

## Classification Pipeline

```mermaid
flowchart LR
    App[Application Traffic]
    Mark[DSCP / PCP Marking]
    Map[Priority Mapping]
    Queue[Switch Queue]
    Policy[ETS, ECN, PFC]
    Link[Physical Link]
    App --> Mark --> Map --> Queue --> Policy --> Link
```

A packet’s marking must map consistently at the host, access switch, routed fabric, and destination. A single mismatch can place RoCE traffic into a lossy queue or apply PFC to unrelated traffic.

## Core Controls

| Control | Purpose |
|---|---|
| Traffic classes | Separate behavior and telemetry |
| ETS | Allocate minimum bandwidth among classes |
| PFC | Pause one selected priority |
| ECN | Mark congestion for endpoint response |
| DSCP/PCP mapping | Carry classification intent |
| Scheduling | Select queue service order |

ETS guarantees are not equivalent to fixed reservations under every implementation and load. Validate actual behavior with simultaneous traffic classes.

## Production Design

Define a small number of classes. A common model separates management/control, RoCE compute, storage, and best-effort traffic. More classes increase operational complexity and reduce buffer flexibility.

Configuration should be generated from one source of truth. Continuously verify switch and host mappings, because drift is difficult to detect from application symptoms.

## Troubleshooting

**Symptoms:** RoCE drops despite PFC, management stalls during training, or storage receives less bandwidth than policy suggests.

Capture packet markings, queue mapping, PFC state, ECN marks, ETS configuration, and per-class counters at each hop. Follow one test flow end to end.

## Customer Perspective

QoS is not a substitute for sufficient capacity. It controls contention and protects critical classes, but a persistently overloaded fabric still queues, pauses, or drops traffic.

## Interview Preparation

**Question:** Why is end-to-end classification difficult?

Because applications, operating systems, NICs, VLANs, routed hops, and switches must preserve and interpret markings consistently.

## Key Takeaways

- DCB defines controlled traffic sharing.
- Classification consistency is the foundation.
- PFC should protect only the intended class.
- QoS manages contention; it does not create bandwidth.

## Cross References

- [ECN and DCQCN](./chapter-05-ecn-and-dcqcn)
- [Next: Spectrum Switches](./chapter-07-spectrum-switches-for-ai)
