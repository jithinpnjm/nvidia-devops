---
title: Lab 01 — Inspect GPU Architecture and Topology
description: Inspect a GPU host, identify device architecture, map PCIe and NUMA locality, and distinguish visibility from effective placement.
sidebar_position: 1
tags:
  - lab
  - nvidia-smi
  - gpu-topology
  - numa
---

# Lab 01 — Inspect GPU Architecture and Topology

## Lab Metadata

| Field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Beginner |
| Estimated time | 60–90 minutes |
| Lab level | L1 — Exploration |
| Target platform | Linux host with one or more NVIDIA GPUs |
| Primary tools | `nvidia-smi`, `lspci`, `numactl`, `/sys`, optional `dcgmi` |

## 1. Objective

Inspect a GPU-enabled Linux host and build an evidence-based map of its accelerator architecture and system topology.

The lab does not install drivers or run a benchmark. Its purpose is to teach the inspection workflow that should happen before deployment, performance testing, or troubleshooting.

## 2. Background

A host can report that a GPU is present while still being poorly configured for the intended workload. Device visibility does not prove correct NUMA placement, peer connectivity, link width, driver health, or workload suitability.

Production engineers should be able to answer:

- Which GPUs are installed?
- Which driver controls them?
- How much device memory is available?
- Which PCIe paths connect the devices?
- Which CPU NUMA nodes are closest to each GPU?
- Which GPUs can communicate through direct high-speed paths?
- Are links operating at expected width and generation?

## 3. Learning Outcomes

After completing this lab, you will be able to:

- Identify installed NVIDIA GPUs and their stable identifiers.
- Read device memory, power, temperature, and driver state.
- Interpret `nvidia-smi topo -m` output.
- Map a GPU PCI address to Linux sysfs and NUMA information.
- Distinguish healthy visibility from healthy topology.
- Produce a concise host architecture report.

## 4. Architecture

```mermaid
flowchart TD
    CPU0[CPU Socket or NUMA Node 0]
    CPU1[CPU Socket or NUMA Node 1]
    Root0[PCIe Root Complex 0]
    Root1[PCIe Root Complex 1]
    GPU0[GPU 0]
    GPU1[GPU 1]
    NIC0[High-Speed NIC]
    Storage[NVMe Storage]

    CPU0 --> Root0
    CPU1 --> Root1
    Root0 --> GPU0
    Root0 --> NIC0
    Root1 --> GPU1
    Root1 --> Storage
```

**Figure 2.L1.1 — Example host topology.** Device placement beneath CPU sockets and PCIe root complexes affects memory access and communication paths.

Your host may differ. The goal is to discover the actual topology rather than assume this example.

## 5. Prerequisites

### Hardware

- One or more NVIDIA GPUs
- Access to the Linux host

### Software

- NVIDIA driver installed
- `nvidia-smi`
- `pciutils` package for `lspci`
- `numactl` package for `numactl`
- Optional: NVIDIA Data Center GPU Manager

### Permissions

Most inspection commands work as a normal user. Some sysfs or management details may require elevated privileges.

## 6. Environment

Record the environment before running the lab.

```bash
cat /etc/os-release
uname -r
nvidia-smi --query-gpu=driver_version --format=csv,noheader | sort -u
```

### Expected Output

The output should identify the operating-system release, kernel version, and one NVIDIA driver version.

### Common Problems

- `nvidia-smi: command not found`: NVIDIA utilities are not installed or not in `PATH`.
- `NVIDIA-SMI has failed`: the driver may not be loaded, may not match the running kernel, or may not communicate with the device.
- Multiple driver versions in output: investigate containerized tooling or inconsistent command context.

## 7. Components

| Component | Why it matters |
|---|---|
| GPU | Executes parallel kernels and owns device memory |
| NVIDIA driver | Controls the device and exposes management state |
| PCIe fabric | Connects the GPU to CPUs and other devices |
| NUMA node | Represents locality between CPUs, memory, and I/O devices |
| NIC | Carries inter-node traffic in distributed workloads |
| NVLink or peer path | Provides direct GPU-to-GPU communication on supported systems |
| Sysfs | Exposes Linux device and topology metadata |

## 8. Deployment Steps

This is an exploration lab, so there is no software deployment. The steps build the host map progressively.

### Step 1 — List GPUs

#### Purpose

Identify the installed devices using concise, script-friendly output.

#### Command

```bash
nvidia-smi --query-gpu=index,name,uuid,pci.bus_id,memory.total --format=csv
```

