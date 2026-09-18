---
title: Chapter 12 — Volume 10 Summary
description: Consolidate the Kubernetes GPU platform lifecycle from driver and runtime through scheduling, observability, upgrades, and troubleshooting.
sidebar_position: 13
tags: [kubernetes, gpu-operator, summary]
---

# Volume 10 Summary

Kubernetes schedules a declared extended resource; it does not, by itself, create a safe GPU lifecycle. A production platform must make the GPU usable on the host, expose it to the chosen container runtime, discover and advertise it to the kubelet, describe its capability to the scheduler, inject it into a workload, observe its health, and change the entire stack without leaving incompatible layers behind.

That chain is the central model of this volume. It gives the platform team a way to turn “GPU Pod failed” into a smaller, testable question about one interface at a time.

## The platform lifecycle

```mermaid
flowchart TD
    Hardware[GPU hardware and firmware] -->|"nvidia-smi initializes (Ch1, Lab1)"| Driver[Kernel driver]
    Driver -->|"crictl inspect shows /dev/nvidiaN injected (Ch3)"| Runtime[Container Toolkit, CDI, or runtime handler]
    Driver -->|"kubelet Allocatable.nvidia.com/gpu > 0 (Ch4)"| Plugin[Device Plugin and kubelet registration]
    Hardware -->|"node labels nvidia.com/gpu.product=... (Ch5)"| Discovery[NFD and GPU feature discovery]
    Runtime -->|"nvidia-smi succeeds inside container"| Workload[GPU workload]
    Plugin --> Scheduler[Kubernetes resource and scheduler]
    Discovery --> Scheduler
    Scheduler -->|"Pod bound + placement contract met (Ch8)"| Workload
    Hardware -->|"DCGM_FI_DEV_* fields populate (Ch9)"| DCGM[DCGM and exporter]
    Workload --> Evidence["Workload, node, and device evidence —\nthe basis for every troubleshooting table in this volume"]
    DCGM --> Evidence
    Evidence -->|"any single link above unproven"| Gap["Gap = the exact chapter to re-open,\nnot a reason to reinstall everything"]
```

**Figure 10.12.1 — The GPU platform is a chain of contracts, each proven by a specific piece of evidence from earlier chapters.** A healthy lower layer is necessary but not sufficient for the layer above it — this recap diagram exists specifically to show that the volume's individual per-chapter evidence checks (the edge labels, each traceable back to its source chapter) compose into one end-to-end diagnosis path, not eleven unrelated topics. The `Gap` node is the practical payoff: when something fails, the broken edge in this diagram names the chapter to open, instead of restarting the whole install.

## What each component is responsible for

| Component | Responsibility | It does not prove |
|---|---|---|
| GPU hardware and firmware | Makes a physical device available with its platform-level behavior | That the operating system or a workload can use it |
| NVIDIA driver | Exposes the device to the host and supports CUDA execution | That a container receives the device |
| Container Toolkit, CDI, or runtime handler | Makes the approved GPU path available to containers | That kubelet advertises a schedulable resource |
| Device plugin | Registers and allocates GPU extended resources with kubelet | That placement meets topology or workload requirements |
| NFD and GPU feature discovery | Publishes node capabilities for placement and policy | That labels reflect an accepted, healthy node unless the platform enforces that contract |
| GPU Operator | Reconciles enabled GPU platform operands | That every operand is healthy or every workload works |
| Scheduler policy | Selects a node that satisfies declared constraints | That the resulting CPU, NIC, and GPU topology is optimal |
| DCGM Exporter | Exposes selected device telemetry | That an alert has workload impact or a responder action |

This separation of responsibility is useful in design reviews and incidents. It prevents the imprecise statement “the GPU Operator is broken” from hiding a node-image, runtime, device-plugin, scheduler, or workload problem.

## The production operating model

Make the following decisions explicit and source controlled:

- Define eligible GPU node pools, their labels and taints, and the workload classes they serve.
- Choose driver and runtime ownership: curated host image, host automation, operator-managed operands, or a deliberate combination with clear boundaries.
- Pin and qualify the complete compatibility set: Kubernetes, node image and kernel, driver, runtime, operator, operand images, firmware where relevant, and validation workload.
- Treat privileged operands, host mounts, registry access, and RBAC as platform security controls rather than installation details.
- Accept nodes only after a real GPU workload, expected resource advertisement, required topology behavior, and telemetry path all pass.
- Preserve a representative canary pool, spare capacity, a maintenance process, and a coherent rollback path.

