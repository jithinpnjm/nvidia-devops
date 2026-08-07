---
title: Chapter 07 — Driver Containers and Node Operands
description: Operate privileged GPU node components as a host-lifecycle system, with clear readiness, security, and recovery boundaries.
sidebar_position: 8
tags: [gpu-operator, driver-container, daemonset]
---

# Driver Containers and Node Operands

The Kubernetes objects that make a GPU usable are Pods, but their work is often performed on the host. A driver container may interact with kernel modules and device files. A toolkit operand configures the container runtime. A device plugin communicates with the kubelet. Discovery and telemetry agents observe hardware state. These are node-operating components delivered through Kubernetes, not ordinary workload containers.

Their privilege is necessary for their job and dangerous if their supply chain, RBAC, or lifecycle is weak. A sound design starts by treating the node as the security and failure domain, then making the path from a newly joined node to an accepted GPU node explicit.

## Learning objectives

After this chapter, you will be able to:

- distinguish the host responsibilities of the major GPU node operands;
- select an ownership model for driver and runtime configuration;
- define GPU readiness beyond Kubernetes `NodeReady`; and
- diagnose recovery failures without masking the original host-level evidence.

## One node, several host-facing contracts

```mermaid
flowchart TD
    Kernel[Host kernel and OS]
    GPU[GPU and firmware]
    Driver[Driver operand or host driver]
    DriverOK{"Driver interface healthy?<br/>nvidia-smi exits 0"}
    DriverDown["No usable GPU:<br/>/dev/nvidia* absent or NVML init fails.<br/>Stop here — do not debug plugin or kubelet yet."]
    Runtime[Toolkit/runtime operand]
    Plugin[Device plugin]
    Kubelet[Kubelet]
    Discovery[Discovery]
    Validation[Validator]
    Workload[GPU workload]

    GPU -->|"evidence: lspci shows NVIDIA controller"| Driver
    Kernel -->|"evidence: kernel module signable and loadable for this kernel ABI"| Driver
    Driver --> DriverOK
    DriverOK -->|"No"| DriverDown
    DriverOK -->|"Yes — evidence: /dev/nvidia0, /dev/nvidiactl present"| Runtime
    DriverOK -->|"Yes"| Plugin
    DriverOK -->|"Yes"| Discovery
    Runtime -->|"evidence: CDI/runtime injects device + driver libs into container spec"| Workload
    Plugin -->|"evidence: Node.status.allocatable[nvidia.com/gpu] > 0"| Kubelet
    Runtime -->|"evidence: minimal CUDA container exits 0"| Validation
    Plugin -->|"evidence: plugin gRPC ListAndWatch reports Healthy device"| Validation
    Kubelet -->|"evidence: node status patch applied"| Validation
```

**Figure 10.7.1 — A node is ready for GPU workloads only when host, runtime, allocation, and validation contracts agree.** The `DriverOK` decision point is the load-bearing fork in this whole chapter: everything downstream — toolkit injection, plugin registration, discovery labels, validator success — is unreachable evidence if the driver interface itself is not healthy, so this is the first thing to check, not the last. The GPU Operator architecture and reconciliation model are covered in [Chapter 06](./chapter-06-gpu-operator-architecture).

| Operand or layer | Host-facing responsibility | Failure visible to users |
|---|---|---|
| Driver | bind the OS to the GPU and expose the driver interface | no usable GPU or failed CUDA initialization |
| Toolkit/runtime | make allocated devices and driver-facing components available to containers | GPU resource allocates, but the container cannot use it |
| Device plugin | register devices and health with kubelet, handle allocation | capacity missing or new workloads cannot be allocated |
| Discovery | publish selected hardware and software facts | wrong pool selection or unschedulable affinity |
| DCGM/exporter | observe hardware telemetry | monitoring blind spot, not necessarily workload failure |
| Validator | exercise defined integration boundaries | node may look healthy while remaining unaccepted |

The table is a diagnostic aid, not a promise that each failure maps to one Pod. The same symptom can be downstream of multiple failures. For example, an absent resource can originate in driver health, plugin configuration, kubelet registration, or scheduling labels.

## Driver containers are a delivery model, not an abstraction escape hatch