#### Expected Output

```text
index, name, uuid, pci.bus_id, memory.total [MiB]
0, NVIDIA ..., GPU-..., 00000000:31:00.0, ... MiB
```

Exact model names, UUIDs, bus IDs, and memory values depend on the host.

#### Explanation

- `index` is convenient but may change after reboot or hardware changes.
- `uuid` is a more stable workload identifier.
- `pci.bus_id` links NVIDIA tooling to Linux PCI topology.
- `memory.total` reports device-memory capacity visible to the driver.

#### Common Errors

An empty list means the driver sees no GPUs. Do not continue to topology analysis until host visibility is fixed.

### Step 2 — Inspect Runtime State

#### Purpose

Capture utilization, memory, temperature, power, and clocks.

#### Command

```bash
nvidia-smi --query-gpu=index,utilization.gpu,utilization.memory,memory.used,temperature.gpu,power.draw,clocks.sm,clocks.mem --format=csv
```

#### Expected Healthy Output

An idle host usually shows low utilization and low memory use, with valid temperature, power, and clock fields.

#### Interpretation

A zero utilization value is not an error on an idle host. Missing or `N/A` fields may be normal for some products, but repeated management failures require investigation.

### Step 3 — Inspect PCI Devices

#### Purpose

Verify that Linux enumerates the NVIDIA device and identify its PCI function.

#### Command

```bash
lspci -Dnn | grep -i nvidia
```

#### Expected Output

One or more NVIDIA VGA, 3D controller, audio, bridge, or related functions should appear.

#### Explanation

The domain-qualified address from `lspci -D` should correspond to the bus ID reported by `nvidia-smi`.

### Step 4 — Inspect Detailed PCIe Link State

Replace the address with a GPU bus ID from Step 1.

#### Purpose

Inspect negotiated and supported PCIe link characteristics.

#### Command

```bash
GPU_BDF="0000:31:00.0"
sudo lspci -s "$GPU_BDF" -vv | grep -E "LnkCap:|LnkSta:"
```

#### Expected Output

The output typically includes supported and negotiated speed and width.

#### Interpretation

A device can support a wider or faster link than it currently negotiates. Reduced link state may be caused by platform design, BIOS settings, slot placement, power management, or hardware problems.

:::caution
Do not declare a link faulty from one field alone. Compare with the server design, slot specification, GPU product requirements, and workload state.
:::

### Step 5 — Map GPU to NUMA Node

#### Purpose

Determine which NUMA node Linux associates with the GPU.

#### Command

```bash
GPU_BDF="0000:31:00.0"
cat "/sys/bus/pci/devices/$GPU_BDF/numa_node"
```

#### Expected Output

```text
0
```

The value may be another NUMA node. A value of `-1` means Linux does not expose a specific NUMA association for that device.

### Step 6 — Inspect Host NUMA Topology

#### Purpose

Understand CPU and memory placement around the GPU.

#### Command

```bash
numactl --hardware
```

#### Expected Output

The command should list NUMA nodes, CPUs assigned to each node, memory size, free memory, and distance values.

#### Explanation

Workloads that prepare data on a CPU far from the GPU may cross inter-socket links before reaching the PCIe root complex. This can increase latency and consume additional bandwidth.

### Step 7 — Inspect GPU Peer Topology

#### Purpose

Map communication relationships between GPUs, CPUs, and NICs.

#### Command

```bash
nvidia-smi topo -m
```

#### Expected Output

A matrix with GPU rows and columns, CPU affinity, NUMA affinity, and path labels.

Common path labels vary by platform and driver version. Use the legend printed by the command rather than memorizing one fixed interpretation.

#### Interpretation

Shorter or direct GPU paths are generally preferable for communication-heavy workloads. Paths that traverse host bridges, CPU sockets, or slower interconnects can reduce peer performance.

### Step 8 — Inspect Link or Peer Status Where Supported

#### Purpose

Gather additional interconnect evidence.

#### Commands

```bash
nvidia-smi nvlink --status
```

Optional DCGM inventory:

```bash
dcgmi discovery -l
```

#### Expected Output

Systems without NVLink may report that the feature is unsupported or show no active links. That is not automatically a fault. Interpret the result against the platform design.

## 9. Validation

Create a compact inventory table from the host.

```bash
nvidia-smi --query-gpu=index,name,uuid,pci.bus_id,memory.total,driver_version --format=csv
```

Validation is complete when every GPU has:

