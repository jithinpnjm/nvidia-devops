---
title: Chapter 02 — Inside an HGX Platform
description: Understand HGX as an integrated accelerator baseboard that OEMs combine with host, network, storage, power, cooling, and management designs.
sidebar_position: 3
tags:
  - hgx
  - architecture
  - oem
---

# Inside an HGX Platform

HGX is frequently misunderstood as a complete server. It is better understood as a tightly integrated accelerator platform that becomes part of a complete server designed and delivered by an OEM.

That distinction changes how architecture, support, and troubleshooting work. The accelerator fabric may be standardized, while the surrounding host processors, PCIe layout, network adapters, local storage, cooling implementation, firmware packaging, management interfaces, and service model vary by system vendor.

## Learning objectives

After completing this chapter, you will be able to:

- identify the architectural boundary of an HGX platform;
- separate NVIDIA-provided accelerator integration from OEM system integration;
- explain how host, I/O, power, cooling, firmware, and service choices affect the final platform;
- compare two HGX-based servers without relying only on GPU count;
- identify support ownership across NVIDIA, the OEM, and software vendors;
- troubleshoot an HGX-based system using layered evidence.

## The platform boundary

```mermaid
flowchart TD
    subgraph OEM[OEM server platform]
        CPU[Host CPUs and memory]
        PCIe[PCIe and I/O design]
        NIC[Network adapters]
        Storage[Local storage]
        Mgmt[Management controller]
        Cooling[Power and cooling]
        subgraph HGX[HGX accelerator platform]
            GPU[GPUs and HBM]
            Fabric[High-speed GPU fabric]
        end
    end

    CPU <--> PCIe
    PCIe <--> HGX
    PCIe <--> NIC
    PCIe <--> Storage
    Mgmt --> CPU
    Mgmt --> HGX
    Cooling --> OEM
```

**Figure 6.2.1 — HGX is a major subsystem inside an OEM server.**

The final behavior of the server depends on both the accelerator platform and the OEM integration around it.

## Accelerator domain

The accelerator domain contains the GPUs, local high-bandwidth memory, and the high-speed fabric used for GPU-to-GPU communication.

From the workload perspective, this domain determines:

- how many accelerators can participate inside one server boundary;
- how quickly peer GPUs can exchange data;
- how much aggregate accelerator memory is available;
- which communication paths are available to frameworks and collective libraries.

The accelerator domain does not independently define the host processors, network topology, storage layout, or operational tooling of the final server.

## Host domain

The OEM selects and integrates host processors and system memory around the accelerator platform.

The host design influences:

- CPU preprocessing capacity;
- NUMA locality;
- memory capacity and bandwidth;
- PCIe root-complex placement;
- network-adapter affinity;
- storage-device affinity;
- virtualization and operating-system support.

Two servers built around the same HGX generation can therefore expose different host-level characteristics.

## I/O domain

The I/O domain connects the host and accelerator subsystem to external networks and storage.

```mermaid
flowchart LR
    CPU0[CPU socket or domain 0]
    CPU1[CPU socket or domain 1]
    HGX[HGX platform]
    NIC0[Compute NICs]
    NIC1[Storage or service NICs]
    NVMe[Local NVMe]

    CPU0 <--> HGX
    CPU1 <--> HGX
    CPU0 <--> NIC0
    CPU1 <--> NIC1
    CPU0 <--> NVMe
```

This diagram is conceptual. The exact topology must be taken from the specific OEM platform.

An architecture review should ask:

- Which devices share upstream PCIe paths?
- Which CPU domain is closest to each network adapter?
- How are GPU-direct communication paths exposed?
- Are network adapters distributed to support the intended workload?
- Can local storage sustain staging and checkpoint requirements?

## Power and cooling domain

OEM integration is especially important for power and cooling. The server must deliver power safely to the accelerator subsystem and remove heat under sustained workload.

Different platforms may use different:

- chassis sizes;
- fan and airflow designs;
- liquid-cooling options;
- power-supply arrangements;
- rack-level facility requirements;
- service procedures.

A platform that is technically compatible with a workload may still be unsuitable for a facility that cannot support its rack density, cooling method, or redundancy model.

## Firmware and management domain

The final server includes firmware and management components from several sources.

```mermaid
flowchart TD
    NVIDIA[NVIDIA accelerator firmware and driver dependencies]
    OEM[OEM BIOS, BMC, platform firmware]
    OS[Operating system]
    Runtime[CUDA and container stack]
    Framework[AI framework]
    Workload[Application]

    NVIDIA --> OS
    OEM --> OS
    OS --> Runtime --> Framework --> Workload
```

Supportability depends on a validated combination, not an independently chosen version at each layer.

The OEM may package updates, define supported firmware bundles, provide management tools, and own first-line hardware support. NVIDIA owns important accelerator technologies and software components. The customer must understand how these responsibilities meet.

## HGX versus complete-system thinking