A driver container packages driver installation and host integration as a Kubernetes-managed operand. It can make intended versions, logs, and reconciliation visible in the cluster. It cannot make the host kernel irrelevant. Kernel ABI compatibility, module signing and secure-boot policy, node image content, GPU support, storage availability, and reboot behavior remain part of the contract.

Host-installed drivers remain reasonable when a golden-image pipeline, immutable OS policy, or support boundary owns that layer. The decision is architectural: choose who owns updates, evidence, rollback, and incident response. Do not allow both the image pipeline and an operator operand to independently modify the same driver or runtime configuration.

| Approach | Operational strength | Design obligation |
|---|---|---|
| Driver container | declarative rollout and Kubernetes-visible state | coordinate with node kernel lifecycle and privileged host access |
| Host-installed driver | reproducible image construction and OS-owned maintenance | surface driver version and validation status to the platform |
| Mixed ownership | accommodates constrained environments | define exactly which system controls each layer |

## Readiness has gates, not one boolean

`NodeReady` proves that kubelet has reported a functioning node. It does not prove that the driver loaded, that a runtime can inject a device, or that the advertised GPU works for a CUDA process. Adopt an explicit acceptance sequence for each GPU node:

1. **Infrastructure gate:** the correct image, kernel policy, network, registry access, and node-pool controls are present.
2. **Driver gate:** the GPU is visible to the host and the driver interface is healthy.
3. **Runtime gate:** an allocated test container receives the expected device path and driver interface.
4. **Kubernetes gate:** discovery labels and device-plugin allocatable resources match the intended class.
5. **Acceptance gate:** a scoped validation workload and required telemetry checks pass.

Only the last gate should make the node eligible for production workloads that depend on the platform contract. This can be represented by a controlled lifecycle label, taint removal, or pool admission mechanism. The mechanism matters less than documenting who changes it and what evidence permits the change.

**What the driver gate actually looks like.** The driver gate is not "the driver Pod is Running" — it is a specific successful query against the device:

```text
$ kubectl exec -n gpu-operator nvidia-driver-daemonset-4k7pl -- nvidia-smi
Wed Aug  6 14:02:11 2026
+-----------------------------------------------------------------------------------------------+
| NVIDIA-SMI 550.90.07              Driver Version: 550.90.07      CUDA Version: 12.4            |
|-----------------------------------------+------------------------+----------------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC       |
| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M.       |
|===========================================================================================|
|   0  NVIDIA H100 80GB HBM3          On  | 00000000:65:00.0 Off  |                    0       |
| N/A   34C    P0             118W / 700W |      0MiB /  81559MiB |      0%      Default        |
+-----------------------------------------------------------------------------------------------+
```

Driver Version, CUDA Version, and a `0MiB / 81559MiB` memory line with no error banner is the pass condition for the driver gate. Compare that with a failing node:

```text
$ kubectl exec -n gpu-operator nvidia-driver-daemonset-9xq2z -- nvidia-smi
Failed to initialize NVML: Driver/library version mismatch
```

That single line is enough to stop and route to the driver operand's own logs and kernel messages — it means the loaded kernel module version and the userspace NVML library the driver container shipped disagree, almost always from a partially-completed driver rollout or a node that kept an old kernel module loaded across a driver container upgrade. This is exactly the case the `DriverOK` decision point in Figure 10.7.1 is guarding: nothing downstream (runtime, plugin, kubelet, validator) can produce meaningful evidence while this gate fails, so a team that jumps straight to "restart the device plugin" on this symptom burns a maintenance window without touching the actual fault.

**What the runtime gate looks like when it fails even though the driver gate passed.** A test Pod that requests a GPU but whose container image or CDI configuration is wrong shows a different signature — the device plugin allocated a device, but the runtime never actually wired it into the container:

```text
$ kubectl exec -it cuda-validation-pod -- nvidia-smi
Failed to initialize NVML: Unknown Error
```

`Unknown Error` (rather than the version-mismatch message above) from *inside a container*, while `nvidia-smi` on the *host* is healthy, is the signature of a toolkit/CDI misconfiguration — the container runtime did not correctly bind-mount the driver's device nodes and libraries into the container's mount namespace. This is why the troubleshooting table below separates the "GPU allocated but unusable in Pod" row from the driver rows: the fix is a runtime/CDI configuration review, not a driver reinstall.

