---
title: DGX Management Plane
description: Understand the out-of-band, operating-system, cluster-management, and observability layers used to operate DGX systems.
sidebar_position: 4
tags:
  - dgx
  - bmc
  - base-command-manager
  - operations
---

# DGX Management Plane

A DGX system is not operated through `nvidia-smi` alone. Production administration spans several control layers: out-of-band hardware management, host operating system, GPU software, cluster provisioning, orchestration, monitoring, and support data collection.

When these layers are mixed together, incident response becomes slow and risky. A reliable DGX platform assigns each control function to the correct management plane.

| Chapter field | Value |
|---|---|
| Difficulty | Intermediate |
| Estimated reading time | 40 minutes |
| Prerequisites | Chapters 01–02 |
| Primary outcome | Design and operate a layered DGX management architecture |

## 1. The Production Problem

A DGX node stops responding over the production network. The scheduler marks the node unavailable, but the operations team cannot tell whether the failure is caused by Linux, the network interface, a power event, a failed component, or an administrative mistake.

If the only management path depends on the host operating system, the team has lost its visibility at the exact moment it is needed most.

## 2. Learning Objectives

After completing this chapter, you will be able to:

- separate in-band and out-of-band DGX management;
- explain the role of the Baseboard Management Controller (BMC);
- place Base Command Manager in a multi-node architecture;
- design secure management-network boundaries;
- build an operational workflow for provisioning, monitoring, and recovery.

## 3. Management Plane Architecture

```mermaid
flowchart TD
    Admin[Administrator]
    OOB[Out-of-band network]
    BMC[DGX BMC]
    Mgmt[Management network]
    BCM[Base Command Manager]
    OS[DGX operating system]
    GPU[Driver, CUDA, Fabric Manager]
    Orch[Slurm or Kubernetes]
    Obs[Monitoring and logging]

    Admin --> OOB --> BMC
    Admin --> Mgmt --> BCM
    BCM --> OS --> GPU
    Orch --> OS
    GPU --> Obs
    BMC --> Obs
```

**Figure 5.3.1 — Layered DGX management plane.** Hardware recovery remains available independently of the host operating system.

## 4. Out-of-Band Management

The BMC monitors and controls hardware independently of the primary host operating system. Depending on the DGX generation and supported functions, it can expose sensor readings, event logs, power controls, virtual console, firmware information, and hardware inventory.

The BMC is used when:

- the operating system is unavailable;
- network configuration is broken;
- the node must be power-cycled remotely;
- hardware sensors or event logs are required;
- installation media must be attached through a remote console;
- firmware state must be inspected.

:::warning
The BMC is a privileged infrastructure endpoint. It should never share an unrestricted user or workload network.
:::

### BMC network controls

A production design should include:

- a dedicated out-of-band network;
- restricted administrative access;
- centralized authentication where supported;
- credential rotation;
- TLS certificate management;
- event logging;
- backup access procedures;
- explicit break-glass controls.

## 5. In-Band Host Management

Once the operating system is healthy, administrators use the host management plane for configuration and diagnostics.

Typical responsibilities include:

- operating-system updates;
- driver and CUDA lifecycle;
- network configuration;
- storage mounts;
- system services;
- Fabric Manager where required;
- DCGM and telemetry agents;
- container runtime;
- workload scheduler integration.

The operating system should be managed as a reproducible image or controlled configuration, not as an individually hand-tuned server.

## 6. Base Command Manager

NVIDIA Base Command Manager (BCM) provides cluster-level capabilities such as provisioning, configuration management, monitoring, and workload-management integration. It becomes relevant when the customer moves from administering one DGX system to operating a coordinated fleet.

```mermaid
flowchart LR
    Head[BCM head nodes]
    Image[Approved system images]
    DGX1[DGX node 1]
    DGX2[DGX node 2]
    DGXN[DGX node N]
    Sched[Scheduler or Kubernetes]
    Metrics[Monitoring services]

    Image --> Head
    Head --> DGX1
    Head --> DGX2
    Head --> DGXN
    Sched --> DGX1
    Sched --> DGX2
    Sched --> DGXN
    DGX1 --> Metrics
    DGX2 --> Metrics
    DGXN --> Metrics
```

**Figure 5.3.2 — Cluster management with BCM.** The management system establishes consistent node state and connects the fleet to orchestration and monitoring.

BCM does not eliminate the need for BMC access. The two systems solve different problems:

| Layer | Primary purpose |
|---|---|
| BMC | Hardware-level control and recovery |
| Host OS | Node configuration and local services |
| BCM | Fleet provisioning and cluster management |
| Scheduler or Kubernetes | Workload placement and lifecycle |
| Monitoring stack | Health, performance, and alerting |

## 7. Management Network Separation

A DGX cluster commonly uses multiple network domains.

```mermaid
flowchart TD
    Users[Users and applications]
    Service[Service or storage network]
    Compute[High-speed compute fabric]
    Management[In-band management network]
    OOB[Out-of-band BMC network]

    Users --> Service
    Service --> DGX[DGX systems]
    DGX <--> Compute
    Management --> DGX
    OOB --> DGX
```

