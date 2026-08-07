---
title: PCIe, SXM, and Platform Integration
description: Understand how accelerator form factor changes server topology, communication, power, cooling, and operations.
sidebar_position: 5
tags:
  - pcie
  - sxm
  - gpu-hardware
  - platform-design
---

# PCIe, SXM, and Platform Integration

Two GPUs from the same architectural generation can create very different systems. The difference is often not the execution engine itself, but how the accelerator is integrated into the server.

PCIe cards, SXM modules, integrated CPU-GPU platforms, and rack-scale systems represent distinct architectural choices. Each changes data paths, power delivery, thermal design, serviceability, networking, and the operational boundary between the GPU vendor and the system vendor.

| Chapter field | Value |
|---|---|
| Difficulty | Intermediate |
| Estimated reading time | 35–45 minutes |
| Prerequisites | Chapters 01–03 |
| Primary outcome | Select an accelerator integration model based on workload and operational constraints |

## 1. The Production Problem

A customer requests eight high-end GPUs in every node. One vendor proposes PCIe accelerators in a conventional server. Another proposes an SXM-based platform with a high-bandwidth scale-up fabric.

Both proposals contain eight GPUs. They are not equivalent systems.

The design decision affects:

- GPU-to-GPU communication;
- CPU-to-GPU locality;
- adapter placement;
- power density;
- cooling method;
- failure domains;
- firmware ownership;
- field replacement procedures;
- qualification and support.

## 2. Learning Objectives

After completing this chapter, you will be able to:

- explain the architectural difference between PCIe and SXM integration;
- identify how form factor changes topology and data movement;
- evaluate power, cooling, and serviceability implications;
- explain why server qualification matters;
- recommend an integration model without declaring a universal winner.

## 3. The Integration Stack

```mermaid
flowchart TD
    Workload[Workload requirements] --> GPU[Accelerator selected]
    GPU --> Form{"Form factor decision —<br/>what does the workload's communication<br/>pattern actually require?"}
    Form -->|"Little/no GPU-to-GPU traffic<br/>(independent inference replicas)"| PCIePath["PCIe card<br/>evidence: nvidia-smi topo -m shows<br/>PHB/PXB paths are fine, never queried"]
    Form -->|"Heavy intra-node collective traffic<br/>(large-batch training, tensor-parallel inference)"| SXMPath["SXM module<br/>evidence: nccl-tests all-reduce time<br/>would dominate step time on PCIe-only paths"]
    PCIePath --> Baseboard1["Standard PCIe topology<br/>verify: nvidia-smi topo -m"]
    SXMPath --> Baseboard2["NVLink/NVSwitch baseboard<br/>verify: nvidia-smi topo -m shows NV# links"]
    Baseboard1 --> Server[Server design]
    Baseboard2 --> Server
    Server --> Rack{"Rack power and cooling —<br/>measured, not assumed"}
    Rack -->|"power.draw sustained near power.limit,<br/>PDU headroom checked"| RackOK["Facility fit confirmed"]
    Rack -->|"sustained draw would exceed<br/>rack PDU or airflow budget"| RackFail["Facility mismatch —<br/>re-open form factor decision"]
    RackFail -.->|"loop back"| Form
    RackOK --> Cluster[Cluster fabric and operations]
```

**Figure 4.4.1 — Accelerator integration stack, with the evidence that justifies each layer's decision, not just the layers themselves.** The loop-back from a failed facility check to the form-factor decision is the important edge: a technically correct SXM choice that the rack can't power sends the process back to reconsider the integration model, not straight to a purchase order.

A form factor should therefore be treated as an architectural contract, not a mechanical detail.

**Reading `nvidia-smi topo -m`, the command this whole diagram depends on:**

```bash
$ nvidia-smi topo -m
        GPU0    GPU1    GPU2    GPU3    NIC0    CPU Affinity
GPU0     X      NV18    NV18    NV18    PXB     0-31
GPU1    NV18     X      NV18    NV18    PXB     0-31
GPU2    NV18    NV18     X      NV18    PXB     32-63
GPU3    NV18    NV18    NV18     X      PXB     32-63

Legend:
  X    = self
  NV#  = NVLink, # = number of links
  PXB  = connection traversing multiple PCIe bridges (no NVLink)
  PHB  = connection traversing a single PCIe host bridge
```

