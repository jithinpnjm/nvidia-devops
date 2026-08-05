---
title: Lab 04 — Build a Topology-Aware GPU Placement Plan
description: Inspect GPU, CPU, NUMA, and NIC relationships and convert the evidence into a production placement policy.
sidebar_position: 4
tags:
  - lab
  - topology
  - numa
  - gpu-scheduling
---

# Lab 04 — Build a Topology-Aware GPU Placement Plan

## Lab Metadata

| Field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Intermediate |
| Estimated time | 90–120 minutes |
| Lab level | L3 — Configuration and design |
| Target platform | Linux host with one or more NVIDIA GPUs |
| Primary tools | `nvidia-smi`, `lspci`, `numactl`, `/sys`, optional `hwloc` |

## 1. Objective

Inspect the physical relationships among GPUs, CPU NUMA nodes, PCIe paths, and network adapters, then produce a placement policy for single-GPU, multi-GPU, and distributed workloads.

The lab does not change firmware or move hardware. It turns existing topology evidence into an operational design that a scheduler or platform team can implement.

## 2. Background

A resource request such as “two GPUs” describes capacity but not locality. On a multi-socket host, the selected GPUs may be close to each other, attached to different CPU sockets, or far from the network adapter used for distributed communication.

Topology-aware placement improves predictability by aligning:

- communicating GPUs
- CPU workers
- host memory
- network adapters
- workload type

The objective is not to force every job onto the fastest path. It is to reserve strong paths for workloads that benefit from them and preserve scheduling flexibility for workloads that do not.

## 3. Learning Outcomes

After completing this lab, you will be able to:

- create a stable GPU inventory using UUIDs and PCI addresses
- map each GPU and NIC to a NUMA node
- interpret the GPU topology matrix
- classify strong and weak GPU pairs
- identify GPU-to-NIC affinity
- define placement rules for different workload profiles
- recognize topology drift after hardware or firmware changes

## 4. Architecture

```mermaid
flowchart TD
    Scheduler[Scheduler or Placement Policy]
    CPU0[NUMA Node 0]
    CPU1[NUMA Node 1]
    GPU0[GPU 0]
    GPU1[GPU 1]
    GPU2[GPU 2]
    GPU3[GPU 3]
    NIC0[NIC 0]
    NIC1[NIC 1]

    Scheduler --> CPU0
    Scheduler --> CPU1
    CPU0 --> GPU0
    CPU0 --> GPU1
    CPU0 --> NIC0
    CPU1 --> GPU2
    CPU1 --> GPU3
    CPU1 --> NIC1
    GPU0 <--> GPU1
    GPU2 <--> GPU3
```

**Figure 2.L4.1 — Placement policy over physical topology.** The scheduler should select GPU, CPU, memory, and NIC resources as one locality-aware group.

## 5. Prerequisites

### Hardware

- One or more NVIDIA GPUs
- Multi-GPU or multi-NUMA host preferred
- A high-speed NIC is helpful but not mandatory

### Software

```bash
nvidia-smi
lspci
numactl
```

Optional tools:

```bash
lstopo
hwloc-ls
```

### Permissions

Read access to `/sys` is normally sufficient. Detailed PCI information may require `sudo`.

## 6. Environment

Record the host before analysis.

```bash
hostname
cat /etc/os-release
uname -r
nvidia-smi --query-gpu=driver_version --format=csv,noheader | sort -u
```

Record the date, server model, firmware baseline, and driver version in your lab notes.

## 7. Components

| Component | Role in placement |
|---|---|
| GPU UUID | Stable workload and inventory identity |
| PCI bus address | Connects GPU identity to Linux topology |
| NUMA node | Identifies nearby CPU and host memory |
| PCIe root and switch | Defines host and peer communication path |
| Direct GPU link | Provides an accelerator-specific peer path where present |
| NIC | Carries distributed workload traffic |
| CPU affinity | Controls where host threads execute |
| Memory policy | Controls where host buffers are allocated |

## 8. Deployment Steps

This is a design lab. “Deployment” means collecting evidence and producing a policy artifact.

### Step 1 — Build the Stable GPU Inventory

#### Purpose

Map logical indices to stable UUIDs and PCI addresses.

#### Command

```bash
nvidia-smi --query-gpu=index,name,uuid,pci.bus_id,memory.total --format=csv
```

