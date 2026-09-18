---
title: Chapter 03 — NVLink and NVSwitch
description: Understand why scale-up GPU fabrics exist, how NVLink and NVSwitch change intra-system communication, and when they are operationally justified.
sidebar_position: 4
tags:
  - gpu-networking
  - nvlink
  - nvswitch
  - scale-up
---

# NVLink and NVSwitch

## Introduction

PCI Express made accelerators practical by giving servers a common I/O fabric. It is flexible, widely supported, and essential for device discovery, host communication, storage, and network adapters. But tightly coupled GPU workloads ask a different question:

> How can several accelerators exchange large amounts of data repeatedly without forcing every peer interaction through a host-oriented I/O tree?

NVLink addresses that problem by providing high-bandwidth links for supported accelerator and processor endpoints. NVSwitch extends those links into a switched scale-up fabric so multiple GPUs can communicate through a more uniform local topology.

These technologies do not make communication free. They do not replace PCIe, eliminate synchronization, or guarantee application scaling. They change the available paths. Software, placement, collective algorithms, firmware, and workload behavior still determine whether those paths are used effectively.

| Chapter field | Value |
|---|---|
| Volume | 07 — GPU Networking |
| Difficulty | Advanced |
| Estimated reading time | 60–75 minutes |
| Primary focus | Intra-system GPU scale-up communication |
| Previous | PCIe, NUMA, and Host Data Paths |
| Next | DMA, RDMA, and Peer-to-Peer |

## Story: Eight GPUs, Two Very Different Systems

A customer compares two eight-GPU servers. Both expose the same accelerator model and memory capacity. One uses independent PCIe-attached GPUs. The other integrates the GPUs through an NVSwitch-based fabric.

The procurement team asks why the second platform costs more when the GPU count is identical.

The answer depends on the workload. Eight independent inference replicas may exchange little data and gain limited value from a dense scale-up fabric. A model-parallel workload may exchange activations on every layer boundary. A training job may perform collective reductions during every iteration. For those workloads, the communication architecture is part of the compute architecture.

The correct comparison is therefore not:

```text
8 GPUs versus 8 GPUs
```

It is:

```text
8 endpoints behind a general I/O hierarchy
versus
8 accelerators participating in a high-bandwidth scale-up domain
```

## Learning Objectives

After completing this chapter, you will be able to:

- explain why PCIe alone can limit communication-heavy workloads;
- distinguish NVLink from NVSwitch;
- describe direct-link and switched scale-up topologies;
- explain how CUDA and NCCL use available peer paths;
- identify workloads that benefit from scale-up fabrics;
- describe operational and failure-domain considerations;
- troubleshoot degraded or asymmetric peer communication;
- explain the customer trade-off between integrated scale-up and independent GPUs.

## Big Picture

```mermaid
flowchart LR
    subgraph HostIO[Host and External I/O]
        CPU[CPU]
        PCIe[PCIe Fabric]
        NIC[NIC]
        Storage[Storage]
    end

    subgraph ScaleUp[GPU Scale-Up Domain]
        G0[GPU 0]
        G1[GPU 1]
        G2[GPU 2]
        G3[GPU 3]
        SW[NVSwitch Fabric]
    end

    CPU <--> PCIe
    PCIe <--> NIC
    PCIe <--> Storage
    PCIe <-->|"topo -m: SYS/NODE class —\ncontrol, host I/O, NIC/storage traffic"| G0
    PCIe <--> G1
    PCIe <--> G2
    PCIe <--> G3
    G0 <-->|"topo -m: NVx class,\nnvidia-smi nvlink -s: active"| SW
    G1 <--> SW
    G2 <--> SW
    G3 <--> SW

    Peer{Peer transfer\nrequested} -->|"nvidia-smi topo -m shows NVx\nbetween source and dest"| UseNV[Uses NVLink/NVSwitch:\nhigh bandwidth, low latency]
    Peer -->|"topo -m shows SYS/PHB,\nno direct link available"| Fallback[Falls back to PCIe,\npossibly host-staged: much lower\nbandwidth, higher latency]
```

