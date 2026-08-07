---
title: Volume 10 — Kubernetes GPU Platform
description: Design and operate the lifecycle that turns NVIDIA GPUs into reliable, schedulable Kubernetes infrastructure.
slug: /nvidia-zero-to-hero/volume-10/index
sidebar_position: 1
tags:
  - kubernetes
  - gpu-operator
  - platform-engineering
---

# Volume 10 — Kubernetes GPU Platform

A GPU node is not ready because Kubernetes reports `Ready`. It is ready when a compatible driver controls the hardware, the container runtime can construct a GPU-enabled sandbox, Kubernetes can advertise and allocate healthy devices, and a representative workload can execute. Those are separate contracts, owned by different layers, and they fail differently.

This volume develops the platform layer that makes those contracts repeatable. It starts at the boundary between Kubernetes and the host, follows the lifecycle through discovery, allocation, and runtime injection, then examines operator reconciliation, node operands, topology-aware scheduling, telemetry, installation, upgrades, and incident response. The goal is not to memorize manifests. It is to make a GPU fleet predictable during routine change and diagnosable when one of its dependency boundaries breaks.

| Volume field | Value |
|---|---|
| Audience | Experienced DevOps, SRE, platform, cloud, infrastructure, and MLOps engineers |
| Difficulty | Advanced |
| Estimated reading time | 18–24 hours, excluding labs |
| Prerequisites | Kubernetes node and workload operations; Volumes 01–09 |
| Outcome | Design, validate, upgrade, and troubleshoot a production Kubernetes GPU platform |

## The Platform Contract

```mermaid
flowchart TD
    Start[GPU node enters or returns to the pool] --> H{Host driver proves every expected GPU?}
    H -->|"No: lspci / nvidia-smi / kernel logs disagree"| HFail[Quarantine node; repair hardware, kernel, firmware, or driver]
    H -->|"Yes: nvidia-smi lists expected UUIDs"| R{Fresh GPU container starts through the approved runtime?}
    R -->|"No: kubelet or CRI reports handler, CDI, mount, or sandbox error"| RFail[Inspect RuntimeClass, containerd, Toolkit, CDI, and security policy]
    R -->|"Yes: validation container initializes CUDA"| A{Kubelet advertises expected GPU resources?}
    A -->|"No: Capacity or Allocatable missing"| AFail[Inspect device-plugin Pod, registration logs, and kubelet state]
    A -->|"Yes: kubectl node status shows expected count"| P{Placement matches the workload contract?}
    P -->|"No: Pending event or wrong pool/topology"| PFail[Inspect labels, taints, affinity, quota, and fragmentation]
    P -->|"Yes: assigned node and class are correct"| O{Workload and telemetry acceptance pass?}
    O -->|"No: application, DCGM, scrape, or performance evidence fails"| OFail[Keep node out of service and isolate the first failed upper layer]
    O -->|"Yes: workload result plus fresh metrics"| Accept[Admit node or pool into production service]
```

**Figure 10.0.1 — Admission is a sequence of evidence gates.** Each edge names the proof that allows the investigation to advance. A failure branch identifies the team and evidence boundary to inspect next. The important operational rule is that a passing lower gate does not prove the next gate.

### A representative evidence read

The following output is **representative**, not captured from this environment.

```text
$ kubectl get nodes -o custom-columns=NAME:.metadata.name,READY:.status.conditions[-1].status,CAPACITY:.status.capacity.nvidia\.com/gpu,ALLOCATABLE:.status.allocatable.nvidia\.com/gpu
NAME          READY   CAPACITY   ALLOCATABLE
gpu-canary-1  True    8          8
gpu-worker-7  True    <none>     <none>
```

`gpu-canary-1` has passed only the Kubernetes advertisement gate: kubelet reports eight units of the extended resource. It still needs runtime, workload, and telemetry proof. `gpu-worker-7` demonstrates why `Ready=True` is not GPU readiness. The kubelet is healthy enough to participate in the cluster, but no GPU resource is registered. The next investigation is the host driver, device-plugin Pod, and kubelet registration path—not the application image.

A 64-GPU cluster can also be numerically healthy while operationally short of capacity. Suppose eight nodes each contain eight GPUs:

```text
8 nodes × 8 GPUs = 64 physical GPUs

One node quarantined for a missing device-plugin registration:
7 accepted nodes × 8 GPUs = 56 schedulable GPUs

One additional node reserved as upgrade headroom:
6 workload nodes × 8 GPUs = 48 guaranteed workload GPUs
```