#### Expected Output

```text
index, name, uuid, pci.bus_id, memory.total [MiB]
0, NVIDIA ..., GPU-..., 00000000:31:00.0, ... MiB
```

#### Explanation

Use UUIDs for durable identity. Use the PCI bus address to join NVIDIA data with Linux topology data.

### Step 2 — Record the GPU Topology Matrix

#### Purpose

Identify GPU-to-GPU path classes and CPU affinity.

#### Command

```bash
nvidia-smi topo -m
```

#### Expected Output

A matrix of GPU and NIC relationships, plus CPU and NUMA affinity where supported.

#### Interpretation

Read the legend printed by your installed version. Do not copy path meanings from another system without checking the local output.

Create a table like this:

| Pair | Path label | Same NUMA node? | Direct peer path? | Placement class |
|---|---|---:|---:|---|
| GPU 0 ↔ GPU 1 | host-specific | Yes | Yes/No | Preferred |
| GPU 0 ↔ GPU 2 | host-specific | No | Yes/No | Avoid for communication-heavy jobs |

### Step 3 — Map Every GPU to a NUMA Node

#### Purpose

Verify Linux's device locality.

#### Command

```bash
for bdf in $(nvidia-smi --query-gpu=pci.bus_id --format=csv,noheader | sed 's/^00000000:/0000:/'); do
  printf "%s NUMA=" "$bdf"
  cat "/sys/bus/pci/devices/$bdf/numa_node"
done
```

#### Expected Output

One NUMA value per GPU. A value of `-1` means Linux does not expose a specific association.

#### Common Errors

If the sysfs path is missing, compare domain formatting between `nvidia-smi` and `lspci -D`.

### Step 4 — Map Network Adapters to NUMA Nodes

#### Purpose

Identify which NIC should serve each GPU group.

#### Commands

```bash
lspci -Dnn | grep -iE 'ethernet|infiniband|network'
```

For each NIC PCI address:

```bash
NIC_BDF="0000:41:00.0"
cat "/sys/bus/pci/devices/$NIC_BDF/numa_node"
```

#### Expected Output

A NUMA node for each adapter, or `-1` when locality is not exposed.

### Step 5 — Inspect CPU and Memory Layout

#### Purpose

Identify CPUs and memory local to each device group.

#### Command

```bash
numactl --hardware
```

#### Expected Output

NUMA nodes, CPU lists, memory capacity, and distance values.

Create a placement record:

| NUMA node | CPUs | GPUs | NICs | Preferred workload |
|---|---|---|---|---|
| 0 | host-specific | GPU 0, GPU 1 | NIC 0 | distributed rank group A |
| 1 | host-specific | GPU 2, GPU 3 | NIC 1 | distributed rank group B |

### Step 6 — Inspect PCIe Link State

#### Purpose

Confirm that devices negotiate expected link width and speed.

#### Command

```bash
GPU_BDF="0000:31:00.0"
sudo lspci -s "$GPU_BDF" -vv | grep -E 'LnkCap:|LnkSta:'
```

#### Interpretation

Compare capability and negotiated state with the approved server design. A lower negotiated state requires context: power management, idle state, platform wiring, firmware, or a fault may explain it.

### Step 7 — Classify Workload Profiles

Create at least three profiles.

#### Profile A — Single-GPU inference

Priorities:

- sufficient GPU memory
- CPU locality
- request-path latency
- optional NIC locality

Strict GPU-to-GPU locality is not required.

#### Profile B — Multi-GPU training inside one node

Priorities:

- strongest GPU peer group
- balanced topology
- sufficient CPU and memory locality
- avoidance of fragmented allocation

#### Profile C — Distributed multi-node training

Priorities:

- strong local GPU group
- nearby high-speed NIC
- rank-to-device consistency
- collective communication path

### Step 8 — Write the Placement Policy

Use this structure:

```yaml
placement_profiles:
  single_gpu_inference:
    require_same_numa_cpu: true
    require_peer_group: false
    prefer_local_nic: true

  multi_gpu_training:
    require_same_peer_group: true
    require_balanced_gpu_count: true
    require_local_cpu_memory: true

  distributed_training:
    require_same_peer_group: true
    require_local_high_speed_nic: true
    require_rank_device_mapping: true
```

This is a conceptual policy, not a vendor-specific scheduler schema. Adapt it to Kubernetes, Slurm, or another platform later.

