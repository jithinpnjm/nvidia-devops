---
title: Chapter 05 — Node and GPU Feature Discovery
description: Turn GPU-node facts into governed Kubernetes scheduling signals without coupling workloads to individual hardware SKUs.
sidebar_position: 6
tags: [nfd, gfd, kubernetes]
---

# Node and GPU Feature Discovery

An allocator can assign only the resources it knows about, and a scheduler can discriminate only on facts that reach the API. A GPU request answers *how many* devices a Pod needs. It does not answer whether those devices are the intended architecture, have the required partitioning state, sit in an approved node pool, or have passed the platform acceptance test.

Node Feature Discovery (NFD) and GPU Feature Discovery (GFD) convert selected host facts into node labels. That makes capability visible to scheduling and policy. It also creates an API contract: a wrong, stale, or freely mutable label can place a workload incorrectly even when every component involved is healthy.

## Learning objectives

After this chapter, you will be able to:

- distinguish resource advertisement from descriptive node metadata;
- trace discovery from a node-local probe to a scheduling decision;
- design a label taxonomy that preserves workload portability;
- protect capability labels as infrastructure-controlled data; and
- diagnose a pending Pod caused by discovery drift rather than capacity loss.

## The problem: quantity is not a platform contract

Consider an inference team that needs a validated pool with a particular accelerator class and a training team that needs nodes configured for a different sharing model. Both teams may request `nvidia.com/gpu: 1`. The device plugin can satisfy that request on either node. If the platform has not published a deliberate distinction, Kubernetes has no basis for applying it.

The tempting response is to expose every hardware string and ask teams to use required node affinity. That works briefly, then binds manifests to inventory. A refresh from one SKU to another becomes an application migration, capacity fragments, and a typo can turn a performance preference into a hard outage. Discovery should expose facts; the platform should turn the small subset that users need into durable service classes.

## From host evidence to a scheduling decision

```mermaid
flowchart LR
    Host[PCI devices, OS, driver, GPU state]
    NFD[NFD worker]
    GFD[GPU feature discovery]
    API[Node labels in Kubernetes API]
    Policy[Admission and platform policy]
    Scheduler[Kubernetes scheduler]
    Pod[GPU workload]
    Host --> NFD --> API
    Host --> GFD --> API
    Policy --> Pod
    API --> Scheduler
    Pod --> Scheduler
```

**Figure 10.5.1 — Discovery produces metadata; it does not allocate a GPU.** The device plugin supplies the allocatable extended resource described in [Chapter 04](./chapter-04-device-plugin-and-kubernetes-resource-model). Labels narrow the eligible nodes before allocation.

NFD normally runs node-local workers and publishes detected host features through Kubernetes resources. GFD is the NVIDIA-specific discovery component commonly deployed with the GPU platform stack. Exact label keys and values are release- and configuration-dependent. Treat them as an implementation detail until they have been reviewed as part of your platform API.

## Facts, assertions, and classes

Three kinds of labels are useful, but they should not have the same owner or lifetime.

| Kind | Example intent | Authoritative writer | Consumer |
|---|---|---|---|
| Discovered fact | accelerator family, detected driver, partitioning state | discovery component | platform automation and diagnostics |
| Lifecycle assertion | node accepted, maintenance pending, network validated | controlled platform controller | admission and operations |
| Service class | `gpu.platform.example/class=training-topology` | platform engineering | workload manifests |

A discovered fact is evidence observed at a point in time. A lifecycle assertion says the platform has completed a process against a defined standard. A service class is a promise to users. Keeping those distinctions explicit avoids a common failure: using a raw inventory label as though it were proof that a node is safe for a workload.

For example, `gpu-validation=passed` should be set only after the driver, runtime, device plugin, and a defined validation workload succeed. It should be removed or withheld during a disruptive change. This gives admission control and node affinity a stable condition without claiming that discovery alone tested the entire stack.

## A practical label contract

Publish a short catalog, not an accidental dump of detector output. For each workload-facing label, document:

- its semantic meaning and owner;
- the evidence or controller that sets it;
- whether it is a hard eligibility constraint or a preference;
- the change process and deprecation window; and
- the operational action when it disagrees with node reality.

Prefer coarse classes such as `inference-general`, `training-topology`, or `mig-serving` when those are the actual service offerings. Retain raw labels for inventory, audits, and controller logic. Do not promise a memory size, interconnect shape, or driver behavior through a class unless the acceptance process tests the promised property.

## Security and integrity boundary

Node labels influence placement, isolation, licensing, and sometimes compliance. A tenant that can write an eligibility label can potentially steer work onto hardware it should not use. A compromised node can also make a false claim. RBAC should therefore restrict Node mutation and the service accounts used by discovery and reconciliation. Admission policy should reject workload selectors that target unapproved namespaces or keys when that is appropriate for the tenancy model.

