---
title: "Chapter 2 - PCIe, NVLink and topology"
slug: "chapter-2-pcie-nvlink-and-topology"
sidebar_position: 2
description: "Chapter 2 - PCIe, NVLink and topology — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---

GPUs may communicate through PCIe, NVLink, or NVSwitch depending on the system. **Topology** describes which devices are connected through which paths and with what performance characteristics. CPU socket and NUMA placement can also matter because GPU, NIC, and memory traffic may cross slower inter-socket links.

### Multiple nodes

Once work crosses machines, the network becomes part of application performance:

```mermaid
flowchart LR
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["GPU memory"]
  n1["GPU/NIC path"]
  n2["NIC/HCA"]
  n3["switch fabric"]
  n4["remote NIC"]
  n5["remote GPU memory"]
  n0 --> n1
  n1 --> n2
  n2 --> n3
  n3 --> n4
  n4 --> n5
```

- **Distributed training** divides work across processes, GPUs, or model components.
- A **rank** is one process identity in a distributed job.
- A **collective** is a coordinated communication operation across a group, such as all-reduce.
- **NCCL** is NVIDIA's library for high-performance GPU collectives.
- **MPI** is a standard and library ecosystem for communication among processes; it may launch/coordinate work while NCCL moves GPU tensors.
- A **straggler** is a slower participant that delays synchronized peers.

**Learning outcome:** Understand why "same number of GPUs" can produce different performance depending on physical connectivity and NUMA placement.

GPUs connect to CPUs and sometimes to peer GPUs through PCIe and higher-bandwidth links such as NVLink/NVSwitch on supported systems. NICs also attach through PCIe topology. Distributed and multi-GPU performance can depend on whether GPU-GPU or GPU-NIC traffic traverses favorable paths or crosses CPU/NUMA boundaries.

```
nvidia-smi topo -m
lspci -tv
numactl --hardware
```

## Worked scenario
**Situation:** Two 8-GPU servers have identical GPU models, but one is consistently slower for multi-GPU training.

1. Compare nvidia-smi topo -m and NIC/GPU placement rather than assuming equivalent topology.
2. Check CPU NUMA binding and whether workers/communication threads align with local GPUs/NICs.
3. Check link width/speed/errors and firmware/driver consistency.
4. Benchmark peer-to-peer and collective performance before blaming the framework.

**Conclusion:** GPU count is a capacity number; topology is a performance property.

---

**ASCII topology diagram — the two server layouts the worked scenario is actually comparing:**
```mermaid
flowchart TB
    subgraph A["Server A -- NVSwitch-connected (e.g. HGX baseboard, all-to-all NVLink)"]
        direction LR
        A0[GPU0] --- ASW[NVSwitch<br/>full bandwidth, any GPU to any GPU]
        A1[GPU1] --- ASW
        A2[GPU2] --- ASW
        A3[GPU3] --- ASW
        A4[GPU4] --- ASW
        A5[GPU5] --- ASW
        A6[GPU6] --- ASW
        A7[GPU7] --- ASW
    end
    ANote["All-reduce cost: flat,<br/>independent of which GPU pair talks"]
    A --> ANote

    subgraph B["Server B -- PCIe-only, split across two NUMA/root-complex domains"]
        direction LR
        subgraph N0["NUMA node 0"]
            direction LR
            CPU0[CPU0] --- SW0[PCIe switch] --- BG0[GPU0]
            SW0 --- BG1[GPU1]
            SW0 --- NIC0[NIC0]
        end
        subgraph N1["NUMA node 1"]
            direction LR
            CPU1[CPU1] --- SW1[PCIe switch] --- BG2[GPU2]
            SW1 --- BG3[GPU3]
            SW1 --- NIC1[NIC1]
        end
        N0 <-->|QPI/UPI cross-socket hop| N1
    end
    BNote["All-reduce cost: cheap within a NUMA domain, expensive crossing it --<br/>GPU0-GPU1 fast; GPU0-GPU2 pays a CPU-socket-crossing tax every step"]
    B --> BNote
```
Same GPU count and model, structurally different worst-case collective latency — this diagram *is* the answer to "why would two identical-spec servers train differently."

**Annotated real `nvidia-smi topo -m` output (the matrix everyone name-drops but few can actually read cold):**
```
$ nvidia-smi topo -m
       GPU0  GPU1  GPU2  GPU3  NIC0  CPU Affinity  NUMA Affinity
GPU0    X    NV12  SYS   SYS   PHB      0-31            0
GPU1  NV12    X    SYS   SYS   SYS      0-31            0
GPU2   SYS   SYS    X    NV12  SYS     32-63            1
GPU3   SYS   SYS  NV12    X    PHB     32-63            1
NIC0   PHB   SYS   SYS   PHB    X        --             --

Legend:
  NV#  = NVLink with # links (higher = more bandwidth; NV12 = fast GPU-GPU peer)
  PHB  = connection traverses a PCIe Host Bridge (single CPU root complex — good)
  SYS  = connection traverses SMP/cross-socket interconnect (worst case — crosses CPUs)
```
Reading it: **GPU0↔GPU1 = NV12** (fast NVLink peers, same NUMA node) but **GPU0↔GPU2 = SYS** (crosses NUMA/socket boundary, no NVLink between those two — falls back to the slowest path). A job that places rank 0 and rank 2 as a tightly-communicating pair (e.g. a naive round-robin rank-to-GPU mapping) pays for the `SYS` path every all-reduce step, while a topology-aware mapping would pair 0↔1 and 2↔3. **NIC0 is `PHB` to GPU0/GPU3 but `SYS` to GPU1/GPU2** — this is exactly the NIC-locality problem Deep Dive 2 names for GPUDirect RDMA: a NCCL/collective job whose ranks talk to the NIC via `SYS` pays a real, measurable tax versus ranks reachable via `PHB`.

