---
title: HGX Networking, Storage, and Cluster Integration
description: Learn how to integrate HGX-based servers into production compute, storage, management, and orchestration fabrics.
sidebar_position: 7
tags:
  - hgx
  - networking
  - storage
  - cluster-design
  - rdma
---

# HGX Networking, Storage, and Cluster Integration

An HGX-based server can be internally well designed and still fail as a cluster building block. The reason is simple: the HGX platform defines the accelerated compute domain, while the OEM system and customer architecture determine how that domain reaches storage, peer nodes, management services, and applications.

Cluster integration must therefore validate the complete path from a GPU process to every external dependency. A topology drawing that stops at the server boundary is not enough.

| Chapter field | Value |
|---|---|
| Difficulty | Advanced |
| Estimated reading time | 40–50 minutes |
| Prerequisites | Chapters 01–05 |
| Primary outcome | Design HGX nodes as repeatable, supportable cluster units |

## Learning Objectives

After completing this chapter, you will be able to:

- define the external networks required by an HGX-based server;
- align GPU, NIC, CPU, and storage topology;
- explain how OEM variation affects cluster standardization;
- build a layered acceptance plan for scale-out communication and data access;
- identify support boundaries during multi-vendor incidents.

## The HGX Node as a Cluster Unit

```mermaid
flowchart LR
    Users[Users and APIs] -->|"evidence: service reachable,<br/>auth/routing healthy"| HGX[HGX-Based Server]
    Control[Management and Orchestration] -->|"evidence: kubectl describe node —<br/>nvidia.com/gpu allocatable matches inventory"| HGX
    HGX -->|"evidence: fio / dataset read test<br/>meets workload throughput target"| Storage[Storage Fabric]
    HGX -->|"evidence: nvidia-smi topo -m — compute<br/>NIC at PIX to its GPU group"| Compute[Scale-Out Compute Fabric]
    Compute -->|"evidence: NCCL all-reduce bandwidth<br/>matches healthy-node baseline"| Peers[Peer HGX Nodes]

    Gate{"Does every path clear its<br/>acceptance threshold?"}
    Storage --> Gate
    Peers --> Gate
    Gate -->|"NO — one path underperforms"| Isolate["Isolate to that path's layer<br/>(this node vs. shared fabric) before<br/>touching anything else"]
    Gate -->|"YES"| ClusterReady["Node accepted into<br/>the scheduling pool"]
```

**Figure 6.6.1 — HGX becomes useful at cluster scale only through external integration.** Management, storage, application, and compute traffic have different objectives and failure modes; each arrow names the check that proves that specific path is healthy, and the diagram ends at the actual admission decision — a node does not join the pool on "it's the same HGX generation," it joins after every external path clears its own threshold.

## Network Roles

| Network role | Purpose | Design priority |
|---|---|---|
| Out-of-band management | BMC, firmware, remote recovery | Isolation, availability, security |
| Host management | Provisioning, monitoring, orchestration | Reachability, automation, policy |
| Application | User and service traffic | Availability, segmentation, load balancing |
| Storage | Dataset and checkpoint movement | Throughput, burst handling, locality |
| Compute | Distributed collectives and GPU-to-GPU traffic | Latency, bandwidth, congestion control, topology |

These roles may share physical infrastructure in some architectures, but they should never be treated as indistinguishable traffic.

## GPU-to-NIC Locality

An HGX server may include several high-speed adapters. Their relationship to CPU sockets, PCIe switches, and the GPU fabric determines the cost of moving data off-node.

```mermaid
flowchart TD
    GPUGroupA[GPU Group or Scale-Up Domain]
    CPUA[CPU Socket A]
    NICA[Compute NIC A]
    GPUB[GPU Group or Scale-Up Domain]
    CPUB[CPU Socket B]
    NICB[Compute NIC B]

    GPUGroupA <--> CPUA <--> NICA
    GPUB <--> CPUB <--> NICB
```

**Figure 6.6.2 — Adapter placement should align with the server topology.** The actual path depends on the OEM design and must be verified from current platform documentation and runtime discovery.

The scheduler and distributed runtime must preserve this locality. A job can receive the correct number of GPUs and still perform poorly if ranks use remote adapters or cross CPU sockets unnecessarily.

## Storage Integration

HGX clusters often combine:

- local NVMe for scratch and caching;
- shared high-performance filesystems for active datasets;
- object storage for durable datasets and artifacts;
- checkpoint repositories for recovery;
- metadata and control services.

Storage validation must include the actual application access pattern. Large sequential reads, small-file metadata storms, shuffled training data, and synchronized checkpoint writes stress different components.