## Privilege and supply-chain controls

Host-integrating operands can require privileged execution, host filesystem mounts, access to device files, or runtime sockets. Such access can change the node’s security posture. Limit it to a protected namespace, approved service accounts, scoped node selectors, and images obtained through the organization’s approved registry path.

Review the following together:

- who may change the operator policy, operand image references, and service accounts;
- which host paths, sockets, capabilities, and namespaces each operand requires;
- how image provenance, vulnerability response, and air-gapped replication are handled;
- how user workloads are prevented from gaining equivalent host control; and
- whether audit logs identify configuration changes and node-level failures.

Avoid the false comfort of a restrictive application Pod policy while leaving the node-management namespace broadly writable. The privileged operand is a legitimate control-plane extension and needs equivalent protection.

## Recovery and maintenance behavior

Node reboots, kernel updates, runtime restarts, GPU resets, and replacement hardware all interrupt some part of the chain. Design the recovery path before the maintenance window. Drain workloads using their service-specific policy, preserve enough spare capacity, and expect distributed training to require coordinated checkpoint and restart behavior. A PodDisruptionBudget may limit voluntary disruption, but it does not make a driver update non-disruptive.

After a host change, wait for each readiness gate rather than assuming a DaemonSet rollout has completed. Reconfigure or revalidate feature discovery after partitioning or inventory changes. Keep the previous known-good node image, configuration, and required artifacts reachable long enough to perform the planned rollback.

**Sizing the maintenance window with a real number.** A driver container upgrade is disruptive per node — every GPU workload on that node loses its device during the module reload. Suppose a 40-node GPU pool runs mixed training and inference, and the platform team upgrades the driver operand DaemonSet with a `maxUnavailable: 4` rolling strategy. Each node needs roughly 6 minutes to drain existing Pods, reload the driver, and clear all five readiness gates (illustrative, based on typical driver-container reload plus validator run time). Draining 4 nodes at a time across 40 nodes is `40 / 4 = 10` batches, so total wall-clock time is `10 x 6 minutes = 60 minutes` if nothing stalls — but the number that actually matters for capacity planning is how much GPU capacity is unavailable *at any single instant*: `4 nodes x 8 GPUs/node = 32 GPUs` offline concurrently. If the cluster's inference pool needs 28 GPUs of headroom to stay within its latency SLO during the window, `maxUnavailable: 4` is already too aggressive on an 8-GPU-per-node fleet; `maxUnavailable: 2` (16 GPUs offline at a time) would fit the same 28-GPU headroom with margin. This is the arithmetic that should precede setting the rollout parameter, not follow an incident caused by it.

## Troubleshooting sequence

Start with the narrowest observable boundary and preserve evidence. On the affected node, verify the intended OS and kernel state, then inspect the driver operand or host driver, kernel messages, runtime configuration, device-plugin registration, and validation results. Compare a failing node with an accepted node in the same class; this often exposes a kernel, label, registry, or configuration difference faster than reading a large cluster-wide log stream.

| Symptom | First evidence | Likely next decision |
|---|---|---|
| Driver Pod restarting | operand logs, kernel logs, module-load evidence | repair compatibility or signing; do not proceed to plugin debugging |
| GPU absent from allocatable | host driver state, device-plugin logs, kubelet events | restore healthy discovery/allocation before changing workload manifests |
| GPU allocated but unusable in Pod | runtime logs, allocation data, minimal CUDA test | isolate toolkit/runtime from application image compatibility |
| Node returns after reboot but stays excluded | acceptance label or taint, validator result | complete the failed gate; do not manually mark accepted without evidence |
| Metrics disappear while workloads run | exporter and scrape path | treat as observability degradation and preserve workload evidence |

For driver investigation, kernel version, installed headers where relevant, secure-boot policy, signing, module-load logs, and node events are meaningful evidence. Commands that query or modify these details are host- and distribution-specific; use the operating system’s supported procedures and execute disruptive actions only in a drained maintenance scope.

