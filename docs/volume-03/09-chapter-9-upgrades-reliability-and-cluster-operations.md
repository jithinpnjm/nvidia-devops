---
title: "Chapter 9 - Upgrades, reliability and cluster operations"
slug: "chapter-9-upgrades-reliability-and-cluster-operations"
sidebar_position: 9
description: "Chapter 9 - Upgrades, reliability and cluster operations — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Plan control-plane/node changes around skew, disruption budgets, workload topology and rollback evidence.


Kubernetes upgrades are distributed-system changes. Managed services hide some control-plane work but not workload disruption, node image/driver compatibility, admission changes, deprecated APIs or GPU/operator compatibility. Inventory versions and APIs before change, define surge/drain strategy, and measure workload health during rollout.


<!-- source-table:2 -->

```text
kubectl get pdb -A
kubectl get nodes -o wide
kubectl api-resources
kubectl get --raw /readyz?verbose
```


## Practice

1\. For a Pending Pod, write a decision tree that starts from Events and ends at the exact violated constraint.

2\. Trace a Service request and name one artifact/evidence at each step.

3\. Explain HPA vs cluster autoscaler to a customer using two separate control loops.

4\. Design a GitOps rollback that preserves audit trail and explain when an emergency imperative change may still be justified.

## Targeted references

[Kubernetes documentation](https://kubernetes.io/docs/) - Primary API, scheduling, networking, storage, security and operations reference.

[NVIDIA Kubernetes technical blog](https://developer.nvidia.com/blog/tag/kubernetes/) - Current GPU Kubernetes operations, Slurm integration, observability and inference patterns.

[Vishakha Sadhwani public profile/posts](https://www.linkedin.com/in/vsadhwani) - Practitioner signals for platform/networking/GitOps/AI-infra learning paths.


<!-- source-table:3 -->

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 3


**Kubernetes internals, production operations and GPU-aware platform engineering**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-03-03.png)

_Figure A. Most Kubernetes behavior is an API-state transition followed by one or more reconcilers._
