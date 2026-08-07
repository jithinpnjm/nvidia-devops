---
title: Chapter 04 — Device Plugin and Kubernetes Resource Model
description: Understand how healthy NVIDIA devices become Kubernetes extended resources and how kubelet allocation reaches a Pod.
sidebar_position: 5
tags: [kubernetes, device-plugin, scheduling]
---

# Device Plugin and Kubernetes Resource Model

The Kubernetes scheduler cannot inspect a GPU driver, reason about device files, or allocate a vendor device directly. The device-plugin framework separates that vendor-specific work from the scheduler. An NVIDIA device plugin discovers supported devices on a node, registers with the kubelet, reports their health, and participates in allocation when a bound Pod requests the corresponding resource.

This model makes a GPU schedulable. It intentionally does not make every hardware characteristic schedulable. That boundary is the source of both its operational simplicity and its most important production trade-offs.

## Learning Objectives

After this chapter, you can:

- explain device-plugin registration, health reporting, and allocation at a high level;
- distinguish node capacity, allocatable resources, a Pod request, and an allocated device;
- explain why extended resources express quantity rather than placement quality;
- identify the policy needed for GPU classes, topology, and sharing; and
- troubleshoot a missing or unusable GPU without confusing resource advertisement with workload success.

## The Kubelet Contract

```mermaid
sequenceDiagram
    participant DP as NVIDIA device plugin
    participant K as Kubelet
    participant API as Kubernetes API
    participant S as Scheduler
    participant P as GPU Pod
    DP->>K: Register(endpoint, "nvidia.com/gpu")
    Note over DP,K: evidence: gRPC Register() returns OK;<br/>kubelet log shows "Registered plugin for nvidia.com/gpu"
    DP->>K: ListAndWatch stream opens
    K->>DP: healthy device count?
    alt devices healthy (Health: "Healthy")
        DP-->>K: Device list, all Healthy
        K->>API: Publish capacity/allocatable = N
        Note over K,API: evidence: Node.status.allocatable["nvidia.com/gpu"] = N
    else devices unhealthy or stream drops
        DP-->>K: Health: "Unhealthy" or stream closes
        K->>API: Publish capacity/allocatable = 0 (or stale count)
        Note over K,API: evidence: allocatable drops to 0 even though<br/>capacity may still show the old number
    end
    P->>S: Request nvidia.com/gpu: 1
    S->>API: Bind Pod to eligible node
    K->>DP: Allocate(deviceIDs) for bound Pod
    DP-->>K: AllocateResponse: device paths, mounts, env
    K->>P: Create sandbox through CRI runtime
```

**Figure 10.4.1 — The kubelet is the bridge between a device plugin and Kubernetes scheduling.** The scheduler reads node resource state from the API; it does not call the plugin. Allocation occurs after a Pod is bound to a node. The `alt` block makes the two operationally distinct outcomes explicit: a plugin that is registered but reporting unhealthy devices (or whose `ListAndWatch` stream has dropped) publishes `allocatable = 0` even while `capacity` can still show the old number — this is exactly the split behind the "Resource absent on node" troubleshooting row below, and it is why `kubectl describe node` capacity alone is not proof the plugin is healthy right now.

The plugin exposes a local gRPC endpoint under the device-plugin framework and registers it with the kubelet. `ListAndWatch` keeps the kubelet informed of the discovered device IDs and health state. When the health set changes, the kubelet updates the node’s resource view. During allocation, the plugin returns the device-specific information required by the node’s configured runtime path. [Chapter 3](./chapter-03-container-toolkit-runtimeclass-and-cdi) covers the next handoff to the runtime.

The exact API version and allocation strategy are implementation details that must match the Kubernetes release and NVIDIA device-plugin configuration in use. Treat the plugin’s release notes and supported configuration as the authority, rather than copying old socket paths or annotations from a different cluster.

**What the contract looks like as real output.** `kubectl describe node` on a healthy GPU node shows capacity and allocatable as separate lines, and they normally agree:

```text
$ kubectl describe node gpu-node-07
...
Capacity:
  cpu:                64
  memory:             527923648Ki
  nvidia.com/gpu:     8
Allocatable:
  cpu:                63500m
  memory:             520192000Ki
  nvidia.com/gpu:     8
...
Allocated resources:
  Resource           Requests    Limits
  --------           --------    ------
  nvidia.com/gpu     6           6
```

