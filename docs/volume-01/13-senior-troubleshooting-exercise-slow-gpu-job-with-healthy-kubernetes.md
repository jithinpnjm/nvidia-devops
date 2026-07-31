---
title: "Senior troubleshooting exercise — Slow GPU job with “healthy” Kubernetes"
slug: "senior-troubleshooting-exercise-slow-gpu-job-with-healthy-kubernetes"
sidebar_position: 13
description: "Senior troubleshooting exercise — Slow GPU job with “healthy” Kubernetes — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
Scenario: a distributed training job runs 35% slower after a node pool refresh. Pods are Running, GPU utilization averages 70%, and no Kubernetes events show errors. A senior investigation does not restart the job first. Establish whether the slowdown is reproducible on specific nodes; compare GPU/NIC topology, CPU NUMA placement, driver versions, NVLink state, RDMA counters, storage throughput and CPU throttling. The goal is to isolate the changed layer before changing configuration.

**•** Scope: is every rank slow, only ranks on one node, or only communication-heavy phases?

**•** Baseline: compare known-good node firmware, driver, kernel, NIC and topology outputs.

**•** Host evidence: CPU throttling, memory PSI, NUMA misses, block latency, softirq saturation.

**•** GPU evidence: clocks, power, thermals, ECC/Xid, NVLink health, per-process utilization.

**•** Network evidence: link speed, RDMA errors/retries, congestion counters and NCCL topology.

**•** Validation: change one variable or move one rank; prove that performance follows the suspected layer.

## Targeted references and reinforcement

**Vishakha Sadhwani — Kubernetes networking traffic flow:** [https://www.linkedin.com/in/vsadhwani](https://www.linkedin.com/in/vsadhwani) — Practitioner framing: Kubernetes networking is Linux networking plus abstractions; trace the traffic path.

**Udemy — Complete Linux Troubleshooting Course:** [https://www.udemy.com/course/linux-troubleshooting-course](https://www.udemy.com/course/linux-troubleshooting-course) — Target lectures: Server is Not Reachable (~14m), Running Out of Memory (~32m), IP Assigned but not Reachable (~21m), System is Running Slow (~34m).

**NVIDIA GPU Operator docs:** [https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html) — Host prerequisites and the GPU software lifecycle managed on Kubernetes nodes.
