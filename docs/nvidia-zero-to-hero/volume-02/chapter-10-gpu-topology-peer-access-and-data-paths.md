---
title: GPU Topology, Peer Access, and Data Paths
description: Understand how GPU placement, PCIe hierarchy, NVLink connectivity, NUMA locality, and peer access shape application performance.
sidebar_position: 11
tags:
  - gpu-architecture
  - topology
  - pcie
  - nvlink
  - numa
---

# GPU Topology, Peer Access, and Data Paths

## Introduction

A multi-GPU server may contain several identical accelerators, yet communication between two selected devices can be much faster than communication between another pair. The difference is not the GPU model. It is the path between them.

Data may travel through a direct GPU interconnect, across a PCIe switch, through a host bridge, or even across CPU sockets. Each additional boundary introduces bandwidth limits, latency, contention, and operational consequences. For this reason, GPU count alone is not an architecture.

Topology explains how accelerators, CPUs, memory controllers, network adapters, and storage devices are physically connected. Peer access explains whether one GPU can address another GPU's memory directly. Together, they determine whether software placement matches the machine that actually exists.

| Chapter field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Intermediate |
| Estimated reading time | 50 minutes |
| Primary focus | Multi-GPU locality and communication paths |
| Previous | Divergence, Coalescing, and Bottleneck Reasoning |
| Next | Building a GPU Performance Model |

## Story

A training job uses four GPUs in one server. The framework reports that all four devices are healthy, but scaling from two GPUs to four produces little improvement. The team suspects the collective library.

Topology inspection shows that the first two GPUs share a direct high-bandwidth path, while the other pair sits behind a different PCIe hierarchy. The network adapter used for inter-node traffic is also closest to only one CPU socket. Processes were assigned by GPU index rather than by physical locality.

Nothing was broken. The workload was simply mapped onto the wrong communication paths.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain why logical GPU indices do not describe physical locality.
- Distinguish direct peer paths from host-mediated paths.
- Interpret PCIe, NUMA, and high-speed GPU interconnect relationships.
- Explain the role of peer memory access.
- Identify placement problems that reduce multi-GPU performance.
- Describe how topology influences scheduling and troubleshooting.

## Big Picture

```mermaid
flowchart TD
    CPU0[CPU Socket 0]
    CPU1[CPU Socket 1]
    Root0[PCIe Root Complex 0]
    Root1[PCIe Root Complex 1]
    GPU0[GPU 0]
    GPU1[GPU 1]
    GPU2[GPU 2]
    GPU3[GPU 3]
    NIC0[High-Speed NIC]

    CPU0 --> Root0
    CPU1 --> Root1
    Root0 --> GPU0
    Root0 --> GPU1
    Root0 --> NIC0
    Root1 --> GPU2
    Root1 --> GPU3
    GPU0 <--> GPU1
    GPU2 <--> GPU3
    GPU1 -.->|"cross-root-complex peer traffic:<br/>evidence: nvidia-smi topo -m shows<br/>SYS/PHB not NVLink/PIX"| GPU2
    GPU0 --> Check{"nvidia-smi topo -m label<br/>for this GPU pair?"}
    Check -->|"NVLink/PIX (direct or same switch)"| Fast["Strong path — safe to assign<br/>as a communicating pair"]
    Check -->|"PXB/PHB/SYS (crosses<br/>switches, root complex, or socket)"| Slow["Weak path — avoid for<br/>collective-heavy workloads"]
```

**Figure 2.10.1 — Example multi-GPU topology.** GPUs under the same root complex may have a shorter PCIe path, while selected pairs may also have a direct high-bandwidth peer interconnect. The dotted edge marks the specific weak path this chapter's opening Story traces — a pair that looks identical to any other GPU pair in a resource count, but actually crosses root complexes. The branch turns "which pairs are safe to assign together" into a lookup against one command's output rather than an assumption based on GPU index.

**The evidence this whole chapter is built on — one command, read correctly:**

