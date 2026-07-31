---
title: "Chapter 3 - Kubelet, CRI and Pod lifecycle"
slug: "chapter-3-kubelet-cri-and-pod-lifecycle"
sidebar_position: 3
description: "Chapter 3 - Kubelet, CRI and Pod lifecycle — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand how an assigned Pod becomes namespaces, cgroups, volumes, network setup and running containers on a node.


The kubelet watches Pods assigned to its node, manages volumes/secrets/config, asks the container runtime through CRI to create sandboxes/containers, and reports status back to the API. CNI plugins handle network setup through the runtime integration path; CSI handles storage interactions. A Pod can therefore be scheduled correctly but fail during node-local preparation.


<!-- source-table:2 -->

```text
kubectl describe pod <pod>
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[*].state}'
journalctl -u kubelet --since '-20 min'
crictl ps -a
crictl inspectp <sandbox-id>
```


<!-- source-table:3 -->

| Symptom | Likely stage |
| --- | --- |
| Pending, no nodeName | scheduler / admission / PVC binding |
| nodeName set, ContainerCreating | kubelet: image, CNI, CSI, mounts, sandbox |
| ImagePullBackOff | registry/auth/image pull |
| CrashLoopBackOff | container starts then exits repeatedly |
| Running but NotReady | readiness/dependency/application health |
