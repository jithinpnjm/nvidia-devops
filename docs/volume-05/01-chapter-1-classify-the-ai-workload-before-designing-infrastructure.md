---
title: "Chapter 1 - Classify the AI workload before designing infrastructure"
slug: "chapter-1-classify-the-ai-workload-before-designing-infrastructure"
sidebar_position: 1
description: "Chapter 1 - Classify the AI workload before designing infrastructure — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
**VOLUME 5**

**AI Workloads and AI Platform Architecture**

Training, inference, serving, scaling, state, security and performance trade-offs


<!-- source-table:1 -->

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> Learning outcome Distinguish training, fine-tuning, evaluation, batch inference and online inference by compute, communication, storage and SLO behavior.


<!-- source-table:3 -->

| Workload | Dominant concerns |
| --- | --- |
| Pretraining / large training | GPU-hours, distributed collectives, dataset feed, checkpoints, job reliability |
| Fine-tuning | model memory, training framework, smaller distributed jobs, artifacts/checkpoints |
| Batch inference | throughput, scheduling, queue completion time, cost |
| Online inference | P95/P99 latency, TTFT/TPOT, concurrency, autoscaling, availability |
| Evaluation | repeatability, dataset/model versioning, controlled benchmark environment |


Start architecture discovery by naming the workload and measurable outcome. An online service with a 500 ms P95 constraint needs a different capacity strategy from an overnight batch job that only needs to finish by 06:00.