## OEM Variation and Cluster Standardization

Two systems may both use the same HGX platform while differing in:

- CPU architecture and count;
- memory capacity and channels;
- NIC model, count, and placement;
- local storage layout;
- firmware and BMC implementation;
- cooling method;
- chassis dimensions;
- supported software and lifecycle policy.

For a production cluster, standardize the full bill of materials and firmware baseline. Treat mixed server designs as separate node classes unless validated evidence proves they can share the same workload and operational policy.

## Orchestration and Kubernetes

A Kubernetes-based HGX cluster must expose more than generic GPU count. Scheduling may need to consider:

- GPU topology and partitioning;
- RDMA or DPU resources;
- local storage availability;
- NUMA alignment;
- firmware and driver class;
- cooling or power domain;
- tenant isolation;
- maintenance state.

Node labels, device plugins, runtime classes, admission policies, and topology-aware scheduling should reflect the physical design. Otherwise the abstraction hides constraints that still affect performance.

A quick sanity check most teams skip: confirm the node's advertised capacity actually matches physical inventory before trusting the scheduler's placement decisions.
```text
$ kubectl describe node hgx-node-14 | grep -A6 "Allocatable:"
Allocatable:
  cpu:                 126
  memory:              2050702416Ki
  nvidia.com/gpu:      8
  rdma/roce_gdr:       8
  pods:                110

$ kubectl get node hgx-node-14 --show-labels | tr ',' '\n' | grep -E 'nvidia.com|topology'
nvidia.com/gpu.product=NVIDIA-H100-80GB-HBM3
nvidia.com/gpu.count=8
nvidia.com/gpu.replicas=1
topology.kubernetes.io/zone=rack-14
```
`nvidia.com/gpu: 8` matching the physical GPU count is necessary but not sufficient — it proves the device plugin discovered the GPUs, not that their NIC or NUMA locality is exposed to the scheduler. If `rdma/roce_gdr` shows `0` while the node genuinely has 8 RDMA-capable NICs, that is a device-plugin or CDI configuration gap, and any job scheduled onto this node will silently fall back to a slower host-staged path with no error — exactly the kind of failure the "Orchestration and Kubernetes" bullet list above is warning about.

## Layered Acceptance

1. Verify hardware inventory and firmware baseline.
2. Verify local GPU topology and peer paths.
3. Verify NIC link state, PCIe health, and NUMA mapping.
4. Verify point-to-point host networking.
5. Verify RDMA or accelerated data paths where required.
6. Verify local and shared storage behavior.
7. Verify multi-GPU collectives inside one node.
8. Verify collectives across nodes.
9. Verify the representative application.
10. Test failure, drain, replacement, and rejoin procedures.

This order reduces the fault domain at each step.

## Observability

| Layer | Evidence |
|---|---|
| HGX compute | GPU health, fabric state, memory, power, thermals |
| Host | CPU, NUMA, PCIe, memory pressure, kernel logs |
| Adapter | link, throughput, errors, retries, congestion |
| Switch | port health, utilization, path balance, congestion |
| Storage | latency, throughput, metadata, errors, queue depth |
| Orchestrator | placement, device allocation, evictions, topology decisions |
| Application | step time, queue delay, communication fraction, checkpoint time |

## Production Troubleshooting

### Problem — One node consistently reduces collective performance

**Symptoms**

- cluster benchmark is stable until one node joins;
- the slow node passes basic GPU tests;
- one rail or adapter carries less traffic;
- communication time increases for all ranks.

**Diagnosis**

Compare the node's firmware, BIOS, driver, NIC firmware, PCIe negotiated state, topology map, interface configuration, cable path, and switch counters against a healthy node. Confirm that the job uses the intended adapters.

**Root cause examples, with evidence**

- **Down-trained PCIe link.** A NIC or GPU negotiated a narrower or slower link than its rated spec:
  ```text
  $ lspci -vv -s 65:00.0 | grep -E 'LnkCap|LnkSta'
  LnkCap: Port #0, Speed 32GT/s, Width x16
  LnkSta: Speed 16GT/s (downgraded), Width x16
  ```
  `LnkCap` (capability, what the slot supports) says Gen5 x16; `LnkSta` (current negotiated state) shows it actually linked at Gen4 speed — half the expected bandwidth on that device, with no explicit error anywhere else in the stack. This is a common, silent cause of "one rail carries less traffic."