- A visible index
- A model name
- A UUID
- A PCI bus ID
- A memory capacity
- A driver association

## 10. Verification

Verify consistency across tools.

1. Each `nvidia-smi` PCI bus ID should appear in `lspci`.
2. Each GPU should have a sysfs device directory.
3. The NUMA node should be recorded or explicitly reported as unknown.
4. `nvidia-smi topo -m` should list all expected GPUs.
5. Link state should be compared with platform expectations.

Use this command to verify the sysfs path:

```bash
GPU_BDF="0000:31:00.0"
test -d "/sys/bus/pci/devices/$GPU_BDF" && echo "device path exists"
```

## 11. Observability

### Host-Level Signals

- GPU temperature
- Power draw
- Core and memory clocks
- Device memory use
- GPU and memory utilization
- PCIe replay or error counters where available
- XID events in kernel logs

### Commands

```bash
nvidia-smi -q
journalctl -k | grep -iE "nvrm|xid|nvidia"
```

Optional:

```bash
dcgmi diag -r 1
```

Use diagnostics only when supported and appropriate for the environment.

## 12. Performance Measurements

This lab does not run a workload benchmark. It records architectural conditions that affect future benchmarks.

Capture:

- PCIe negotiated link width and speed
- GPU-to-GPU path matrix
- NUMA node for each GPU
- CPU affinity from `nvidia-smi topo -m`
- Presence or absence of direct peer links

These values become the baseline for later bandwidth and NCCL labs.

## 13. Failure Injection

### Failure Scenario — Incorrect CPU Placement

Do not modify the system. Simulate the design error on paper.

1. Select one GPU and record its NUMA node.
2. Select CPUs from a distant NUMA node.
3. Describe the path data would take from those CPUs to the GPU.
4. Predict the effect on host-to-device transfer and CPU preprocessing.
5. Write the preferred CPU-binding policy.

This exercise teaches failure reasoning without disrupting the host.

## 14. Troubleshooting

### Problem — `nvidia-smi` sees fewer GPUs than `lspci`

#### Symptoms

- PCI devices appear in `lspci`.
- One or more devices are missing from `nvidia-smi`.

#### Diagnosis

```bash
lspci -Dnn | grep -i nvidia
journalctl -k | grep -iE "nvrm|xid|nvidia"
lsmod | grep nvidia
```

#### Possible Root Causes

- Driver initialization failure
- Unsupported or mismatched driver
- Device in a faulted state
- IOMMU or passthrough configuration
- Hardware or firmware issue

#### Resolution

Follow the evidence. Confirm the supported driver branch, inspect kernel logs, validate firmware and BIOS configuration, and avoid repeated resets on a production host without a maintenance plan.

### Problem — PCIe link is narrower than expected

#### Diagnosis

Compare `LnkCap` and `LnkSta`, then confirm server slot wiring and BIOS configuration.

#### Prevention

Maintain an approved slot-placement diagram and validate link state during commissioning.

### Problem — Workload uses CPUs far from the GPU

#### Diagnosis

Compare process CPU affinity with the GPU's NUMA node.

```bash
taskset -pc <PID>
numactl --hardware
nvidia-smi topo -m
```

#### Resolution

Apply CPU and memory binding through the workload manager, container platform, or service configuration.

## 15. Cleanup

This lab creates no persistent resources.

Unset shell variables if desired:

```bash
unset GPU_BDF
```

Remove any temporary notes or generated inventory files created during the exercise.

## 16. Summary

You inspected GPU identity, driver state, PCI enumeration, link characteristics, NUMA locality, and peer topology. The lab demonstrated that a visible GPU is not automatically a well-placed or production-ready GPU.

The evidence collected here will support later labs on CUDA execution, memory behavior, peer bandwidth, and distributed communication.

## 17. Challenge Exercises

1. Generate a Markdown inventory table for every GPU automatically.
2. Map each high-speed NIC to its NUMA node and compare it with GPU placement.
3. Identify which GPU pairs have the shortest communication path.
4. Create a recommended process-binding policy for each GPU.
5. Compare topology before and after moving a GPU or NIC to another approved slot in a lab system.

## 18. Further Reading

- [Volume 02 Introduction](../index)
- [Why GPU Architecture Evolved](../chapter-01-why-gpu-architecture-evolved)
- [Inside a Modern NVIDIA GPU](../chapter-02-inside-a-modern-nvidia-gpu)
- [Threads, Warps, Blocks, and Streaming Multiprocessors](../chapter-03-threads-warps-blocks-and-sms)