`NV18` between every GPU pair (18 NVLink connections) is the signature of an SXM/NVSwitch baseboard — every GPU reaches every other GPU through the high-bandwidth fabric, not through PCIe. A PCIe-card server running the same command would show `PHB` or `PXB` instead of `NV#` between GPUs, meaning GPU-to-GPU traffic has to traverse PCIe switches or the CPU root complex — the exact distinction Figure 4.4.1's decision point is testing for. `PXB` next to `NIC0` on both rows also confirms both GPUs reach the network adapter through the same PCIe path, relevant for the scale-out check in [Section 8](#8-network-adapter-placement).

## 4. PCIe Accelerator Integration

A PCIe accelerator is installed through the server's PCI Express fabric. This model fits a broad ecosystem of enterprise servers and allows flexible combinations of GPU count, CPU platform, network adapters, and storage.

### Strengths

- broad OEM availability;
- flexible server configurations;
- familiar replacement procedures;
- ability to scale from one to several accelerators;
- suitable for workloads that do not require the strongest possible intra-node scale-up fabric.

### Constraints

- GPU-to-GPU traffic may traverse PCIe switches or CPU root complexes;
- peer paths vary by server design;
- NIC and GPU affinity must be inspected carefully;
- chassis airflow and slot spacing can limit density;
- performance consistency depends heavily on OEM topology.

```mermaid
flowchart LR
    CPU0[CPU socket 0]
    CPU1[CPU socket 1]
    SW0[PCIe switch]
    SW1[PCIe switch]
    G0[GPU 0]
    G1[GPU 1]
    G2[GPU 2]
    G3[GPU 3]
    NIC0[NIC 0]
    NIC1[NIC 1]

    CPU0 --> SW0
    CPU1 --> SW1
    SW0 --> G0
    SW0 --> G1
    SW0 --> NIC0
    SW1 --> G2
    SW1 --> G3
    SW1 --> NIC1
    CPU0 <--> CPU1
```

**Figure 4.4.2 — Simplified PCIe accelerator topology.** Performance depends on which devices share switches and CPU roots.

## 5. SXM Platform Integration

SXM-based systems integrate accelerator modules on a specialized baseboard designed for dense GPU communication. The platform commonly combines multiple accelerators with NVLink and NVSwitch to create a stronger scale-up domain.

### Strengths

- high-bandwidth GPU-to-GPU communication;
- predictable multi-GPU topology;
- platform design optimized around dense AI and HPC workloads;
- fewer application-visible penalties when models communicate heavily inside the node.

### Constraints

- higher rack power and cooling density;
- more specialized service procedures;
- less freedom to mix arbitrary server components;
- platform firmware and Fabric Manager compatibility become critical;
- acquisition and support are tied closely to qualified systems.

```mermaid
flowchart TD
    CPU[Host CPUs]
    PCIe[Balanced PCIe paths]
    Fabric[NVLink and NVSwitch domain]
    G0[GPU 0]
    G1[GPU 1]
    G2[GPU 2]
    G3[GPU 3]

    CPU --> PCIe --> Fabric
    Fabric <--> G0
    Fabric <--> G1
    Fabric <--> G2
    Fabric <--> G3
```

**Figure 4.4.3 — Simplified SXM scale-up domain.** The baseboard is designed around coordinated multi-GPU communication rather than independent add-in cards.

## 6. PCIe Versus SXM

| Design dimension | PCIe accelerator server | SXM-based platform |
|---|---|---|
| Configuration flexibility | High | More standardized |
| Intra-node GPU fabric | Depends on server and GPU | Designed for dense scale-up |
| Power density | Often lower per node | Often higher per node |
| Cooling complexity | Conventional high-performance server range | Frequently requires stricter airflow or liquid-cooling planning |
| Serviceability | Familiar add-in-card model | Platform-specific procedures |
| Topology variability | High across OEM designs | More predictable within a platform generation |
| Best fit | Flexible inference, visualization, mixed workloads, smaller GPU counts | Communication-heavy training and large multi-GPU inference |

The table is not a winner matrix. It is a constraint matrix.

## 7. CPU and NUMA Placement

The host CPU remains part of the data path. A GPU can be physically attached to one CPU socket while the process feeding it runs on another.