- **Container missing one RDMA device.** The job reports 8 GPUs but only 7 working RDMA paths:
  ```text
  $ kubectl exec -it training-pod-7 -- ls /dev/infiniband/
  uverbs0  uverbs1  uverbs2  uverbs3  uverbs4  uverbs5  uverbs6
  ```
  Seven `uverbs` devices instead of the expected eight means one RDMA NIC was never injected into this container — check the device plugin allocation and CDI spec for that pod, not the physical NIC or cable, since the host-level `ibdev2netdev` for this node may show all eight adapters `Up`.

- **Switch counters confirming a marginal cable/port** rather than a host-side issue:
  ```text
  $ show interface ethernet 1/14 counters | grep -E 'CRC|input errors'
  CRC Errors: 48213
  Input Errors: 48213
  ```
  A nonzero, climbing CRC error count on the specific switch port this node's compute NIC lands on is definitive evidence of a physical-layer problem (cable, transceiver, or port) — this is the difference between "reconfigure the host" and "replace the cable," and checking it early avoids a wasted firmware re-flash.

**Resolution**

Remove the node from service, correct the differing layer, repeat point-to-point and collective acceptance, then return it to the scheduler.

**Prevention**

Use immutable baselines, automated drift detection, and node qualification gates.

## Support Boundaries

During a cluster incident, responsibility may span:

- NVIDIA GPU and platform software;
- OEM server firmware and chassis integration;
- NIC and switch components;
- storage vendor;
- operating system and orchestrator;
- application framework.

The incident record should preserve exact versions, topology, logs, reproduction steps, and the first failing layer. Evidence is what allows vendors to collaborate without repeatedly redirecting the case.

## Customer Scenario

A customer wants to combine two HGX server models in one training pool because both contain the same GPU generation. The architect should compare CPU, NIC, memory, firmware, cooling, and topology—not only GPUs. The safest initial design is separate node classes with explicit scheduling and benchmark evidence. Consolidation can follow only after equivalent behavior is demonstrated.

## Interview Preparation

### Architecture question

**Why is the HGX baseboard not enough information to design a cluster?**

"Because a cluster is defined by everything outside the box as much as by what's inside it. Two nodes can have an identical HGX baseboard and still fail to behave as interchangeable cluster units if their NIC placement, firmware bundle, or storage path differs — I'd check `nvidia-smi topo -m` for NIC-to-GPU locality and `kubectl describe node` for whether the scheduler even sees the RDMA devices, because a device the scheduler can't see is a device that job silently won't use. The baseboard tells you the accelerator generation matches; it tells you nothing about whether the node will actually perform the same as its neighbors under a real distributed job."

### Troubleshooting question

**One HGX node slows an otherwise healthy cluster. What is your method?**

"First I quarantine it — pull it from the scheduler so it stops dragging down other jobs' collectives while I work. Then I compare it layer by layer against a known-good node: PCIe link state with `lspci -vv`, because a down-trained link is silent and easy to miss; RDMA device count inside the container with `ls /dev/infiniband/`, because a device plugin can advertise 8 GPUs while only injecting 7 working RDMA paths; and switch-side CRC/error counters on that node's port, because a climbing CRC count is definitive proof of a physical-layer problem versus a host configuration issue. Whichever of those three diverges from the healthy node first is where I stop and fix, then I rerun point-to-point and collective acceptance before letting it back into the pool."

### Customer question

**Can different HGX server vendors share one node pool?**

"Only after they've proven equivalent, not because the spec sheets match. My default recommendation is separate node classes at first — different labels, different scheduling pools — with a shared acceptance bar: matching `nvidia-smi topo -m` output, the same collective-bandwidth benchmark within an agreed tolerance, and a sustained thermal soak. Once both vendors' nodes clear that bar with comparable numbers, I'd consider merging them into one pool, but I'd keep the node-class label around so we can still attribute a regression to a specific vendor's hardware if one shows up later."

## Key Takeaways

- HGX is the accelerated core of a larger OEM and cluster architecture.
- GPU-to-NIC locality and external fabric design determine scale-out efficiency.
- Storage must be validated with the real access pattern.
- Standardization applies to the complete server bill of materials.
- Layered acceptance and drift detection make heterogeneous incidents manageable.

## Cross References

- [OEM Integration and Support Boundaries](./chapter-03-oem-integration-and-support-boundaries)
- [HGX Topology and Data Paths](./chapter-04-hgx-topology-and-data-paths)
- [HGX Power, Cooling, and Rack Integration](./chapter-05-hgx-power-cooling-and-rack-integration)
- [Lab 02 — Review an HGX Rack Design](./labs/lab-02-review-an-hgx-rack-design)
