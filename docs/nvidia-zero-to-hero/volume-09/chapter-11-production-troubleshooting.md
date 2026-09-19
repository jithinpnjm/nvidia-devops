---
title: "Chapter 11 — Production Troubleshooting"
sidebar_position: 11
description: "Master the diagnostic workflows for AI Ethernet. Learn how to correlate application stalls with switch telemetry and PFC counters."
---

# Chapter 11 — Production Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 09 — Ethernet for AI (RoCE, Spectrum, DPUs) |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | Tier 3 Support, SREs, Network Operations |
| Core question | When a PyTorch job hangs indefinitely with no obvious error messages, how do you mathematically prove it is a network configuration drift? |

## Introduction

Troubleshooting an AI fabric requires a fundamental mental shift. 

In traditional IT, if an application is slow, you look for a down link, a crashed pod, or a full disk. 
In AI infrastructure, the links will be up, the pods will be running, and the disks will have space. Yet, the distributed training job will stall completely. The symptom is identical across four different root causes: queueing, PFC propagation, path imbalance, or endpoint configuration drift.

To troubleshoot RoCEv2, a Senior SRE must correlate application-level telemetry (NCCL timeouts) directly with hardware-level telemetry (switch queue depth and RDMA NIC counters) within the exact same time window.

## 1. The Symphony of Counters

You cannot troubleshoot RoCEv2 without knowing exactly which counters to read.

### On the Host (ConnectX NIC):
Use `ethtool -S <interface>` to read the hardware counters:
*   `rx_roce_np_ecn_marked`: Did the network tell the NIC to slow down (ECN)?
*   `rx_pause_ctrl`: How many PFC pause frames did this NIC receive from the switch? (If this is skyrocketing, the NIC is being choked).
*   `tx_pause_ctrl`: How many PFC pause frames did this NIC send to the switch? (If this is skyrocketing, the server's PCIe bus or CPU is too slow to ingest the network data).
*   `rx_roce_v2_nak_seq_err`: Did the NIC detect a dropped packet and request a Go-Back-N retransmission? (This number must be zero in a perfectly lossless fabric).

### On the Switch (Spectrum / Arista / Cisco):
*   **Queue Occupancy:** Is Priority 3 (RoCE) hitting its `xoff` watermark?
*   **PFC Tx/Rx per priority:** Is the switch actively generating Pause frames?
*   **ECN Marks:** Is the switch actively marking packets?

## 2. Diagnosing "The Slow Job"

**Symptom:** Two jobs are running on the fabric. There are no dropped packets recorded anywhere. However, Job A's collective step time has tripled, and it is running erratically.

**The Workflow:**
1.  **Gather Time-Aligned Counters:** Pull ECN marks and PFC pause duration on every Leaf port Job A touches during the exact time window of the slowdown.
2.  **Hypothesis 1: The Control Loop is Working.** If ECN marks are climbing but PFC frames are flat, the network is doing its job. The fabric is congested, ECN is slowing the job down, but no packets are lost. The fix is scheduling (don't run two massive jobs on the same shared paths), not a network configuration change.
3.  **Hypothesis 2: PFC Propagation.** If PFC frames are climbing on a specific Leaf, and you trace that pause propagating backward to the Spine, you have a queueing problem. The fix is adding capacity or altering workload placement.
4.  **Hypothesis 3: Path Imbalance (ECMP Failure).** If the topology map says Job A and Job B should not be sharing the same Leaf uplinks, but you see massive congestion on one specific uplink, you have an ECMP hash collision. Both jobs were hashed to the same wire. (This is why Spectrum Adaptive Routing is superior).
5.  **Hypothesis 4: Configuration Drift.** If you see PFC pause frames occurring on Priority 0 (Standard traffic) instead of Priority 3 (RoCE), a switch rebooted and lost its QoS configuration, or an engineer manually altered it. You must diff the switch configuration against the source of truth (GitOps).

## Customer Scenario (Senior Level)

**The Situation:**
A Kubernetes cluster administrator reports that a critical training job randomly hangs for exactly 120 seconds, crashes with a `NCCL WARN Call to epoll_wait failed`, and then restarts. The network team insists there are no downed links and the fabric is healthy.

**The Senior Architect Response:**
"A 120-second hang followed by an `epoll_wait` failure is the classic signature of an RDMA Queue Pair timeout caused by a silent packet drop. 

When RoCEv2 loses a packet, the NIC hardware waits for the sequence number. If it doesn't arrive, it requests a retransmission. If the network is so congested (or misconfigured) that the retransmissions also drop, the hardware enters an endless retry loop. Eventually, the hardware timer expires, the RDMA Queue Pair enters an error state, and NCCL throws the fatal timeout. 

The network team claims the fabric is healthy because they are looking at link state (Layer 1). We must look at the lossless protocol state (Layer 2/3). 

I will immediately execute an `ethtool` check on the affected nodes. We will look for `rx_roce_v2_nak_seq_err` to confirm packets are dropping. If they are, we must audit the switch path between those specific nodes. We will likely find that a specific Leaf switch has a misconfigured Trust Boundary, allowing standard traffic to overflow the RoCE priority queue, or that the PFC `xoff` threshold is set higher than the physical buffer size, allowing the buffer to overflow before the pause frame can be sent."

## Interview Preparation

**Conceptual:** If a distributed training job is slow, but there are zero dropped packets on the network, what are two possible network-related causes? *(Hint: 1. PFC Storms / Propagation: The network is technically lossless, but constant PFC pause frames are physically stopping traffic, causing massive latency. 2. ECMP Hash Collisions: Two large flows have hashed to the same uplink; ECN and DCQCN are throttling both flows to share the single wire, while other uplinks sit idle).*

**Architecture:** Why must an SRE check `ethtool` hardware counters instead of standard Linux `ifconfig` or `ip -s link` counters when troubleshooting RoCEv2? *(Hint: RoCEv2 bypasses the Linux kernel entirely via hardware offload. The OS network stack (`ifconfig`) never sees the traffic or the drops. You must query the NIC hardware directly using `ethtool -S` to see the RDMA-specific counters like ECN marks and NAK sequences).*
