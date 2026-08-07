---
title: Why GPU Networking Exists
description: Understand why modern AI systems are limited as much by data movement and synchronization as by arithmetic throughput.
sidebar_position: 2
tags:
  - gpu-networking
  - data-movement
  - topology
  - nvlink
  - rdma
---

# Why GPU Networking Exists

## Introduction

An accelerator does not operate in isolation. It consumes data from storage, receives instructions from a CPU, exchanges tensors with peer GPUs, communicates with remote nodes, and periodically writes checkpoints back to persistent storage.

As long as a workload fits on one GPU and performs enough computation for every byte it moves, communication remains secondary. That assumption breaks when models, batches, optimizer states, and datasets grow beyond a single device. The system then spends a meaningful part of its time moving data and waiting for other participants.

This is the problem GPU networking exists to solve.

GPU networking is not one product or one cable. It is the complete set of data paths that connect GPU memory to peer GPUs, host memory, network adapters, storage devices, and remote accelerators. It includes PCI Express, Non-Uniform Memory Access locality, NVLink, NVSwitch, Direct Memory Access, Remote Direct Memory Access, GPUDirect technologies, adapter placement, and collective communication behavior.

A platform engineer who sees only GPU count sees capacity. An architect must also see paths, contention domains, synchronization boundaries, and failure domains.

| Chapter field | Value |
|---|---|
| Volume | 07 — GPU Networking |
| Difficulty | Advanced |
| Estimated reading time | 45–60 minutes |
| Primary focus | Why data movement becomes an architectural constraint |
| Previous | Volume 06 — HGX Platform |
| Next | PCIe, NUMA, and Host Data Paths |

## Story: Eight GPUs, Two Very Different Results

A customer purchases an eight-GPU server for distributed model training. The first test uses one GPU and completes in eight hours. The customer expects eight GPUs to finish in approximately one hour.

The job completes in three hours and forty minutes.

Every GPU passes diagnostics. Temperatures are normal. No link is down. The software framework sees all eight devices. The customer concludes that the GPUs are underperforming.

A closer investigation shows a different story.

The model is split across GPUs. Every training step includes several communication phases. Gradients are reduced across devices. Activations cross GPU boundaries. Checkpoints compete with training traffic. CPU workers are bound to remote NUMA nodes. Two network adapters are physically close to one GPU group, while the processes using them run on another socket.

The GPUs are fast. The system around them is forcing them to wait.

This scenario captures the central lesson of GPU infrastructure:

> Compute capacity is useful only when data arrives at the right device, at the right time, through the right path.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain why multi-GPU systems require specialized communication paths.
- Distinguish scale-up communication from scale-out communication.
- Identify the major data paths inside an accelerator server and across a cluster.
- Explain why bandwidth, latency, synchronization, topology, and contention must be evaluated together.
- Recognize symptoms caused by data movement rather than insufficient compute.
- Describe why healthy components can still form an inefficient end-to-end path.
- Structure a customer discovery conversation for multi-GPU training and inference.

## Big Picture

```mermaid
flowchart LR
    Storage[Dataset and Checkpoint Storage]
    CPU[CPU and System Memory]
    PCIe[PCIe Fabric]
    GPU0[GPU 0 and HBM]
    GPU1[GPU 1 and HBM]
    NV[NVLink or NVSwitch]
    NIC[Network Adapter]
    Fabric[Cluster Fabric]
    Remote[Remote GPU Node]

    Storage -->|"fio/gds throughput near device spec = not the bottleneck"| CPU
    CPU <-->|"lspci -nn shows device enumerated;\nnuma distance = 10 (local) if process is pinned correctly"| PCIe
    PCIe <-->|"nvidia-smi topo -m shows PIX/PXB = shares local switch"| GPU0
    PCIe <-->|"nvidia-smi topo -m shows SYS/NODE = crosses socket, expect a latency penalty"| GPU1
    GPU0 <-->|"nvidia-smi nvlink -s: active, expected link count up"| NV <-->|"same"| GPU1
    PCIe <-->|"ibdev2netdev / nvidia-smi topo -m NIC row: GPU-local NIC = PIX/PXB"| NIC
    NIC <-->|"ib_write_bw sustaining near line rate"| Fabric <-->|"ib_write_bw between nodes at/near local single-flow bandwidth"| Remote

    GPU1 -.->|"DECISION: is this GPU's NIC local (PIX/PXB) or remote (SYS)?"| Check{GPU-to-NIC\naffinity check}
    Check -->|"remote: traffic must cross CPU interconnect first"| Slow[Bottleneck: cross-socket hop\nadds latency, steals inter-socket bandwidth]
    Check -->|"local: direct PCIe switch path"| Fast[Healthy: single-switch hop,\nnear-line-rate transfer]
```