Cross-socket access may introduce:

- additional latency;
- reduced effective host-to-device bandwidth;
- contention on the CPU interconnect;
- inconsistent performance among otherwise identical jobs.

Production scheduling should consider:

- CPU affinity;
- memory allocation locality;
- GPU locality;
- NIC locality;
- storage-controller locality.

A correct GPU count with an incorrect NUMA policy is still an incorrect architecture.

## 8. Network Adapter Placement

Distributed training and inference move data between GPUs in different nodes. The path from GPU to network adapter is therefore a first-class design decision.

```mermaid
flowchart LR
    GPU[GPU memory]
    Root[PCIe root or switch]
    NIC[Network adapter]
    Fabric[Cluster fabric]
    Remote[Remote GPU]

    GPU --> Root --> NIC --> Fabric --> Remote
```

**Figure 4.4.4 — Simplified scale-out data path.** Extra PCIe hops or cross-socket paths can reduce effective communication performance.

The architect should verify whether adapters are balanced across CPU sockets and whether each GPU has an efficient path to the intended network interface.

## 9. Power and Cooling

Accelerator selection changes facility design.

### Power planning must include

- steady-state draw;
- transient behavior;
- CPU, memory, NIC, and storage consumption;
- power-supply redundancy mode;
- rack-level distribution limits;
- derating and safety margin.

### Cooling planning must include

- inlet temperature;
- airflow direction;
- rack density;
- containment strategy;
- liquid-cooling dependencies where applicable;
- behavior during degraded cooling.

:::warning
A server that fits physically in a rack may still be impossible to operate safely in that rack.
:::

## 10. Qualification and Support Boundaries

A production platform is supported as a combination of hardware and software.

Qualification should verify:

- server model and firmware bundle;
- GPU firmware;
- BMC version;
- BIOS settings;
- driver branch;
- CUDA and framework support;
- network adapter firmware;
- operating system;
- orchestration stack.

NVIDIA-Certified Systems and vendor qualification matrices help reduce the risk of unsupported combinations, but the customer still needs an internal approved configuration baseline.

## 11. Production Troubleshooting

### Symptom

Two servers with the same GPU model show different distributed-training performance.

### Diagnosis

```bash
nvidia-smi topo -m
lspci -tv
numactl --hardware
```

The commands reveal GPU, NIC, PCIe, and NUMA relationships. Compare the outputs rather than assuming identical topology from the bill of materials.

### Likely causes

| Cause | Evidence | Resolution |
|---|---|---|
| Different PCIe switch layout | Different `nvidia-smi topo -m` paths | Align placement or standardize server design |
| Cross-socket CPU feeding | Process CPU affinity differs from GPU locality | Bind CPU and memory correctly |
| NIC attached to remote root | Network path crosses CPU interconnect | Reassign interfaces or workload placement |
| Firmware drift | Same hardware, different firmware bundle | Return to approved baseline |
| Thermal limitation | Reduced clocks under sustained load | Correct airflow or cooling capacity |

**Evidence walkthrough — "cross-socket CPU feeding," comparing the two servers' `numactl --hardware` output:**

```bash
# Server A (fast)
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
node 0 size: 515000 MB
node 1 cpus: 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
node 1 size: 515000 MB
node distances:
node   0   1
  0:  10  21
  1:  21  10

# Server B (slow)
$ ps -o pid,psr,comm -p $(pgrep -f train.py)
    PID PSR COMMAND
  48213  22 python
$ nvidia-smi topo -m | grep GPU0
GPU0     X   ...   NODE    0-15
```

On Server B, `ps -o psr` shows the training process's thread scheduled on core `22` — which `numactl --hardware`'s node layout places on NUMA node 1 — while `nvidia-smi topo -m` shows GPU0 is attached to NUMA node 0 (`0-15`). Every host-to-device transfer for that process crosses the CPU interconnect (`node distances` above shows node 0↔1 is `21`, roughly double the same-node cost of `10`). Server A's process was pinned to a core in GPU0's own node, avoiding that penalty entirely — this is the actual mechanism behind "cross-socket CPU feeding," not just a label in a table.

**Evidence walkthrough — "thermal limitation," confirmed with clocks rather than assumed from temperature:**