**Figure 7.3.1 — Host I/O and scale-up communication coexist, and the fabric a given transfer actually uses is a decision, not a guarantee.** PCIe remains essential while NVLink and NVSwitch provide accelerator-oriented peer paths. The decision branch on the right is the check that separates "this workload is using the fast fabric" from "this workload silently fell back to PCIe" — `nvidia-smi topo -m` is the evidence for which branch actually applies to a given GPU pair.

## Why PCIe Alone Can Become Insufficient

PCIe is a tree. Large peer flows may traverse switches, root complexes, and shared upstream links. The path is highly capable, but it is shared with host memory, NICs, and storage.

Communication-heavy AI workloads create several pressures:

- gradients must be reduced across GPUs;
- model partitions exchange activations;
- expert-parallel workloads route tokens between devices;
- inference shards synchronize intermediate state;
- peer copies compete with host and network I/O;
- synchronization amplifies the cost of a slow path.

A general I/O fabric is not necessarily the wrong design. It may be entirely appropriate for independent workloads. The problem appears when application performance depends on repeated, high-volume, low-latency peer exchange.

## What NVLink Is

NVLink is a high-bandwidth interconnect designed for supported NVIDIA GPU and processor communication. The exact endpoint support, link count, aggregate bandwidth, coherency behavior, and topology vary by product generation and platform.

The stable architectural idea is more important than any single generation number:

- create a stronger path between accelerator endpoints;
- reduce dependence on host-mediated peer traffic;
- support larger communication domains;
- expose the path to CUDA and communication libraries.

A direct-link topology may connect selected GPU pairs or groups. In such systems, not every pair is necessarily equivalent.

```mermaid
flowchart LR
    G0[GPU 0] <--> G1[GPU 1]
    G1 <--> G2[GPU 2]
    G2 <--> G3[GPU 3]
    G3 <--> G0
```

**Figure 7.3.2 — Simplified direct-link topology.** Software may need to account for which peers are directly connected and which require multi-hop or alternate paths.

## What NVSwitch Adds

NVSwitch provides a switching layer for NVLink-connected endpoints. Instead of relying only on a sparse graph of direct GPU-to-GPU links, endpoints connect into a switched fabric.

The architectural goal is to improve peer reachability and make more GPU pairs communicate through a strong scale-up path.

```mermaid
flowchart TD
    G0[GPU 0] --> S[NVSwitch Fabric]
    G1[GPU 1] --> S
    G2[GPU 2] --> S
    G3[GPU 3] --> S
    S --> G0
    S --> G1
    S --> G2
    S --> G3
```

**Figure 7.3.3 — Simplified switched scale-up fabric.** The switch fabric creates a more uniform communication domain than a sparse direct-link graph.

A switched fabric introduces its own engineering concerns:

- switch silicon and firmware;
- fabric initialization;
- routing and partitioning behavior;
- telemetry and error handling;
- thermal and power requirements;
- platform-specific service procedures.

## PCIe, Direct NVLink, and NVSwitch

| Characteristic | PCIe | Direct NVLink | NVSwitch Fabric |
|---|---|---|---|
| Primary purpose | General host and device I/O | High-bandwidth peer links | Switched multi-GPU scale-up |
| Topology | Tree | Platform-specific graph | Switched domain |
| Host communication | Native role | Not a replacement for host I/O | Not a replacement for host I/O |
| Peer uniformity | Depends on PCIe hierarchy | Depends on direct links | Usually more uniform within the fabric |
| Operational complexity | Broadly understood | Platform-specific | Higher integration and validation burden |
| Best fit | Independent or moderately communicating devices | Strong peer neighborhoods | Tightly coupled multi-GPU workloads |

No row identifies a universal winner. The workload communication pattern determines whether scale-up fabric creates measurable value.

## Software View

Applications do not usually program raw fabric links. They interact through layers such as:

