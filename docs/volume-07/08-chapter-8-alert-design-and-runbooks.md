---
title: "Chapter 8 - Alert design and runbooks"
slug: "chapter-8-alert-design-and-runbooks"
sidebar_position: 8
description: "Chapter 8 - Alert design and runbooks — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Alert on actionable risk to an SLO or critical dependency, then make the first diagnostic steps deterministic.


A good alert tells the responder what is broken, scope, severity and where to begin. Avoid alerting on every transient metric threshold. Multi-window burn-rate approaches can detect fast and slow SLO consumption. Infrastructure alerts remain appropriate for imminent hard failures such as disk exhaustion or GPU hardware errors when action is required before user impact.


<!-- source-table:2 -->

| Bad alert | Better question |
| --- | --- |
| CPU > 80% | Is service latency/error budget burning because CPU saturation is limiting work? |
| GPU util > 90% | Is queue/latency rising or is the GPU efficiently serving demand? |
| Pod restarted | Is restart rate abnormal and causing availability impact? |
| Disk 70% | At current growth, when will capacity breach safe threshold? |