**Figure 7.1.1 — The GPU data path spans several subsystems, and each hop has a specific piece of evidence that proves it is healthy.** A workload may depend on storage, host memory, PCIe, local GPU interconnects, network adapters, and the cluster fabric during a single iteration. The decision branch on the right is the actual diagnostic move analysts make on an incident like the one in the Story above: for a given GPU, is its NIC local or remote? `nvidia-smi topo -m` answers that question directly — a `PIX`/`PXB` classification (shares a nearby PCIe switch) versus `SYS`/`NODE` (crosses the inter-socket link) is the single fastest way to separate "this GPU pairing was placed correctly" from "this GPU pairing is paying a cross-socket tax on every transfer."

The diagram is intentionally simplified. Real systems may include multiple CPU sockets, several PCIe switches, multiple NICs, local NVMe, DPUs, NVSwitch fabrics, storage adapters, and separate management and compute networks.

**A concrete look at that GPU-to-NIC decision point.** Here is a representative, annotated `nvidia-smi topo -m` output from an eight-GPU, dual-socket, four-NIC node — the same command that would have caught the Story's problem before the job ever ran:

```text
$ nvidia-smi topo -m
        GPU0  GPU1  GPU2  GPU3  GPU4  GPU5  GPU6  GPU7  NIC0  NIC1  NIC2  NIC3 CPU Affinity  NUMA Affinity
GPU0     X    NV18  NV18  NV18  NV18  NV18  NV18  NV18  PIX   SYS   SYS   SYS  0-31,64-95    0
GPU1    NV18   X    NV18  NV18  NV18  NV18  NV18  NV18  PIX   SYS   SYS   SYS  0-31,64-95    0
GPU2    NV18  NV18   X    NV18  NV18  NV18  NV18  NV18  SYS   PIX   SYS   SYS  0-31,64-95    0
GPU3    NV18  NV18  NV18   X    NV18  NV18  NV18  NV18  SYS   PIX   SYS   SYS  0-31,64-95    0
GPU4    NV18  NV18  NV18  NV18   X    NV18  NV18  NV18  SYS   SYS   PIX   SYS  32-63,96-127  1
GPU5    NV18  NV18  NV18  NV18  NV18   X    NV18  NV18  SYS   SYS   PIX   SYS  32-63,96-127  1
GPU6    NV18  NV18  NV18  NV18  NV18  NV18   X    NV18  SYS   SYS   SYS   PIX  32-63,96-127  1
GPU7    NV18  NV18  NV18  NV18  NV18  NV18  NV18   X    SYS   SYS   SYS   PIX  32-63,96-127  1

Legend:
  X    = self
  NV18 = 18 NVLink connections between the two GPUs (scale-up fabric)
  PIX  = connection traversing at most a single PCIe bridge (GPU-local NIC)
  SYS  = connection traversing PCIe and the inter-socket (SMP) link
```

**Reading this the way the Story's investigation would have:** every GPU pair shows `NV18` — the NVSwitch fabric is fully healthy, so intra-node GPU-to-GPU communication is not the problem. The evidence that *does* explain the slowdown is in the NIC columns: `GPU0`/`GPU1` are `PIX` (local, healthy) to `NIC0` but `SYS` to `NIC1`–`NIC3`. If the training job's rank-to-NIC assignment put GPU1's traffic on `NIC2` instead of `NIC0`, that traffic crosses the inter-socket link on every single collective step — exactly the kind of silent, component-healthy bottleneck this chapter describes. Nothing here would show up as an "error"; every device still reports fine. The only way to see it is to read the topology matrix and compare it against the actual rank/NIC placement the job used.

## Why Compute Stopped Being the Only Constraint

Early accelerator adoption often focused on arithmetic throughput. This made sense when the working set fit on one device and the workload spent most of its time executing kernels.

Modern AI systems changed the balance.

Large models may require multiple GPUs simply to hold parameters and runtime state. Distributed training exchanges gradients and optimizer information. Tensor parallelism moves partial results between devices during nearly every layer. Pipeline parallelism passes activations between stages. Expert parallelism routes tokens dynamically. Inference systems exchange KV-cache state, shard models, and stream responses under strict latency targets.

The result is that communication is no longer an occasional overhead. For many workloads, communication is part of the algorithm itself.