```bash
$ nvidia-smi --query-gpu=clocks.sm,clocks.max.sm,power.draw,power.limit,temperature.gpu --format=csv
clocks.sm [MHz], clocks.max.sm [MHz], power.draw [W], power.limit [W], temperature.gpu [C]
1305 MHz, 1980 MHz, 612.40 W, 700.00 W, 87 C
```

`clocks.sm` running well below `clocks.max.sm` while `power.draw` still has headroom under `power.limit` (612W vs 700W) points at thermal throttling specifically, not power throttling — if this were power-bound, `power.draw` would be pinned at `power.limit` the way it was in the Chapter 3 power-throttle example. `temperature.gpu` at 87C corroborates it. The distinction matters operationally: a power throttle is fixed by facility power delivery, a thermal throttle by airflow or cooling capacity — the same "reduced clocks" symptom, two different corrective actions.

## 12. Customer Scenario

A telecom customer needs two platforms. The first runs many independent inference services with moderate model sizes and strict cost controls. The second trains a large model using all GPUs in a node.

A flexible PCIe platform may be appropriate for the independent services because the workloads communicate little across GPUs. An SXM-based system may be appropriate for the training workload because intra-node collective communication is central to scaling.

The architect uses the workload communication pattern—not brand preference—to separate the designs.

## 13. Interview Preparation

### Architecture question

**Why can two eight-GPU servers behave differently?**

**Model answer:** "Because 'eight GPUs' describes a count, not a topology. I'd want to see `nvidia-smi topo -m` from both servers before assuming they're equivalent — one might show `NV18` between every GPU pair on an NVSwitch baseboard, and the other might show `PXB` or `PHB`, meaning GPU-to-GPU traffic has to cross PCIe switches or the CPU root complex. On top of that, NUMA attachment matters just as much: I've debugged a case where the process was pinned to a CPU core on the wrong NUMA node relative to its GPU, and `numactl --hardware` showed a 2x latency penalty crossing to the GPU's actual node — same GPU count, same GPU model, materially different delivered performance because of a placement issue nothing in the spec sheet would show."

### Scenario question

**When would you choose PCIe accelerators instead of an SXM platform?**

**Model answer:** "When the workload's own communication pattern doesn't need the fabric SXM is built for — independent inference replicas that barely talk to each other, for example. In that case I'd rather have PCIe's configuration flexibility, broader OEM choice, and familiar service procedures than pay for NVSwitch bandwidth the workload will never use. The test I'd actually run before committing either way is `nccl-tests` — if all-reduce time barely factors into the workload's total time at all, PCIe is the right call; if it dominates step time, that's the signal SXM's scale-up fabric is worth its extra power, cooling, and procurement complexity."

### Troubleshooting question

**What is the first command you use to understand GPU topology?**

**Model answer:** "`nvidia-smi topo -m` — it's the fastest way to see the actual GPU-to-GPU and GPU-to-NIC paths instead of assuming them from the bill of materials. But I treat its output as a map, not a verdict — an `NV18` link tells me the fabric exists, it doesn't tell me a specific job is actually using it efficiently. From there I'd follow up with `lspci -tv` to see the full PCIe tree and `numactl --hardware` to check CPU-to-GPU locality, because a topology that looks fine in `nvidia-smi topo -m` can still have a NUMA placement problem that `topo -m` alone won't show."

## 14. Summary

PCIe and SXM represent different platform-integration strategies. PCIe emphasizes flexibility. SXM emphasizes a coordinated scale-up domain. Neither is universally correct.

The correct choice aligns workload communication, topology, power, cooling, serviceability, and support requirements.

## Cross References

- [Chapter 02 — Workload-First GPU Selection](./chapter-02-workload-first-gpu-selection)
- [Chapter 03 — Accelerator Generations and Design Shifts](./chapter-03-accelerator-generations-and-design-shifts)
- [Lab 01 — Build a GPU Selection Scorecard](./labs/lab-01-build-a-gpu-selection-scorecard)

## Further Reading

- [NVIDIA-Certified Systems](https://docs.nvidia.com/certification-programs/latest/nvidia-certified-systems.html)
- [NVIDIA HGX Platforms documentation](https://docs.nvidia.com/hgx-platforms/index.html)
