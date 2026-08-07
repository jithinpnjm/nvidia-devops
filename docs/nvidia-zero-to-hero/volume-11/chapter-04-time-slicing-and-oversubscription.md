---
title: Chapter 04 — Time-Slicing and Oversubscription
description: "Use logical GPU replicas honestly: as shared access, not reserved capacity."
sidebar_position: 5
tags: [time-slicing, oversubscription, gpu-sharing]
---

# Time-Slicing and Oversubscription

Time-slicing increases the number of workloads Kubernetes can place against a physical GPU. It does not divide that GPU into guaranteed compute, memory, or fault-isolated pieces. This distinction is the entire operational model: a logical replica is an admission token for shared access, not a capacity reservation.

## Learning objectives

After reading this chapter, you can explain how device-plugin replicas affect scheduling, select appropriate best-effort workloads, measure contention, and respond safely when oversubscription damages latency or memory availability.

| Prerequisites | Difficulty | Reading time |
|---|---:|---:|
| Chapters 01–03 and Kubernetes resource requests | Advanced | 45 minutes |

## What the Kubernetes configuration changes

```mermaid
sequenceDiagram
    participant P as Pod A
    participant Q as Pod B
    participant K as Kubernetes scheduler
    participant D as NVIDIA device plugin
    participant G as Physical GPU
    P->>K: request shared GPU resource
    Q->>K: request shared GPU resource
    K->>D: allocate logical replicas
    D->>G: expose access to same GPU
    G-->>P: multiplexed execution
    G-->>Q: multiplexed execution
```

NVIDIA’s GPU Operator documents time-slicing as a device-plugin configuration that defines a number of replicas for a GPU resource. The scheduler can allocate each replica independently. Internally, work from those replicas is multiplexed on the underlying GPU. Unlike MIG, time-sliced replicas have no memory or fault isolation.

| Claim | Correct interpretation |
|---|---|
| Pod is `Running` | it received access, not a fixed fraction of SMs or memory |
| Node has eight GPU replicas | one physical device may be represented by eight allocatable tokens |
| Pod requests two replicas | it does not guarantee proportional compute power |
| GPUs are shared | all users remain in a shared physical-device failure and contention domain |

## Where time-slicing belongs

Good candidates are interactive development, short experiments, CI validation, and low-duty-cycle workloads whose owners accept variable completion time. It can also offer practical shared access on GPUs that do not support MIG. It is not a default deployment shape for strict tail-latency services, large memory consumers, untrusted tenants needing a strong isolation claim, or coordinated distributed jobs.

CUDA MPS may be relevant when a controlled set of CUDA processes needs concurrent execution. It does not add tenant memory isolation, quota, or an independent scheduler guarantee. Treat it as an application/runtime optimization with its own compatibility and operational testing.

## Design the service, not the replica count

Start with a benchmark envelope: workloads, concurrency, request shape, memory behavior, power/thermal state, and success criteria. Select a replica count that preserves the service objective under that envelope, then set a policy for overload.

| Control | Why it exists |
|---|---|
| separate shared node pool and explicit resource name | prevents a critical pod accidentally receiving best-effort access |
| namespace quota and admission control | limits a single tenant’s allocation burst |
| concurrency/request limits in the application | protects memory and tail latency |
| queueing or load shedding | makes overload visible rather than silently slow |
| telemetry correlated by workload | distinguishes allocation from actual pressure |
| dedicated escape hatch | moves critical workloads to MIG or whole GPU during incidents |

If the platform uses `renameByDefault`, the device plugin can advertise a `.shared` resource name. This is often clearer than silently changing the meaning of the ordinary GPU resource: workload authors can see that they are asking for shared access. Follow the current Operator documentation for the exact configuration and supported resource types.

## Safe rollout sequence

1. Select a noncritical node pool and label it as shared before configuring replicas.
2. Capture a baseline with the same workloads running one at a time and concurrently.
3. Introduce a small replica count; validate actual allocation, application latency, memory use, and recovery.
4. Increase density only while the agreed service envelope still passes.
5. Publish the shared resource name, workload eligibility, escalation path, and the exit path to dedicated capacity.
6. Rehearse removal of the shared configuration in a canary so responders know how to restore a conservative state.

