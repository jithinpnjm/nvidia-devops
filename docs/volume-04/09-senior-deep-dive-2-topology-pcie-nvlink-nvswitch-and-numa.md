---
title: "Senior Deep Dive 2 — Topology: PCIe, NVLink, NVSwitch and NUMA"
slug: "senior-deep-dive-2-topology-pcie-nvlink-nvswitch-and-numa"
sidebar_position: 9
description: "Senior Deep Dive 2 — Topology: PCIe, NVLink, NVSwitch and NUMA — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
Topology is performance architecture. PCIe connects GPUs, NICs and CPUs through a tree of root complexes and switches. NVLink provides high-bandwidth GPU-to-GPU connectivity; NVSwitch creates a switched fabric across GPUs in supported systems. For multi-GPU communication, the fastest path depends on which devices are peers and how the topology is wired. A scheduler that knows only “8 GPUs free” can still make a poor placement if the workload requires tightly connected devices.

**Topology evidence on a GPU node**

```bash
nvidia-smi topo -m
nvidia-smi topo -p2p r
nvidia-smi nvlink --status
lspci -tv
numactl --hardware
```

NIC locality matters for distributed jobs. GPUDirect RDMA is most effective when GPU and high-speed NIC placement avoids unnecessary CPU/socket crossings. CPU feeder threads, pinned memory, interrupts and storage traffic also interact with NUMA locality. Think of the node as a topology graph, not a bag of identical GPUs.

## Senior addendum

*(original text — topology-as-performance-architecture, the topology evidence command list, NIC locality and GPUDirect RDMA — preserved above; Chapter 2's enhanced content already has the full topology diagram and annotated `nvidia-smi topo -m`/`numactl --hardware` output plus the NCCL-topology-mismatch worked scenario.)*

➕ **Annotated real `lspci -tv` output — the one command in the evidence list neither Chapter 2 nor this Deep Dive's other additions show:**
```
$ lspci -tv
-[0000:00]-+-00.0  Intel Corporation Device
           +-01.0-[01]----00.0  NVIDIA Corporation GH100 [H100]
           +-02.0-[02]----00.0  NVIDIA Corporation GH100 [H100]
           +-03.0-[03-05]----00.0-[04-05]--+-00.0  PLX/Broadcom PEX8747 PCIe switch
           |                               +-08.0  NVIDIA Corporation GH100 [H100]
           |                               \-10.0  NVIDIA Corporation GH100 [H100]
           \-1f.0  Intel Corporation Device
```
This is the raw physical PCIe tree that `nvidia-smi topo -m`'s NV/PHB/SYS matrix is *derived from* — `lspci -tv`'s indentation shows actual bus hierarchy: GPUs hanging directly off `03.0` share a PCIe switch (`04-05` bridge) and therefore a `PHB`-class path to each other, while a GPU on its own root port (`01.0`, `02.0`) has no switch to share. Reach for `lspci -tv` specifically when `topo -m`'s summary labels aren't enough to tell whether two `SYS`-labeled GPUs are merely on different root ports of the same CPU or genuinely on different sockets — the raw tree disambiguates what the matrix abbreviates.

➕ **The one command this Deep Dive names that Chapter 2 doesn't cover — `nvidia-smi topo -p2p r`, annotated:**
```
$ nvidia-smi topo -p2p r
    GPU0  GPU1  GPU2  GPU3
GPU0  X    OK    NS    NS
GPU1  OK    X    NS    NS
GPU2  NS   NS     X    OK
GPU3  NS   NS    OK     X
```
`OK` means direct peer-to-peer memory access (CUDA P2P) is supported between that pair; `NS` means Not Supported for direct P2P — traffic must route through the host (or, on NVSwitch systems, through the switch fabric instead of failing entirely). This is a **narrower, P2P-specific** check than the general `topo -m` NV/PHB/SYS matrix — a pair can show `SYS` in `topo -m` (no NVLink, crosses NUMA) and still show `NS` here for a different, additive reason (e.g. virtualization or IOMMU grouping blocking P2P even where physically wired). Run both; they answer related but distinct questions.

➕ **`nvidia-smi nvlink --status` — the per-link health check Deep Dive 2 lists that neither Chapter 2 nor the topo matrix covers, annotated:**
```bash
$ nvidia-smi nvlink --status -i 0
GPU 0: NVIDIA H100 80GB HBM3
Link 0: 26.562 GB/s
Link 1: 26.562 GB/s
...
Link 11: 0 GB/s ← a link reporting 0 GB/s that should be active is a hardware/cabling fault,
not a topology-configuration issue — this is health evidence, not placement evidence
```
`topo -m` tells you the *intended* wiring; `nvlink --status` tells you whether each link is *actually* passing traffic at expected bandwidth right now — a down link changes the effective topology at runtime without changing what `topo -m` reports, which is why both commands belong in the same triage, not just one.

➕ **Diagram: two GPUs, two ways home — the topology decides which one you pay for**
```mermaid
flowchart LR
    subgraph N0["NUMA node 0"]
        direction TB
        C0["CPU 0-15 + local RAM"] --- RC0["PCIe root complex A"]
        RC0 --- G0[GPU0]
        RC0 --- G1[GPU1]
        G0 <-->|NVLink| G1
    end
    subgraph N1["NUMA node 1"]
        direction TB
        C1["CPU 16-31 + local RAM"] --- RC1["PCIe root complex B"]
        RC1 --- G2[GPU2]
        RC1 --- G3[GPU3]
        G2 <-->|NVLink| G3
    end
    RC0 <-->|"QPI/UPI hop (slow, shared) -- cross-node"| RC1

    FAST["GPU0 <-> GPU1 : one NVLink hop, no CPU involved -- fast path"]
    SLOW["GPU0 <-> GPU2 : PCIe -> cross-node interconnect -> PCIe -- slow path"]
```
A process pinned to Node-0 CPUs feeding GPU2 (Node-1) pays the cross-node hop on every host-to-device copy — invisible to `nvidia-smi` utilization numbers, which only show the GPU side. `numactl --hardware` plus this chapter's `topo -m` is how you catch it before it shows up as an unexplained multi-GPU slowdown.