**Figure 5.3.3 — Logical DGX network separation.** Workload traffic and privileged infrastructure control should not share the same trust boundary.

The exact number of physical networks depends on scale and constraints, but the security roles should remain distinct.

## 8. Provisioning Lifecycle

A controlled DGX provisioning workflow follows this sequence:

1. Register hardware inventory and BMC access.
2. Validate rack power, cooling, and network cabling.
3. Apply approved firmware and BIOS settings.
4. Provision the approved operating-system image.
5. Install or validate the GPU software stack.
6. Validate NVLink, NVSwitch, PCIe, NIC, and storage topology.
7. Enroll the node in monitoring.
8. Run burn-in and acceptance tests.
9. Add the node to the scheduler.
10. Record the final configuration baseline.

Skipping acceptance testing transfers hardware and integration risk directly into production workloads.

## 9. Observability Across Layers

A complete health view combines signals from several sources.

| Source | Example signals |
|---|---|
| BMC | Power, fans, temperatures, hardware event logs |
| Linux | Kernel events, filesystems, memory, services |
| NVIDIA driver | XID events, device state, driver errors |
| DCGM | GPU health, utilization, thermals, ECC, fabric metrics |
| Scheduler | Node state, job failures, resource allocation |
| Network | Port state, errors, congestion, link health |
| Storage | Capacity, latency, throughput, mount failures |

No single dashboard proves that a DGX system is healthy. Health is a correlated conclusion across layers.

## 10. Secure Administrative Workflow

A practical workflow uses role separation:

- platform administrators manage images, cluster services, and scheduler integration;
- hardware administrators manage BMC, firmware, and physical replacement;
- security administrators control credentials, certificates, and audit policy;
- workload owners receive scheduler-level access rather than host-level administrative access.

Shared root credentials and unrestricted BMC access create an unacceptable blast radius.

## 11. Production Troubleshooting

### Scenario: node unreachable over SSH

#### Symptoms

- scheduler reports the node down;
- SSH fails;
- application monitoring stops;
- other nodes remain healthy.

#### Diagnosis

1. Check BMC reachability.
2. Inspect power state and hardware event logs.
3. Use the remote console to observe boot or kernel state.
4. Confirm in-band switch port state.
5. Determine whether the host is running but isolated.
6. Capture evidence before power cycling.

#### Root-cause branches

```mermaid
flowchart TD
    Start[Node unreachable]
    BMC{BMC reachable?}
    Power{Host powered on?}
    Console{Console responsive?}
    Network[Investigate host or switch network]
    Boot[Investigate boot, kernel, or filesystem]
    Facility[Investigate OOB network or facility power]

    Start --> BMC
    BMC -- No --> Facility
    BMC -- Yes --> Power
    Power -- No --> Boot
    Power -- Yes --> Console
    Console -- Yes --> Network
    Console -- No --> Boot
```

**Figure 5.3.4 — DGX unreachable decision tree.** Out-of-band visibility separates hardware, boot, and network failures.

### Prevention

- monitor BMC and host paths separately;
- test remote console access before incidents;
- keep configuration backups;
- document safe power-cycle criteria;
- maintain an approved firmware baseline;
- automate post-recovery validation.

## 12. Customer Scenario

A customer purchases eight DGX systems and initially manages them as independent servers. Within months, firmware versions drift, local accounts differ, and troubleshooting depends on which engineer configured each node.

The recommended architecture introduces dedicated OOB and management networks, centralized image management, BCM head nodes, a scheduler, and consistent telemetry. The value is not merely automation. It is the replacement of undocumented server state with a controlled cluster state.

## 13. Interview Preparation

### Architecture question

**Why are both BMC and cluster-management software required?**

The BMC provides hardware-level control independent of the host OS. Cluster-management software provisions and manages the operating environment across many nodes. Neither replaces the other.

### Scenario question

**A DGX node is unreachable. Would you power-cycle it immediately?**

No. First capture BMC event logs, console state, power state, switch information, and any available host evidence. A power cycle may restore service but destroy evidence needed to identify recurrence.

### Customer question

**Why do we need a separate management network?**

Because privileged infrastructure control must remain available during workload-network failures and must be isolated from tenant and application traffic.

## 14. Summary

DGX operations require a layered management plane. The BMC controls hardware, the host OS controls node services, BCM manages fleet state, orchestration places workloads, and observability correlates health across the stack.

The design principle is:

> Recovery paths must not depend on the component being recovered.

## Cross References

- [Chapter 01 — Why DGX Exists](./chapter-01-why-dgx-exists)
- [Chapter 02 — Inside a DGX System](./chapter-02-inside-a-dgx-system)
- [Lab 01 — Build a DGX Health Baseline](./labs/lab-01-build-a-dgx-health-baseline)

## Further Reading

- [NVIDIA DGX B200 BMC guide](https://docs.nvidia.com/dgx/dgxb200-user-guide/bmc.html)
- [NVIDIA Base Command Manager documentation](https://docs.nvidia.com/base-command-manager/)
- [NVIDIA DGX BasePOD reference architecture](https://docs.nvidia.com/dgx-basepod/reference-architecture-infrastructure-foundation-enterprise-ai/latest/reference-architectures.html)