This sequence makes a failed density experiment reversible. It also prevents the misleading success criterion of “the pods scheduled.” Scheduling is an early control-plane check, not workload acceptance.

## Fairness and admission

GPU time-slicing multiplexes execution; it is not a billing or fairness system. Kubernetes quotas can restrict resource requests, while application admission limits and queues control demand before GPU memory and latency become unstable. A fairness policy should name the protected unit—namespace, team, service tier, or customer—and state what happens during contention. Without that policy, the most aggressive client can consume the practical capacity of a shared pool even when every request is formally valid.

## Internal working and consequence

The device plugin advertises logical replicas of a supported resource. Kubernetes accounts for those replicas during placement. At runtime, the underlying GPU multiplexes work; the logical resource count has not created additional device memory, SMs, memory bandwidth, copy engines, or a new physical fault domain. That is why a time-sliced resource request has a different semantic meaning from a MIG resource request.

| Layer | What it can protect | What it cannot protect |
|---|---|---|
| Kubernetes request | number of logical allocations | per-pod GPU memory share |
| Namespace quota | allocation burst by namespace | kernel execution fairness |
| Application queue | request admission | a runaway process already on device |
| Time-slicing | multiple workloads receive turns | memory and fault isolation |
| MIG/dedicated pool | stronger hardware/capacity boundary | all host or board failures |

Use these layers together. If a workload needs a per-tenant memory reservation, it is a mechanism-selection issue, not a Kubernetes quota tuning issue.

## Measuring a replica ratio

Select a ratio through an experiment, not a generic multiplier. Hold the GPU, driver, runtime, workload version, input distribution, and client concurrency known. Measure a baseline with one workload. Add intended neighbors until the service objective or memory safety boundary is approached. Repeat during the temperature, power, and data-path conditions representative of the target environment. Record the result as an envelope, not a permanent hardware fact.

| Test phase | Purpose | Acceptance evidence |
|---|---|---|
| Single tenant | establish normal latency and memory | baseline is stable and reproducible |
| Concurrent active | identify interference | all protected SLOs remain within limit |
| Burst | test queue/admission behavior | overload is bounded and observable |
| Failure/recovery | test response to a bad neighbor or restart | recovery does not rely on manual guesswork |
| Upgrade repeat | detect changed runtime behavior | prior envelope remains valid or tier is revised |

**Concrete measurement example — finding a safe replica ratio for notebook workloads:**

Test environment: one A100 GPU, time-slicing enabled, lightweight notebooks (PyTorch, typical ML workloads).

**Baseline (single notebook):**
```bash
# One notebook running; measure for 5 minutes
nvidia-smi dmon -s puctem -n 300
nvidia-smi --query-processes=gpu_uuid,pid,process_name,gpu_memory_usage --format=csv
```
Observed:
- Average SM: 25%
- Peak memory: 12GB out of 80GB
- P99 kernel launch latency: 8ms (imperceptible to user)

**Two concurrent notebooks:**
```bash
# Launch second notebook; measure interference
# (same observation commands)
```
Observed:
- Each notebook's SM: ~40% (interference; no memory yet)
- Combined memory: 24GB out of 80GB
- P99 latency: 25ms (still acceptable for interactive)

**Four concurrent notebooks:**
Observed:
- Each notebook's SM: ~55%
- Combined memory: 48GB out of 80GB
- P99 latency: 120ms (noticeable, but still acceptable for dev work)
- Memory pressure: not concerning yet

**Eight concurrent notebooks (oversubscribed):**
Observed:
- Each notebook's SM: ~65%
- Combined memory: 96GB > 80GB ← **exceeds GPU memory**
- P99 latency: 500ms (unacceptable—data spilling to host RAM or OOM happening)
- Evidence: `nvidia-smi` shows one process OOM-killed

**Conclusion:** Safe replica count is 4 (with 20GB headroom). Replicas > 4 risk OOM. Configuration:
```yaml
device-plugin-configs.yaml:
  replicas: 4  # on this workload mix
```

