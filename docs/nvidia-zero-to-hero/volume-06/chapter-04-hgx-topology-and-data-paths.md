---
title: "Chapter 4 — HGX Topology and Data Paths"
sidebar_position: 4
description: "Master the wild west of OEM PCIe layouts. Learn how to map balanced vs. unbalanced trees and diagnose GPUDirect RDMA failures in custom servers."
---

# Chapter 4 — HGX Topology and Data Paths

| Chapter metadata | Value |
|---|---|
| Volume | 06 — HGX Platforms & OEM Integration |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | If two different OEMs use the exact same NVIDIA HGX board, why does one server train models 40% faster than the other? |

## Introduction

In Volume 5, we looked at the network topology of the NVIDIA DGX H100. It was perfectly balanced: 2 CPUs, 8 GPUs, and 8 NICs, all flawlessly symmetrical. 

When you leave the safety of the DGX appliance and enter the world of OEM HGX servers, you enter the Wild West. 

Because the OEM designs the top half of the server (the motherboard and the PCIe lanes), they have complete freedom to wire the components however they want. Some OEMs prioritize maximum AI performance. Other OEMs prioritize cost-savings, reusing older server chassis designs and simply cramming the HGX baseboard inside.

As a Senior Infrastructure Engineer, you must know how to read a server's PCIe topology map. If you blindly deploy Kubernetes across a fleet of poorly wired OEM servers, your distributed training jobs will be silently strangled by the host CPUs.

## 1. The Ideal Topology: Symmetrical and Balanced

The perfect HGX server mirrors the DGX design. It is built around **PCIe Switches**.

Instead of wiring the HGX baseboard directly into the CPU's limited PCIe lanes, the OEM places massive PCIe Switch chips on the motherboard. 
*   **CPU 0** connects to PCIe Switch A. 
*   **GPU 0, 1, 2, 3** connect to PCIe Switch A. 
*   **NIC 0, 1, 2, 3** connect to PCIe Switch A.

This is a **Balanced Tree**. If GPU 0 needs to send gradients over the network, it pushes the data into PCIe Switch A, which instantly routes it into NIC 0. The data never touches the Intel/AMD CPU. This achieves perfect **GPUDirect RDMA**.

## 2. The Nightmare Topology: Unbalanced and CPU-Bound

To save money, an OEM might omit the expensive PCIe switches and wire the components directly to the CPUs. Furthermore, they might try to save money by providing only 2 Network Cards (NICs) instead of 8.

*   **CPU 0** connects to GPU 0, 1, 2, 3. 
*   **CPU 1** connects to GPU 4, 5, 6, 7. 
*   **NIC 0** connects to CPU 0. 
*   **NIC 1** connects to CPU 1.

This is an **Unbalanced Tree**. 
If GPU 4 needs to send data over the network, but the training script happens to bind its network traffic to NIC 0, the data path is catastrophic:
1.  GPU 4 pushes data to CPU 1.
2.  CPU 1 pushes the data across the slow UPI motherboard link to CPU 0.
3.  CPU 0 pushes the data down to NIC 0.

The host CPU becomes a massive traffic jam. Distributed training performance collapses.

## Architectural Diagram: Balanced vs. Unbalanced OEM Layouts

```mermaid
flowchart TD
    subgraph "Balanced OEM Layout (High Performance)"
        CPU_B[CPU 0] --- SW_B[PCIe Switch]
        SW_B --- GPU_B[GPU 0]
        SW_B --- NIC_B[NIC 0]
        GPU_B -.->|GPUDirect (Bypass CPU)| NIC_B
    end
    
    subgraph "Unbalanced OEM Layout (Bottlenecked)"
        CPU_U1[CPU 0] <-->|UPI Link| CPU_U2[CPU 1]
        CPU_U1 --- GPU_U[GPU 4]
        CPU_U2 --- NIC_U[NIC 0]
        GPU_U -.->|Traffic forced across UPI| NIC_U
    end
```

## 3. Detecting the Topology (`nvidia-smi topo -m`)

You do not need to open the server chassis to find out if the OEM cut corners. You run `nvidia-smi topo -m`. 

### Identifying a Balanced Server (GPUDirect Enabled)
If you see **PIX** or **PXB** between a GPU and a NIC, you are safe.
```text
        GPU0    NIC0    
GPU0     X      PIX     
NIC0    PIX      X      
```
*Meaning:* GPU 0 and NIC 0 are connected to the exact same PCIe switch. Data bypasses the CPU. 

### Identifying an Unbalanced Server (CPU Bottlenecked)
If you see **SYS** or **NODE** between a GPU and the network card, the OEM has failed to provide a GPUDirect-capable path.
```text
        GPU4    NIC0    
GPU4     X      SYS     
NIC0    SYS      X      
```
*Meaning:* GPU 4 must route traffic through the CPU's system memory and across the socket interconnect (SYS) to reach the network. 

## Customer Scenario (Senior Level)

**The Situation:**
A retail company buys 10 Supermicro HGX H100 servers. To save money, they only installed two 100GbE network cards per server (NIC 0 and NIC 1) instead of the recommended eight. They run a distributed training job across the 10 servers. The job crashes continuously with NCCL timeout errors. The data scientists blame the network team.

**The Senior Architect Response:**
"The network team is not at fault. We have a severe PCIe topology mismatch caused by under-provisioning the Network Interface Cards.

I ran `nvidia-smi topo -m` on the Supermicro nodes. Because we only installed two NICs, they are wired to CPU 0. However, the HGX baseboard has 8 GPUs distributed across both CPUs. 

When GPUs 4 through 7 (which sit behind CPU 1) attempt to synchronize their gradients over the network via NCCL, they must send their massive data payloads across the motherboard's UPI link to reach the NICs on CPU 0. 
The UPI link is physically incapable of handling the hundreds of gigabytes per second generated by 4 H100 GPUs. The interconnect violently bottlenecks, the data backs up, and the NCCL synchronization timers expire, causing the job to crash.

To fix this immediately without buying new hardware, we must reconfigure the PyTorch NCCL environment variables (`NCCL_P2P_DISABLE=1` or strictly defining network interfaces) to artificially throttle the GPUs so they do not overwhelm the host CPU. Ultimately, to unlock the cluster's performance, we must purchase and install 6 additional NICs into the correct PCIe slots to establish a 1:1 GPU-to-NIC ratio, enabling GPUDirect RDMA."

## Interview Preparation

**Conceptual:** If a GPU and a Network Card are on different NUMA nodes, what is the data path for network communication? *(Hint: GPU -> PCIe Bus -> CPU A -> QPI/UPI Interconnect -> CPU B -> PCIe Bus -> NIC. This completely breaks GPUDirect RDMA and destroys multi-node scaling).*

**Architecture:** Why is a PCIe Switch (PIX) critical for AI server motherboard design? *(Hint: It allows multiple PCIe devices—like GPUs, NVMe drives, and Network Cards—to communicate directly with each other at the hardware level, bypassing the host CPU entirely).*