The physical inventory remains 64, but the platform can safely promise only 48 during that maintenance state. This is why capacity reporting must distinguish physical, advertised, allocated, quarantined, and reserved capacity.

The platform team should be able to state, and continuously test, a concrete contract:

- which node images, kernels, GPU models, drivers, and runtime configurations are supported;
- which GPU resource names and workload classes application teams may request;
- what evidence admits a node into service and what evidence removes it;
- how a disruptive change is canaried, drained, validated, rolled back, and communicated.

That contract is more valuable than a one-time installation guide. It converts a collection of privileged node components into an operable service.

## How to Read This Volume

The first four chapters establish the dependency chain. Chapter 1 explains why CPU-era Kubernetes operations are not enough for GPUs. Chapter 2 turns the software stack into a lifecycle and change-management problem. Chapter 3 covers the runtime boundary—NVIDIA Container Toolkit, RuntimeClass, and CDI. Chapter 4 explains the Kubernetes device-plugin API and the limits of an integer extended resource.

Chapters 5 through 9 add the controls needed to operate that chain: capability labels, GPU Operator reconciliation, privileged node operands, placement and topology, and DCGM-based observability. The final chapters turn those controls into installation, upgrade, rollback, and troubleshooting practice.

## Chapter Sequence

1. [Why Kubernetes Needs a GPU Platform Layer](./chapter-01-why-kubernetes-needs-a-gpu-platform-layer)
2. [GPU Software Lifecycle in Kubernetes](./chapter-02-gpu-software-lifecycle-in-kubernetes)
3. [NVIDIA Container Toolkit, RuntimeClass, and CDI](./chapter-03-container-toolkit-runtimeclass-and-cdi)
4. [Device Plugin and Kubernetes Resource Model](./chapter-04-device-plugin-and-kubernetes-resource-model)
5. [Node and GPU Feature Discovery](./chapter-05-node-and-gpu-feature-discovery)
6. [GPU Operator Architecture](./chapter-06-gpu-operator-architecture)
7. [Driver Containers and Node Operands](./chapter-07-driver-containers-and-node-operands)
8. [GPU Scheduling and Topology](./chapter-08-gpu-scheduling-and-topology)
9. [GPU Observability with DCGM](./chapter-09-gpu-observability-with-dcgm)
10. [Production Installation and Configuration](./chapter-10-production-installation-and-configuration)
11. [Upgrades and Production Troubleshooting](./chapter-11-upgrades-and-production-troubleshooting)
12. [Volume 10 Summary](./chapter-12-volume-10-summary)

## Operating Perspective

Treat every platform change as a hypothesis about the whole chain. A successful driver DaemonSet rollout is not proof that Pods can use CUDA. A visible `nvidia.com/gpu` resource is not proof that the intended GPU class, NUMA locality, or framework image is suitable. Conversely, a failed workload does not prove the device plugin is at fault.

The validation sequence follows the dependency order: hardware and driver, runtime injection, resource advertisement, a minimal GPU container, then a representative workload. The troubleshooting sequence uses the same order. This volume returns to that discipline repeatedly because it prevents the most expensive failure mode in GPU operations: debugging symptoms at the application layer while a lower platform boundary is broken.

## Planned Labs

- [Inspect a Kubernetes GPU Node](./labs/lab-01-inspect-a-kubernetes-gpu-node)
- [Install and Validate GPU Operator](./labs/lab-02-install-and-validate-gpu-operator)
- [Diagnose a Missing Allocatable GPU](./labs/lab-03-diagnose-a-missing-allocatable-gpu)
- [Perform a Controlled GPU Platform Upgrade](./labs/lab-04-perform-a-controlled-gpu-platform-upgrade)

Before running a lab, establish whether it targets real GPU hardware. Commands that load a driver, reset a device, drain a production node, or alter a container runtime are hardware- and environment-specific; they must run only in the scoped lab or maintenance environment described by the lab.

## Further Reading

- [Kubernetes device plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/device-plugins/)
- [Kubernetes extended resources](https://kubernetes.io/docs/tasks/configure-pod-container/extended-resource/)
- [NVIDIA GPU Operator documentation](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/)
- [NVIDIA Container Toolkit documentation](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/)
