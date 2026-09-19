---
title: "Chapter 4 — Priority Flow Control (PFC)"
sidebar_position: 4
description: "Master the Layer 2 safety net of AI networks. Learn how PFC prevents packet loss by pausing traffic before switch buffers overflow."
---

# Chapter 4 — Priority Flow Control (PFC)

| Chapter metadata | Value |
|---|---|
| Volume | 09 — Ethernet for AI (RoCE, Spectrum, DPUs) |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Network Architects, Data Center Engineers |
| Core question | If a switch buffer is 99% full, how do we physically stop the sender from transmitting the packet that will cause the drop? |

## Introduction

As established in Chapter 3, RoCEv2 requires a lossless network. If a packet is dropped, the RDMA hardware halts, and the AI cluster stalls. 

But Ethernet switches have finite memory buffers. When 100 GPUs transmit data to a single destination GPU (an Incast event), the switch buffer leading to that destination fills up in microseconds.

The solution is **Priority Flow Control (PFC) — IEEE 802.1Qbb**. PFC is a brutal, hardware-level brake pedal. It allows a switch to scream at the sender: *"My buffer is full. Stop sending data on this specific priority class immediately."*

## 1. How PFC Works (The Pause Frame)

PFC operates entirely at Layer 2 (the physical/MAC layer). It is hop-by-hop, meaning it only works between two physically connected devices (e.g., a Server and a Leaf switch, or a Leaf and a Spine).

1.  **The Buffer Fills:** Leaf Switch A detects that the egress buffer on Port 10 is dangerously high (e.g., crossing the `xoff` threshold).
2.  **The Pause Frame:** Leaf Switch A immediately generates a special Ethernet Pause Frame and sends it backward out of the ingress ports feeding that buffer. 
3.  **The Halt:** The connected devices (e.g., the GPU NICs or the Spine switches) receive the Pause Frame. Their hardware immediately halts transmitting data for a specified duration (measured in quanta).
4.  **The Resume:** Once Leaf Switch A drains its buffer below a safe threshold (`xon`), it sends a resume frame, and the network flows again.

This physically guarantees that Leaf Switch A will never drop a packet due to congestion.

## 2. Why "Priority" is Critical (Avoiding Head-of-Line Blocking)

Before PFC, older networks used a generic "Ethernet Pause." If a switch buffer filled up, it sent a Pause Frame that halted *all* traffic on the wire. This was disastrous. A burst of storage traffic would pause the wire, causing critical SSH or Kubernetes API traffic to drop. This is known as **Head-of-Line (HoL) Blocking**.

PFC fixes this by dividing the physical wire into 8 logical lanes, called **Priorities** (or Traffic Classes).

In an AI data center, you map RoCEv2 traffic to a specific priority (commonly Priority 3 or 4).
When the switch issues a PFC Pause Frame, it explicitly says: *"Pause Priority 3 ONLY."*
The GPU tensor traffic halts, preventing packet loss, while SSH, ping, and standard front-end traffic (running on Priority 0) continue to flow completely unhindered.

## 3. The Dangers of PFC (PFC Storms and Deadlocks)

PFC is a blunt instrument. While it prevents packet loss, misconfigured PFC can destroy a data center.

### PFC Propagation (Congestion Spreading)
Because PFC is hop-by-hop, if Leaf A tells Spine B to pause, Spine B's buffers will now start to fill up. Spine B will then generate PFC Pause frames and send them to Leaf C, D, and E. The congestion propagates backward through the topology like a traffic jam on a highway, eventually pausing the entire data center.

### PFC Deadlock
If the routing topology has a loop, or if the buffer thresholds are misconfigured, Switch A pauses Switch B, Switch B pauses Switch C, and Switch C pauses Switch A. All three switches sit permanently paused, waiting for the others to clear. The network is dead. Modern switches implement **PFC Watchdog** timers to detect this, forcibly dropping the blocked packets to break the deadlock.

## Customer Scenario (Senior Level)

**The Situation:**
A network team enables RoCEv2 across their data center. They configure PFC on Priority 3 globally across all switches and NICs. However, during large LLM training runs, they notice that the storage network (NFS) performance collapses, and sometimes they lose SSH access to the GPU nodes entirely, even though storage and SSH are using standard TCP/IP.

**The Senior Architect Response:**
"You have enabled PFC, but you have failed to enforce **Traffic Classification and Trust Boundaries**. 

PFC pauses specific traffic classes based on the VLAN Priority (PCP) or Differentiated Services Code Point (DSCP) tags in the packet headers. You designated Priority 3 for RoCEv2. However, Linux operating systems and various applications will often tag their own packets with arbitrary DSCP values. 

If your NFS storage servers or your Kubernetes pods are accidentally tagging their standard TCP traffic with DSCP values that map to Priority 3, the network switches are treating that traffic as RoCEv2. When the AI workload microbursts and triggers a PFC Pause Frame for Priority 3, it is simultaneously pausing your storage and SSH traffic. 

To fix this, we must configure strict QoS ACLs (Access Control Lists) on the ingress ports of the Leaf switches. The switch must **rewrite or drop** the DSCP tags of any traffic that is not explicitly originating from the RDMA hardware. By enforcing a strict Trust Boundary at the edge, we guarantee that only actual GPU tensor traffic is placed in the PFC-protected Priority 3 queue, protecting the rest of the data center from Head-of-Line blocking."

## Interview Preparation

**Conceptual:** What is the fundamental difference between generic Ethernet Pause and Priority Flow Control (PFC)? *(Hint: Generic pause halts all traffic on the wire, causing Head-of-Line blocking. PFC divides the wire into 8 logical classes and can selectively pause a single class (e.g., RoCE traffic) while allowing all other traffic (e.g., SSH, storage) to continue flowing).*

**Architecture:** Why is PFC considered a "blunt instrument" that requires a softer mechanism (like ECN) to assist it? *(Hint: PFC is a hard hardware halt. While it prevents packet loss, it completely stops traffic and causes congestion to spread backward through the spine switches (PFC propagation). We need a softer mechanism to tell senders to slow down gracefully before the buffers get full enough to trigger the brutal PFC pause).*
