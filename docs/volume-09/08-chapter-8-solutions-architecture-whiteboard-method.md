---
title: "Chapter 8 - Solutions architecture whiteboard method"
slug: "chapter-8-solutions-architecture-whiteboard-method"
sidebar_position: 8
description: "Chapter 8 - Solutions architecture whiteboard method — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Discover, model paths/state/failure domains, compare options, recommend and define validation.


Before drawing boxes, ask workload type, SLO, scale, data location, tenancy/security, current platform skills, budget and growth. Then draw request/data/control paths and failure domains. Compare two or three options on weighted dimensions. End with a recommendation plus what the PoC/benchmark must validate.

## Worked scenario


<!-- source-table:2 -->

> Situation Design a shared 128-GPU platform for training and inference.


**1\. Clarify training/inference split, models, concurrency, distributed job sizes and SLOs.**

2\. Define GPU pool strategy: homogeneous/heterogeneous, full GPU vs MIG/shared pools, topology requirements.

3\. Choose scheduler/orchestration model per workload; consider Kubernetes, Slurm or integration.

4\. Design fabric/storage around distributed training and model/data paths.

5\. Define identity/tenancy/quota, observability, lifecycle automation and failure domains.

6\. Capacity-test peak inference + training contention and define admission/fair-share policy.


<!-- source-table:3 -->

> Conclusion A platform architecture is workload + resource-control + data-path + operations, not a Kubernetes diagram.