```text
$ nvidia-smi topo -m
        GPU0    GPU1    GPU2    GPU3    NIC0    CPU Affinity    NUMA Affinity
GPU0     X      NV4     SYS     SYS     PIX     0-31            0
GPU1    NV4      X      SYS     SYS     SYS     0-31            0
GPU2    SYS     SYS      X      NV4     SYS     32-63           1
GPU3    SYS     SYS     NV4      X      SYS     32-63           1
NIC0    PIX     SYS     SYS     SYS      X

Legend:
  X    = self
  NV4  = 4 NVLink connections between GPUs
  PIX  = connection traversing at most a single PCIe bridge
  SYS  = connection traversing PCIe as well as a NUMA/socket-level link
```

Reading this matrix against the Story's failure directly: `GPU0 <-> GPU1` shows `NV4` (a direct 4-link NVLink connection) — the strong pair. `GPU0 <-> GPU2` shows `SYS`, meaning the path crosses both the PCIe hierarchy and a NUMA/socket boundary — exactly the "different PCIe hierarchy" and "different CPU socket" problem the Story describes. `NIC0` shows `PIX` to `GPU0` (same PCIe bridge, good locality) but `SYS` to `GPU2` and `GPU3` — the NIC is close to only one GPU pair, confirming the Story's second claim about network-adapter locality. None of this requires guessing: the legend defines exactly what each label means on the installed driver version, and the labels are the direct evidence for every placement decision later in this chapter.

## Logical Identity versus Physical Placement

GPU software often exposes devices as `GPU 0`, `GPU 1`, and so on. Those indices are convenient, but they are not stable architectural identifiers. Enumeration order can change after firmware updates, device replacement, or operating-system changes.

A topology-aware design uses stable identifiers and physical relationships:

- GPU UUID
- PCI bus address
- NUMA node
- CPU affinity
- NIC affinity
- peer-access capability
- direct-link or switch path

A scheduler that sees only a count of four GPUs knows capacity. It does not automatically know which two GPUs should be paired for a communication-heavy workload.

## PCIe Hierarchy

PCI Express connects GPUs to host CPUs and often to network or storage devices. A typical path contains endpoints, switches, root ports, and root complexes.

Two GPUs can communicate through PCIe peer-to-peer transactions when the platform, firmware, driver, and device path support it. However, peer traffic may still cross one or more switches, and path quality varies.

| Path characteristic | Architectural implication |
|---|---|
| Same PCIe switch | Shorter path and shared switch bandwidth |
| Different switches under one root complex | Additional switching and possible contention |
| Different root complexes on one socket | More host-fabric traversal |
| Different CPU sockets | Possible inter-socket traffic and NUMA penalty |
| GPU and NIC share locality | Better potential for communication placement |

A shorter path is usually preferable, but architecture must also consider shared-bandwidth contention. Several fast devices behind one switch can compete for the same upstream link.

## NUMA Locality

Non-Uniform Memory Access means that CPU cores do not access every region of host memory with the same cost. I/O devices are also associated with particular CPU sockets or NUMA nodes.

When a CPU prepares data for a GPU attached to another socket, traffic may cross the inter-socket fabric before reaching the GPU. The same problem appears when a process uses a network adapter far from its assigned GPU.

```mermaid
flowchart LR
    CPUA[CPU on Local NUMA Node]
    LocalMem[Local Host Memory]
    GPU[Nearby GPU]
    CPUB[CPU on Remote NUMA Node]
    RemoteMem[Remote Host Memory]

    CPUA --> LocalMem --> GPU
    CPUB --> RemoteMem --> CPUA --> GPU
```

**Figure 2.10.2 — Simplified local and remote host paths.** Remote CPU or memory placement can add an inter-socket hop before data reaches the GPU.

NUMA penalties do not always dominate end-to-end performance, but they become important in input-heavy inference, CPU preprocessing, storage pipelines, and network-intensive training.

## Direct GPU Interconnects

High-bandwidth GPU interconnects provide a path designed specifically for accelerator communication. Depending on the system, GPUs may be connected directly or through a switch fabric.

The architectural purpose is to reduce dependence on host-mediated PCIe paths for communication-heavy operations such as:

- collective communication
- tensor exchange
- model parallelism
- peer memory copies
- shared working sets

Direct connectivity does not make every GPU pair equivalent. Some systems provide full-fabric connectivity; others expose specific link neighborhoods. Software must understand the actual matrix.

## Peer Memory Access

