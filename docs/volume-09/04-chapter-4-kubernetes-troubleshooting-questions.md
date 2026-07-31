---
title: "Chapter 4 - Kubernetes troubleshooting questions"
slug: "chapter-4-kubernetes-troubleshooting-questions"
sidebar_position: 4
description: "Chapter 4 - Kubernetes troubleshooting questions — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Use object status/events to find the control-loop stage, then descend to node/Linux evidence.


<!-- source-table:2 -->

| Symptom | First evidence |
| --- | --- |
| Pending | Pod events + scheduler constraints |
| ContainerCreating | kubelet/CNI/CSI/image/sandbox events |
| CrashLoopBackOff | previous termination reason/exit code + previous logs |
| NotReady | readiness probe/dependency/application evidence |
| Service unreachable | EndpointSlice -> DNS -> service dataplane -> CNI/policy |


## Worked scenario


<!-- source-table:3 -->

> Situation Interviewer: “Pods are Pending despite cluster autoscaler enabled.”


**1\. Read FailedScheduling reason.**

2\. Ask whether any node type the autoscaler can create would satisfy the Pod.

3\. Check max size/resource limits/quota.

4\. Check affinity/taints/PVC topology/GPU resource type that may prevent expansion from helping.

5\. Only then investigate autoscaler implementation/logs.


<!-- source-table:4 -->

> Conclusion Autoscaler is not a universal cure for unschedulable constraints.
