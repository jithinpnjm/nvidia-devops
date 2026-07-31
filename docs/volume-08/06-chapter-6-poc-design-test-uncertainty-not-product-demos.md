---
title: "Chapter 6 - PoC design: test uncertainty, not product demos"
slug: "chapter-6-poc-design-test-uncertainty-not-product-demos"
sidebar_position: 6
description: "Chapter 6 - PoC design: test uncertainty, not product demos — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Define hypotheses, metrics, controls and pass/fail criteria before building.


A good PoC answers the risky questions that block a production decision. Example hypothesis: “On H100 with candidate serving engine X, model Y can sustain 200 concurrent requests with P95 TTFT &lt; 1 s and cost &lt; €Z/1M tokens.” The PoC needs request distribution, warm/cold state, instrumentation, comparison baseline and repeatability.


<!-- source-table:2 -->

```text
PoC hypothesis
  -> test environment + versions
  -> workload generator + data
  -> metrics/SLO
  -> baseline
  -> experiment matrix
  -> pass/fail criteria
  -> decision and residual risks
```


## Worked scenario


<!-- source-table:3 -->

> Situation Customer asks for a 2-week PoC of “GPU Kubernetes.”


**1\. Ask what production decision the PoC should enable: lifecycle automation, serving performance, distributed training, tenancy, networking?**

2\. Choose 2–3 hypotheses rather than attempting every platform feature.

3\. Define measurable pass/fail and a baseline.

4\. Use production-representative security/network/storage constraints where they affect the hypothesis.

5\. Produce a decision report: validated, failed, unknown, recommendation, next risk.


<!-- source-table:4 -->

> Conclusion A PoC is an experiment with a decision outcome, not a showroom.
