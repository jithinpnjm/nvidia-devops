---
title: "Chapter 7 - HPC networking questions"
slug: "chapter-7-hpc-networking-questions"
sidebar_position: 7
description: "Chapter 7 - HPC networking questions — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Explain RDMA/RoCE/InfiniBand and troubleshoot performance from link to collective behavior.


A good explanation of RDMA starts from data movement and CPU-copy overhead, then describes registered memory/remote operations and fabric implications. A good RoCE answer includes Ethernet fabric/congestion/loss design rather than only “RDMA over Ethernet.” A good training-network answer connects NIC/GPU topology and NCCL collectives to observed step time.

## Worked scenario


<!-- source-table:2 -->

> Situation Interviewer: “How do you prove the network is slowing training?”


**1\. Show that the slow phase is communication/collective time, not data loading or compute.**

2\. Compare collective benchmark/bandwidth across nodes or before/after change.

3\. Inspect NIC/RDMA link state, speed and error/congestion counters.

4\. Check topology and outlier nodes/paths.

5\. Correlate network evidence with job step time.


<!-- source-table:3 -->

> Conclusion Network suspicion becomes network diagnosis only when communication timing and fabric evidence correlate.
