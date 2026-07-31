---
title: "Chapter 9 - Performance and cost engineering"
slug: "chapter-9-performance-and-cost-engineering"
sidebar_position: 9
description: "Chapter 9 - Performance and cost engineering — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Translate benchmarks into capacity, cost per unit work and headroom under real request distributions.


For inference, useful economic units include cost per 1K/1M tokens, cost per request at an SLO, or throughput per GPU. For training, GPU-hours and time-to-train matter, but failed/restarted jobs and checkpoint overhead can dominate cost. Benchmark warm and cold behavior, typical and peak request distributions, and failure headroom.

## Worked scenario


<!-- source-table:2 -->

> Situation A cheaper GPU produces 60% of the throughput of a premium GPU at 45% of the hourly price.


**1\. Normalize by the actual outcome: tokens/s at required latency, not peak FLOPS.**

2\. Include replica count required for peak demand and availability headroom.

3\. Include model fit, precision support, power/operational constraints and startup time.

4\. Compute cost per unit work under expected utilization, then sensitivity-test traffic changes.

5\. Recommend the cheaper device only if operational and SLO constraints remain acceptable.


<!-- source-table:3 -->

> Conclusion Architecture cost decisions require normalized workload outcomes, not list price comparisons.


## Practice

1\. Draw a training data/checkpoint/collective path and list observability at each boundary.

2\. For an LLM service, define TTFT, queue duration, tokens/s and GPU memory, then explain how they interact.

3\. Design autoscaling signals for batch inference versus interactive inference.

4\. Classify five types of AI platform state by durability and locality.

## Targeted references

[NVIDIA Developer: Deploying Generative AI in Production with NIM](https://www.youtube.com/watch?v=bpOvayHifNQ) - Short visual overview of NIM, Kubernetes scaling, metrics and production deployment.

[NVIDIA Kubernetes technical blog](https://developer.nvidia.com/blog/tag/kubernetes/) - Current posts on disaggregated inference, Dynamo, autoscaling and AI platform operations.


<!-- source-table:4 -->

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 5


**AI workload architecture, LLM serving and production inference systems**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-05-02.png)

_Figure A. Decompose latency before selecting a scaling strategy._
