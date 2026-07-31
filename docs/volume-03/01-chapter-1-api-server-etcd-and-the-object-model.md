---
title: "Chapter 1 - API server, etcd and the object model"
slug: "chapter-1-api-server-etcd-and-the-object-model"
sidebar_position: 1
description: "Chapter 1 - API server, etcd and the object model — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
**VOLUME 3**

**Kubernetes and Platform Engineering**

Control loops, scheduling, networking, storage, security, scaling and platform operations


<!-- source-table:1 -->

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> Starting assumption You already know kubectl, Deployments, Services and Helm. This volume focuses on internals, evidence and architectural trade-offs rather than beginner YAML.


<!-- source-table:3 -->

> Learning outcome Trace reads/writes, resourceVersion, watches and declarative desired state through the API control plane.


![](pathname:///img/generated/volume-03-01.png)

Figure 1. Kubernetes components coordinate through API objects and watch/reconcile behavior.

## 1.1 API objects are records of desired/observed state

A Kubernetes object contains spec-like desired configuration plus metadata; controllers and node agents update status/conditions to describe observed state. The API server authenticates, authorizes, admits and validates requests before persistence. Most components interact through the API rather than directly modifying etcd.


<!-- source-table:4 -->

```text
kubectl get deploy api -o yaml
kubectl get deploy api -o jsonpath='{.metadata.resourceVersion}{"\n"}'
kubectl get events --sort-by=.lastTimestamp
```


## 1.2 Watches and reconciliation

Controllers commonly watch API changes, enqueue work, compare desired and actual state, and issue idempotent API updates. Reconciliation is level-based: the controller should make progress toward the desired state even if it misses an individual event, because the current object state remains authoritative.

## Worked scenario


<!-- source-table:5 -->

> Situation A Deployment object exists with replicas=3 but no Pods appear.


**1\. Check Deployment conditions and whether a ReplicaSet exists. This asks whether the Deployment controller reconciled.**

2\. If no ReplicaSet exists, inspect controller-manager health/events/admission and selector/template validity.

3\. If a ReplicaSet exists but no Pods exist, inspect ReplicaSet status/events and admission failures.

4\. If Pods exist but are Pending, move to the scheduler branch rather than continuing controller logs.


<!-- source-table:6 -->

> Conclusion Find which controller/agent should have produced the next object/action.
