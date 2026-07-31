---
title: "Chapter 7 - TCO and capacity conversations"
slug: "chapter-7-tco-and-capacity-conversations"
sidebar_position: 7
description: "Chapter 7 - TCO and capacity conversations — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Normalize cost by useful work and include operations, headroom, failure and licensing.


Hardware/hour price is only one input. Calculate usable throughput at the target SLO, utilization under real demand, failure/maintenance reserve, storage/network, software licensing and staff operational cost. Cloud elasticity can reduce idle capacity but may have availability/quota/data-egress constraints. On-prem may improve steady-state economics but introduces procurement and lifecycle burden.


<!-- source-table:2 -->

```text
cost_per_million_tokens = total_hourly_cost / (tokens_per_hour / 1_000_000)
effective_capacity = nominal_capacity * expected_utilization * availability_factor
```
