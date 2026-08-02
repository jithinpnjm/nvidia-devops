---
title: "Chapter 12 — Sharing: MIG, time-slicing, MPS and vGPU"
slug: "senior-deep-dive-5-sharing-mig-time-slicing-mps-and-vgpu"
sidebar_position: 12
description: "Chapter 5 — Sharing: MIG, time-slicing, MPS and vGPU — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
These mechanisms solve different problems. MIG partitions supported GPUs into hardware-isolated instances with dedicated portions of compute and memory-system resources, giving much stronger performance isolation than simple time-sharing. Time-slicing lets multiple workloads take turns on a GPU but does not create the same memory or fault isolation. MPS improves concurrent CUDA process execution for compatible workloads. vGPU virtualizes GPU access into VMs and involves a separate licensing and hypervisor stack.

Choose from requirements: isolation, predictable latency, memory capacity, workload elasticity, operational complexity and licensing. A small inference model requiring predictable tenant isolation may fit MIG; a bursty development cluster may prefer time-sharing; large training normally needs whole GPUs with topology-aware placement.

## Build from the normal path

Start with the requirement that must remain true when another tenant is busy or faulty. “Higher utilization” is not specific enough.

| Mechanism | Scheduling boundary | Memory isolation | Typical fit | Main caution |
|---|---|---|---|---|
| Whole GPU | one workload owns the device | strongest practical boundary | distributed training, latency-sensitive serving | unused capacity cannot be borrowed automatically |
| MIG | hardware-backed GPU instances on supported GPUs | dedicated memory slices and stronger fault/QoS isolation | predictable multi-tenant inference | profiles are finite; reconfiguration needs lifecycle planning |
| Time-slicing | processes take turns on one GPU | no dedicated memory or fault domain | development, notebooks, bursty best-effort work | advertised replicas are not additional physical capacity |
| MPS | compatible CUDA processes share execution more efficiently | processes still share a device | tightly controlled cooperative workloads | not a general multi-tenant security boundary |
| vGPU | mediated device exposed to virtual machines | depends on vGPU profile and platform | VM estates and VDI/enterprise virtualization | licensing, hypervisor and guest-driver compatibility add owners |

### Decision example

A platform has one 80 GB GPU and four inference services, each using 14 GB. If p99 latency must remain predictable when a neighbor spikes, time-slicing is a weak fit even though the arithmetic says the models fit. MIG may provide the needed isolation if a supported profile supplies enough memory and compute. If one model later needs 55 GB, the profile plan no longer fits; the decision must be revisited rather than silently overcommitting memory.

Validate the choice in four steps: confirm the physical/MIG inventory, confirm what the scheduler advertises, run concurrent load rather than a single-process benchmark, and inject one tenant failure. Measure latency distributions, memory errors and reset impact. A successful allocation proves scheduling; it does not prove isolation or service-level performance.
