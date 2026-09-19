---
title: "Chapter 3 — RoCEv2 and RDMA over Ethernet"
sidebar_position: 3
description: "Understand the core protocol that makes Ethernet viable for AI. Learn how RoCEv2 encapsulates InfiniBand commands inside standard UDP packets."
---

# Chapter 3 — RoCEv2 and RDMA over Ethernet

| Chapter metadata | Value |
|---|---|
| Volume | 09 — Ethernet for AI (RoCE, Spectrum, DPUs) |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Network Architects, Systems Engineers |
| Core question | How do we get the microsecond latency and zero-copy performance of InfiniBand while using standard Ethernet switches? |

## Introduction

As discussed in Volume 8, **RDMA (Remote Direct Memory Access)** is the holy grail of high-performance computing. It allows a Network Interface Card (NIC) to write data directly into the physical memory of a remote server, completely bypassing both CPUs and both Linux kernels.

Historically, RDMA was only possible on specialized InfiniBand networks. 
But InfiniBand is expensive, proprietary, and requires a distinct skillset. Hyperscalers (like Azure and AWS) demanded the performance of RDMA but insisted on using their massive, existing Ethernet infrastructure.

The solution is **RoCE (RDMA over Converged Ethernet)**. Specifically, RoCEv2.

## 1. The Anatomy of RoCEv2

RoCEv2 is a stroke of engineering genius: it takes native InfiniBand RDMA commands and wraps them in standard IP and UDP headers so they can be routed by normal Ethernet switches.

### The Protocol Stack
When an application (like PyTorch/NCCL) issues an RDMA write:
1.  **InfiniBand Payload:** The command starts as a pure InfiniBand Base Transport Header (BTH) and data payload.
2.  **UDP Encapsulation:** The NIC wraps this in a standard UDP header (using destination port 4791).
3.  **IP Routing:** It is wrapped in an IPv4 or IPv6 header, allowing it to cross subnets (Layer 3 routing).
4.  **Ethernet:** It is wrapped in a standard Layer 2 Ethernet frame and put on the wire.

To the application, it looks like it is talking to an InfiniBand fabric. To the Cisco or Arista core switch, it looks like a standard UDP packet. 

## 2. The Fatal Flaw of UDP

There is one massive architectural problem with RoCEv2.
It uses UDP. 

TCP (Transmission Control Protocol) is "reliable." If a switch drops a TCP packet, the sender knows it and resends it. 
UDP (User Datagram Protocol) is "unreliable." It is a fire-and-forget protocol. If a switch drops a UDP packet, the network doesn't care.

Because RDMA hardware assumes the network is perfectly lossless (like InfiniBand), a dropped RoCEv2 UDP packet is catastrophic. The RDMA NIC hardware will detect the sequence number mismatch, halt the entire transmission, generate an NAK (Negative Acknowledgment), and force a Go-Back-N retransmission of the entire sequence. 

**This means RoCEv2 is a protocol built on top of UDP that absolutely cannot tolerate dropped UDP packets.**

## 3. Forcing Ethernet to be Lossless

To make RoCEv2 work, you cannot just plug the cables in and turn it on. You must violently modify the behavior of the Ethernet switches to prevent them from ever dropping packets. 

We must transform "Lossy Ethernet" into "Converged (Lossless) Ethernet." This requires two specific technologies configured in perfect harmony:
1.  **Priority Flow Control (PFC):** A Layer 2 mechanism that tells a switch to pause traffic on a specific wire before its buffer overflows. (Covered in Chapter 4).
2.  **Explicit Congestion Notification (ECN):** A Layer 3 mechanism that tags packets to warn the sender to slow down before PFC is triggered. (Covered in Chapter 5).

If you deploy RoCEv2 without perfectly tuning PFC and ECN across every single switch port and NIC in the data center, your AI cluster will experience constant RDMA retransmissions and the training jobs will grind to a halt.

## Customer Scenario (Senior Level)

**The Situation:**
A DevOps engineer attempts to build an AI cluster across two different availability zones (AZs) in a public cloud. They configure their nodes to use RoCEv2. The ping latency between AZs is only 2 milliseconds. However, the NCCL tests fail entirely, timing out with `IBV_WC_RETRY_EXC_ERR`. The engineer blames the cloud provider's network bandwidth.

**The Senior Architect Response:**
"The issue is not bandwidth; the issue is that you are attempting to run a loss-sensitive protocol over a lossy WAN link.

RoCEv2 encapsulates RDMA in UDP packets. While UDP can be routed across the public internet or between Availability Zones (Layer 3), the required congestion control mechanisms—specifically Priority Flow Control (PFC)—operate at Layer 2. PFC pause frames cannot traverse the cloud provider's inter-AZ routers. 

When your RoCE traffic bursts between AZs, it encounters standard internet routing buffers. Because it is UDP traffic without PFC protection, the cloud routers drop packets during microbursts. A single dropped packet triggers an RDMA Go-Back-N retransmission. Over a 2-millisecond WAN link, these retransmissions compound, causing the Queue Pairs to time out and enter an error state (`RETRY_EXC_ERR`), crashing the application.

RoCEv2 is designed for tightly coupled, perfectly controlled, lossless data center fabrics. It cannot be routed across standard WANs or availability zones. We must constrain this training job to a single AZ and a single dedicated Leaf-Spine fabric where we control the PFC and ECN queues end-to-end."

## Interview Preparation

**Conceptual:** What is the primary difference between RoCEv1 and RoCEv2? *(Hint: RoCEv1 encapsulated InfiniBand directly into Layer 2 Ethernet frames, meaning it could not be routed across different subnets. RoCEv2 encapsulates InfiniBand into UDP/IP, allowing it to be routed across Layer 3 networks, making it viable for massive modern Leaf-Spine data centers).*

**Architecture:** Why is running RoCEv2 dangerous if the network switches are not configured correctly? *(Hint: RoCEv2 relies on UDP, which does not have built-in packet loss recovery like TCP. If the network switches are not configured with PFC/ECN to guarantee a lossless fabric, dropped packets cause severe RDMA hardware timeouts, destroying AI workload performance).*
