---
title: "Chapter 8 - Kubernetes, Slurm or both"
slug: "chapter-8-kubernetes-slurm-or-both"
sidebar_position: 8
description: "Chapter 8 - Kubernetes, Slurm or both — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Choose orchestration by workload and operating model, not by platform loyalty.


<!-- source-table:2 -->

| Dimension | Kubernetes strength | Slurm strength |
| --- | --- | --- |
| Long-lived services | native Deployments/Services/operators | not primary design center |
| Batch HPC jobs | possible via jobs/operators | core scheduling model |
| Application ecosystem | cloud-native service/platform ecosystem | HPC job ecosystem/tooling |
| GPU gang/coordinated jobs | requires scheduler/operator patterns | native HPC allocation concepts |
| Platform self-service/API extensibility | CRDs/operators/GitOps | HPC workflow/accounting integration |


Hybrid environments can integrate the two, but integration adds lifecycle and ownership questions. A Solutions Architect should discover which workloads, teams and operational processes must be preserved before recommending consolidation.

## Practice

1\. Explain RDMA to a Kubernetes engineer using the data path rather than protocol jargon.

2\. List five checks for a suspected RoCE performance issue.

3\. Design a storage benchmark that resembles model startup rather than training reads.

4\. Compare Kubernetes and Slurm for an organization with 80% batch training and 20% online inference.

## Targeted references

[NVIDIA Kubernetes technical blog](https://developer.nvidia.com/blog/tag/kubernetes/) - Includes recent 2026 Slurm/Kubernetes and GPU cluster validation material.

[NVIDIA Network Operator](https://docs.nvidia.com/networking/display/cokan10) - Use current docs for supported configurations; verify release/version in your environment.


<!-- source-table:3 -->

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 6


**HPC scheduling, accelerated networking and storage for multi-node AI**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-06-02.png)

_Figure A. A collective operation is a data path across GPU, PCIe/NVLink, NIC and fabric._
