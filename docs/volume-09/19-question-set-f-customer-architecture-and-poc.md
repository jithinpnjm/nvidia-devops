---
title: "Question set F — Customer architecture and PoC"
slug: "question-set-f-customer-architecture-and-poc"
sidebar_position: 19
description: "Question set F — Customer architecture and PoC — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
**•** A customer wants 32 H100-class GPUs for “an LLM platform”. What workload facts do you request before sizing?

**•** The customer mandates Kubernetes but training team wants Slurm. Design an operating model that avoids two schedulers fighting for the same nodes.

**•** Storage vendor claims 200 GB/s. Design a PoC that proves whether training GPUs will stay fed during checkpointing.

**•** Security disallows privileged workloads. Explain why GPU node enablement may require elevated host access and propose governance/isolation options.

**•** The customer wants maximum GPU utilization and strict p99 latency. Explain the inherent tension and the experiments needed to choose a sharing model.