A useful mental model is:

```text
Iteration time = compute time + communication time + synchronization time + input/output time
```

The terms overlap in well-designed systems, but the relationship remains useful. Adding more GPUs reduces only the portion of work that can be parallelized. It may increase communication and synchronization at the same time.

**A worked version of the Story's numbers.** The customer above measured one GPU at 8 hours and eight GPUs at 3 hours 40 minutes (220 minutes) instead of the naively expected 1 hour (60 minutes). Assume compute per step scales perfectly with GPU count (a generous assumption) and the gap is entirely communication and synchronization overhead that did not exist on one GPU:

```text
Expected (compute-only, perfect scaling): 480 min / 8 = 60 min
Actual observed:                          220 min
Overhead attributable to communication:   220 - 60 = 160 min

Overhead as a fraction of total run time: 160 / 220 ≈ 73%
```

That is the number that reframes the ticket. The GPUs are not "underperforming" by some vague 3-4x — roughly three-quarters of every training minute on this job is being spent moving data and waiting for stragglers, not computing. That is exactly the kind of number that turns "the GPUs seem slow" into "go find out which hop in Figure 7.1.1 is costing 160 minutes."

## The Data-Movement Tax

Moving data introduces several distinct costs.

| Cost | What it means | Typical symptom |
|---|---|---|
| Serialization | Bytes must cross a finite-bandwidth link | Throughput plateaus as message size grows |
| Latency | Every operation has setup and transit delay | Small-message collectives perform poorly |
| Synchronization | Faster participants wait for the slowest | GPU utilization rises and falls in waves |
| Contention | Multiple flows share links, queues, or switches | Performance changes with neighboring jobs |
| Copy overhead | Intermediate staging consumes CPU and memory bandwidth | High CPU usage during transfers |
| Topology penalty | Traffic follows an indirect path | One GPU pair performs worse than another |
| Protocol overhead | Software and transport processing consume time | Line rate is available but not delivered |

These costs interact. A topology problem may look like a bandwidth problem. A synchronization problem may look like low GPU utilization. CPU staging may make the network appear slow even when the network is healthy.

## Scale-Up and Scale-Out

GPU communication operates across two architectural domains.

### Scale-up

Scale-up connects accelerators inside one server or tightly integrated system.

Typical technologies include:

- PCI Express
- GPU peer-to-peer access
- NVLink
- NVSwitch
- shared host memory paths

Scale-up communication supports local collectives, tensor exchange, peer memory copies, and model-parallel execution.

### Scale-out

Scale-out connects GPU systems across nodes, racks, or sites.

Typical technologies include:

- InfiniBand
- Ethernet
- RDMA
- RoCE
- ConnectX adapters
- fabric switches and routing

Scale-out communication supports distributed training, multi-node inference, remote storage access, and cluster-wide collectives.

| Domain | Boundary | Primary design question |
|---|---|---|
| Scale-up | Inside one system | How efficiently can local GPUs exchange data? |
| Scale-out | Between systems | How efficiently can remote GPUs coordinate? |

The distinction matters because a strong scale-out fabric cannot compensate for poor GPU-to-NIC locality inside the node. Likewise, an excellent NVSwitch fabric cannot compensate for a congested or oversubscribed inter-node network.

## Why PCIe Alone Was Not Always Sufficient

PCI Express is the general-purpose I/O backbone of modern servers. It connects GPUs, NICs, storage devices, and other endpoints to the CPU complex.

PCIe remains essential, but dense AI workloads exposed several limitations:

1. Several high-bandwidth devices may share one upstream path.
2. Peer traffic may cross multiple switches or root complexes.
3. Some transfers require staging through host memory.
4. Device locality depends on physical placement.
5. Communication-heavy workloads may exceed the practical bandwidth of the host I/O hierarchy.

These limitations do not make PCIe unsuitable. They explain why architects must understand where PCIe is sufficient and where additional accelerator-specific paths are justified.

## Why NVLink and NVSwitch Exist

NVLink provides a high-bandwidth path designed for GPU-to-GPU and supported CPU-to-GPU communication. NVSwitch extends that concept by creating a switched scale-up fabric when direct point-to-point links are insufficient for the required GPU count or connectivity pattern.

The engineering objective is not simply “more bandwidth.” It is to reduce dependence on indirect host-mediated paths for communication-heavy workloads.

Typical beneficiaries include:

- tensor parallel training;
- model sharding;
- large peer memory copies;
- local collective communication;
- workloads that treat several GPUs as one tightly coupled compute complex.

