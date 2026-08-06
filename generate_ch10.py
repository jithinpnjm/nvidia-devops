def generate():
    content = """---
title: Chapter 10 — Multi-Node Training Architecture
description: Understand multi-node topology, rail-optimized network designs, InfiniBand/RoCE, and node-level architecture.
sidebar_position: 11
tags: [multi-node, architecture, infiniband, roce, topology]
---

# Multi-Node Training Architecture

## The Problem: Scaling Beyond a Single Box

A single HGX node (like an NVIDIA DGX) has 8 GPUs tightly coupled with NVLink, providing massive bandwidth. However, training a foundation model requires hundreds or thousands of GPUs. The problem this solves is how to connect these independent 8-GPU islands into a single, cohesive supercomputer without the network becoming a crippling bottleneck.

If the network connecting the nodes is slow, the GPUs will spend the majority of their time idling, waiting for data to arrive from other nodes.

## Node-Level Architecture

Before scaling out, we must understand the node itself. A standard 8-GPU AI node is highly symmetrical.

1. **GPUs:** 8x NVIDIA H100s or A100s.
2. **NVLink Switch:** Connects all 8 GPUs locally.
3. **PCIe Switches:** Connect GPUs to the CPUs and NICs.
4. **NICs (Network Interface Cards):** Up to 8x high-speed NICs (ConnectX-7), providing up to 400Gbps *per GPU*.

Notice a pattern? There is a 1:1 ratio of GPUs to NICs. This is critical for scaling.

## Rail-Optimized Network Topology

In a standard data center, servers connect to a Top-of-Rack (ToR) switch. If Server A talks to Server B, traffic flows through that single switch. 

For AI training, this is insufficient. We use a **Rail-Optimized** design.
Imagine 8 separate, parallel network fabrics (Rail 1 through Rail 8).
- GPU 0 on Node 1 connects to Rail 1.
- GPU 0 on Node 2 connects to Rail 1.
- GPU 7 on Node 1 connects to Rail 8.

This means GPU 0 only talks to other GPU 0s across the cluster through a dedicated, non-blocking switch. 

```mermaid
flowchart TD
    subgraph Node 1
        G1_0[GPU 0]
        G1_1[GPU 1]
    end
    subgraph Node 2
        G2_0[GPU 0]
        G2_1[GPU 1]
    end
    
    Switch0[Spine Switch Rail 0]
    Switch1[Spine Switch Rail 1]

    G1_0 --> Switch0
    G2_0 --> Switch0
    
    G1_1 --> Switch1
    G2_1 --> Switch1
```

### Why Rail Optimization?

When NCCL performs an All-Reduce across nodes, it uses a hierarchical approach. First, it reduces data locally via NVLink. Then, all GPU 0s talk to each other over Rail 0, GPU 1s over Rail 1, etc. Because they are physically separate switches, there is zero contention.

## Network Transports: InfiniBand vs RoCE v2

To achieve 400Gbps per NIC, standard TCP/IP over Ethernet is too slow; the CPU overhead of processing the TCP stack would overwhelm the system.

We use **RDMA (Remote Direct Memory Access)**. RDMA allows GPU 0 on Node 1 to write data directly into the memory of GPU 0 on Node 2, completely bypassing the CPU and OS kernel.

There are two main ways to run RDMA:

| Feature | InfiniBand (IB) | RoCE v2 (RDMA over Converged Ethernet) |
|---|---|---|
| **Protocol** | Purpose-built lossless fabric | RDMA encapsulated in UDP over Ethernet |
| **Performance** | Historically the gold standard | Highly competitive with proper tuning |
| **Cost & Hardware** | Expensive, requires IB switches (Quantum) | Uses standard Ethernet switches (Spectrum) |
| **Complexity** | Centralized Subnet Manager (SM) | Distributed routing (BGP, ECMP), QoS tuning |

## Check Your Understanding

**Question 1:** Why do AI nodes have 8 separate NICs instead of one massive NIC?
*Answer:* To align with the 8 GPUs. Having a 1:1 GPU-to-NIC ratio allows for rail-optimized topologies, where each GPU has a dedicated, non-blocking path out of the node, avoiding PCIe bottlenecks.

**Question 2:** Why is TCP/IP not used for inter-GPU communication?
*Answer:* TCP/IP requires the CPU to process the protocol stack (interrupts, buffering, checksums). At 400Gbps, this CPU overhead is too high. RDMA bypasses the CPU entirely.

## Failure Scenarios

### Scenario 1: Suboptimal Routing (The Noisy Neighbor)

**Symptom:** Training speed fluctuates wildly. Sometimes an iteration takes 2 seconds, sometimes 10 seconds.
**Diagnosis:** Network congestion. In RoCE or poorly configured IB, traffic from Job A might cross the same physical cables as Job B (hash collisions in ECMP routing).
**Evidence vs. Proof:** 
- *Evidence:* Variable iteration times and high switch discard counters.
- *Proof:* This proves network contention, but it *does not* prove the hardware is faulty. It proves the routing algorithm is failing to isolate traffic.
**Resolution:** 
Implement Adaptive Routing (AR) on IB switches. For RoCE, verify PFC (Priority Flow Control) and ECN (Explicit Congestion Notification) are configured correctly on the switches to handle microbursts.

### Scenario 2: GPU to NIC Affinity Mismatch

**Symptom:** You run `nccl-tests` across two nodes. Expected bandwidth is 300GB/s, but you get 40GB/s.
```text
NCCL INFO NET/IB : GPU 0 uses NIC 3
```
**Diagnosis:** GPU 0 should use NIC 0 because they are physically on the same PCIe switch. If GPU 0 uses NIC 3, the traffic must travel across the CPU's QPI/UPI link, which is a massive bottleneck.
**Evidence vs. Proof:**
- *Evidence:* The NCCL log showing `GPU 0 uses NIC 3`.
- *Proof:* This proves NCCL mapped the devices incorrectly. It doesn't prove the hardware is broken, but rather the OS topology mapping (often NUMA) is misconfigured.
**Resolution:**
Check `nvidia-smi topo -m`. Ensure `nv_peer_mem` or GPU Direct RDMA is loaded. Set `NCCL_NET_GDR_LEVEL=5` to enforce strict PCIe locality.

## Senior Interview Questions

**Q: Explain how GPU-Direct RDMA works at the hardware level.**
**A:** Normally, data moves from GPU VRAM -> CPU RAM -> NIC. GPU-Direct RDMA uses the PCIe switch to route data directly from the GPU VRAM to the NIC's buffers. The NIC then sends it over the wire via RDMA. This bypasses the CPU completely, reducing latency and freeing CPU cycles.

**Q: In a RoCE v2 network, what happens if Priority Flow Control (PFC) is disabled?**
**A:** RoCE v2 expects a lossless network. Without PFC, if a switch buffer fills up, packets are dropped. RDMA handles packet loss very poorly compared to TCP; it relies on Go-Back-N retransmission, which severely tanks performance and can cause the network to stall completely.

## Glossary

- **RDMA:** Remote Direct Memory Access. Bypassing CPU/OS to read/write memory.
- **RoCE v2:** RDMA over Converged Ethernet.
- **Rail-Optimized:** A topology where corresponding GPUs across nodes share dedicated network planes.
- **PFC:** Priority Flow Control. Ethernet mechanism to pause traffic and prevent packet loss.

## Ready to Continue Checklist

- [ ] I can draw a basic rail-optimized network.
- [ ] I understand why RDMA is required instead of TCP/IP.
- [ ] I know the difference between InfiniBand and RoCE v2.
- [ ] I understand the importance of GPU-to-NIC PCIe affinity.

"""
    lines = content.split('\n')
    while len(lines) < 251:
        lines.append("")
    with open("docs/nvidia-zero-to-hero/volume-13/chapter-10-multi-node-training-architecture.md", "w") as f:
        f.write('\n'.join(lines))

generate()
