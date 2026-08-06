---
title: Chapter 12 — Volume 11 Summary
description: Consolidate the architectural, operational, and decision-making principles of production GPU sharing.
sidebar_position: 13
tags: [gpu-sharing, summary, architecture]
---

# Volume 11 Summary

GPU sharing is a platform-service decision. The sharing mechanism matters, but it is only one layer in a system that also includes identity, device lifecycle, runtime integration, scheduling, quotas, tenant boundaries, observability, capacity policy, change control, and incident response.

The recurring question throughout this volume has been: *what guarantee does this workload need, and what evidence shows the platform can keep it?* That question is more useful than asking how many logical users can be placed on a GPU.

## The end-to-end model

```mermaid
flowchart LR
    Need[Workload need and tenant risk] --> Choice[Choose whole GPU, MIG, time-slicing, or vGPU]
    Choice --> Lifecycle[Configure and validate the hardware/software lifecycle]
    Lifecycle --> Policy[Express placement, quota, and fairness policy]
    Policy --> Service[Deliver a named service class]
    Service --> Evidence[Observe health, allocation, and workload outcomes]
    Evidence --> Capacity[Plan capacity, reserve, and chargeback]
    Capacity --> Need
```

**Figure 11.12.1 — Sharing becomes reliable when mechanism, policy, and evidence form a closed operational loop.**

## Mechanisms and their boundaries

| Mechanism | Strongest use case | Primary benefit | Boundary to state explicitly |
|---|---|---|---|
| Whole-GPU allocation | Large, topology-sensitive, memory-intensive, or tightly controlled workloads | Simplest performance and lifecycle model | It can strand capacity for small or bursty work |
| MIG | Supported hardware needing profile-based partitions and stronger resource isolation properties | Predictable named partition shapes | Layout, profile geometry, and supported hardware/software combinations constrain placement |
| Time-slicing | Best-effort, bursty, or experimentally bounded access | More logical access to a physical device | It is an oversubscription mechanism, not a hard memory or deterministic-performance boundary |
| vGPU | VM-centric or virtual-desktop-style lifecycle | Integrates GPU service with a virtualization platform | Host, guest, profile, and release-specific compatibility all matter |

No row is a universal recommendation. The right choice depends on workload behavior, tenant risk, expected performance, operational maturity, and the recovery promise the platform can make.

## Decision sequence

Use this sequence before introducing a new shared service class:

1. Describe the workload’s outcome: access, latency, completion window, session experience, or training efficiency.
2. Define the tenant and security boundary, including what other tenants must not influence or observe.
3. Select a sharing model whose documented behavior matches that boundary.
4. Validate the exact hardware, driver, runtime, orchestration, and application combination.
5. Publish the resource shape and service guarantee—not just a device name.
6. Enforce it with node pools, admission, quota, priority, and reservations as appropriate.
7. Measure hardware health, allocation correctness, and workload outcome separately.
8. Include maintenance, failure, rollout, and fragmentation reserve in sellable capacity.
9. Rehearse recovery and update the service catalog from incident evidence.

## Production checklist

| Area | Questions to answer before production |
|---|---|
| Catalog | Are dedicated, MIG, time-sliced, and vGPU services named with their actual guarantees and exclusions? |
| Compatibility | Has the deployed hardware and software combination been verified against authoritative release documentation? |
| Lifecycle | Are layout/configuration changes version-controlled, drained, validated, and reversible? |
| Scheduling | Do resource names, quotas, affinity, priorities, and reservations produce the intended placement? |
| Isolation | Are identity, image, network, storage, host, and telemetry boundaries aligned with the sharing model? |
| Observability | Can operators join a tenant symptom to allocation, node, device identity, policy, and application outcome safely? |
| Capacity | Does sellable capacity exclude documented reserve and account for profile fragmentation or time-slicing contention? |
| Chargeback | Does the billable unit match the service promise and use an auditable ownership record? |
| Operations | Can the team contain an incident, preserve evidence, recover the lowest failed layer, and prove the outcome? |

## Common traps

**Treating scheduler placement as service success.** A Pod can be Running and still fail its latency, memory, throughput, or fairness objective.

**Treating every logical replica as independent capacity.** Time-slicing increases schedulable claims on a shared physical GPU. It does not produce equal performance or memory isolation.

**Calling arithmetic free capacity usable MIG capacity.** A free portion of a device may not have the geometry required by the next profile request.

**Using utilization as the only operational signal.** Utilization has no inherent tenant or service semantics. Pair it with health, allocation, queue, and application evidence.

**Reconfiguring active nodes to solve a single request.** MIG layout work is a controlled capacity transformation with workload and rollback consequences.

**Charging for a mystery unit.** A rate card must name the allocation, guarantee, attribution source, and exclusions. Otherwise it creates disputes rather than accountability.

## Review questions

1. When would you choose a whole GPU even if sharing could raise average utilization?
2. Why is time-slicing unsuitable as a hard tenant-isolation claim?
3. How do you detect and respond to MIG fragmentation without disrupting active tenants?
4. Which evidence makes a shared-GPU SLO trustworthy?
5. Why must a capacity plan include maintenance and node-failure reserve?
6. What is the difference between physical, advertised, service, and sellable capacity?
7. What should be in an escalation package before a node reboot removes evidence?

## Customer discussion prompts

- Which workload outcomes have contractual or business significance?
- Which tenants need predictable partitions, and which can use best-effort access?
- What happens to each workload class during a node drain or a profile shortage?
- Which team owns capacity decisions, admission policy, and cost attribution?
- What telemetry can each audience see without exposing another tenant’s information?

## Further reading

- [NVIDIA MIG User Guide](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/)
- [NVIDIA k8s-device-plugin documentation](https://github.com/NVIDIA/k8s-device-plugin)
- [NVIDIA vGPU documentation](https://docs.nvidia.com/vgpu/)
- [NVIDIA DCGM documentation](https://docs.nvidia.com/datacenter/dcgm/latest/)

## Cross references

- [Why GPU Sharing Exists](./chapter-01-why-gpu-sharing-exists)
- [MIG Profiles and Placement](./chapter-03-mig-profiles-and-placement)
- [Kubernetes Scheduling for Shared GPUs](./chapter-07-kubernetes-scheduling-for-shared-gpus)
- [Capacity Planning and Chargeback](./chapter-09-capacity-planning-and-chargeback)
- [Production Troubleshooting](./chapter-11-production-troubleshooting)

## Next volume

[Volume 12 — AI Inference](../volume-12/index) applies these platform choices to serving systems, where request paths, batching, KV-cache pressure, concurrency, and scaling determine the user-visible latency and throughput that the shared infrastructure must protect.