NVLink and NVSwitch do not eliminate the need for PCIe. PCIe still participates in device discovery, control, I/O, NIC attachment, and many host interactions. The architecture contains multiple complementary fabrics.

## Why DMA and RDMA Matter

A traditional data transfer may involve the CPU copying bytes between buffers. This consumes CPU cycles and host memory bandwidth.

Direct Memory Access allows devices to move data without requiring the CPU to copy every byte. Remote Direct Memory Access extends the concept across a network, allowing a remote system to access registered memory with reduced software involvement.

For GPU systems, the important question is whether a network or storage device can exchange data directly with GPU memory through a supported peer path.

```mermaid
flowchart LR
    Remote[Remote Node]
    NIC[Network Adapter]
    Host[Host Memory]
    GPU[GPU Memory]

    Remote --> NIC
    NIC -. host-staged path .-> Host
    Host -. copy .-> GPU
    NIC -->|direct peer DMA when supported| GPU
```

**Figure 7.1.2 — Host-staged and direct peer data paths.** A direct path can avoid a host bounce buffer, but only when hardware, topology, firmware, drivers, and software support the operation.

GPUDirect RDMA enables direct data exchange between GPU memory and supported third-party peer devices over PCIe. GPUDirect Storage enables supported storage paths to transfer data directly to or from GPU memory while avoiding a CPU bounce buffer. These technologies reduce unnecessary data movement; they do not remove the need to validate topology, compatibility, and fallback behavior.

## Locality Is a First-Class Property

Servers expose devices through logical identifiers, but performance follows physical paths.

Consider a two-socket server:

```mermaid
flowchart TD
    CPU0[CPU Socket 0]
    CPU1[CPU Socket 1]
    Root0[PCIe Root Complex 0]
    Root1[PCIe Root Complex 1]
    GPUA[GPU Group A]
    GPUB[GPU Group B]
    NICA[NIC A]
    NICB[NIC B]

    CPU0 --> Root0
    Root0 --> GPUA
    Root0 --> NICA
    CPU1 --> Root1
    Root1 --> GPUB
    Root1 --> NICB
    CPU0 <--> CPU1
```

**Figure 7.1.3 — Device locality in a two-socket server.** A process using GPU Group A and NIC B may force traffic across the inter-socket path.

The operating system may report all devices as healthy. The application may run successfully. Yet a remote path can add latency, consume inter-socket bandwidth, and reduce effective throughput.

This is why topology-aware placement aligns:

- GPU selection;
- CPU affinity;
- memory allocation;
- NIC selection;
- interrupt placement;
- process ranks;
- collective communication paths.

## Synchronization Amplifies Small Problems

Distributed AI workloads often synchronize.

During an AllReduce operation, every rank contributes data and waits for the collective to complete. If one rank is slow because it uses a remote NIC, a down-trained PCIe link, a congested switch path, or an overloaded CPU, the entire job may wait.

```mermaid
sequenceDiagram
    participant G0 as GPU Rank 0
    participant G1 as GPU Rank 1
    participant G2 as GPU Rank 2
    participant G3 as GPU Rank 3

    G0->>G0: Compute gradients
    G1->>G1: Compute gradients
    G2->>G2: Compute gradients
    G3->>G3: Compute gradients
    G0->>G1: Collective exchange
    G1->>G2: Collective exchange
    G2->>G3: Slow path delays completion
    G3-->>G0: Collective completes
```

**Figure 7.1.4 — One slow participant can extend the synchronization window.** Component-level health does not reveal rank-level imbalance.

This explains a common production pattern: all GPUs appear underutilized even though only one path is actually slow.

## When Specialized GPU Networking Becomes Necessary

Specialized communication becomes increasingly important when:

- a model spans multiple GPUs;
- training uses data, tensor, pipeline, or expert parallelism;
- inference shards a model across accelerators;
- collective communication consumes a significant fraction of iteration time;
- checkpoints must be written frequently;
- datasets must be streamed at high sustained rates;
- many accelerators share one host I/O hierarchy;
- service objectives depend on predictable tail latency;
- the platform must scale from one server to many racks.

It may be unnecessary when workloads are independent, fit on one GPU, exchange little data, and tolerate modest transfer latency. Architecture should follow workload behavior, not product fashion.

## Architecture Trade-offs

### Bandwidth versus cost

Higher-bandwidth fabrics and denser switching increase hardware cost, power consumption, cooling demand, and operational complexity.

