---
title: "Chapter 9 - Customer discovery interview"
slug: "chapter-9-customer-discovery-interview"
sidebar_position: 9
description: "Chapter 9 - Customer discovery interview — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Practice consultative questions that reveal constraints instead of demonstrating jargon.


Use a funnel: business outcome -> workload/SLO -> current state -> constraints -> risks -> decision. Ask follow-ups based on answers. If the customer says “on-prem because security,” clarify which data/residency/control requirement prevents cloud; do not accept or challenge the premise without understanding it.


<!-- source-table:2 -->

| Customer statement | Useful follow-up |
| --- | --- |
| We need GPUs | For training, inference or both? Which model sizes and peak concurrency/job sizes? |
| We need high availability | Which workload SLO and failure domains? What RTO/RPO for state/checkpoints? |
| We want Kubernetes | Which existing operational strengths or platform integration drive that choice? |
| We need low cost | Cost per what outcome—job completion, tokens, request SLO? What utilization/headroom is acceptable? |