The goal is not to expose the maximum number of knobs. It is to offer a small number of stable platform classes—such as topology-sensitive training, latency-sensitive inference, or flexible batch—whose placement, sharing, and lifecycle rules are understandable to users and operators.

## A reusable diagnosis sequence

When a GPU workload is pending, fails, or slows down, establish the scope and change timeline first. Then walk the dependency chain rather than hopping between dashboards:

1. Verify hardware inventory, node boot state, kernel, driver, and device evidence.
2. Verify runtime injection and the creation of a fresh GPU Pod.
3. Verify device-plugin registration, kubelet state, capacity, and allocatable resources.
4. Verify labels, taints, affinity, quotas, priority, and any coordinated-scheduling rule.
5. Verify the allocated workload, security context, image libraries, CUDA initialization, and application behavior.
6. Correlate DCGM, driver, Kubernetes, network, storage, and application evidence at the same time range.

This is an evidence order, not a claim that every fault starts in hardware. It is designed to find the first broken interface and avoid changing healthy layers before they have been ruled out.

## Revision prompts

**Why is a `Running` GPU Pod not proof of GPU health?**

**Model answer:** "`Running` is Kubernetes telling me the container process started and hasn't exited — that's a lifecycle fact, not a hardware or CUDA fact. I've walked into incidents where a Pod had been `Running` for hours while its GPU had already fallen off the bus, because nothing about the container lifecycle depends on the application actually calling into CUDA successfully. Proof of GPU health is `nvidia-smi` succeeding inside that specific container, DCGM showing no reliability events for that UUID, and the workload's own throughput metrics — three separate checks, none of which `kubectl get pod` can answer for you."

**Why is resource quantity insufficient for placement?**

**Model answer:** "`nvidia.com/gpu: 4` is an integer — it says nothing about which four GPUs, whether they're NVLink peers or scattered across PCIe roots, whether the CPU cores and NIC assigned sit on the same NUMA node, or whether a sharing mode like MIG changes what 'one unit' even means. Two Pods can both get an allocation that satisfies the same integer request and see completely different real-world performance. That's the whole argument for treating capacity, eligibility, locality, and coordination as four separate questions instead of trusting the count."

**What makes a deployment production-ready?**

**Model answer:** "Six things have to all be true at once, not just one: a compatibility set that's actually been qualified together — kernel, driver, runtime, operator, firmware; clear ownership and security boundaries so I know who's authoritative for each layer; operands that are reconciled and green; a workload and telemetry acceptance gate that ran on this specific node, not just a chart status; a documented recovery path that covers host state, not only Helm; and enough spare capacity to actually execute a canary or drain without an outage. Any one of those missing is a deployment that looks done and isn't."

**Why is rollback more than Helm rollback?**

**Model answer:** "Because `helm rollback` only touches what the chart controls — Kubernetes objects. If the change that broke things also touched the node — a driver module, a kernel, firmware — reverting the chart doesn't put the host back to a matching state, it just makes the control plane's *description* of the state wrong again in the opposite direction. Real rollback means figuring out which layers actually changed and restoring a tested, coherent combination across all of them — sometimes that's a chart revert, sometimes it's booting a known-good node image, and it's often both."

## Continue the practice

Use the labs to turn the lifecycle into observable evidence: inspect a node, install and validate the platform, diagnose missing allocatable GPUs, and perform a controlled upgrade. Keep the exact validation image, expected evidence, and rollback decision points with the platform’s runbooks; an operator should not have to improvise them under pressure.

Revisit the key chapters as you operate the platform:

- [NVIDIA Container Toolkit, RuntimeClass, and CDI](./chapter-03-container-toolkit-runtimeclass-and-cdi) for the container boundary.
- [Device Plugin and Kubernetes Resource Model](./chapter-04-device-plugin-and-kubernetes-resource-model) and [Node and GPU Feature Discovery](./chapter-05-node-and-gpu-feature-discovery) for advertisement and labeling.
- [GPU Operator Architecture](./chapter-06-gpu-operator-architecture) and [Driver Containers and Node Operands](./chapter-07-driver-containers-and-node-operands) for reconciliation and host ownership.
- [GPU Scheduling and Topology](./chapter-08-gpu-scheduling-and-topology), [GPU Observability with DCGM](./chapter-09-gpu-observability-with-dcgm), and [Upgrades and Production Troubleshooting](./chapter-11-upgrades-and-production-troubleshooting) for the production feedback loop.

## Next volume

[Volume 11 — GPU Sharing](../volume-11/index) extends this platform model to MIG, time slicing, vGPU, isolation, multi-tenancy, scheduling, accounting, and performance trade-offs.
