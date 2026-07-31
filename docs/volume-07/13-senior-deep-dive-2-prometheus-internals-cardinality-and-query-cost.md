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

## Senior addendum

*(original text and PromQL examples preserved — Ch.3's addendum already covers cardinality mechanics and query evaluation order in depth; cross-reference rather than re-derive)*

See Chapter 3's addendum for: the step-by-step PromQL evaluation walkthrough, the cardinality-explosion worked scenario (`request_id` as a label), and the `histogram_quantile` mechanics. The one genuinely new point here: ➕ **recording rules trade write-time cost for read-time cost** — a recording rule precomputes an expensive expression on ingest so dashboards querying it are cheap reads instead of expensive aggregations recomputed on every page load. The operational question this Deep Dive adds beyond Ch.3: *"what failure will this metric distinguish"* — a metric or recording rule that can't change a diagnosis or capacity decision is cost without value, which is the same discipline as Ch.6's "don't log four times" applied to the metrics plane instead of logs.

➕ **Visual model — cardinality is a multiplication, not a label count:**
```
metric name × service × region × pod × user/request id = time series stored and queried
     │                         │             │
     │                         │             └── unbounded label: explosion
     │                         └── bounded operational dimensions: useful filters
     └── recording rule: spend compute once on ingest, read cheaply many times
```
**Memory hook:** *"Labels are an index; every index has a bill."*
