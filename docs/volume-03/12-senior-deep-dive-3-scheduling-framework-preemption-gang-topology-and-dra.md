---
title: "Senior Deep Dive 3 — Scheduling framework, preemption, gang/topology and DRA"
slug: "senior-deep-dive-3-scheduling-framework-preemption-gang-topology-and-dra"
sidebar_position: 12
description: "Senior Deep Dive 3 — Scheduling framework, preemption, gang/topology and DRA — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
![](pathname:///img/generated/volume-03-04.png)

_Figure B. Specialized hardware placement is a multi-stage scheduling and allocation problem._

The scheduler first establishes feasible nodes, then scores them. Requests, node selectors/affinity, taints, topology spread, inter-pod affinity, storage constraints and plugin-specific resources all participate. Priority affects queue order and can trigger preemption, but preemption is not a general capacity-management strategy; PodDisruptionBudgets and topology constraints can prevent the expected victim set from making the Pod schedulable.

Dynamic Resource Allocation (DRA) is now a key concept for accelerators. Core DRA APIs graduated to GA in Kubernetes 1.34. Instead of expressing only an integer extended resource, workloads can request devices through structured resource claims and device classes, enabling richer matching and allocation semantics for GPUs and other hardware. A senior GPU-platform engineer should understand both the traditional device-plugin path and DRA because clusters will contain both during transition periods.

**Scheduling: prove which constraint eliminates nodes**

\# Scheduling evidence for a Pending Pod
kubectl describe pod &lt;pod>
kubectl get pod &lt;pod> -o json | jq '.status.conditions,.spec.priorityClassName'
kubectl get nodes -o custom-columns=NAME:.metadata.name,GPU:.status.allocatable.nvidia\\.com/gpu
kubectl get events --field-selector involvedObject.name=&lt;pod> --sort-by=.lastTimestamp

# DRA resources on clusters that support them
kubectl api-resources | grep -Ei 'resourceclaim|deviceclass'