## 9. Validation

Validate that every rule is supported by evidence.

- Each GPU must map to a UUID and PCI address.
- Each device should have a recorded NUMA relationship or an explicit unknown state.
- Preferred GPU groups must come from the topology matrix.
- NIC affinity must be based on PCI and NUMA evidence.
- The policy must distinguish workload profiles.

## 10. Verification

Use CPU binding to verify that a test process can be placed near a selected GPU.

```bash
numactl --cpunodebind=0 --membind=0 bash -c 'taskset -pc $$; numactl --show'
```

Expected output should show CPU and memory policy aligned with the selected NUMA node.

Do not run production workloads under a new binding policy until it has been tested in a maintenance or staging environment.

## 11. Observability

Topology itself changes rarely, but the effective path can degrade.

Monitor or periodically verify:

- GPU inventory and UUIDs
- PCIe negotiated state
- topology matrix
- peer-link health
- NUMA mappings
- NIC inventory
- XID and PCIe errors
- workload placement decisions
- collective or peer bandwidth baselines

Useful commands:

```bash
nvidia-smi topo -m
nvidia-smi -q
journalctl -k | grep -iE 'nvrm|xid|pcie|aer'
```

## 12. Performance Measurements

This lab focuses on placement design, but collect a baseline where safe.

Possible measurements include:

- host-to-device copy bandwidth for local and remote NUMA binding
- peer copy bandwidth between selected GPU pairs
- collective performance for preferred and non-preferred groups
- GPU-to-NIC throughput for local and remote combinations

Do not invent expected numbers. Compare paths on the same host and retain the exact test configuration.

## 13. Failure Injection

### Failure Scenario — Deliberately Poor Placement Plan

Create a paper design that assigns:

- a GPU on NUMA node 0
- CPU workers on NUMA node 1
- a NIC on NUMA node 1
- a peer GPU across the weakest available path

Predict:

1. which data crosses socket boundaries
2. where contention may appear
3. which metrics would change
4. which workload types would be most affected
5. how the scheduler should prevent the placement

This is a non-disruptive failure exercise.

## 14. Troubleshooting

### Problem — Topology matrix changes after maintenance

**Symptoms**

- GPU indices changed
- path labels differ
- CPU affinity changed

**Diagnosis**

Compare UUID-to-PCI mappings, firmware settings, BIOS configuration, slot population, and device replacement records.

**Root cause**

Enumeration changed, hardware moved, or firmware altered the exposed topology.

**Resolution**

Rebuild the inventory using stable identifiers and update the placement policy only after validating the physical design.

### Problem — Preferred GPU group performs poorly

Check:

- negotiated PCIe state
- peer-link health
- CPU and memory binding
- NIC selection
- concurrent traffic
- application communication pattern

### Problem — Scheduler cannot satisfy strict placement

The policy may be too restrictive for the available free resources. Decide whether to queue the job, relax locality for that workload, or reserve topology groups through capacity planning.

## 15. Cleanup

Unset temporary variables:

```bash
unset GPU_BDF NIC_BDF
```

Remove temporary inventory files only after saving the final topology report and placement policy in the appropriate repository or configuration-management system.

## 16. Summary

You converted hardware topology into an operational placement policy. The lab demonstrated that GPU allocation should consider CPU, memory, peer, and network locality rather than device count alone.

The resulting policy becomes an input to future Kubernetes, Slurm, and distributed-training chapters.

## 17. Challenge Exercises

1. Generate the GPU and NIC NUMA inventory automatically as JSON.
2. Compare local and remote NUMA host-to-device transfer performance.
3. Create Kubernetes node labels representing approved GPU peer groups.
4. Design a Slurm topology or generic-resource policy for the same host.
5. Detect topology drift automatically during node commissioning.
6. Add a policy for latency-sensitive inference and explain why it differs from training.

## 18. Further Reading

- [GPU Topology, Peer Access, and Data Paths](../chapter-10-gpu-topology-peer-access-and-data-paths)
- [Building a GPU Performance Model](../chapter-11-building-a-gpu-performance-model)
- [Volume 02 Architecture Summary](../chapter-12-volume-02-architecture-summary)
- [Lab 01 — Inspect GPU Architecture and Topology](./lab-01-inspect-gpu-architecture-and-topology)