Peer access allows one GPU to access memory associated with another GPU through a supported peer path. Without peer access, applications may need to stage data through host memory or use another communication mechanism.

```mermaid
flowchart LR
    GPUA[GPU A]
    MemA[GPU A Memory]
    GPUB[GPU B]
    MemB[GPU B Memory]
    Host[Host Memory]

    GPUA --> MemA
    GPUB --> MemB
    GPUA <--> MemB
    GPUB <--> MemA
    GPUA -. fallback staging .-> Host
    Host -. fallback staging .-> GPUB
```

**Figure 2.10.3 — Peer access and host-staged fallback.** Supported peer access can avoid an additional host-memory staging step.

Peer access is not the same as guaranteed high performance. The path may still be limited by PCIe topology, switch bandwidth, address-translation behavior, or concurrent traffic.

**A worked comparison: NVLink pair versus cross-socket pair, for one collective step.** Suppose a training step needs to all-reduce a 500MB gradient buffer between two GPUs. Over a direct NVLink connection at roughly 900 GB/s (a representative multi-link NVLink aggregate on a modern data-center GPU), the transfer alone takes on the order of `0.5 GB / 900 GB/s ≈ 0.56 ms`. The same 500MB over a `SYS`-labeled path — PCIe plus a cross-socket hop, effectively bottlenecked by something closer to a single PCIe Gen4 x16 link at roughly 25-32 GB/s — takes on the order of `0.5 GB / 28 GB/s ≈ 18 ms`, over 30x slower for the identical data volume. This is the concrete arithmetic behind the chapter's opening Story: a scheduler that places two ranks on a `SYS` pair instead of an `NV4` pair doesn't just run "somewhat slower" — it can dominate step time entirely, especially at the small message sizes and high frequency typical of gradient synchronization.

## Topology-Aware Placement

Applications and schedulers should align communication partners with the strongest available paths.

For a multi-GPU job, placement decisions may include:

1. selecting GPUs connected through the same high-speed fabric
2. binding CPU workers to nearby NUMA nodes
3. choosing network adapters close to the participating GPUs
4. preserving topology groups for collective communication
5. avoiding fragmented allocation across weakly connected devices

A topology-unaware scheduler can satisfy the resource request and still produce poor performance.

## Internal Working

Consider an inter-node collective operation. A GPU may first move data to a local peer, send data through a nearby NIC, receive remote data, and distribute results to other GPUs.

```mermaid
sequenceDiagram
    participant G0 as Local GPU 0
    participant G1 as Local GPU 1
    participant N as Local NIC
    participant R as Remote Node

    G1->>G0: Peer transfer or collective step
    G0->>N: Submit network data
    N->>R: Transmit over fabric
    R-->>N: Return collective result
    N-->>G0: Deliver data
    G0-->>G1: Distribute to peer
```

**Figure 2.10.4 — Simplified topology-dependent collective path.** GPU-to-GPU, GPU-to-NIC, and inter-node relationships all affect the communication path.

## Architecture Trade-offs

### Dense connectivity versus cost

More direct links and larger switch fabrics improve communication flexibility but increase system cost, power, complexity, and validation requirements.

### Locality versus scheduling flexibility

Strict topology placement can improve performance but reduce scheduler flexibility and cluster utilization. The platform must decide when performance justifies preserving specific device groups.

### Shared fabric versus isolation

A shared high-bandwidth path improves connectivity, but multiple jobs may contend for the same links or switches. Observability and admission control become important.

## Production Deployment

A production topology policy should include:

- a validated physical topology map
- stable device identifiers
- NUMA-aware CPU allocation
- GPU-to-NIC affinity rules
- topology-aware scheduling labels
- baseline peer-bandwidth measurements
- expected path matrices for each approved server design

Commissioning should verify the topology delivered by firmware and operating-system enumeration against the approved hardware design.

:::warning Production mistake
Do not assume that identical servers expose identical device numbering. Validate UUID, PCI address, NUMA affinity, and link relationships on every node class.
:::

## Production Troubleshooting

### Problem: Four-GPU scaling is worse than two-GPU scaling

**Symptoms**

- healthy device state
- increasing communication time
- strong performance on one GPU pair
- weak performance on another pair