### Locality versus scheduler flexibility

Preserving topology groups can improve performance but reduce placement flexibility. A scheduler may leave capacity idle to avoid fragmenting a strong GPU group.

### Direct paths versus compatibility

Direct data paths can reduce copies, but they require validated hardware, firmware, drivers, filesystems, kernels, and topology. Fallback paths must remain understood and observable.

### Shared fabrics versus isolation

A shared high-speed fabric improves connectivity but creates contention domains. Multi-tenant clusters need admission control, telemetry, and capacity policies.

### Peak throughput versus reliability

The fastest path is not useful if it is fragile, poorly supported, or difficult to recover. Production designs must value repeatability and supportability.

## Production Deployment Mindset

A production GPU networking design should include:

- an approved physical topology;
- stable device identities and PCI addresses;
- GPU-to-NIC affinity maps;
- NUMA-aware CPU and memory policies;
- baseline PCIe, NVLink, and network measurements;
- documented direct-path prerequisites;
- fallback behavior and performance expectations;
- monitoring for link state, errors, congestion, and topology drift;
- change-control procedures for firmware, BIOS, drivers, and kernels;
- workload placement policies aligned with communication patterns.

Node acceptance should validate not only that devices exist, but that they are connected as designed.

:::warning Production mistake
A successful `nvidia-smi` or link-state check proves visibility and basic health. It does not prove that the workload is using the intended path or achieving the expected bandwidth.
:::

## Hands-on Preview

Later labs in this volume will ask you to:

1. inspect PCIe and NUMA topology;
2. validate GPU peer-access relationships;
3. measure local and remote transfer paths;
4. benchmark RDMA or GPUDirect-capable paths where available;
5. create a topology-aware workload placement plan;
6. inject failures and compare healthy and broken behavior.

The lab philosophy is simple: draw the expected path, measure each segment, then verify the application uses that path.

## Production Troubleshooting

### Scenario 1: Eight GPUs scale poorly

**Symptoms**

- one-GPU performance is healthy;
- communication time grows with GPU count;
- utilization drops during collective phases;
- no device errors are reported.

**Diagnosis**

- inspect the GPU topology matrix;
- compare selected GPUs with direct-link groups;
- verify rank placement and CPU affinity;
- inspect GPU-to-NIC locality;
- benchmark peer transfers independently;
- correlate collective traces with hardware counters.

**Likely root causes**

- the scheduler fragmented a strong topology group;
- ranks use remote NUMA resources;
- peer access is unavailable or falling back;
- multiple flows share an oversubscribed PCIe path;
- one rank uses a weaker network path.

**Resolution**

Realign GPU, CPU, and NIC placement; preserve strong topology groups; correct runtime affinity; or redesign the allocation policy.

**Worked evidence for this exact scenario.** Using the eight-GPU topology matrix from Figure 7.1.1 above, pair it with an application-level per-rank timing breakdown — this is the paired snapshot that actually separates "which layer is slow" from "something is slow":

```text
$ cat rank_timing.log | column -t
rank  gpu  nic   compute_ms  comm_ms  total_ms
0     0    NIC0  412         38       450
1     1    NIC0  415         41       456
2     2    NIC2  409         187      596
3     3    NIC2  411         181      592
```

Compute time (`compute_ms`) is nearly identical across all four ranks — roughly 410 ms, confirming the GPUs themselves are not the problem. `comm_ms` for ranks 2 and 3 is **4–5x** higher than ranks 0 and 1. Cross-referencing against the topology matrix: rank 2 sits on GPU2, whose topology row showed `PIX` to `NIC1` but this job assigned it to `NIC2` (`SYS` — remote). That single misassignment is consuming an extra ~145 ms per iteration on those two ranks, and because AllReduce is synchronous, ranks 0 and 1 sit idle waiting for ranks 2 and 3 to catch up — which is why the *whole job's* iteration time degrades even though only two of four ranks have a bad path.

### Scenario 2: Network links are underused while jobs wait

**Symptoms**

- fabric ports show low utilization;
- collective latency is high;
- CPU usage is elevated;
- GPU utilization oscillates.

**Diagnosis**

Determine whether data is staged through host memory, whether the application is issuing sufficiently large transfers, and whether synchronization or software processing is limiting the path before the network becomes busy.

### Scenario 3: Performance changes after firmware maintenance

**Symptoms**

- devices remain visible;
- one node class becomes slower;
- peer bandwidth or NIC throughput changes.

**Possible causes**

