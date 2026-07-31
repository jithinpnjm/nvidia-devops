---
title: "Chapter 7 - Capacity and failure-domain design"
slug: "chapter-7-capacity-and-failure-domain-design"
sidebar_position: 7
description: "Chapter 7 - Capacity and failure-domain design — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Plan GPU pools around workload shape, topology, maintenance, spare capacity and heterogeneous generations.


GPU capacity planning should account for usable memory per workload, sharing mode, target throughput/latency, topology, driver/image compatibility, node boot/provisioning time, maintenance and failure reserve. A “64 GPU cluster” tells you little about whether those GPUs are eight 8-GPU nodes with fast fabric or 64 isolated single-GPU nodes.

## Worked scenario


<!-- source-table:2 -->

> Situation A customer wants 95% average GPU utilization across production inference.


**1\. Ask whether the SLO is latency, throughput, cost per token, or utilization itself. Utilization is usually an efficiency signal, not the business outcome.**

2\. Measure queueing and latency as concurrency rises; identify the safe saturation point.

3\. Reserve failure/traffic headroom if the service has an availability SLO.

4\. Evaluate batching/sharing/model optimization before simply reducing replicas.

5\. Define utilization targets by workload class rather than one fleet-wide percentage.


<!-- source-table:3 -->

> Conclusion Optimize customer outcomes and unit economics, not a vanity utilization percentage.


## Practice

1\. Draw the software path from a PyTorch container to the physical GPU.

2\. Explain why GPU Operator and device plugin are related but not the same component.

3\. Choose MIG versus time slicing for dev notebooks, latency-sensitive voice inference, and a full-GPU training job.

4\. Create a metric set that distinguishes GPU health from inference saturation.

## Targeted references

[NVIDIA GPU Operator docs](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/) - Current component, install, MIG and troubleshooting details.

[NVIDIA DCGM](https://developer.nvidia.com/dcgm) - GPU management/monitoring foundation.

[Monitoring GPUs in Kubernetes with DCGM](https://developer.nvidia.com/blog/monitoring-gpus-in-kubernetes-with-dcgm/) - Kubernetes + exporter + Prometheus/Grafana flow.


<!-- source-table:4 -->

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 4


**GPU systems, lifecycle management and accelerated compute operations**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-04-03.png)

_Figure A. GPU problems can originate in application, runtime, container integration, driver, silicon or fabric._
