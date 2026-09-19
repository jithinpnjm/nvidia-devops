---
title: "Chapter 6 — Data Center Bridging and QoS"
sidebar_position: 6
description: "Master the configuration of a lossless fabric. Learn how to map DSCP values to traffic classes, configure ETS, and enforce trust boundaries."
---

# Chapter 6 — Data Center Bridging and QoS

| Chapter metadata | Value |
|---|---|
| Volume | 09 — Ethernet for AI (RoCE, Spectrum, DPUs) |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | Network Architects, Data Center Engineers |
| Core question | When standard IP traffic, NFS storage traffic, and RoCEv2 GPU traffic all hit the same physical port, how does the switch know which one gets lossless treatment? |

## Introduction

In the previous chapters, we established that RoCEv2 requires a lossless fabric (PFC) and proactive congestion control (ECN). 

But a 400G switch port does not inherently know what "RoCEv2" is. If you just plug cables into a switch, it treats all packets equally. If the buffers fill up, it drops everything equally.

To create a lossless fabric, we must deploy **Quality of Service (QoS)** and **Data Center Bridging (DCB)**. This is the process of mapping specific types of traffic into specific hardware queues, and applying strict physical rules (PFC/ECN) only to the queues that matter.

## 1. Traffic Classification (DSCP / Trust)

The first step is identifying the traffic. 

We use **DSCP (Differentiated Services Code Point)**, a 6-bit field in the IP header. The sender (the Server) must tag its traffic before putting it on the wire.
*   **DSCP 0 (Default):** Standard TCP/IP (SSH, Kubernetes API). 
*   **DSCP 24 (CS3):** Often used for standard NFS storage.
*   **DSCP 26 (AF31) or DSCP 48 (CS6):** Commonly designated for RoCEv2 AI Tensor traffic.

### The Trust Boundary
A switch must be configured with a **Trust Boundary**. If the switch "trusts" the server, it reads the DSCP tag (e.g., DSCP 48) and routes the packet into the appropriate internal queue. 
*Architectural Warning:* If you trust untrusted servers, a malicious container could tag its standard web traffic as DSCP 48, flooding your lossless queues and destroying the AI cluster's performance. Production fabrics rewrite tags at the ingress edge if they don't originate from trusted hardware.

## 2. Mapping DSCP to Traffic Classes (Queues)

Once the switch reads the DSCP tag, it must map it to a physical hardware queue (called a Traffic Class or Priority Group). Modern ASICs usually have 8 queues (0-7) per port.

**Example QoS Map:**
*   **Traffic Class 0:** Matches DSCP 0. (Standard traffic). Lossy. Drops allowed.
*   **Traffic Class 3:** Matches DSCP 26/48. (RoCEv2 traffic). **Lossless. PFC enabled. ECN enabled.**
*   **Traffic Class 7:** Matches DSCP 56. (Network Control / BGP traffic). Lossy, but guaranteed high priority.

## 3. Enhanced Transmission Selection (ETS)

If a 400G port is fully congested, which queue gets the bandwidth?

We use **ETS (Enhanced Transmission Selection)** to guarantee minimum bandwidth percentages to specific traffic classes during times of extreme congestion, while allowing classes to burst if the wire is idle.

**Example ETS Configuration:**
*   Traffic Class 0 (Standard): Guaranteed 10% bandwidth (40G).
*   Traffic Class 3 (RoCEv2): Guaranteed 85% bandwidth (340G).
*   Traffic Class 7 (Control): Guaranteed 5% bandwidth (20G).

If the RoCEv2 traffic stops, Traffic Class 0 can burst up to the full 400G. But the moment the GPUs start training, they are absolutely guaranteed 85% of the wire, and standard traffic is throttled.

## Customer Scenario (Senior Level)

**The Situation:**
A network administrator claims they have successfully configured RoCEv2. They show you the configuration: "We have enabled PFC on Priority 3 globally across all switches. We have configured the ConnectX NICs to tag all PyTorch traffic as Priority 3. Therefore, the fabric is lossless."

**The Senior Architect Response:**
"Your configuration has enabled PFC, but without configuring ETS and proper hardware buffering, you have inadvertently created a brittle network that will suffer from buffer starvation.

Simply enabling PFC on a priority queue is not enough. An Ethernet switch ASIC contains a finite pool of physical memory (e.g., 32MB or 64MB of shared buffer). By default, most ASICs allocate this memory dynamically across all queues. 

If a massive storage backup job runs on Traffic Class 0 (the lossy queue), it can absorb 90% of the switch's shared buffer pool. When the AI workload microbursts on Traffic Class 3, the switch will attempt to buffer it, but the physical memory is already exhausted by the storage traffic. Traffic Class 3 will hit its `xoff` threshold almost instantly, triggering a massive, premature PFC storm across the fabric.

To build a true lossless fabric, we must configure strict QoS memory allocation. We must carve out a dedicated, reserved buffer space strictly for Traffic Class 3 that cannot be touched by other queues. Only by configuring DSCP mapping, ETS bandwidth guarantees, and dedicated ingress/egress buffer reservations can we declare a fabric truly optimized for RoCEv2."

## Interview Preparation

**Conceptual:** Explain the relationship between DSCP and a Traffic Class. *(Hint: DSCP is the tag placed on the packet header by the sender (e.g., the server). The switch reads the DSCP tag and uses a QoS map to assign that packet to a specific internal hardware Traffic Class/Queue, where specific physical rules like PFC and ETS are applied).*

**Architecture:** Why must network control traffic (like BGP routing updates) be placed in a separate priority queue from RoCEv2 traffic? *(Hint: RoCEv2 traffic triggers PFC, which physically pauses the wire. If BGP traffic is in the same queue, the routing updates will be paused. If they are paused too long, the BGP adjacency drops, and the switch completely loses its routing tables, bringing down the entire data center. Control traffic must have a dedicated, un-pausable queue).*
