---
title: "Chapter 3 - Trade-off matrices with weighted requirements"
slug: "chapter-3-trade-off-matrices-with-weighted-requirements"
sidebar_position: 3
description: "Chapter 3 - Trade-off matrices with weighted requirements — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Compare options transparently without pretending all dimensions matter equally.


<!-- source-table:2 -->

| Dimension | Example measure |
| --- | --- |
| Performance | P95 TTFT, tokens/s/GPU, training scaling efficiency |
| Reliability | failure domains, recovery, upgrade disruption |
| Operability | skills, automation, debugging, lifecycle burden |
| Security | isolation, IAM, network/data controls |
| Economics | cost/unit work, utilization, licensing, staff time |
| Time-to-value | procurement + integration + migration timeline |


Weights come from customer priorities. A 10% performance advantage may be irrelevant if the option violates data residency. A cheaper platform may be more expensive if operational complexity consumes scarce engineering capacity. Make assumptions explicit so the customer can challenge them.