- PCIe link width or speed changed;
- device enumeration changed;
- IOMMU or ACS behavior changed;
- NUMA affinity changed;
- BIOS settings reverted;
- interrupt placement changed.

**Worked evidence for this scenario.** Compare `LnkCap` (what the slot/device is capable of) against `LnkSta` (what it actually negotiated) before and after the maintenance window:

```text
$ sudo lspci -s 61:00.0 -vv | grep -E 'LnkCap|LnkSta'
        LnkCap: Port #0, Speed 16GT/s, Width x16, ASPM not supported
        LnkSta: Speed 8GT/s (downgraded), Width x16
```

`LnkCap` says this device and slot are capable of `16GT/s` (PCIe Gen4) at `x16` — the full designed link. `LnkSta` shows it is actually running at `8GT/s` (Gen3 speeds) despite the full `x16` width. Width matching but speed downgraded is the classic signature of a BIOS setting reverted during firmware maintenance (for example, a PCIe ASPM or link-speed policy reset to a conservative default) rather than a physical seating or riser fault — a physical fault more commonly costs width (`x8` instead of `x16`), not just speed. This single before/after comparison is enough to route the ticket to "BIOS/firmware configuration drift" instead of "hardware replacement," which is the difference between a five-minute config fix and an unnecessary parts swap.

### Prevention

Capture topology and bandwidth baselines during commissioning. Re-run them after firmware, BIOS, kernel, driver, or hardware changes.

## Customer Perspective

When a customer asks for “faster GPU networking,” do not begin with a product recommendation.

Begin with discovery:

1. What workload is running?
2. Which tensors move between devices?
3. How much data moves per iteration or request?
4. Is communication mostly inside one node or between nodes?
5. Does the workload synchronize globally?
6. Which GPU, NIC, and storage paths are currently used?
7. Is the problem bandwidth, latency, contention, software overhead, or placement?
8. What growth is expected over the next three years?
9. What operational complexity can the customer support?
10. What failure and upgrade model is acceptable?

Only then should the design discussion move to NVLink, NVSwitch, InfiniBand, Ethernet, RDMA, or GPUDirect.

### Example customer statement

> “We purchased eight DGX or HGX-based systems. Training is slower than expected. Should we buy a faster network?”

A strong architect first separates:

- intra-node communication;
- GPU-to-NIC locality;
- inter-node fabric behavior;
- collective algorithm behavior;
- storage interference;
- software placement.

The network may be the bottleneck. It is not the only plausible bottleneck.

## Interview Preparation

### Knowledge Questions

1. Why does adding GPUs increase communication demand?

   > "Because past one GPU, the algorithm itself starts moving data. Data parallelism reduces gradients across every device every step, tensor parallelism moves partial activations between devices inside a single layer, and pipeline parallelism hands activations from one stage to the next. None of that traffic existed on a single GPU — it's not overhead bolted on top of the workload, it *is* part of the workload, so more GPUs means more required communication, not just more compute."

2. What is the difference between scale-up and scale-out communication?

   > "Scale-up is communication inside one tightly coupled system — GPUs talking over NVLink or NVSwitch within a server. Scale-out is communication between systems, over InfiniBand or Ethernet, RDMA, across racks. They're not interchangeable: a great NVSwitch fabric inside a node can't fix an oversubscribed inter-node network, and a great cluster fabric can't fix bad GPU-to-NIC placement inside one node. You have to evaluate both domains separately."

3. Why is PCIe topology relevant even when NVLink is present?

   > "Because NVLink only carries GPU-to-GPU traffic. Everything else — the NIC, the storage controller, host memory, device discovery and control — still goes through PCIe. If a NIC ends up behind the wrong root complex relative to the GPUs feeding it, that traffic pays a PCIe and inter-socket tax no matter how fast the NVLink fabric is. NVLink and PCIe are complementary fabrics carrying different traffic classes, not a replacement relationship."

4. What problem does RDMA solve?

   > "It removes the CPU from the data path on every transfer. A traditional network transfer has the CPU copy bytes between buffers, which burns CPU cycles and host memory bandwidth on every message. RDMA lets a remote system read or write registered memory directly, with the CPU only involved in setup, not in every byte that moves. That matters a lot once communication volume is high enough that CPU-mediated copying itself becomes the bottleneck."

5. Why can direct peer access still perform poorly?

   > "Because 'available' and 'fast' are different claims. Peer access being enabled just means the hardware and driver permit the transfer — it says nothing about whether that pair of GPUs has a direct NVLink connection or has to hop through a switch, or whether they're competing with other flows for the same link. I'd never accept 'peer access is enabled' as proof of performance; I'd run an actual pairwise bandwidth test and compare it to the topology matrix."

