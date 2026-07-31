---
title: "Chapter 2 - SLIs, SLOs and error budgets"
slug: "chapter-2-slis-slos-and-error-budgets"
sidebar_position: 2
description: "Chapter 2 - SLIs, SLOs and error budgets — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Connect reliability work to measurable user outcomes instead of infrastructure percentages.


An SLI measures an outcome such as successful requests or latency under threshold. An SLO defines the target over a window. Error budget is the tolerated failure proportion. Infrastructure metrics explain causes, but an SLO should usually represent what the service/customer experiences.


<!-- source-table:2 -->

```text
availability = successful_requests / valid_requests
error_budget = 1 - target_slo
# 99.9% availability -> 0.1% error budget over the window
```


For training platforms, useful SLO-style measures might include job-start latency, successful completion rate, cluster availability or checkpoint/recovery expectations. For inference, request success and latency/tokens are closer to user experience.