| Question | HGX platform view | Complete server view |
|---|---|---|
| What is standardized? | Accelerator integration and internal GPU fabric | Full BOM, host layout, management, cooling, service model |
| Who determines CPU and storage? | Not the HGX platform alone | OEM platform design |
| Who validates firmware bundles? | Shared technology dependency | Usually delivered through the OEM support model |
| Can two systems differ substantially? | Accelerator generation may match | Yes, host and operational characteristics can differ |
| What should a customer purchase? | Not an abstract baseboard alone | A validated OEM system and support lifecycle |

## Comparing HGX-based systems

A meaningful comparison should include more than accelerator specifications.

### Compute and memory

- accelerator generation and count;
- accelerator memory capacity;
- host CPU architecture and count;
- host memory capacity and topology.

### I/O and networking

- number and placement of network adapters;
- supported link technologies;
- PCIe topology and oversubscription;
- local storage configuration;
- direct data-path support.

### Facilities

- rack units;
- maximum and typical power requirements;
- air or liquid cooling;
- inlet-temperature and facility prerequisites;
- service clearances.

### Operations

- BMC and remote-management capability;
- firmware update workflow;
- telemetry integration;
- operating-system support;
- warranty and field-service model;
- validated container and orchestration stack.

### Lifecycle

- component replacement process;
- firmware-bundle cadence;
- support duration;
- upgrade and rollback procedure;
- spare-parts strategy.

## Data flow through an HGX-based server

```mermaid
sequenceDiagram
    participant A as Application
    participant H as Host CPU and memory
    participant G as HGX GPUs
    participant N as Network adapter
    participant R as Remote node or storage

    A->>H: Prepare work and buffers
    H->>G: Launch kernels and transfer or map data
    G->>G: Exchange tensors through GPU fabric
    G->>N: Initiate external data movement
    N->>R: Send compute or storage traffic
    R-->>N: Return data or collective result
    N-->>G: Complete transfer
    G-->>H: Report completion
```

Every transition crosses an ownership or integration boundary that must be validated in the final system.

## Production architecture considerations

### Availability

Treat the complete server as a failure domain. Even when individual components provide redundancy, host or platform failure can remove all accelerators in the chassis from service.

### Scalability

Scale-out behavior depends on external networking, workload communication patterns, storage, and cluster scheduling. Internal GPU connectivity cannot compensate for a poorly designed external fabric.

### Security

Include BMC access, firmware provenance, secure-boot policy, host identity, network segmentation, tenant isolation, and update authorization.

### Maintainability

A maintainable design has a documented supported baseline, automated inventory, repeatable diagnostics, staged upgrades, and clear escalation paths between customer, OEM, and NVIDIA support.

### Cost

Compare complete platform cost, including facilities, networking, storage, support, and operational staffing. The accelerator subsystem is only part of total cost.

## Production troubleshooting: same HGX, different behavior

### Scenario

Two servers use the same HGX generation, but one consistently underperforms.

### Investigation

1. Compare OEM model and exact bill of materials.
2. Compare CPU and host-memory configuration.
3. Compare PCIe and network-adapter topology.
4. Compare firmware bundles, BIOS settings, and power profiles.
5. Compare cooling state and thermal telemetry.
6. Compare driver, CUDA, and framework versions.
7. Compare workload CPU affinity and device placement.
8. Run the same approved benchmark with identical inputs.

### Likely causes

- different host CPU or memory configuration;
- different NIC placement or link state;
- firmware or BIOS drift;
- power or cooling constraints;
- process-affinity differences;
- storage or data-pipeline variation;
- an unhealthy external network path.

### Resolution

Normalize the systems to an approved OEM platform baseline before attributing the difference to the accelerator subsystem.

## Customer scenario

A customer requests “an HGX cluster” and asks several vendors for quotes. The proposals contain the same broad accelerator generation but differ in CPU design, memory, NIC count, cooling, rack density, firmware tooling, and support.

The architect should create a compliance matrix covering:

- workload and scaling requirements;
- host and accelerator topology;
- network and storage design;
- facility compatibility;
- management and observability;
- validated software stack;
- lifecycle and support ownership;
- acceptance testing.

Without that matrix, bids that look equivalent may represent materially different production platforms.

## Interview preparation

### Knowledge questions

1. Why is HGX not equivalent to a complete server?
2. Which parts of the final system are determined by the OEM?
3. Why can two HGX-based systems perform differently?

### Architecture questions

1. Draw the boundary between HGX and the surrounding OEM platform.
2. Create an evaluation matrix for two HGX-based servers.
3. Explain how network-adapter placement affects scale-out workloads.

### Customer questions

1. How would you explain support ownership among the customer, OEM, and NVIDIA?
2. What evidence would you require before approving an HGX-based platform for production?
3. How would facility constraints change the server shortlist?

## Key takeaways

- HGX is an integrated accelerator platform within a complete OEM server.
- The OEM design around HGX materially affects performance, operations, facilities, and support.
- Compare complete systems, not only accelerator specifications.
- Normalize firmware, topology, software, and workload placement before diagnosing platform differences.
- Support boundaries must be designed and documented before production deployment.

## Cross references

- [Volume 06 introduction](./index)
- [Chapter 01 — Why HGX Exists](./chapter-01-why-hgx-exists)
- [Lab 01 — Compare HGX-Based Server Designs](./labs/lab-01-compare-hgx-server-designs)
