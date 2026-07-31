---
title: "Senior Deep Dive 2 — Prometheus internals, cardinality and query cost"
slug: "senior-deep-dive-2-prometheus-internals-cardinality-and-query-cost"
sidebar_position: 13
description: "Senior Deep Dive 2 — Prometheus internals, cardinality and query cost — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Prometheus stores labeled time series. Every unique label set is a series, so unbounded labels such as user\_id, request\_id or pod UID in long-lived metrics can create cardinality explosions. Query cost depends on how many series and samples must be scanned and aggregated. Recording rules precompute common expensive expressions; federation/remote systems such as Thanos can aggregate retention/query across Prometheus instances, but they do not excuse poor metric design.

**PromQL: derive service behavior, do not graph raw everything**

\# Request error ratio
sum(rate(http\_requests\_total&#123;status=~"5.."&#125;\[5m\]))
/
sum(rate(http\_requests\_total\[5m\]))

# p95 from histogram buckets
histogram\_quantile(0.95,
  sum by (le) (rate(http\_request\_duration\_seconds\_bucket\[5m\])))

# GPU utilization grouped by node (metric names depend on exporter/version)
avg by (instance) (DCGM\_FI\_DEV\_GPU\_UTIL)

Your Staff Engineer guide already emphasizes Prometheus data model, PromQL, federation, Thanos, label cardinality and monitoring Prometheus itself. The senior expansion adds the operational question: what failure will this metric distinguish? A metric that cannot change a diagnosis or a capacity decision is usually telemetry cost without operational value.