**`numactl --hardware` — the other half of the same evidence, annotated:**
```mermaid
flowchart TD
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["$ numactl --hardware"]
  n1["available: 2 nodes (0-1)"]
  n2["node 0 cpus: 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 ... 31"]
  n3["node 0 size: 515928 MB"]
  n4["node 1 cpus: 32 33 34 35 ... 63"]
  n5["node 1 size: 515928 MB"]
  n6["node distances"]
  n7["node 0 1"]
  n8["0: 10 21 ← '21' (roughly 2x local) is the cross-node access-latency penalty"]
  n9["1: 21 10"]
```
`node distances` is the number that turns "NUMA-aware placement" from folklore into arithmetic: a memory access to the remote node costs ~2.1x a local one on this system. Combine with the topo matrix above — a data-loader thread pinned to node-0 CPUs feeding GPU2 (node-1) pays this distance penalty on every host-side batch prep, on top of the `SYS` PCIe path.

**Diagram: GPUDirect RDMA path vs the host-bounce fallback**
```mermaid
flowchart LR
    subgraph WithoutRDMA["Without GPUDirect RDMA (or NIC not locally attached -- the SYS case above)"]
        direction LR
        H1[GPU HBM] -->|"PCIe, copy #1<br/>device to host"| H2[Host DRAM<br/>staging buffer]
        H2 -->|"PCIe, copy #2<br/>host to NIC"| H3[NIC]
        H3 --> H4[fabric]
    end
    NoteA["Two copies + CPU involvement on every transfer"]
    WithoutRDMA --> NoteA

    subgraph WithRDMA["With GPUDirect RDMA, GPU and NIC on the same PCIe root complex (PHB)"]
        direction LR
        R1[GPU HBM] -->|"single DMA, CPU only sets up<br/>the transfer, does not copy data"| R2[PCIe switch]
        R2 --> R3[NIC]
        R3 --> R4[fabric]
    end

    subgraph CrossSocket["Even with GPUDirect RDMA, NIC reachable only via SYS"]
        direction LR
        S1[GPU HBM] --> S2[PCIe switch]
        S2 -.->|crosses to other socket, SYS -- blocked/slow path| S3[NIC on the OTHER root complex]
    end
    NoteB["GPUDirect removes the CPU copy, not the topology --<br/>a cross-socket hop is still paid"]
    CrossSocket --> NoteB
```
This is the mechanism behind the `NIC0 PHB vs SYS` distinction called out in the `topo -m` reading above: GPUDirect RDMA eliminates the double-copy through host memory, but only when the GPU and NIC already share a favorable PCIe path — placement still has to be right first.

**Extra worked scenario — NCCL failure caused by exactly this topology mismatch, the concrete AI-infra consequence:**
> **Situation:** A distributed training job on Server B (the PCIe-only, dual-NUMA server above) shows all-reduce step time 3x slower than the identical job on Server A, and occasionally NCCL logs `NCCL WARN Timeout` or falls back with a "using non-optimal path" style debug message under `NCCL_DEBUG=INFO`.
> 1. `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=GRAPH` on job launch prints NCCL's own topology detection and the ring/tree it chose — compare against the `nvidia-smi topo -m` matrix above; if NCCL's chosen ring puts GPU0 next to GPU2 in the ring order, every hop pays the `SYS` cost.
> 2. Check `NCCL_IB_HCA` / `NCCL_SOCKET_IFNAME` env vars are pointing at the NIC actually local (`PHB`) to the ranks using it — a wrong or unset value can force NCCL onto a slower discovered path, or onto TCP sockets instead of RDMA entirely.
> 3. Check process-to-GPU-to-NIC affinity: if the launcher (e.g. `mpirun`, `torchrun`) doesn't pin each rank's CPU affinity to match its GPU's NUMA node, host-side collective staging (pinned memory copies) also crosses the NUMA boundary — doubling the penalty (compute topology *and* memory topology both wrong).
> 4. Fix: use `nvidia-smi topo -m` to build an explicit rank→GPU→NIC→CPU affinity map before launch, or rely on `NCCL_TOPO_FILE`/automatic topology detection plus correct `taskset`/`numactl --cpunodebind` per rank.
> **Interview-ready line:** "NCCL timeouts and slow all-reduce on identical hardware are almost always a topology-detection or affinity-pinning problem, not a NCCL bug — `nvidia-smi topo -m` plus `NCCL_DEBUG=INFO` is the first and second command, before touching NCCL configuration."

**Shortcut — mnemonic for the topo -m legend, and a one-liner to flag any GPU pair that falls back to the worst path:**
*"NV beats PHB beats SYS — NVLink beats one-bridge beats system-crossing."*
```bash
nvidia-smi topo -m | grep -E 'GPU[0-9]' | awk '{for(i=2;i<=NF;i++) if($i=="SYS") print "row "$1" col "i": SYS path — cross-NUMA, worst case"}'
```

**Practice (continuation — original chapter had a worked scenario but no numbered Practice list; these are new):**
1. Given a `topo -m` matrix, identify the best 4-GPU subset for a tightly-coupled collective job on an 8-GPU PCIe-only (no NVSwitch) server, and justify the choice using only NV/PHB/SYS values.
2. Explain why `node distances` of "10/21" matters more for a CPU-bound data-loader than for the GPU compute itself, and name the Kubernetes-level lever (Topology Manager policy) that prevents the scheduler from placing a Pod's CPUs and GPUs on mismatched NUMA nodes.