### Architecture Questions

1. Draw the end-to-end path for a tensor moving from storage to a remote GPU.

   > "I'd draw it left to right: dataset on storage, into host memory — either staged through the page cache or, if GPUDirect Storage is validated, directly into GPU memory. Then from GPU memory across NVLink or PCIe to a local peer if it's staying in-node, or out through a GPU-local NIC over RDMA to the remote node's NIC, then into the remote GPU's memory, ideally without another host-memory bounce on that side either. At each hop I'd label what proves it's using the path I think it's using — `nvidia-smi topo -m` for the local hops, NCCL debug output plus an RDMA counter check for the network hop."

2. Design a two-socket, eight-GPU server placement policy.

   > "I'd group GPUs by NUMA node — four GPUs and their local NICs on socket 0, four on socket 1 — and pin each rank's CPU threads and memory allocation to match the socket of the GPU it drives. I'd assign NIC ownership so each GPU group talks to the NIC that's PCIe-local to it, not one that forces inter-socket traffic. And I'd make that placement policy part of the launcher, not a manual step someone can forget."

3. Explain how GPU-to-NIC locality affects distributed training.

   > "Every gradient a GPU sends off-node has to reach its NIC first. If that NIC is local — same PCIe switch, same socket — the hop is cheap. If it's remote, every send crosses the inter-socket interconnect before it even reaches the network. In a synchronous training step that delay doesn't just slow one rank, it delays the whole collective, because every other rank waits for the slowest one to finish."

4. Compare a topology-aware scheduler with a count-only scheduler.

   > "A count-only scheduler asks 'does this node have eight free GPUs?' and stops there. A topology-aware scheduler asks that plus 'do these eight GPUs form a strong, undivided NVLink/NVSwitch group, and are the NICs this job needs actually local to them?' The count-only scheduler can quietly hand out a fragmented set of GPUs — say four from one strong group and four from another — and the job will run, just slower, with no error anywhere. The topology-aware one either keeps the group intact or tells you honestly that it can't."

### Scenario Questions

1. A job is fast on GPUs 0 and 1 but slow on GPUs 1 and 2. What do you inspect?

   > "First the topology matrix — `nvidia-smi topo -m` — to see whether 1-2 has a weaker link class than 0-1, for example a multi-hop NVLink path versus a direct one. Then I'd run an isolated pairwise bandwidth test on 1-2 specifically, because if the matrix says they're equivalent but the measured bandwidth isn't, that points to something dynamic — contention from another process, a degraded link that hasn't been flagged yet — rather than a fixed topology property."

2. All links are up, but collective latency doubled after maintenance. What could have changed?

   > "'Up' just means the link trained at some speed and width — it doesn't say which speed and width. I'd compare `LnkCap` against `LnkSta` before assuming anything is wrong at the collective-algorithm level. A BIOS setting reverted during maintenance, a retimer that didn't come back at full speed, or a firmware mismatch between the switch and the endpoints can all halve delivered bandwidth while every link still reports 'up.'"

3. The network is only 30 percent utilized while GPUs wait. Why might the network not be the bottleneck?

   > "Because low utilization on the wire can mean the network is idle waiting for work, not that it's the constraint. If data is being staged through host memory instead of a direct peer path, the CPU copy step can be the actual bottleneck, and the network just never gets enough concurrent, large-enough transfers to show high utilization. I'd check whether transfers are host-staged before concluding anything about the network itself."

4. One rank consistently finishes communication later than the others. How do you isolate the cause?

   > "I'd pull a per-rank timing breakdown first — compute time versus communication time — to confirm compute is equal across ranks and the gap is specifically in communication. Then I'd map that rank to its GPU and NIC, check the topology row for that GPU, and check whether it's using a different, weaker path than the other ranks. In my experience it's almost always a placement issue: one rank quietly landed on a remote NIC or a fragmented GPU group."

### Customer Questions

1. When should a customer invest in NVSwitch?

   > "When the workload spends a meaningful fraction of iteration time in GPU-to-GPU collectives — tensor-parallel training, large all-reduce steps, model sharding across many devices. If I measure that and it's a small percentage of iteration time, NVSwitch is expensive insurance for a problem the workload doesn't have."

