---
title: "Chapter 10 - Incident playbook: GPU workload slow or failing"
slug: "chapter-10-incident-playbook-gpu-workload-slow-or-failing"
sidebar_position: 10
description: "Chapter 10 - Incident playbook: GPU workload slow or failing — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Walk from workload SLO through GPU, container/runtime, host, network and storage evidence.


## Worked scenario


<!-- source-table:2 -->

> Situation Distributed training throughput drops 35% after maintenance with no application code change.


**1\. Scope: one job/node group/all jobs; compare a known-good baseline.**

2\. Inventory changes: driver, firmware, operator, kernel, NIC, switch, storage, topology.

3\. GPU: utilization, clocks, memory, health/error/throttle indicators.

4\. Host: CPU/memory/I/O pressure and cgroup throttling.

5\. Fabric: link state, RDMA/NIC counters, drops/congestion, collective benchmark.

6\. Storage: dataset/checkpoint latency if step timeline aligns with I/O.

7\. Perform a controlled node/path benchmark or rollback that isolates the changed layer.


<!-- source-table:3 -->

> Conclusion “No code change” narrows change history, but evidence must still identify the bottleneck.
