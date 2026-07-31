---
title: "Senior Deep Dive 1 — Workload characterization before architecture"
slug: "senior-deep-dive-1-workload-characterization-before-architecture"
sidebar_position: 11
description: "Senior Deep Dive 1 — Workload characterization before architecture — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
Do not start a customer conversation with products. Characterize workload: training versus inference, model sizes, precision, sequence lengths, concurrency, batch behavior, data volume, checkpoint frequency, latency/throughput SLOs, tenancy, regions, compliance, lifecycle and operator skills. The same “LLM platform” requirement can imply one GPU in Kubernetes or hundreds of nodes with a dedicated fabric.


<!-- source-table:1 -->

| Discovery area | Questions that change design |
| --- | --- |
| Performance | TTFT/ITL targets? tokens/s? training step time? tail latency? |
| Scale | peak concurrency, model count, GPU count, growth, burstiness? |
| Data | dataset size, small-file count, checkpoint size/frequency, locality? |
| Availability | RTO/RPO, multi-zone/rack, maintenance windows, failover behavior? |
| Tenancy | hard isolation or fair-share? chargeback? reservations? priorities? |
| Operations | Kubernetes or Slurm skills? GitOps? on-call ownership? air-gap? |
