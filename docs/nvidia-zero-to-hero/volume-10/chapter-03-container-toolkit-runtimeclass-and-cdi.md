---
title: Chapter 03 — NVIDIA Container Toolkit, RuntimeClass, and CDI
description: Understand the runtime boundary that turns a Kubernetes GPU allocation into a usable container device interface.
sidebar_position: 4
tags: [container-toolkit, runtimeclass, cdi]
---

# NVIDIA Container Toolkit, RuntimeClass, and CDI

Scheduling a GPU is not the same as giving a process a GPU. The scheduler selects a node using an extended-resource request; the kubelet asks the device plugin to allocate devices; then the CRI runtime creates a sandbox. At that final boundary, device nodes, driver-facing libraries, mounts, environment, and permissions must describe the allocation accurately. NVIDIA Container Toolkit provides the NVIDIA-specific runtime integration needed by supported container runtimes.

This boundary deserves separate design and validation. A node may advertise GPUs correctly and still produce Pods that cannot create a CUDA context. That is not a contradiction: allocation is a kubelet/device-plugin concern, while sandbox construction is a runtime concern.

## Learning Objectives

After this chapter, you can:

- explain the handoff from device allocation to container creation;
- distinguish the host driver from CUDA and framework components in an image;
- distinguish RuntimeClass runtime selection from CDI device description;
- choose a standardized runtime path for a cluster; and
- isolate runtime-injection failures from scheduling and application failures.

## From Allocation to Process

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant K as Kubelet
    participant DP as Device plugin
    participant CRI as CRI runtime
    participant NCT as NVIDIA Container Toolkit / CDI
    participant C as Container process
    S->>K: Bind Pod to GPU node
    K->>DP: Allocate requested devices
    DP-->>K: Allocation response
    K->>CRI: Create Pod sandbox and container
    CRI->>NCT: Resolve NVIDIA device configuration
    NCT-->>CRI: Device, mount, and environment edits
    CRI->>C: Start allocated GPU container