```mermaid
flowchart TD
    App[Training or Inference Framework]
    Collective[NCCL or Communication Runtime]
    CUDA[CUDA Runtime and Driver]
    Peer[Peer Memory and Copy Mechanisms]
    Fabric[NVLink / NVSwitch / PCIe]

    App --> Collective --> CUDA --> Peer --> Fabric
```

**Figure 7.3.4 — Software consumes the scale-up fabric through runtime and communication layers.** The fastest physical path is useful only when the stack selects and uses it correctly.

### CUDA peer access

CUDA can expose peer memory access between supported devices. The availability and quality of the path depend on the platform topology and software stack.

### NCCL path selection

NCCL discovers topology and constructs communication paths for collective operations. It may use direct peer links, shared memory, PCIe, or network transports depending on the environment.

NCCL debug output is valuable, but it must be interpreted alongside:

- `nvidia-smi topo -m`;
- link and switch telemetry;
- process-to-GPU binding;
- controlled collective benchmarks;
- known-good node baselines.

**A concrete look at NCCL's own path-selection log.** Setting `NCCL_DEBUG=INFO` on an eight-GPU NVSwitch node produces output like this during initialization:

```text
$ NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH python train.py
node0:1234:1234 [0] NCCL INFO NCCL_TOPO_FILE set by environment to /var/run/nvidia-topologyd/virtualTopology.xml
node0:1234:1234 [0] NCCL INFO Topology detection: 8 GPUs, NVSwitch fabric detected
node0:1234:1234 [0] NCCL INFO Channel 00/04: 0 1 2 3 4 5 6 7
node0:1234:1234 [0] NCCL INFO Trees [0] 1/-1/-1->0->-1 [1] 1/-1/-1->0->-1
node0:1234:1234 [0] NCCL INFO Ring 00 : 0[0] -> 1[1] -> 2[2] -> 3[3] -> 4[4] -> 5[5] -> 6[6] -> 7[7] -> 0[0]
node0:1234:1234 [0] NCCL INFO Connected all rings, using NVLS (NVSwitch) algorithm
node0:1234:1234 [0] NCCL INFO 8 coll channels, 0 nvls channels, 8 p2p channels
```

**Reading this:** "NVSwitch fabric detected" and "Connected all rings, using NVLS (NVSwitch) algorithm" together confirm NCCL discovered the switch fabric and selected an algorithm designed to exploit it — this is the log-level equivalent of the diagram's right-hand branch landing on "uses NVLink/NVSwitch." If a link were down or the fabric degraded, the equivalent log would instead report something like `Connected all rings, using PCIe P2P` or, in a fully staged fallback, no peer channels at all and a warning about `NCCL_P2P_DISABLE`. Seeing "PCIe" in this line when the topology matrix and hardware say NVSwitch should be available is the single strongest signal that something — a disabled peer path, an environment variable override, or a driver-level restriction — is forcing a slower path than the hardware supports.

## Internal Working: A Collective on a Scale-Up Fabric

Consider a simplified all-reduce step:

```mermaid
sequenceDiagram
    participant F as Framework
    participant N as NCCL
    participant G0 as GPU 0
    participant S as NVSwitch Fabric
    participant G1 as GPU 1

    F->>N: Launch all-reduce
    N->>G0: Schedule send/receive work
    N->>G1: Schedule send/receive work
    G0->>S: Transmit tensor fragment
    S->>G1: Forward fragment
    G1->>S: Return reduced fragment
    S->>G0: Deliver result
    N-->>F: Signal completion
```

**Figure 7.3.5 — Simplified collective step.** Fabric bandwidth matters, but ordering, synchronization, chunking, and algorithm selection also affect completion time.

The collective may use rings, trees, hierarchical methods, or other algorithms. The best method depends on message size, topology, number of participants, and software version.

## When Scale-Up Fabric Matters

Scale-up fabric is especially relevant when:

- a model does not fit on one GPU;
- tensor or pipeline parallel stages exchange data frequently;
- all-reduce occupies a large fraction of iteration time;
- the workload requires predictable peer latency;
- several GPUs share one large working set;
- intra-node communication must remain faster than scale-out communication.

It may provide limited value when:

- workloads are independent;
- each GPU serves separate requests;
- peer exchange is rare or small;
- the bottleneck is storage, CPU preprocessing, or network ingress;
- scheduler fragmentation prevents workloads from using the full scale-up group.

## Architecture Considerations

### Performance

Measure:

- peer bandwidth by GPU pair;
- collective bandwidth and latency;
- message-size sensitivity;
- simultaneous communication and compute;
- cross-node performance after local aggregation.

**A worked comparison.** A 7-billion-parameter model trained at FP16 has a gradient tensor of roughly `7e9 params × 2 bytes ≈ 14 GB` to all-reduce every step. A ring all-reduce moves roughly `2×(N-1)/N` times the tensor size across the slowest link in the ring, so for 8 GPUs that's about `2 × 7/8 × 14 GB ≈ 24.5 GB` of effective traffic per GPU.

```text
On an NVSwitch fabric at ~180 GB/s achieved busbw: 24.5 GB / 180 GB/s ≈ 136 ms per step
On a PCIe-fallback path at ~13 GB/s achieved (from the shared-uplink case earlier): 24.5 GB / 13 GB/s ≈ 1,885 ms per step
```

That is roughly a 14x difference in the communication portion of every single training step — for a workload where communication is already a meaningful fraction of iteration time, that gap alone can be the difference between a job that scales and one that doesn't. This is also exactly why "the fabric is healthy" and "the workload is fast" are different claims: the arithmetic only pays off if NCCL is actually routing through NVSwitch rather than falling back to the PCIe number.

### Scalability

Scale-up improves the local communication domain but has a finite boundary. Beyond that boundary, scale-out networking becomes responsible. Distributed architectures often use hierarchical collectives that first communicate locally, then across nodes.

### Availability

A degraded link or switch can affect multiple GPUs. Define whether the platform:

- removes one link from service;
- degrades the entire local fabric;
- requires a node reboot;
- quarantines the system;
- exposes health through DCGM, BMC, or platform tooling.

### Reliability

Fabric errors may be intermittent and workload-dependent. A node can pass idle diagnostics but fail during sustained peer traffic. Commissioning should include load-based communication tests.

### Security and isolation

Peer access expands the importance of device isolation and memory protection. Multi-tenant platforms must understand which sharing modes preserve hardware isolation and which expose a shared execution or communication domain.

### Cost and operations

NVSwitch-based systems require more integrated hardware, power, cooling, firmware coordination, and support procedures. The value must be justified by workload communication, not by GPU count alone.

## Production Deployment

A production scale-up baseline should capture:

- GPU UUID and physical position;
- expected peer topology;
- link state and error counters;
- switch inventory and firmware;
- peer-access matrix;
- NCCL topology discovery;
- pairwise bandwidth;
- collective benchmark results;
- thermal and power state during load.

Use the exact platform documentation. Do not transfer topology assumptions or bandwidth numbers from another GPU generation or server model.

## Production Troubleshooting

### Scenario 1 — All-reduce is slow inside one node

**Symptoms**

- compute kernels are healthy;
- communication time dominates;
- multi-node networking is not involved;
- one node is slower than identical peers.

**Diagnosis**

1. Capture `nvidia-smi topo -m`.
2. Check link and switch health.
3. Run pairwise peer tests.
4. Run NCCL tests by message size.
5. Compare firmware and driver inventory.
6. Verify process binding.

**Root causes**

- degraded or disabled link;
- unexpected PCIe fallback;
- firmware mismatch;
- incorrect rank placement;
- thermal or power throttling;
- software path-selection issue.

**Resolution**

Restore the approved hardware and software state, validate the fabric, and rerun both microbenchmarks and the application.

**Worked evidence for this scenario.** Pair an `nccl-tests` all-reduce run against the NCCL debug log shown earlier:

```text
$ ./build/all_reduce_perf -b 8M -e 512M -f 2 -g 8
#         size    time    algbw    busbw
#        bytes      us    GB/s     GB/s
       8388608    412.3   20.35    35.62
      16777216    698.1   24.03    42.06
      33554432   1301.4   25.79    45.13
     536870912  19844.2   27.05    47.34
```

On a healthy eight-GPU NVSwitch node, `busbw` (bus bandwidth — the algorithm-adjusted figure that's comparable across message sizes) should climb toward a plateau in the tens of GB/s as message size grows, since NVSwitch fabrics are built for exactly this collective pattern. If this same run on the slow node instead plateaus at roughly a third of that — say ~15 GB/s busbw — while the NCCL log shows `Connected all rings, using PCIe P2P` instead of `using NVLS (NVSwitch) algorithm`, that combination is conclusive: the fabric itself, not the collective algorithm or the workload, is the reason communication time dominates. The fix is to find why NCCL fell back (disabled link, `NCCL_P2P_DISABLE` set, degraded switch) rather than to tune the collective further.

### Scenario 2 — One GPU pair is slower than the others

**Symptoms**

- asymmetric pairwise bandwidth;
- topology matrix differs from the expected design;
- collectives become sensitive to rank order.

**Root cause**

The pair uses a weaker or multi-hop path, or a direct link is unavailable.

**Resolution**

Correct hardware or firmware issues, or adjust rank placement when the topology is intentionally asymmetric.

**Worked evidence for this scenario.** A pairwise bandwidth sweep across all eight GPUs surfaces the asymmetry directly, and it is worth reading as a full matrix rather than one number at a time:

```text
$ ./p2pBandwidthLatencyTest
   D\D     0      1      2      3      4      5      6      7
     0      -   184.2  181.9  183.5   11.2  180.8  182.1  183.9
     1  184.5      -   183.1  182.7  182.9   11.4  181.6  182.4
     2  182.0  183.6      -   184.1  181.5  182.2   11.1  183.0
     ...
```

(Units: GB/s, illustrative for an NVLink-generation figure.) Every pair reads roughly ~182–184 GB/s except GPU0-GPU4, which reads ~11 GB/s — an order of magnitude lower, and close to what an indirect or PCIe-fallback path would deliver rather than a direct NVLink connection. That single outlier cell is the evidence: cross-check it against `nvidia-smi topo -m` for that specific pair (expect `SYS` or a downgraded NVLink class where every other pair shows the fabric's normal class), then correlate with link-error counters for GPU0 and GPU4 specifically rather than the whole node — the other twelve-plus pairs already prove the fabric as a whole is healthy.

### Scenario 3 — NVLink is healthy, but the application does not improve

**Symptoms**

- fabric diagnostics pass;
- peer benchmark is strong;
- application scaling remains weak.

**Likely causes**

- workload has little peer communication;
- synchronization or imbalance dominates;
- communication is too small to amortize overhead;
- storage or CPU feeding limits the pipeline;
- application is not using the intended communication path.

**Production advice**

Do not assume a high-bandwidth fabric will improve an application that is not communication-bound.

## Customer Scenario

A customer wants to standardize on one eight-GPU node type for both independent inference and model-parallel training.

The architect presents two options:

1. a lower-cost design optimized for independent GPU use;
2. an integrated scale-up design optimized for tightly coupled workloads.

The decision is made from measured communication patterns:

- percentage of time in collectives;
- required model partitioning;
- peer message sizes;
- service-latency objectives;
- scheduler ability to allocate complete GPU groups;
- cost of idle scale-up capacity for independent workloads.

The final recommendation may use separate node pools. Standardization is valuable, but not when it forces every workload to pay for an interconnect it does not use.

## Interview Preparation

### Knowledge Questions

1. Why does NVLink exist when PCIe already connects GPUs?

   > "Because PCIe is a general-purpose tree shared by every device class — GPUs, NICs, storage — and communication-heavy GPU workloads need something purpose-built. NVLink gives GPUs a dedicated high-bandwidth path so gradient exchange, activation handoff, and peer copies don't have to compete with host I/O and don't have to route through a switch topology designed for interoperability rather than raw GPU-to-GPU throughput."

2. What problem does NVSwitch solve beyond direct NVLink connections?

   > "Direct NVLink connections form a sparse graph — not every GPU pair necessarily has a direct link, so some pairs would need multiple hops. NVSwitch turns that sparse graph into a switched fabric so more, and often all, GPU pairs get a uniformly strong path, instead of software having to reason about which pairs are directly connected and which aren't."

3. Does NVLink replace PCIe?

   > "No — it's additive, not a replacement. PCIe still handles device discovery, control, host memory access, NIC and storage traffic. NVLink only carries GPU-to-GPU and, on some platforms, CPU-to-GPU traffic. A node has both fabrics doing different jobs at the same time."

4. Why can a healthy NVLink fabric still produce poor application scaling?

   > "Because the fabric being healthy only proves the pipe is good — it doesn't mean the workload is using it, or that communication is even the bottleneck. If the workload barely communicates between GPUs, or if synchronization overhead and load imbalance dominate, or if the application never issues large enough transfers to amortize per-message overhead, a fast fabric sitting mostly idle won't move the needle. I'd never conclude 'the fabric is fine, so it must be scaling well' — I'd check the collective's actual bandwidth achieved, not just link health."

### Architecture Questions

1. Compare an eight-GPU PCIe node with an eight-GPU NVSwitch node.

   > "Same GPU count, very different communication cost profile. On the PCIe-only node, peer traffic shares the general I/O tree with NICs and storage, and pairwise bandwidth depends on how many switches and root complexes sit between two GPUs. On the NVSwitch node, GPU-to-GPU traffic gets a dedicated, largely uniform high-bandwidth path regardless of which two GPUs are talking. For eight independent inference replicas that barely exchange data, that difference might not matter. For a model-parallel training job doing all-reduce every step, it's the difference between communication being a rounding error and communication dominating iteration time."

2. Draw a hierarchical collective using scale-up inside nodes and scale-out between nodes.

   > "I'd draw each node's eight GPUs as one box, reducing locally across NVSwitch first — that's the cheap, high-bandwidth step. Then one representative value per node crosses the inter-node fabric to do the second-level reduction across nodes — that's the expensive, lower-bandwidth step, so I want to do it once per node, not once per GPU. The whole point of hierarchical collectives is doing as much reduction as possible on the fast local fabric before ever touching the slower network."

3. Explain the failure domain introduced by a switched scale-up fabric.

   > "A degraded or failed switch component can affect every GPU connected through it, not just one link like a point-to-point failure would. That's a real operational trade-off: NVSwitch gives you a more uniform fabric, but it also concentrates risk — I'd want DCGM or platform-level telemetry watching switch health specifically, and I'd want to know from the vendor whether a degraded link takes down the whole local fabric or just isolates itself."

### Scenario Questions

1. One GPU pair has lower bandwidth than all others. What evidence do you collect?

   > "A full pairwise bandwidth matrix across every GPU, not just the suspect pair — that's what tells me whether this is an isolated outlier or a systemic problem. If I see one cell at roughly a tenth of every other cell's value, I'd cross-check that exact pair against `nvidia-smi topo -m` for its link class and pull link-error counters for just those two GPUs."

2. NCCL appears to use PCIe instead of the expected peer path. What could cause this?

   > "I'd check the NCCL init log for the actual algorithm and path it selected — I've seen this be a disabled peer link, an environment variable like `NCCL_P2P_DISABLE` set somewhere in the launch environment, or a genuine hardware fault. Before touching any hardware, I'd confirm the topology matrix agrees the fabric should be available for that pair — if the hardware path exists but NCCL isn't using it, that's a software/environment problem, not a fabric problem."

3. A customer runs independent inference replicas. How do you determine whether NVSwitch is worth the cost?

   > "I'd measure how much data actually crosses between GPUs for this workload — for independent replicas, that number is often close to zero, since each replica owns its own model copy and serves its own requests. If peer traffic is negligible, NVSwitch is paying for bandwidth this workload structurally can't use, and I'd recommend the lower-cost PCIe-only design instead."

### Customer Questions

1. Why should a customer buy a scale-up platform?

   > "When their workload's iteration time is genuinely dominated by GPU-to-GPU communication — tensor-parallel training, frequent all-reduce, models sharded across many devices. I'd want to see that measured, not assumed, before recommending the higher cost."

2. When should they not buy one?

   > "When workloads are independent — separate inference replicas, embarrassingly parallel batch jobs — or when peer communication is small relative to compute time. In that case they'd be paying for bandwidth capacity the workload structurally can't use."

3. How would you prove the benefit before procurement?

   > "I'd run the customer's actual training or inference job, not a synthetic benchmark, and measure what fraction of iteration time is spent in communication versus compute. If communication is a small single-digit percentage, NVSwitch has little to improve. If it's a large fraction, I'd show the collective bandwidth achieved on PCIe versus what NVSwitch documentation and reference numbers suggest, and let that comparison make the case."

### Whiteboard Question

Draw an eight-GPU node and show the roles of PCIe, NVLink, NVSwitch, NICs, and storage. Explain which fabric handles each traffic class.

> "I'd draw the eight GPUs in a ring connected to a central NVSwitch box — that's the GPU-to-GPU peer traffic, the collectives, the tensor exchange. Then I'd draw PCIe as the tree connecting the CPU to all eight GPUs individually, plus the NICs and storage controllers — that's device discovery, control, host memory access, and anything entering or leaving the node over the network or from disk. The key point I'd make out loud: these two fabrics carry different traffic classes at the same time, and a bottleneck in one doesn't imply a bottleneck in the other — I'd check them independently, not assume one health check covers both."

## Summary

NVLink provides accelerator-oriented peer links. NVSwitch turns those links into a switched scale-up fabric. Together, they can reduce dependence on host-oriented PCIe paths for communication-heavy workloads.

They do not replace PCIe, eliminate synchronization, or guarantee scaling. Their value appears when the workload performs enough peer communication for the stronger local fabric to matter.

## Key Takeaways

- PCIe and NVLink solve different communication problems.
- NVSwitch creates a more uniform multi-GPU scale-up domain.
- Software topology discovery and placement must align with hardware.
- Scale-up fabric should be justified by workload communication.
- Commissioning must validate both telemetry and sustained collective behavior.

## Quick Revision Sheet

| Concept | Remember |
|---|---|
| NVLink | High-bandwidth supported endpoint interconnect |
| NVSwitch | Switching layer for a larger NVLink scale-up domain |
| Scale-up | Communication inside a tightly integrated system |
| Scale-out | Communication between systems or racks |
| Peer access | Software-visible ability to access peer memory |
| Collective | Coordinated communication among multiple ranks |

## Lab Checklist

Before moving on, confirm that you can:

- interpret `nvidia-smi topo -m`;
- describe the expected peer topology;
- compare pairwise and collective benchmarks;
- explain why a fabric can be healthy while an application is slow;
- identify when a PCIe-only design is sufficient.

## Cross References

- Previous: [PCIe, NUMA, and Host Data Paths](./chapter-02-pcie-numa-and-host-data-paths)
- Next: [DMA, RDMA, and Peer-to-Peer](./chapter-04-dma-rdma-and-peer-to-peer)
- Related hardware: [HGX Topology and Data Paths](../volume-06/chapter-04-hgx-topology-and-data-paths)
- Related lab: [Validate Peer Access and NVLink](./labs/lab-02-validate-peer-access-and-nvlink)

## Further Reading

Use the current NVIDIA documentation for the exact GPU and platform generation. Link counts, aggregate bandwidth, topology, switch design, and service procedures are platform-specific.