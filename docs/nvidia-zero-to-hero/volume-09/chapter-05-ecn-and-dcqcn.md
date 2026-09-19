---
title: "Chapter 5 — ECN and DCQCN"
sidebar_position: 5
description: "Master the softer side of congestion control. Learn how ECN prevents PFC storms by warning senders to slow down before buffers overflow."
---

# Chapter 5 — ECN and DCQCN

| Chapter metadata | Value |
|---|---|
| Volume | 09 — Ethernet for AI (RoCE, Spectrum, DPUs) |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Network Architects, Performance Engineers |
| Core question | If PFC is a brutal hardware brake that pauses the entire network, how do we teach the applications to gently slow down before PFC is triggered? |

## Introduction

In Chapter 4, we established that Priority Flow Control (PFC) is mandatory to prevent packet loss. However, PFC is a last resort. It is a violent hardware halt. If a data center constantly relies on PFC to manage congestion, PFC Pause frames will propagate backward across the Spine switches, freezing massive sections of the fabric. This is known as a PFC Storm.

A healthy AI network should almost never trigger PFC. 

To achieve this, we need a proactive, early-warning system. We need a way for the switch to say: *"My buffers are getting warm. Please slow down your transmission rate slightly, so I don't have to hit the PFC panic button."*

This is accomplished via **Explicit Congestion Notification (ECN)** and the **DCQCN** algorithm running on the NICs.

## 1. Explicit Congestion Notification (ECN)

ECN is a standard IP feature (RFC 3168) that uses two bits in the IPv4/IPv6 header.

Here is how it operates in an AI fabric:
1.  **The Threshold:** A Network Architect configures an ECN threshold on the switch buffer (e.g., if the buffer hits 20% capacity). Note that this threshold is *much lower* than the PFC threshold (e.g., 80% capacity).
2.  **The Mark:** When a packet passes through the switch and the buffer is above 20%, the switch does not drop the packet, and it does not pause the port. Instead, it flips the ECN bits in the packet header to `11` (Congestion Experienced - CE). 
3.  **The Delivery:** The marked packet continues to its destination (the receiving GPU).

## 2. DCQCN: The Brains on the NIC

ECN marks the packet, but the switch itself does not tell the sender to slow down. It relies on the endpoints (the ConnectX NICs) to handle the congestion. 

This requires **Data Center Quantized Congestion Notification (DCQCN)**, an advanced algorithm implemented in the hardware of the RDMA NICs.

1.  **The Notification:** The receiving NIC gets the ECN-marked packet. It realizes the network path is congested.
2.  **The CNP (Congestion Notification Packet):** The receiving NIC immediately generates a special RDMA control message called a CNP and fires it backward to the original sender.
3.  **The Rate Reduction:** The sending NIC receives the CNP. The DCQCN algorithm mathematically calculates a lower transmission rate and throttles the sending GPU's output. 
4.  **The Recovery:** If the sending NIC stops receiving CNPs, a hardware timer ticks, and the DCQCN algorithm slowly increases the transmission rate back to full speed.

### The Harmony of ECN and PFC
*   **Buffer at 20%:** ECN marks packets. DCQCN gently slows the senders down. 
*   **Buffer drops to 10%:** ECN stops marking. DCQCN speeds senders back up.
*   **Buffer spikes to 80% (Incast event):** ECN wasn't fast enough. The switch slams the PFC brake pedal, halting traffic instantly to prevent packet loss.

## Customer Scenario (Senior Level)

**The Situation:**
A network team monitors their 800G AI fabric during an LLM training run. They notice thousands of PFC Pause frames triggering every second on the Leaf switches. The network is completely halting, causing severe latency spikes. They check the ECN configuration on the Leaf switches and confirm it is enabled and marking packets. They conclude the RDMA NICs are ignoring the ECN marks.

**The Senior Architect Response:**
"The RDMA NICs are likely not ignoring the ECN marks. You are experiencing the classic symptom of **Misaligned Buffer Thresholds**.

ECN and PFC must be orchestrated as a unified system within the switch ASIC's memory. 
Let's examine the mathematical reality of a microburst. When an Incast event hits a port, the buffer fills extremely rapidly. 

If you configure your ECN marking threshold at 60% of the buffer, and your PFC pause threshold at 65% of the buffer, ECN has no time to act. By the time the switch marks the packet (60%), the packet travels to the receiver, the receiver generates a CNP, the CNP travels back across the data center, and the sender's DCQCN algorithm slows the rate down... the microburst has already filled the remaining 5% of the buffer and triggered the brutal PFC pause. 

To fix this, we must widen the gap. We must set the ECN minimum marking threshold aggressively low (e.g., 15%). We must set the PFC threshold high (e.g., 80%). This guarantees the ECN control loop has the physical time (measured in microseconds) to travel across the data center and throttle the sender's transmission rate long before the buffer critical mass (PFC) is reached."

## Interview Preparation

**Conceptual:** Explain the distinct roles of ECN and PFC in an AI Ethernet fabric. *(Hint: ECN is the soft, proactive early-warning system. It marks packets to tell endpoints to gracefully slow down their transmission rate. PFC is the hard, reactive safety net. It physically pauses the wire to guarantee no packets are dropped when buffers are about to overflow).*

**Architecture:** Describe the journey of a CNP (Congestion Notification Packet). *(Hint: A switch experiences congestion and flips the ECN bit on a passing packet. The receiving NIC reads the ECN bit and generates a CNP. The receiver sends the CNP back to the original sender. The original sending NIC receives the CNP and uses the DCQCN algorithm to throttle its transmission rate).*