```

**Figure 10.3.1 — Runtime injection follows, rather than replaces, Kubernetes allocation.** The components and exact data path vary with the selected runtime and device-plugin configuration, but a scheduled Pod has not succeeded until its sandbox is created with the allocation.

The host owns the kernel modules and the low-level driver interface. The workload image owns the application, its framework, and its CUDA user-space dependencies. The toolkit bridges those domains at container start. Putting a kernel driver in every application image would not solve the host-kernel problem; it would obscure it and make version control unmanageable.

## Three Mechanisms, Three Different Questions

| Mechanism | Question it answers | Scope | Common misuse |
|---|---|---|---|
| NVIDIA Container Toolkit configuration | How does this node’s runtime support NVIDIA devices? | Node runtime | Treating it as an application dependency |
| RuntimeClass | Which configured runtime handler should this Pod use? | Pod scheduling/runtime selection | Assuming it itself allocates a GPU |
| Container Device Interface (CDI) | How is a device described to a CDI-capable runtime? | Device injection | Assuming CDI makes the device schedulable |

RuntimeClass is a Kubernetes API object that refers to a runtime handler configured on each eligible node. It can also carry scheduling information and overhead. It is valuable when a platform intentionally exposes more than one runtime path, but it is not a substitute for consistent runtime configuration across the nodes selected by the Pod.

CDI is an open specification for describing container devices and their required edits. A CDI-capable runtime consumes a device reference and applies the specified device nodes, mounts, environment, or hooks. NVIDIA tooling and the device plugin can be configured to use CDI-related strategies in supported environments. The platform must qualify the exact runtime, toolkit, plugin, and Kubernetes combination it deploys; “CDI” is a mechanism, not a universal compatibility claim.

## Design the Runtime Contract

Avoid making application teams choose among undocumented handler names or node-local exceptions. Publish a small runtime contract:

- supported container runtime and its versioned configuration;
- whether GPU workloads use a RuntimeClass and, if so, its stable name and eligible node pools;
- the supported toolkit and device-plugin strategy, including CDI where enabled;
- a minimal approved validation image and the expected evidence;
- ownership and rollback steps for the runtime configuration.

Store node-runtime configuration and GPU Operator values in version control. Manual edits to a live runtime configuration are particularly risky: they can differ across the fleet, be overwritten by a reconciler, or not take effect until the correct service restart. [Chapter 7](./chapter-07-driver-containers-and-node-operands) explains why this is privileged node infrastructure.

## Production Story: Schedulable but Unusable

After a node-image refresh, the device plugin continues to advertise the expected resource. GPU Pods schedule, but newly created containers fail during startup. The team initially chases quotas and scheduler events because the failure begins with a Kubernetes workload. The decisive evidence is different: a bound Pod, successful allocation, and a CRI error that exposes a runtime configuration mismatch on the refreshed pool.

The recovery is to stop scheduling onto the affected nodes, restore the known-good runtime profile, restart only the required node service under the approved procedure, and run the minimal validation container before reopening the pool. The prevention is a runtime gate in the image-refresh pipeline, not another workload retry.

## Security and Isolation

Runtime configuration controls what privileged device interfaces enter a container. Protect its configuration, sockets, and operator operands with image provenance, registry policy, RBAC, and narrow write access. Workload-level access control also matters: a request for a GPU should be governed by namespace policy, quotas, and the appropriate node pool—not by a user’s ability to alter host runtime settings.

Do not conflate device access with tenant isolation. The runtime correctly injecting a GPU answers an execution question. Isolation and sharing semantics depend on the GPU configuration, the resource exposed by the plugin, and the platform policy; [Volume 11](../volume-11/index) covers these models.

## Troubleshooting the Runtime Boundary

| Symptom | Evidence to inspect | Likely boundary |
|---|---|---|
| Pod remains Pending | Events, request, allocatable capacity, affinity | Scheduling or policy; runtime has not run yet |
| Bound Pod fails before application logs | Kubelet and CRI logs, handler configuration | Runtime sandbox creation |
| Process starts but sees no expected GPU | Allocation result, toolkit/CDI configuration, container device view | Injection path |
| CUDA initialization fails after injection | Driver version, image stack, framework logs | Driver-to-image compatibility |
| Same manifest fails on one pool | Compare runtime revision, handler availability, node image | Fleet drift |

Use a minimal approved GPU workload to separate the platform from the application. If that workload fails on the node, do not begin by changing framework flags. If it succeeds and the production image fails, retain the Pod specification and compare image behavior and compatibility evidence.

## Customer Architecture Discussion

Application teams should experience a stable request contract—resource name, supported image family, and any documented RuntimeClass—not the internal debate between runtime hooks and CDI. Platform teams should retain the implementation choice because it carries runtime support, security, and upgrade consequences.

This separation also improves incident communication. “The resource is allocated but runtime injection is failing on the new node image” is an actionable platform statement. “GPU Pod broken” is not.

## Interview Questions

**Why does a RuntimeClass not make a GPU workload schedulable by itself?**

RuntimeClass selects a configured runtime handler and can influence scheduling constraints. A GPU resource remains schedulable only after the device plugin has reported it to the kubelet and the Pod requests it.

**Why keep the NVIDIA driver on the host?**

The driver interfaces with the host kernel and hardware. The host lifecycle must control that relationship; images carry application-level libraries and frameworks that consume the supported host-driver interface.

## Key Takeaways

- GPU allocation, runtime injection, and CUDA execution are separate gates.
- NVIDIA Container Toolkit bridges the host driver and container runtime; it is not a driver replacement.
- RuntimeClass selects a runtime handler; CDI describes a device to CDI-capable runtimes.
- Standardize and qualify one clear runtime contract per platform release.
- A minimal GPU container is the fastest safe discriminator between runtime and application faults.

## Cross References

- [GPU Software Lifecycle in Kubernetes](./chapter-02-gpu-software-lifecycle-in-kubernetes)
- [Device Plugin and Kubernetes Resource Model](./chapter-04-device-plugin-and-kubernetes-resource-model)
- [Driver Containers and Node Operands](./chapter-07-driver-containers-and-node-operands)
- [Volume 11 — GPU Sharing and Virtualization](../volume-11/index)
