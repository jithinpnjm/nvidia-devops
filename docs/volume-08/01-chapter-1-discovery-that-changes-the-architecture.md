---
title: "Chapter 1 - Discovery that changes the architecture"
slug: "chapter-1-discovery-that-changes-the-architecture"
sidebar_position: 1
description: "Chapter 1 - Discovery that changes the architecture — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
**VOLUME 8**

**Senior Solutions Architecture Practice**

Discovery, architecture, PoCs, economics, migrations and customer communication


<!-- source-table:1 -->

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> Learning outcome Turn “we need an AI platform” into workload, SLO, scale, security, operations and cost facts.


![](pathname:///img/generated/volume-08-01.png)

Figure 1. Recommendation comes after goals, constraints and workload facts.

Discovery is not a checklist recital. Ask questions whose answers eliminate or favor architecture options. “How many users?” is less useful than “What peak concurrent requests and P95 TTFT target must the inference service support?”


<!-- source-table:3 -->

| Discovery area | Questions with architectural consequence |
| --- | --- |
| Workloads | training vs inference; model sizes; batch/online; distributed requirements |
| SLOs | latency, throughput, availability, recovery time, job queue/start time |
| Scale | GPU count now/12 months; concurrency; dataset/model growth |
| Data | where it lives; throughput; sensitivity; sovereignty; movement cost |
| Security | tenancy, identity, network segmentation, artifact/prompt access |
| Operations | Kubernetes/Slurm skills, on-call model, GitOps/IaC, upgrade windows |
| Economics | budget, cloud/on-prem constraints, utilization goals, procurement lead time |


## Practitioner lens


<!-- source-table:4 -->

> Vishakha Sadhwani: SA combines technical recommendation with customer requirements Her public role comparison describes SAs as advising customers, defining business/technical requirements, evaluating trade-offs, building PoCs, guiding implementation and presenting to stakeholders. Treat each of these as a technical competency, not generic “communication skills.”


[Public source](https://www.linkedin.com/in/vsadhwani)