This is not transferable to different workloads or GPU sizes. If workloads change, re-measure.

## Production incident flow

When a shared pool slows, preserve the distinction between control-plane success and service failure. First assess user impact and activate the workload’s approved overload behavior. Then collect a time-correlated snapshot of application latency/queueing, pod allocation, process/memory evidence, GPU health, and node/device-plugin events. If the data supports contention, reduce admission or move the protected service; if it supports host/device failure, follow the node or hardware incident path. Do not delete every pod just to make utilization fall before evidence is captured.

## Troubleshooting scenario 3: shared resource scheduled on the wrong workload class

**Symptoms:** a critical deployment receives a shared device after a manifest or default changed.

**Evidence collection:**
```bash
# Inspect the pod's actual resource request
kubectl get pod <name> -o jsonpath='{.spec.containers[0].resources}'
# Expected for shared: nvidia.com/gpu.shared
# Bad: nvidia.com/gpu (implies exclusive or default)

# Check which node it's on and what device it sees
kubectl get pod <name> -o wide
kubectl exec <pod> -- nvidia-smi
# If output shows multiple containers' processes, it's time-sliced (bad for critical service)

# Compare application SLO with actual
kubectl logs <pod> | grep latency
curl http://service-endpoint:8000/metrics | grep latency_p99_ms
# Expected for critical: p99 <100ms
# Actual if on shared: p99 >300ms (due to contention)

# Inspect deployment history
kubectl rollout history deployment/<name>
kubectl describe deployment <name> | grep -A5 "container specification"
```

**Diagnosis:** the platform allowed a resource request whose name did not communicate its best-effort semantics, or admission policy did not restrict the service class.

**Resolution:** immediately move the deployment:
```bash
# 1. Restore the intended critical resource request
kubectl set resources deployment/<name> --limits nvidia.com/gpu=1
# or edit the deployment to request the dedicated pool node selector

# 2. Verify pods migrate to the protected pool
kubectl get pod -w
# Watch for new pods on dedicated-gpu nodes

# 3. Confirm SLO recovery
kubectl logs -f <new-pod> | grep latency
# p99 should return to baseline
```

**Prevention:** use explicit shared resource naming (e.g., `nvidia.com/gpu.shared`) and policy checks for production namespaces:
```yaml
# ResourceQuota in production namespace: deny shared resource
spec:
  hard:
    nvidia.com/gpu.shared: "0"  # forbid shared access
    nvidia.com/gpu: "unlimited"  # but allow dedicated
```

## Troubleshooting scenario 4: metrics cannot identify the noisy neighbor

**Symptoms:** GPU-level utilization and errors are visible, but responders cannot attribute them to one container.

**Diagnosis:** metric attribution has a known limitation in the time-sliced device-plugin configuration; allocation records and application telemetry were not retained or correlated.

**Resolution:** use scheduler allocation history, pod lifecycle events, application request metrics, and process evidence to narrow scope. Improve the runbook before the next incident.

**Prevention:** validate observability during the rollout, including a controlled multi-pod exercise, rather than discovering the attribution gap during a customer outage.

## Production story: “all pods are healthy”

An engineering team configured shared replicas for a notebook pool and later placed a customer-facing model endpoint there. Kubernetes reported every pod healthy because the process endpoints continued responding. The application’s own p99 SLO had failed: the endpoint was competing with bursty notebook kernels and cache growth.

The remediation did not involve tuning the scheduler first. The team added a separate shared resource class, guarded production namespaces with admission policy, and moved the service to a measured MIG pool. Application latency, GPU memory, active processes, and queue depth became the health signals for the shared pool.

## Observability: allocation is not utilization

For each shared pool, correlate at least:

- scheduler allocation and pending demand;
- per-device memory use and active process count;
- device utilization, clocks, power, thermal state, and error evidence;
- application throughput and p50/p95/p99 latency; and
- OOMs, restarts, and node/device-plugin events.

