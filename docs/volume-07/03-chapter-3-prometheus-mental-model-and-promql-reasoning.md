---
title: "Chapter 3 - Prometheus mental model and PromQL reasoning"
slug: "chapter-3-prometheus-mental-model-and-promql-reasoning"
sidebar_position: 3
description: "Chapter 3 - Prometheus mental model and PromQL reasoning — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand counters, gauges, histograms, rates and label dimensions before copying queries.


<!-- source-table:2 -->

| Metric type | Use |
| --- | --- |
| Counter | monotonic event total; apply rate()/increase() over time |
| Gauge | current value that can go up/down |
| Histogram | bucketed observations enabling distributions/quantiles with aggregation |
| Summary | client-side quantiles/count/sum; aggregation trade-offs |


<!-- source-table:3 -->

```text
# Request rate
sum(rate(http_requests_total{job="api"}[5m]))

# 5xx ratio
sum(rate(http_requests_total{job="api",status=~"5.."}[5m]))
/
sum(rate(http_requests_total{job="api"}[5m]))
```


Always inspect label cardinality. User IDs, request IDs or unbounded model/session identifiers can explode time-series count. Use logs/traces for high-cardinality event identity when metrics do not need it.
