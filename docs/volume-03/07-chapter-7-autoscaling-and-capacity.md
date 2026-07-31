---
title: "Chapter 7 - Autoscaling and capacity"
slug: "chapter-7-autoscaling-and-capacity"
sidebar_position: 7
description: "Chapter 7 - Autoscaling and capacity — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand HPA/VPA/KEDA signals, cluster autoscaler constraints and why application scaling and node scaling are different loops.


HPA adjusts workload replicas based on metrics; KEDA can translate event/external metrics; VPA recommends or adjusts resource requests depending on mode; cluster autoscaler changes node count when Pods are unschedulable due to capacity and an eligible node group can help. These loops interact through requests and scheduling.


<!-- source-table:2 -->

```text
kubectl get hpa -A
kubectl describe hpa <name>
kubectl get events --field-selector reason=FailedScheduling
```


## Worked scenario


<!-- source-table:3 -->

> Situation HPA increases replicas from 5 to 20, but 12 Pods remain Pending and cluster autoscaler does not add nodes.


**1\. Read FailedScheduling reasons. Autoscaler only helps if a node group expansion could make the Pod schedulable.**

2\. Check node-group max size and cluster resource limits/quotas.

3\. Check affinity/taints/topology/PVC/GPU constraints that a new generic node would not solve.

4\. Check autoscaler logs/events for “max limit reached” or “no expansion options.”

5\. Review whether the HPA metric and resource requests produce a feasible scaling model.


<!-- source-table:4 -->

> Conclusion Application autoscaling can create desired Pods that capacity/autoscaler constraints cannot satisfy.