NVIDIA documents a limitation: when time-slicing is enabled with the Kubernetes device plugin, DCGM Exporter cannot associate metrics to containers. Build your incident workflow accordingly; a GPU-level graph alone cannot identify the responsible pod. Chapter 10 expands this into SLO design.

## Troubleshooting scenario 1: all replicas slow at once

**Symptoms:** several pods are `Running`, requests complete slowly, and no single pod is obviously unhealthy.

**Blast radius:** every replica sharing the physical GPU.

**Triage:** verify the node’s replica configuration, compare active workload windows, inspect memory occupancy, application queue depth and latency, and check device health. Do not infer fairness from equal Kubernetes resource requests.

**Diagnosis:** simultaneous demand exceeds physical compute, memory bandwidth, or memory capacity. Logical allocation has hidden a saturation event.

**Resolution:** reduce admission, shed or queue work, move the latency-sensitive workload to a measured partition/dedicated pool, and restore service before pursuing packing efficiency.

**Prevention:** load-test at the intended replica count with concurrent-active, not sequential, clients.

## Troubleshooting scenario 2: one job causes memory failures for neighbors

**Symptoms:** unrelated shared pods fail allocations or restart after a new workload begins.

**Evidence:** collect process memory use, pod events, application logs, and the exact shared-resource policy. Avoid killing processes indiscriminately; preserve evidence and follow the tenant escalation path.

**Diagnosis:** time-slicing does not reserve per-replica memory. A workload’s actual allocations consumed device memory needed by its neighbors.

**Resolution:** stop or throttle the offending workload under the documented incident policy; enforce application-level bounds; move workloads requiring reserved memory to MIG or whole GPU.

**Prevention:** use memory envelope testing at admission and state explicitly that shared replicas do not provide memory quotas.

## Customer architecture discussion

Time-slicing is valuable when the customer wants access density and can accept a best-effort service. It is a poor answer to “guarantee every tenant 25% of a GPU.” The honest offer includes a tested workload class, a concurrency limit, a response to overload, and a separate path for critical services. That clarity often produces a more useful platform than a larger advertised replica number.

## Operational complexity and cost

Time-slicing may improve the number of schedulable users, but it increases incident ambiguity. A single physical-device alert can affect many logical allocations, and container-level attribution can be limited. Account for that support cost when choosing the replica ratio. Chargeback should distinguish reserved shared access from measured service consumption; otherwise a dashboard encourages teams to reserve tokens they cannot safely use at the same time.

## Kubernetes resource semantics in practice

The scheduler makes a binary placement decision from advertised extended resources. It does not observe GPU memory pressure or application tail latency while choosing a replica. That is appropriate: those values are dynamic. It also means platform policy has to prevent an allocatable token from becoming an implied performance guarantee.

| Kubernetes concept | Contribution | Limitation for shared GPUs |
|---|---|---|
| request/limit | reserves a logical allocation | does not divide physical GPU memory |
| node selector/affinity | targets intended pool | does not validate workload behavior |
| taint/toleration | restricts access to special nodes | does not provide tenant isolation |
| quota | bounds request count by scope | does not arbitrate device execution |
| priority | influences scheduling/eviction policy | does not create GPU capacity |

Use these primitives to express service eligibility. Use the application and admission layer to express concurrency and overload behavior. Use a stronger sharing mechanism when the required guarantee cannot be implemented by policy.

## Customer decision narrative: the shared development platform

A development organization can safely benefit from time-slicing when it treats the pool as a convenience service. The service contract says that sessions may slow, work may queue, and memory-heavy experiments should use a different tier. The platform publishes a migration path to a measured MIG or dedicated pool. This is honest and usually more valuable than a long wait for exclusive hardware.

The same configuration is unsuitable when sold as a deterministic production service. A customer cannot fix a missing latency guarantee by adding more replicas; that increases the chance of simultaneous demand.

## Upgrade and rollback implications

After an Operator, device-plugin, driver, or node-image update, validate that the resource name, advertised replica count, node label, and workload placement semantics remain as designed. A regression can be subtle: pods may continue to schedule but land on a nonshared or shared resource unexpectedly. Compare pre- and post-change node inventory and run a constrained workload test before opening the pool.

