---
title: "Chapter 10 — Fabric Validation and Capacity Planning"
sidebar_position: 10
description: "Learn how to mathematically validate an AI fabric. Understand why traditional iperf tests fail, and how to use NCCL tests to prove RoCEv2 readiness."
---

# Chapter 10 — Fabric Validation and Capacity Planning

| Chapter metadata | Value |
|---|---|
| Volume | 09 — Ethernet for AI (RoCE, Spectrum, DPUs) |
| Difficulty | Advanced |
| Estimated reading time | 25 minutes |
| Primary audience | DevOps, SRE, Network Validation Engineers |
| Core question | Before handing the cluster over to the data scientists, how do you mathematically prove the fabric won't collapse under the load of an LLM? |

## Introduction

"The links are up." 

In enterprise networking, a link being 'up' and passing ping tests is often enough to close the ticket. In AI infrastructure, the link being 'up' means absolutely nothing. 

An AI fabric must be scientifically validated under extreme, synchronized microburst loads before it is allowed anywhere near production. If you hand an unvalidated fabric to a data science team, their jobs will fail randomly, and you will spend months chasing phantom bugs in PyTorch when the actual root cause is a misconfigured QoS threshold on a single leaf switch.

## 1. The Fallacy of iperf

The most common mistake junior engineers make is validating a 400G AI fabric using `iperf3`. 

`iperf3` generates a single, asynchronous TCP stream between Server A and Server B. It requires the Host CPU to process the TCP stack. 
1. It will max out the CPU long before it hits 400 Gbps.
2. It tests asynchronous, point-to-point traffic, completely failing to simulate the many-to-many Incast microbursts of AI training.
3. It uses TCP, meaning it completely bypasses the RDMA/RoCEv2 hardware queues and PFC/ECN configurations you just spent weeks building.

If `iperf` works, it only proves the optical cables are plugged in.

## 2. Validating with NCCL Tests

To validate an AI fabric, you must simulate AI math. 

NVIDIA provides a tool suite called `nccl-tests` (e.g., `all_reduce_perf`). These tests bypass the CPU and use the exact same NVIDIA Collective Communication Library (NCCL) that PyTorch uses.

### The Validation Sequence
1.  **Single-Node Tests:** Run `all_reduce_perf` inside a single node across all 8 GPUs. This validates NVLink, NVSwitch, and PCIe topologies. The network is not involved yet.
2.  **Two-Node Tests:** Run the test between Node 1 and Node 2. This validates the RDMA NICs, the optical transceivers, and a single hop through a Leaf switch.
3.  **Scale-Out (The Incast Test):** Run the test across 16, 32, or 64 nodes simultaneously. This is the crucible. This forces massive traffic across the Spine switches. 

### Reading the Results
If the RoCEv2, PFC, and ECN configurations are correct, the `nccl-tests` "Algorithm Bandwidth" should scale linearly and predictably as you add nodes. 
If the Algorithm Bandwidth collapses when you move from 2 nodes to 16 nodes, your fabric is dropping packets and triggering RDMA retransmissions. 

## 3. Verifying the Control Loops (PFC/ECN Counters)

While the `nccl-tests` are running, you must simultaneously monitor the switch telemetry.

*   **ECN Counters:** You *should* see ECN CE (Congestion Experienced) counters incrementing on the switches. This means the early-warning system is working and marking packets.
*   **PFC Counters:** You *should not* see massive spikes in PFC Pause frames. If PFC is constantly triggering, your ECN thresholds are misconfigured (as discussed in Chapter 5), and the fabric is relying on the brutal hardware brake instead of smooth algorithmic throttling.

## Customer Scenario (Senior Level)

**The Situation:**
A deployment team completes the physical racking of a 64-node GPU cluster. They report that all 400G links are active and `iperf` shows connectivity. They hand the cluster over to the AI team. The AI team attempts to train a large model using PyTorch DDP (Distributed Data Parallel), but the training step time fluctuates wildly—one iteration takes 500ms, the next takes 15 seconds.

**The Senior Architect Response:**
"We have skipped the mandatory fabric validation phase, resulting in application-level failures that are nearly impossible for the AI team to debug.

The massive variance in step time indicates that the cluster is experiencing severe network jitter, most likely caused by RDMA retransmissions due to dropped packets or constant PFC storms. Because the deployment team only ran `iperf`, they never tested the RDMA (RoCEv2) traffic classes or the QoS buffering under Incast pressure.

We must halt the training jobs and execute a formal validation plan. 
First, we will run `nccl-tests (all_reduce_perf)` across all 64 nodes to generate synthetic, synchronized tensor traffic. 
Simultaneously, we will poll the `ethtool` counters on the ConnectX NICs to look for `rx_roce_np_ecn_marked` (ECN marks) and `rx_pause_ctrl` (PFC pauses). We will also check the Leaf switch ASIC telemetry for dropped packets on Priority 3. 

Only when we can sustain `all_reduce_perf` at 90%+ expected algorithmic bandwidth with zero packet drops and minimal PFC pauses can we mathematically certify this fabric as production-ready."

## Interview Preparation

**Conceptual:** Why is `iperf3` inadequate for testing a modern AI GPU cluster? *(Hint: `iperf` uses CPU-bound TCP traffic. It cannot test RDMA/RoCEv2 queues, it cannot simulate synchronized many-to-many Incast microbursts, and it will bottleneck on the Host CPU long before saturating a 400G network link).*

**Architecture:** During a multi-node NCCL test, what does it mean if switch telemetry shows high ECN marking but zero PFC pause frames? *(Hint: This is the sign of a perfectly tuned network. ECN is detecting early congestion and telling the DCQCN algorithm on the NICs to slow down the flow. Because the flow slows down gracefully, the buffers never reach the critical threshold required to trigger a PFC hardware pause).*