2. When is InfiniBand appropriate, and when is Ethernet sufficient?

   > "InfiniBand earns its cost when the workload is latency-sensitive at scale and communication-bound — large distributed training jobs where every microsecond of collective latency multiplies across thousands of steps. If the workload is more like independent inference replicas with modest cross-node traffic, a well-tuned RoCE Ethernet fabric is often sufficient and considerably simpler to operate."

3. What evidence is required before recommending GPUDirect Storage?

   > "I'd want to see the actual data-loading pattern first — is the model waiting on storage reads during training, and is that wait large relative to compute time? GPUDirect Storage only pays off when the current CPU-staged path is genuinely the bottleneck. If storage read time is already small next to compute, removing a copy step won't move the needle enough to justify the validation work."

4. How would you explain the cost of topology-aware scheduling to a customer focused on utilization?

   > "I'd tell them that a scheduler chasing maximum utilization will happily fragment a strong GPU group to fill capacity right now, and that decision can cost far more in wasted training time than the idle GPU-hours it avoided. Preserving topology sometimes means leaving a few GPUs idle briefly so the next job gets a coherent group — that's a deliberate trade of short-term utilization for actual throughput."

### Whiteboard Exercise

Draw a two-node training system with:

- four GPUs per node;
- two CPU sockets;
- two NICs;
- one storage path;
- local GPU interconnects;
- an inter-node fabric.

Mark strong and weak paths. Explain where you would place processes and why.

> "I'd draw each node as two NUMA halves — two GPUs and one NIC per socket — connected inside by NVLink, and each socket's PCIe root feeding its local NIC out to the fabric. I'd mark the NVLink connections and each GPU-to-local-NIC hop as strong paths, and I'd mark any GPU-to-remote-NIC hop — crossing the inter-socket link — as a weak path in red. For process placement, I'd pin two ranks per socket, matching each rank's CPU affinity and memory allocation to the same socket as its GPU and NIC, so no rank's data ever has to cross that inter-socket link just to reach its own network adapter."

## Summary

GPU networking exists because modern AI workloads are distributed across memory domains, devices, and systems. As workloads scale, data movement and synchronization become part of the execution model rather than background overhead.

The important architecture is the full path: storage, CPU memory, PCIe, GPU memory, local GPU interconnects, network adapters, and the cluster fabric. A system can contain healthy components and still deliver poor performance when software placement does not match physical topology.

The rest of this volume develops the tools required to inspect, benchmark, design, and troubleshoot these paths.

## Key Takeaways

- GPU count alone does not describe system capability.
- Communication is part of the algorithm for distributed AI workloads.
- Scale-up and scale-out solve different communication problems.
- Bandwidth, latency, synchronization, contention, and topology must be evaluated together.
- Direct paths reduce unnecessary copies but require validated support and observability.
- Healthy components do not guarantee an efficient end-to-end data path.
- Customer recommendations must begin with workload discovery.

## Quick Revision Sheet

| Question | Revision answer |
|---|---|
| Why does GPU networking exist? | To move data efficiently across GPU, host, storage, and remote-node boundaries. |
| What is scale-up? | Communication among accelerators inside one tightly coupled system. |
| What is scale-out? | Communication between GPU systems across a cluster fabric. |
| Why does locality matter? | Physical path length and contention affect delivered latency and bandwidth. |
| Why is synchronization dangerous? | One slow participant can delay the entire distributed operation. |
| What should be measured? | Every required segment of the end-to-end data path. |

## Lab Checklist

Before moving to the next chapter, confirm that you can:

- draw the path from storage to GPU memory;
- distinguish local peer traffic from inter-node traffic;
- explain why NUMA and NIC affinity matter;
- identify at least three reasons healthy GPUs can still scale poorly;
- describe the difference between component health and path health.

## Cross References

- [Volume 07 Introduction](./index)
- Next: [PCIe, NUMA, and Host Data Paths](./chapter-02-pcie-numa-and-host-data-paths)
- Related: [GPU Topology, Peer Access, and Data Paths](../volume-02/chapter-10-gpu-topology-peer-access-and-data-paths)
- Related: [HGX Topology and Data Paths](../volume-06/chapter-04-hgx-topology-and-data-paths)
- Related lab: [Inspect PCIe, NUMA, and GPU Topology](./labs/lab-01-inspect-pcie-numa-and-gpu-topology)

## Further Reading

- NVIDIA GPUDirect RDMA Documentation
- NVIDIA GPUDirect Storage Overview Guide
- NVIDIA DCGM Topology and NVLink Documentation
- PCI Express Base Architecture documentation from PCI-SIG
- NCCL documentation and topology guidance