`Capacity: nvidia.com/gpu: 8` is what the device plugin registered as physically present. `Allocatable: nvidia.com/gpu: 8` matching capacity is the healthy case from the diagram's success branch — every device is currently reporting `Health: Healthy`. `Allocated resources: 6` means the scheduler has already bound Pods consuming 6 of the 8, so only 2 remain schedulable even though both capacity and allocatable read 8. If the plugin instead reported 3 devices unhealthy, allocatable would read `5` while capacity stayed at `8` — that gap between the two numbers is the single fastest signal that devices went unhealthy after boot, versus never having existed.

The registration itself is visible in the device-plugin Pod's own logs, not the kubelet's:

```text
$ kubectl logs -n gpu-operator nvidia-device-plugin-daemonset-4kxqz
I0812 09:14:02.881112       1 main.go:279] Starting FS watcher.
I0812 09:14:02.881390       1 main.go:287] Starting OS watcher.
I0812 09:14:02.912004       1 main.go:337] Retrieving plugins.
I0812 09:14:03.004215       1 server.go:216] Starting GRPC server for 'nvidia.com/gpu'
I0812 09:14:03.006771       1 server.go:139] Starting to serve 'nvidia.com/gpu' on /var/lib/kubelet/device-plugins/nvidia-gpu.sock
I0812 09:14:03.011552       1 server.go:146] Registered device plugin for 'nvidia.com/gpu' with Kubelet
```

The last line, `Registered device plugin for 'nvidia.com/gpu' with Kubelet`, is the direct evidence for the `Register()` arrow in Figure 10.4.1. If this line is absent from the logs but the Pod shows `Running`, the plugin process is alive but has not completed the handshake — the node will show no `nvidia.com/gpu` line at all under `Capacity`, not a `0`, because the resource was never advertised in the first place.

## Read the Resource States Precisely

| State | Meaning | What it does not prove |
|---|---|---|
| Node capacity | Quantity the kubelet reports as present | That every device is allocatable or a workload can use one |
| Node allocatable | Quantity available to scheduling after kubelet accounting | Runtime injection, CUDA initialization, or desired topology |
| Pod request/limit | Quantity the workload asks Kubernetes to reserve | That an eligible node exists |
| Pod binding | Scheduler chose a node | That the kubelet has completed allocation |
| Allocation | Kubelet/plugin selected devices for the bound Pod | That the application stack can execute |
| Workload validation | A process used the device successfully | Performance, distributed behavior, or tenant policy |

For extended resources such as a GPU, Kubernetes expects the quantity in `limits`; when a request is specified it must match the limit. GPUs are ordinarily consumed as whole allocatable units. Sharing, MIG, and virtual-GPU policies can expose different resource names or quantities, but they are deliberate platform configurations—not implicit overcommit behavior. See [Volume 11](../volume-11/index) before promising concurrency or isolation semantics to tenants.

## The Resource Model’s Productive Limitation

The default scheduler can filter and score based on resource quantity and Kubernetes placement rules. It does not automatically infer that a training job needs four mutually close GPUs, a particular compute capability, a GPU close to a NIC, or a reserved low-latency pool. A bare resource request is therefore a capacity contract, not a hardware-intent contract.

| Requirement | Mechanism to add | Trade-off |
|---|---|---|
| Supported GPU class | Controlled feature labels and node affinity | Tighter eligibility can strand capacity |
| Dedicated pool | Taints, tolerations, quota, and namespace policy | More pools increase operational overhead |
| CPU/device locality | CPU Manager, Topology Manager, and qualified placement policy | Strict alignment can reduce utilization |
| Multi-Pod job start | Queue or gang-aware scheduling integration | More scheduler complexity |
| Shared GPU experience | Explicit MIG, time-slicing, or vGPU design | Different resource and isolation semantics |

This is not a defect in the device plugin. It is a clean separation of responsibilities. The plugin provides device discovery and allocation. The platform adds policy based on workload intent. [Chapter 8](./chapter-08-gpu-scheduling-and-topology) develops the placement consequences.

## Production Story: Correct Count, Wrong Outcome

