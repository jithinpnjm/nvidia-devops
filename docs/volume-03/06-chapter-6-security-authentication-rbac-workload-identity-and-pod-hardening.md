---
title: "Chapter 6 - Security: authentication, RBAC, workload identity and Pod hardening"
slug: "chapter-6-security-authentication-rbac-workload-identity-and-pod-hardening"
sidebar_position: 6
description: "Chapter 6 - Security: authentication, RBAC, workload identity and Pod hardening — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Reason about who can call the API, what they can do, how workloads obtain cloud identity and how container privileges change risk.


## 6.1 RBAC is authorization over API verbs/resources


<!-- source-table:2 -->

```text
kubectl auth can-i get secrets --as=system:serviceaccount:team-a:app -n team-a
kubectl auth can-i --list --as=system:serviceaccount:team-a:app -n team-a
```


A ServiceAccount identifies a Kubernetes workload to the API. Cloud workload identity mechanisms can map workload identity to cloud IAM without static keys. Keep these trust domains conceptually separate: Kubernetes RBAC authorizes Kubernetes API actions; cloud IAM authorizes cloud APIs.

## 6.2 Pod security context


<!-- source-table:3 -->

```text
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```


Security settings should derive from workload need. Privileged mode, hostPath, hostNetwork and broad capabilities collapse isolation boundaries. In GPU/HPC environments, device and network access requirements make explicit privilege design especially important.
