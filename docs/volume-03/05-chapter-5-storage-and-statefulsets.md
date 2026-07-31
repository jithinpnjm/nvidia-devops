---
title: "Chapter 5 - Storage and StatefulSets"
slug: "chapter-5-storage-and-statefulsets"
sidebar_position: 5
description: "Chapter 5 - Storage and StatefulSets — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand CSI provisioning/attach/mount, PVC binding modes, topology and StatefulSet identity.


CSI separates storage control-plane operations from Kubernetes core. A StorageClass can dynamically provision a PV for a PVC. WaitForFirstConsumer binding can delay provisioning/binding until Pod scheduling reveals topology. Attach/mount occurs later on the selected node. Distinguish these phases.


<!-- source-table:2 -->

```text
kubectl get pvc,pv -o wide
kubectl describe pvc <claim>
kubectl describe pod <pod> | sed -n '/Events:/,$p'
kubectl get storageclass -o yaml
```


## Worked scenario


<!-- source-table:3 -->

> Situation A StatefulSet Pod stays Pending after a zone outage.


**1\. Inspect PVC/PV topology and node affinity on the volume.**

2\. Check whether the volume can attach in another zone or is intrinsically zonal.

3\. Review StorageClass replication/failure-domain behavior and StatefulSet disruption expectations.

4\. Do not delete claims blindly; stateful recovery must preserve data semantics.


<!-- source-table:4 -->

> Conclusion Stateful scheduling is constrained by both compute and data locality/failure-domain design.
