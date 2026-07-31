---
title: "Chapter 5 - GPU sharing and capacity recommendation"
slug: "chapter-5-gpu-sharing-and-capacity-recommendation"
sidebar_position: 5
description: "Chapter 5 - GPU sharing and capacity recommendation — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Translate workload footprint and SLOs into full GPU, MIG, time-slicing or other resource models.


Collect model memory footprint, peak memory with batching/KV cache, latency sensitivity, failure isolation and concurrency. Then test sharing modes. A production recommendation should include how slices/resources are scheduled, observed and reconfigured—not only the hardware feature.


<!-- source-table:2 -->

| Workload | Likely starting point | Validate |
| --- | --- | --- |
| large training job | full GPUs / coordinated multi-GPU allocation | scaling efficiency, topology, checkpoint/recovery |
| small dev notebooks | time slicing or shared dev pool | fairness, memory interference, user experience |
| latency-sensitive small inference | MIG where supported if slice fits | P95 latency, isolation, packing efficiency |
| mixed model services | benchmark full/MIG/sharing pools | fragmentation, SLO, operational complexity |
