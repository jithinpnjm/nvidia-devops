---
title: "Chapter 2 - Scheduler mechanics, resources and topology"
slug: "chapter-2-scheduler-mechanics-resources-and-topology"
sidebar_position: 2
description: "Chapter 2 - Scheduler mechanics, resources and topology — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Explain filter/score thinking, requests/allocatable, affinity, taints, topology and extended GPU resources.


## 2.1 Requests drive placement

The scheduler checks whether candidate nodes satisfy Pod requirements. Resource requests are reservation/accounting inputs for CPU and memory; limits primarily affect runtime enforcement. A node can be 20% utilized yet unable to fit a Pod because its unallocated requested capacity is insufficient.


<!-- source-table:2 -->

```text
kubectl describe pod <pending-pod>
kubectl get node <node> -o jsonpath='{.status.allocatable}'
kubectl describe node <node> | sed -n '/Allocated resources:/,$p'
```


## 2.2 Constraints: taints, affinity and topology

Taints repel Pods unless a matching toleration exists. Node affinity constrains or prefers labels. Pod affinity/anti-affinity considers co-location relative to other Pods and topology keys. Topology spread constraints express distribution. These rules can reduce the eligible node set to zero even when aggregate capacity exists.


<!-- source-table:3 -->

```text
kubectl get nodes --show-labels
kubectl describe node <node> | grep -A3 Taints
kubectl get pod <pod> -o yaml | sed -n '/affinity:/,/containers:/p'
```


## 2.3 Extended resources and GPUs

GPUs are typically advertised as extended resources by a device plugin. The scheduler allocates named resources; it does not infer GPU availability from nvidia-smi utilization. MIG can expose slice-specific resource names. Therefore low hardware utilization does not imply that the requested resource exists or is unallocated.

## Worked scenario


<!-- source-table:4 -->

> Situation A GPU Pod is Pending with Insufficient nvidia.com/gpu while several GPU nodes show low utilization.


**1\. Inspect Pod requests and Node allocatable/allocated nvidia.com/gpu resources.**

2\. Check labels, taints/tolerations, affinity and topology restrictions.

3\. Verify the NVIDIA device plugin is healthy and advertising the expected resource.

4\. If MIG is configured, confirm the workload requests the correct advertised MIG resource name.

5\. Check cluster autoscaler/NAP limits, quotas and compatible node pool availability.


<!-- source-table:5 -->

> Conclusion Scheduling evidence is allocation + constraints. Utilization belongs to a later runtime/performance question.