This is not a reason to distrust all labels. It is a reason to make the trust chain visible: who observed the fact, who transformed it into a class, and who is allowed to consume or alter it. Keep manual exception labels in a clearly separate namespace and attach an expiry or review process to them.

## Drift is an availability issue

Discovery drift appears after events that change node reality: a GPU replacement, driver update, MIG reconfiguration, BIOS or firmware work, an OS rebuild, or a discovery Pod failure. The resource may remain allocatable while its descriptive metadata is wrong. That is especially dangerous because the scheduler will make a confident but invalid decision.

Operate discovery with the same discipline as any other node-critical DaemonSet:

1. Alert when the worker is absent, repeatedly restarting, or unable to update its node.
2. Compare expected pool membership with the labels actually present.
3. Re-run the supported discovery or reconciliation path after state-changing maintenance.
4. Gate re-entry to production on the platform acceptance label, not merely `NodeReady`.
5. Record the observed facts and validation result with the maintenance change.

The last point matters during incident response. A node that has the correct product label but has not completed validation is not equivalent to a ready production node.

## Scheduling patterns and trade-offs

Use required affinity when a mismatch makes the workload incorrect or unsupported; use preferred affinity when it only improves performance or cost. Taints protect expensive GPU nodes from unconstrained workloads, while tolerations only grant eligibility—they do not select a node. Pair a service-class selector with a GPU request and a capacity policy; neither mechanism replaces the others.

| Requirement | Recommended expression | Cost of overuse |
|---|---|---|
| Run only in a validated GPU pool | required affinity on a platform class | fewer eligible nodes during maintenance |
| Prefer newest available accelerator | preferred affinity | modest scoring complexity |
| Prevent ordinary Pods landing on GPU nodes | taint plus controlled toleration | additional admission and documentation work |
| Require a specific physical topology | dedicated pool and topology-aware policy | substantial fragmentation |

For partitioned or shared GPU configurations, coordinate labels with the resource names advertised by the device plugin. A label saying that a node is MIG-enabled does not by itself guarantee that the requested partition resource exists. Check both conditions, and handle reconfiguration as a capacity-changing maintenance operation.

## Troubleshooting: the selector is correct, yet no Pod schedules

Start at the scheduling event. It states which predicate excluded each node. Then inspect the node’s labels, allocatable GPU resource, taints, and the workload’s required versus preferred terms. Do not begin by changing the selector; first establish whether the intended platform contract is absent, stale, or too narrow.

If labels are stale, identify the state change that made them stale, repair the underlying driver or partition configuration, and use the supported discovery workflow. If the label is correct but no node qualifies, this is a capacity and fragmentation decision, not a discovery incident. Escalate it as such instead of weakening requirements without the workload owner’s agreement.

## Production checklist

- Discovery components run only with the minimum node access and API permissions they require.
- Workload-facing labels have named owners, semantics, and deprecation rules.
- A separate acceptance signal reflects end-to-end validation.
- Maintenance workflows invalidate or revalidate the node’s service class.
- Dashboards expose discovery health, label distribution, and unexpected pool drift.
- Application templates use platform classes rather than SKU strings wherever possible.

## Customer architecture discussion

For a shared platform, discovery is where hardware inventory becomes a product boundary. The platform team owns the translation from fluctuating supply to stable classes; application teams choose the class that matches their SLO and budget. That separation lets the platform replace hardware behind a class after validation, instead of asking every team to revise affinity rules.

## Interview preparation

**Why is a GPU model label not sufficient evidence that a node can run a workload?**

It describes detected inventory, not the health of the driver, runtime, advertised resource, network path, or application. A production eligibility label needs a governed validation process behind it.

**When does node affinity harm a GPU platform?**

When it encodes unnecessary SKU-level constraints. Eligible capacity shrinks, idle devices strand, and a routine refresh becomes a manifest migration. Use hard affinity only for real compatibility or service-contract boundaries.

## Key takeaways

- Feature discovery supplies scheduling metadata; the device plugin supplies allocatable devices.
- Treat labels that affect placement as governed infrastructure data.
- Separate raw facts, validation assertions, and user-facing service classes.
- Revalidate labels after every change that can alter node reality.
- Prefer portable platform classes over hardware strings in workload manifests.

## Cross references and further reading

- [Device Plugin and Kubernetes Resource Model](./chapter-04-device-plugin-and-kubernetes-resource-model)
- [GPU Operator Architecture](./chapter-06-gpu-operator-architecture)
- [GPU Scheduling and Topology](./chapter-08-gpu-scheduling-and-topology)
- [Kubernetes node affinity documentation](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)
- [NVIDIA GPU Operator documentation](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/)
