---
title: "Chapter 10 - Customer communication and executive explanation"
slug: "chapter-10-customer-communication-and-executive-explanation"
sidebar_position: 10
description: "Chapter 10 - Customer communication and executive explanation — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Change abstraction level while preserving technical truth and decision rationale.


<!-- source-table:2 -->

| Audience | Focus |
| --- | --- |
| Operator | failed component, evidence, command/runbook, immediate mitigation |
| Platform lead | blast radius, root-cause hypothesis, reliability/operational trade-off |
| Engineering director | delivery risk, staffing/complexity, cost and roadmap |
| Executive | business/customer impact, decision options, risk, cost, timeline |


A strong SA answer can explain the same design three ways without contradicting itself. Practice beginning with the outcome, then one level of mechanism, then the recommendation/trade-off. Avoid drowning executives in component names or giving engineers vague “business” language.

## Practitioner lens


<!-- source-table:3 -->

> Rob Magno: virtualization/networking/Kubernetes foundations applied to AI/ML architecture NVIDIA’s public author bio describes an SA background in virtualization, networking, Docker and Kubernetes used to architect complex AI/ML environments. This reinforces the role model for this book: AI Solutions Architecture builds on infrastructure mechanisms rather than replacing them.


[Public source](https://developer.nvidia.com/blog/author/robmagno/)

## Practice

1\. Run a 15-minute discovery role-play for an inference platform and list only questions whose answers change architecture.

2\. Create a weighted decision matrix for Kubernetes vs Slurm for a hypothetical customer.

3\. Write PoC success criteria for GPU Operator lifecycle automation and for LLM P95 latency—two very different hypotheses.

4\. Explain MIG to an executive, platform engineer and SRE in three different levels of detail.


<!-- source-table:4 -->

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 8


**Customer discovery, AI factory architecture, PoCs and senior trade-off decisions**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-08-02.png)

_Figure A. A senior SA turns ambiguity into evidence, then into a decision._