**Diagnosis**

Inspect the topology matrix, peer-access capability, collective traces, CPU affinity, and NIC locality. Compare the selected GPU set with a known-good topology group.

**Root cause**

The scheduler allocated GPUs across weaker communication paths or across NUMA boundaries.

**Turning this into evidence.** Compare the topology matrix against the actually-assigned rank-to-GPU mapping used for the job:

```text
$ nvidia-smi topo -m | head -6
        GPU0    GPU1    GPU2    GPU3
GPU0     X      NV4     SYS     SYS
GPU1    NV4      X      SYS     SYS
GPU2    SYS     SYS      X      NV4
GPU3    SYS     SYS     NV4      X
```

If the training job's rank assignment paired `GPU0`+`GPU2` and `GPU1`+`GPU3` — a plausible result of naive round-robin or sequential-index assignment — every one of its two communicating pairs is on a `SYS` path despite two genuinely strong `NV4` pairs (`GPU0`-`GPU1` and `GPU2`-`GPU3`) existing on the same host and going unused. This is fully diagnosable from the topology matrix and the job's launch configuration alone, before touching a profiler — and it is the single most common concrete cause of "four-GPU scaling worse than two-GPU scaling," since two-GPU jobs on this host have a 50% chance of landing on a strong pair by luck, while a naive four-GPU assignment guarantees at least one weak pair is on the critical path.

**Resolution**

Constrain the workload to an appropriate topology group, adjust process binding, or redesign the placement policy.

### Problem: GPU-to-NIC throughput is inconsistent

Possible causes include remote NUMA placement, a shared PCIe switch, link down-training, IOMMU configuration, or competing traffic.

### Prevention

Record topology and bandwidth baselines during node commissioning and compare them after firmware, BIOS, driver, or hardware changes.

## Customer Scenario

A customer buys eight-GPU servers for distributed training and asks why the orchestration platform cannot treat every GPU as an interchangeable unit. The architect explains that capacity is interchangeable only for workloads with little peer communication. Training jobs that exchange gradients or model partitions depend on specific data paths.

The recommended design exposes topology groups to the scheduler, aligns CPU and NIC affinity, and reserves fragmented placement for workloads that do not require strong peer communication.

## Interview Preparation

### Conceptual Questions

1. Why is GPU index insufficient for topology-aware scheduling?
**Model answer:** "Because the index is just an enumeration order — it can change after a reboot, a firmware update, or a hardware swap, and it says nothing about physical placement. I'd point to `nvidia-smi topo -m`: two GPUs can be adjacent indices, 0 and 1, and still be on a `SYS` path crossing sockets, while 0 and 2 might be the actual `NV4` pair. Scheduling by index alone is scheduling blind — the UUID and the topology matrix are the only things that describe what's actually connected to what."

2. What is the difference between peer access and a high-bandwidth peer path?
**Model answer:** "Peer access is a capability question — can GPU A address GPU B's memory directly, without staging through host memory. A high-bandwidth peer path is a performance question — even with peer access enabled, the actual route the data takes could be a fast direct NVLink connection or a slower PCIe-and-switch route. I'd stress that peer access being 'on' doesn't tell you which of those two you're getting — that's exactly what the topology matrix's path label distinguishes, and it's the difference between `NV4` and `SYS` performance."

3. How can NUMA placement affect GPU workloads?
**Model answer:** "When a CPU thread on one NUMA node prepares data for a GPU attached to a different node, that data crosses an inter-socket link before it ever reaches the GPU's PCIe root complex — an extra hop with real added latency and reduced bandwidth versus local placement. This shows up most in CPU-heavy stages: tokenization output being staged for a GPU on the wrong socket, or a network adapter feeding distributed training data from the wrong NUMA node. I'd check `nvidia-smi topo -m`'s NUMA Affinity column against actual process CPU binding with `taskset` to confirm this rather than assume it."

### Architecture Questions

1. Draw a two-socket, four-GPU server and identify strong and weak paths.
**Model answer:** "Two CPU sockets, each with its own PCIe root complex and two GPUs beneath it. Within a socket's pair — GPU0-GPU1 — a direct NVLink connection is the strong path. Across sockets — GPU0-GPU2 — the path has to cross the PCIe hierarchy and the inter-socket link, which the topology matrix would label `SYS`. I'd point at the matrix while drawing it: this isn't a guess, `nvidia-smi topo -m` prints exactly this structure, including which NIC sits closest to which socket, for the actual server in front of you."

