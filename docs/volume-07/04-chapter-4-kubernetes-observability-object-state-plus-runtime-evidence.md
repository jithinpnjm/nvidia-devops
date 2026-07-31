---
title: "Chapter 4 - Kubernetes observability: object state plus runtime evidence"
slug: "chapter-4-kubernetes-observability-object-state-plus-runtime-evidence"
sidebar_position: 4
description: "Chapter 4 - Kubernetes observability: object state plus runtime evidence — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Combine kube-state-style desired/observed state, kubelet/container metrics and application telemetry.


Kubernetes incidents require both control-plane/object evidence and runtime telemetry. A Pending Pod is best explained by status/events/scheduler constraints; CPU graphs cannot tell you why it never scheduled. A Running-but-slow Pod requires application and node/cgroup metrics. Choose the data source that owns the fact.


<!-- source-table:2 -->

```text
kubectl get events --sort-by=.lastTimestamp
kubectl get pod <pod> -o yaml
kubectl describe node <node>
```
