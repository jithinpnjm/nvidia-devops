---
title: "Senior Deep Dive 2 — etcd quorum, control-plane failure and recovery boundaries"
slug: "senior-deep-dive-2-etcd-quorum-control-plane-failure-and-recovery-boundaries"
sidebar_position: 11
description: "Senior Deep Dive 2 — etcd quorum, control-plane failure and recovery boundaries — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
etcd provides strongly consistent storage using quorum. A three-member cluster tolerates one member failure; a five-member cluster tolerates two, at greater write coordination cost. Losing quorum is different from losing one API server. Running workloads can continue when the control plane is unavailable, but new scheduling, reconciliation and API-driven changes stop progressing.


<!-- source-table:1 -->

| Symptom | Control-plane hypothesis | Evidence |
| --- | --- | --- |
| kubectl times out, Pods keep serving | API/LB/control plane unavailable | API health, apiserver logs, LB endpoints |
| Reads work, writes stall | etcd latency/quorum or admission dependency | etcd metrics, apiserver request latency |
| Objects revert or controllers flap | multiple reconcilers or bad desired state | managedFields, events, GitOps/controller logs |
| Namespace stuck deleting | finalizer/controller unavailable | namespace conditions, finalizers, APIService health |
