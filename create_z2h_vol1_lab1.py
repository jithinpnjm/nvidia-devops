content = """---
title: "Lab 03 — Hardware Topology & PCIe Inspection"
slug: "/nvidia-zero-to-hero/volume-01/lab-hardware-topology-pcie-inspection"
sidebar_position: 3
description: "Inspect Linux hardware topology, interpret NUMA and PCIe boundaries, and detect GPU communication bottlenecks without running a single model."
---

# Lab 03 — Hardware Topology & PCIe Inspection

**Learning outcome:** Inspect a bare-metal Linux host and identify the physical boundaries that dictate AI workload performance. You will learn to map NUMA (Non-Uniform Memory Access) nodes, trace PCIe lanes to specific GPUs, and detect hardware topologies that silently strangle data throughput.

**Prerequisites:** Completion of Chapter 1 and 2. Linux shell access.

**Difficulty:** Beginner to Intermediate.

**Estimated execution time:** 30 Minutes.

---

## 1. Introduction

Before an AI engineer ever runs a Docker container, deploys Kubernetes, or executes a PyTorch script, they must understand the physical board they are standing on. 

In AI infrastructure, **geography is destiny**. If GPU 0 and GPU 1 are on the same PCIe switch, they can talk to each other relatively fast. If GPU 0 is wired to CPU Socket 1, and GPU 1 is wired to CPU Socket 2, their communication must traverse the QPI/UPI link connecting the two CPUs. This is known as a **NUMA boundary crossing**, and it destroys training performance.

This lab teaches you how to map the physical terrain of an AI node using standard Linux utilities.

*(Note: While this lab assumes you are on a GPU-enabled host, the NUMA and PCIe inspection concepts apply to any high-performance Linux server).*

---

## 2. Inspecting the CPU and NUMA Topology

First, we must understand the CPU layout. Most enterprise AI servers (like a DGX) have two physical CPU sockets.

### 2.1 The Command
Run the `lscpu` command to view the processor architecture.

```bash
lscpu | grep -iE "socket|numa|core"
```

### 2.2 Expected Evidence
```text
Core(s) per socket:  64
Socket(s):           2
NUMA node(s):        2
NUMA node0 CPU(s):   0-63,128-191
NUMA node1 CPU(s):   64-127,192-255
```

### 2.3 Interpretation
* **Socket(s): 2** — There are two physical CPU chips on the motherboard.
* **NUMA node(s): 2** — The system memory (RAM) is split. Half the RAM is physically attached to CPU 0, and half is physically attached to CPU 1.
* **NUMA node0 CPU(s):** If a process runs on CPU cores 0-63, it has extremely fast access to NUMA Node 0's RAM. If that process needs data stored in NUMA Node 1's RAM, it must cross the motherboard link, incurring a severe latency penalty. 
* **Senior Architect Rule:** When provisioning a GPU workload, the process, the GPU, and the Network Interface Card (NIC) must all be pinned to the same NUMA node.

---

## 3. Tracing the PCIe Tree

Next, we map the PCIe bus. GPUs are not magical floating devices; they are PCIe devices plugged into specific lanes.

### 3.1 The Command
Run `lspci` and filter for NVIDIA devices. We use the `-t` flag to view the output as a physical tree, and `-v` for verbosity.

```bash
lspci -tv | grep -i nvidia
```

### 3.2 Expected Evidence
```text
 +-[0000:80]-+-00.0-[81]--+-00.0  NVIDIA Corporation Device 2330
 |           |            \-00.1  NVIDIA Corporation Device 22ba
 +-[0000:c0]-+-00.0-[c1]--+-00.0  NVIDIA Corporation Device 2330
 |           |            \-00.1  NVIDIA Corporation Device 22ba
```

### 3.3 Interpretation
* The numbers in brackets (e.g., `[0000:80]`) represent the **PCIe Root Complex**. Root complexes map directly to specific CPU sockets.
* In this output, we see NVIDIA devices branching off different root complexes (`80` and `c0`). This immediately tells us that the GPUs are physically distributed across different NUMA nodes. 
* If a training job places Worker 1 on the GPU at `81:00.0` and Worker 2 on the GPU at `c1:00.0`, their data transfers must travel up the PCIe bus to CPU 0, across the UPI link to CPU 1, and down the PCIe bus to the second GPU. 

---

## 4. The Ultimate Map: `nvidia-smi topo -m`

NVIDIA provides a tool specifically designed to map out these bottlenecks instantly.

### 4.1 The Command
```bash
nvidia-smi topo -m
```

### 4.2 Expected Evidence
```text
        GPU0    GPU1    NIC0    CPU Affinity    NUMA Affinity
GPU0     X      NV12    SYS     0-63            0
GPU1    NV12     X      SYS     0-63            0
NIC0    SYS     SYS      X      
```

### 4.3 Interpretation
This matrix is the most important debugging screen in AI Infrastructure. It shows exactly how every component communicates with every other component.
* **GPU0 to GPU1 (NV12):** This means GPU 0 and GPU 1 communicate via 12 lanes of **NVLink**. This is the best possible scenario. They can share memory at hundreds of gigabytes per second, entirely bypassing the CPU.
* **GPU0 to NIC0 (SYS):** This means to talk to the network card, GPU 0 must route its traffic through the System (the CPU). This is a severe bottleneck for distributed training. A properly architected AI Factory should display `PIX` or `PXB` (PCIe switch) indicating GPUDirect RDMA is possible.
* **NUMA Affinity (0):** Both GPUs are correctly attached to NUMA Node 0.

---

## 5. Interview Scenario: The NUMA Bottleneck

**The Question:**
> "A data scientist complains that data loading during their PyTorch training job is wildly inconsistent. Sometimes an epoch takes 2 minutes; sometimes it takes 15 minutes. They suspect the SSD is dying. What do you check first?"

**The Senior Answer:**
"Before blaming the hardware, I check the NUMA alignment. Inconsistencies like that often occur when the OS scheduler randomly places the PyTorch data-loader process on a CPU core in NUMA Node 1, while the GPU it's feeding is physically attached to NUMA Node 0. 

When this happens, every single image or tensor loaded from disk must cross the CPU UPI interconnect to reach the GPU, suffocating the bandwidth. I would use `nvidia-smi topo -m` to find the GPU's NUMA affinity, and then use `numactl` or Kubernetes Topology Manager to pin the container's CPU execution specifically to the cores on that exact NUMA node."
"""

with open("docs/nvidia-zero-to-hero/volume-01/03-lab-hardware-topology.md", "w") as f:
    f.write(content)
