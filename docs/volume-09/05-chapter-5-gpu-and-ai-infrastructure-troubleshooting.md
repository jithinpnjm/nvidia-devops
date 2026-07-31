---
title: "Chapter 5 - GPU and AI infrastructure troubleshooting"
slug: "chapter-5-gpu-and-ai-infrastructure-troubleshooting"
sidebar_position: 5
description: "Chapter 5 - GPU and AI infrastructure troubleshooting — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Walk application -> serving/training -> GPU -> runtime/operator -> host -> network/storage.


## Worked scenario


<!-- source-table:2 -->

> Situation Interviewer: “A distributed GPU training job is 40% slower than yesterday.”


**1\. Clarify whether slowdown is startup, step time, collective phase, data load or checkpointing.**

2\. Scope across jobs/nodes and identify recent infrastructure changes.

3\. GPU: utilization, memory, clocks, errors/throttling.

4\. Host: CPU/memory/I/O/cgroup pressure.

5\. Network: link/RDMA counters, errors, topology, NCCL/collective benchmark.

6\. Storage: dataset/checkpoint latency/throughput.

7\. Isolate with controlled benchmark, node removal or rollback.


<!-- source-table:3 -->

> Conclusion The answer is a layered hypothesis tree with phase timing—not “check GPU utilization.”