2. Explain how GPU-to-NIC affinity influences distributed training.
**Model answer:** "Inter-node collective communication has to go GPU-to-NIC before it ever leaves the box, and if the NIC handling that traffic is on the far socket from the GPU, every outbound packet pays the same cross-socket penalty as GPU-to-GPU traffic would. I'd check the topology matrix's NIC row — a `PIX` label to one GPU pair and `SYS` to another means only half the GPUs on that host have a genuinely local path to the network, and rank assignment should put the ranks doing the most inter-node communication on the locally-attached GPUs."

3. Design a topology-aware allocation policy for multi-GPU jobs.
**Model answer:** "I'd start from the topology matrix, not the resource count. For single-GPU inference, I'd require same-NUMA CPU binding but not a peer group — communication needs are minimal. For multi-GPU training in one node, I'd require the strongest available peer group — NVLink-connected GPUs — and local CPU/memory binding, rejecting fragmented allocation across weak paths even if it means the job queues briefly. For distributed multi-node training, I'd add a requirement for a NIC that's locally attached to the selected GPU group, plus a stable rank-to-device mapping so collective communication patterns match the physical topology consistently across restarts."

### Scenario Questions

1. A job is fast on GPUs 0 and 1 but slow on GPUs 1 and 2. What do you inspect?
**Model answer:** "The topology matrix first — I'd bet `nvidia-smi topo -m` shows `NV4` or a similarly strong label for 0-1 and `SYS` for 1-2, meaning 1-2 crosses a root complex or socket boundary that 0-1 doesn't. That single lookup usually explains the entire gap without needing to profile the application at all — it's a placement problem, not a code problem, and the fix is picking a different pair, not tuning the kernel."

2. All GPUs are healthy, but collective latency increased after a firmware change. Why might topology matter?
**Model answer:** "Firmware and BIOS updates can change how PCIe devices enumerate or how link training negotiates, which can silently change the topology the OS reports — even though every individual GPU still passes health checks. I'd re-run `nvidia-smi topo -m` and diff it against the pre-change baseline rather than assuming the GPUs themselves degraded; if a pair that used to show `NV4` now shows something weaker, or CPU/NUMA affinity shifted, that's the actual explanation, and it's a commissioning/validation gap, not a hardware fault."

3. A scheduler allocates free GPUs across two sockets. What trade-off has it made?
**Model answer:** "It prioritized resource availability and scheduling flexibility over communication performance — filling the request from whatever's free, regardless of path quality. That's a reasonable default for workloads with little peer communication, like independent single-GPU inference jobs, but for a job that exchanges gradients or activations between its GPUs, that same allocation can turn a collective step into the dominant cost, exactly like the 30x latency gap between an NVLink and a cross-socket transfer of the same data. I'd flag that trade-off explicitly rather than assume the scheduler 'did something wrong' — it did what a topology-unaware scheduler is designed to do."

## Summary

GPU topology determines how data moves between accelerators, CPUs, memory, network adapters, and storage. Peer access can remove host staging, but path quality still depends on the physical hierarchy.

A production platform must treat locality as a scheduling input. Healthy devices placed on weak paths can deliver a healthy-looking but inefficient system.

## Key Takeaways

- Logical GPU indices do not describe physical locality.
- PCIe hierarchy, NUMA, direct interconnects, and NIC placement shape performance.
- Peer access enables direct addressing but does not guarantee equal bandwidth.
- Topology-aware scheduling can improve communication-heavy workloads.
- Commissioning should validate actual device paths, not only device visibility.

## Cross References

- Previous: [Divergence, Coalescing, and Bottleneck Reasoning](./chapter-09-divergence-coalescing-and-bottleneck-reasoning)
- Next: [Building a GPU Performance Model](./chapter-11-building-a-gpu-performance-model)
- Related lab: [Build a Topology-Aware GPU Placement Plan](./labs/lab-04-build-a-topology-aware-gpu-placement-plan)