A new GPU pool reports the expected number of `nvidia.com/gpu` resources. A latency-sensitive service lands there, but its performance is inconsistent because the manifest asked only for one GPU. It had no affinity for the qualified pool, no CPU locality policy, and no contract for the hardware class. The device plugin and scheduler behaved correctly; the resource request was underspecified.

The remediation is not a custom device-plugin patch. The platform publishes a small label taxonomy and workload classes, reserves the appropriate pool with taints and policy, and validates both placement and performance on the canary. The lesson is that resource discovery is an input to scheduling design, not the design itself.

**Quantifying "underspecified" instead of just naming it.** Suppose the cluster has 40 GPU nodes split across two hardware generations — 25 newer nodes with NVLink-connected GPUs and NIC-local placement, 15 older nodes without it — and both report identically as `nvidia.com/gpu: 8` allocatable with no distinguishing label published yet. A bare `limits: {nvidia.com/gpu: 1}` request is schedulable on all 40 nodes: the scheduler has a 15/40 = 37.5% chance of landing the latency-sensitive Pod on an older node purely from bin-packing pressure, with zero policy violated. Once the platform publishes a `gpu.platform.example/class=latency-optimized` label restricted to the 25 qualified nodes and the workload adds required affinity on it, the same request becomes schedulable only on the 25 nodes where the performance contract actually holds — the underspecified request didn't fail, it just wasn't asking the question that mattered.

## Operate the Plugin as Infrastructure

The device plugin normally runs node-locally as a managed DaemonSet and requires access to kubelet’s device-plugin registration path. It is an infrastructure component: if it is unavailable or reports devices unhealthy, new GPU allocations can be blocked even while CPU workloads and already-running GPU containers continue.

Monitor operand availability, restarts, registration errors, node resource deltas, and unexpected changes in healthy-device count. Protect the plugin’s namespace, images, RBAC, and host-path access. A compromised or misconfigured plugin can alter scheduling capacity across the fleet.

If GPU Operator manages the plugin, use its policy and status as the desired-state entry point; [Chapter 6](./chapter-06-gpu-operator-architecture) explains that reconciliation model. Do not let a second deployment system overwrite the same DaemonSet or configuration.

## Troubleshooting in Dependency Order

| Symptom | First evidence | Likely next action |
|---|---|---|
| Resource absent on node | Driver health, plugin Pod, kubelet/plugin registration logs | Repair the lowest failing host or registration layer |
| Pod Pending | Pod events, request, allocatable quantity, taints, affinity, quota | Separate shortage from policy and fragmentation |
| Pod bound but fails at startup | Allocation and CRI/runtime logs | Move to runtime integration, not scheduler tuning |
| Pod starts but CUDA fails | Driver/image compatibility and application logs | Compare a minimal approved image on the same node |
| Only some nodes advertise capacity | Plugin version, node profile, driver and runtime evidence | Find configuration drift or a pool-specific host issue |

Do not use `kubectl describe node` as the only test. It is a control-plane view. Pair it with the plugin’s health evidence and a scoped runtime validation before returning a node to service.

**Evidence for "Resource absent on node."** The node's own events reveal whether the resource was ever advertised versus lost after boot:

```text
$ kubectl describe node gpu-node-11 | grep -A2 'Capacity\|Allocatable'
Capacity:
  cpu:              64
  memory:           527923648Ki
Allocatable:
  cpu:              63500m
  memory:           520192000Ki
```

No `nvidia.com/gpu` line appears at all under either `Capacity` or `Allocatable` — this is different from a line reading `0`. Combined with the plugin Pod's logs:

```text
$ kubectl logs -n gpu-operator nvidia-device-plugin-daemonset-9f2lp
I0812 10:02:11.220331       1 main.go:145] Unable to load NVML: library not found
```

`Unable to load NVML` means the plugin process is running but cannot see the driver at all — it never reaches the `Register()` call, so no resource is published. This traces the symptom past the plugin, straight to a driver-layer failure on this specific node, exactly as the "First evidence" column instructs.

**Evidence for "Pod Pending."** `kubectl describe pod` on a Pending GPU Pod prints the scheduler's own predicate failure, which distinguishes a capacity shortage from a policy mismatch:

```text
$ kubectl describe pod inference-7d4-xk2p9 | tail -6
Events:
  Type     Reason            Age   From               Message
  ----     ------            ----  ---------------     -------
  Warning  FailedScheduling  38s   default-scheduler  0/40 nodes are available:
           15 Insufficient nvidia.com/gpu, 25 node(s) didn't match Pod's node affinity/selector.
```

`15 Insufficient nvidia.com/gpu` and `25 node(s) didn't match ... affinity` are two different failure classes on the same event line — 15 nodes were simply full (a capacity problem, solved by waiting or scaling), while 25 nodes were excluded before capacity was even checked (a policy/label problem, e.g. the affinity in the worked example above targeting the wrong class). Reading only "Pod is Pending, GPUs must be full" would have led to scaling the pool instead of fixing the selector — the message text is what separates shortage from fragmentation, matching this row's "Likely next action."

**Evidence for "Pod bound but fails at startup."** Once bound, the allocation and CRI logs — not the scheduler — hold the evidence:

```text
$ kubectl describe pod inference-7d4-xk2p9 | tail -4
  Warning  Failed     12s   kubelet  Error: failed to create containerd task:
           OCI runtime create failed: nvidia-container-cli: mount error:
           file creation failed: /dev/nvidia0: no such device
```

`no such device` at container-create time, after the Pod is already bound to a node, means allocation reported success to the kubelet but the runtime could not actually attach a device file — a toolkit/runtime or stale-allocation problem, not a scheduling one. This is the evidence that tells you to "move to runtime integration, not scheduler tuning," per the table.

## Customer Architecture Discussion

The device plugin provides a reliable statement: “this node has this many healthy, allocatable units of this resource.” It does not provide the broader statement some customers assume: “this workload will receive the best device for its performance target.” The latter needs a service-class design that combines resource requests with placement, sharing, fairness, and observability policy.

Be explicit about the distinction in tenant documentation. It sets the right expectation and prevents a one-line GPU request from becoming an accidental hardware-SLA promise.

## Interview Questions

**Why can a node advertise GPU capacity while a CUDA workload later fails?**

**Model answer:** "Because capacity and allocation prove two different things. The device plugin's job ends at 'I found N devices and they're reporting healthy to the kubelet' — that's what shows up as `Capacity` and `Allocatable`. It says nothing about whether the container toolkit can actually inject a working device file, whether the host driver version matches what the workload's CUDA build expects, or whether the image itself is sane. I've seen a node show `nvidia.com/gpu: 8` allocatable and still fail every Pod at `nvidia-smi`, because a driver upgrade landed on the host without the toolkit being reconciled. So when someone tells me 'the node has GPUs, why is CUDA failing,' my first move is to stop looking at `describe node` and go straight to the Pod's container-create events and the toolkit logs — that's the layer describe node can't see."

**Why does the scheduler not choose the best NVLink topology from a GPU count alone?**

**Model answer:** "Because an extended resource in Kubernetes is just a quantity — `nvidia.com/gpu: 4` tells the scheduler 'reserve four units of this name,' full stop. It carries no notion of which four, whether they're on the same NVLink island, or whether they're even on adjacent PCIe slots. If a training job needs four mutually-close GPUs, that has to be expressed through something else — topology-aware scheduling policy, a service class label, or a placement webhook — because the base resource model was deliberately kept that simple so it could work the same way for every vendor's device plugin. I'd tell a customer: don't expect quantity to imply placement quality, ever, unless you've built the policy layer that adds it."

## Key Takeaways

- The device plugin delegates vendor discovery, health, and allocation to a kubelet-integrated component.
- Capacity, allocatable quantity, allocation, and workload success are different facts.
- Extended resources give Kubernetes a count, not complete hardware intent.
- Sharing and topology are explicit platform designs with their own resource contracts.
- Treat the plugin and its registration path as critical node infrastructure.

## Cross References

- [NVIDIA Container Toolkit, RuntimeClass, and CDI](./chapter-03-container-toolkit-runtimeclass-and-cdi)
- [Node and GPU Feature Discovery](./chapter-05-node-and-gpu-feature-discovery)
- [GPU Operator Architecture](./chapter-06-gpu-operator-architecture)
- [GPU Scheduling and Topology](./chapter-08-gpu-scheduling-and-topology)