| Validation | Why |
|---|---|
| node allocatable resource names/counts | detects changed sharing semantics |
| labels and selectors | confirms pool separation |
| namespace policy | prevents accidental production admission |
| concurrent smoke test | detects behavior change beyond scheduling |
| dashboard attribution | confirms incident evidence remains usable |

## Revision aid

- A replica is a logical scheduling token.
- Time-slicing offers access, not reserved compute or memory.
- Fairness needs quota, admission, and application policy.
- GPU-level telemetry requires allocation and application context.
- A protected service needs an explicit escape path.

## Evidence package for a contention incident

Collect the same time range from every layer.

- workload version and request rate;
- p50/p95/p99 latency and queue depth;
- pod allocation and placement history;
- active-process and memory evidence;
- device health, power, thermal, and error events;
- node/device-plugin configuration and events;
- quota/admission decisions; and
- actions taken and time to recovery.

The purpose is not to blame the last scheduled pod. It is to distinguish a capacity-policy problem from an application regression or a physical-device incident.

## Economic decision

Time-slicing lowers the entry cost for access but raises the cost of ambiguity. Include support effort, queueing impact, telemetry gaps, and critical-workload escape capacity in its business case. The lowest cost per logical allocation is not automatically the lowest cost per reliable outcome.

## Questions for service owners

1. Can requests queue or be rejected safely?
2. What is the maximum acceptable latency during peer activity?
3. What memory envelope was observed at peak input?
4. Which workload may be throttled first?
5. Where does the service move during a shared-device incident?

## Operating policy template

State the shared-pool purpose in one sentence.

State eligible workloads and excluded workloads.

State the advertised shared resource name.

State the tested replica envelope and its date.

State the memory and latency assumptions.

State the quota scope and admission behavior.

State the overload action.

State the escalation owner.

State the protected-service escape path.

State the rollback action for a configuration change.

This template makes time-slicing a service rather than a hidden cluster setting.

## Failure-domain review

All time-sliced replicas can be affected by physical GPU health.

All replicas can be affected by host and driver lifecycle events.

All replicas can contend for memory capacity.

All replicas can contend for execution and bandwidth.

Kubernetes allocation does not remove those shared conditions.

Application queues and admission policy reduce uncontrolled demand.

Dedicated or MIG capacity can reduce the impact on protected work.

## Pre-production acceptance test

Schedule known concurrent workloads on the intended shared pool.

Confirm the resource name and node selection are explicit.

Measure application latency and queue behavior.

Measure memory high-water marks.

Confirm alert and allocation evidence are available.

Reduce admission and confirm recovery behavior.

Move a protected workload to its escape pool and verify success.

Repeat after relevant runtime or device-plugin upgrades.

## Interview exercise

Why is a time-sliced GPU resource not a performance reservation?

Which controls bound tenant demand before GPU contention occurs?

What evidence would distinguish a noisy neighbor from a driver incident?

When should a service leave the shared pool?

Answer using measured objectives.

Avoid a universal replica ratio.

## Revision checklist and senior interview questions

- Are shared resources explicitly named and confined to intended pools?
- Does each workload class have a tested replica envelope and overload policy?
- Can responders correlate application impact with allocation and device evidence?
- Is there a safe route to MIG or dedicated capacity?

- Does the release validation include concurrent workload evidence?

- Is the shared-pool policy visible to every service owner?

- Is a protected workload excluded from this pool by admission policy?

- Has the team rehearsed the overload response?

- Is recovery evidence retained for review?

1. Why does a request for two time-sliced replicas not promise twice the compute?
2. Which signals prove a shared pool is overloaded?
3. How do you prevent a protected deployment from reaching a best-effort pool?
4. Compare a time-sliced OOM incident with a MIG-profile incident.

## Further reading

- [NVIDIA GPU Operator: time-slicing GPUs](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/gpu-sharing.html)
- [NVIDIA MIG User Guide: application considerations](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/deployment-considerations.html)
- Next: [vGPU Architecture and Enterprise Virtualization](./chapter-05-vgpu-architecture-and-enterprise-virtualization)