**Evidence for the "Driver Pod restarting" row.** The driver operand's own logs almost always name the failure before kernel logs do:

```text
$ kubectl logs -n gpu-operator nvidia-driver-daemonset-4k7pl --previous
...
Sending 'nvidia' module removal request... done.
Installing NVIDIA driver kernel module...
modprobe: ERROR: could not insert 'nvidia': Key was rejected by service
```

`Key was rejected by service` is a secure-boot / module-signing failure, not a generic driver bug — the node has Secure Boot enabled and the driver container's kernel module is either unsigned or signed by a key not enrolled in the machine owner key (MOK) database. Cross-checking `journalctl -k | grep -i 'module verification failed'` on the host confirms the same fault from the kernel's side. This is the difference the table row is pointing at: "repair compatibility or signing" means enrolling the signing key or switching to a pre-signed/precompiled driver stream — restarting the plugin or kubelet touches nothing relevant.

**Evidence for the "GPU absent from allocatable" row.** `kubectl describe node` is the fastest way to see Capacity versus Allocatable diverge:

```text
$ kubectl describe node gpu-node-014 | grep -A2 'Capacity:\|Allocatable:'
Capacity:
  nvidia.com/gpu:  8
Allocatable:
  nvidia.com/gpu:  0
```

Capacity reflects what the device plugin discovered at least once; Allocatable reflects what it can offer *right now*. `8` versus `0` is the fingerprint of a device plugin that registered successfully in the past but has since lost contact with the driver or crashed — check `kubectl logs` on the device-plugin Pod for the same node next, not the scheduler.

## Customer architecture discussion

The operational choice is not "containers versus hosts." It is whether host changes are managed by a transparent, reconciled platform contract or hidden across manual processes. A mature service defines accepted node classes, protects privileged operands, and makes a node unavailable until it passes end-to-end validation. That keeps infrastructure change from leaking as an application-team debugging exercise.

## Interview preparation

**Why can every GPU operand Pod be Running while a workload still fails?**

**Model answer:** "`Running` only tells me the container process started and hasn't exited — it says nothing about whether the thing inside actually succeeded at its job. I've seen a driver container sit Running for hours after `modprobe` failed on a signing error, because the container's entrypoint doesn't exit on that failure, it just retries. The same goes for the device plugin: it can be Running and still be serving a stale device list from before a GPU reset. So I always validate the actual interface, not the Pod phase — `nvidia-smi` from inside the driver container for driver health, `Allocatable` on the Node object for plugin health, and a real CUDA-init test Pod for runtime health. Figure 10.7.1's `DriverOK` gate exists specifically because it's the fork where 'looks healthy' and 'is healthy' diverge."

**Why should driver containers be upgraded with a node lifecycle plan?**

**Model answer:** "Because a driver container upgrade isn't a stateless image swap — it reloads a kernel module underneath every GPU workload currently running on that node, which means every one of those workloads loses its device mid-execution. I'd want a plan that covers: compatibility review against the kernel ABI and CUDA versions workloads depend on, a drain sequence with enough spare capacity that draining doesn't starve the inference SLO, acceptance tests that walk all five readiness gates before the node rejoins the pool, and a rollback path that keeps the last known-good driver image and node config reachable. I'd size the blast radius in GPUs-offline-at-once, not just nodes-at-once — `maxUnavailable: 4` on an 8-GPU node means 32 GPUs disappear from the pool simultaneously, and that number is what capacity planning actually needs, not the node count."

## Key takeaways

- GPU node operands perform privileged host work even when packaged as Pods.
- Driver containers simplify delivery but retain kernel and platform dependencies.
- Pick one owner for each host-facing layer.
- Node readiness and GPU production acceptance are distinct states.
- Diagnose from host evidence toward allocation and workload execution, preserving the first failure.

## Cross references and further reading

- [GPU Operator Architecture](./chapter-06-gpu-operator-architecture)
- [Container Toolkit, RuntimeClass, and CDI](./chapter-03-container-toolkit-runtimeclass-and-cdi)
- [GPU Observability with DCGM](./chapter-09-gpu-observability-with-dcgm)
- [NVIDIA GPU Operator documentation](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/)
- [Kubernetes DaemonSet documentation](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)
