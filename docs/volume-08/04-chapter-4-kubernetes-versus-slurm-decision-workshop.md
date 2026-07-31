---
title: "Chapter 4 - Kubernetes versus Slurm decision workshop"
slug: "chapter-4-kubernetes-versus-slurm-decision-workshop"
sidebar_position: 4
description: "Chapter 4 - Kubernetes versus Slurm decision workshop — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Practice a common AI infrastructure architecture decision without forcing a universal answer.


## Worked scenario


<!-- source-table:2 -->

> Situation A research organization runs 80% large batch training, 10% interactive notebooks and 10% online model services. It already operates Slurm but also has a mature Kubernetes platform team.


**1\. Separate workload classes instead of asking for one scheduler to “win.”**

2\. For batch training, evaluate existing Slurm scheduling/accounting/topology capabilities and whether Kubernetes adds enough platform value to justify migration.

3\. For online services, evaluate Kubernetes service/GitOps/observability/autoscaling ecosystem.

4\. For notebooks, evaluate tenancy, quotas and developer experience across both.

5\. Consider integration/shared identity/storage/observability and define ownership boundaries if using both.


<!-- source-table:3 -->

> Conclusion A multi-platform answer can be correct when workload operating models differ; simplicity must include migration/operational reality.
