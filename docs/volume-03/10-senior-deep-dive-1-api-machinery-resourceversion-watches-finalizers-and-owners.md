---
title: "Senior Deep Dive 1 — API machinery: resourceVersion, watches, finalizers and ownership"
slug: "senior-deep-dive-1-api-machinery-resourceversion-watches-finalizers-and-owners"
sidebar_position: 10
description: "Senior Deep Dive 1 — API machinery: resourceVersion, watches, finalizers and ownership — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
The API server is not only a REST endpoint. It provides optimistic concurrency, versioned storage, watch streams and admission. Controllers list objects, establish a resourceVersion, watch changes and reconcile. Clients must expect watch closure, relist, retries and conflicts. This is why a reliable controller is idempotent and why “event received” is not equivalent to “state changed successfully”.

Finalizers turn deletion into a two-phase operation. A delete request sets deletionTimestamp; controllers that own finalizers perform cleanup and remove their keys; only then can the object disappear. OwnerReferences drive garbage collection. When a namespace or custom resource is stuck Terminating, inspect finalizers and the controller responsible rather than force-deleting first.

**Inspect API state before guessing**

kubectl get pod mypod -o json | jq '.metadata.resourceVersion,.metadata.finalizers,.metadata.ownerReferences'
kubectl get --raw '/apis/apps/v1/namespaces/default/deployments?limit=5'
kubectl get events --sort-by=.lastTimestamp
