---
title: "Senior Deep Dive 4 — PoC design: test the uncertainty"
slug: "senior-deep-dive-4-poc-design-test-the-uncertainty"
sidebar_position: 14
description: "Senior Deep Dive 4 — PoC design: test the uncertainty — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
A PoC is not a product demo. Start with the architecture uncertainty that could invalidate the recommendation: Can the storage system feed 64 GPUs? Does disaggregated inference improve SLO/TCO for this prompt mix? Does RoCE remain stable under concurrent training? Can the customer’s security controls work with privileged GPU operands? Define success thresholds, workload generator, telemetry and failure tests before implementation.


<!-- source-table:1 -->

| PoC question | Metric | Pass/fail example |
| --- | --- | --- |
| Inference capacity | p95 TTFT, p95 ITL, tokens/s/GPU | meets SLO at peak concurrency + headroom |
| Training fabric | step time, collective bandwidth, straggler spread | within agreed % of baseline across nodes |
| Storage | GB/s, metadata ops, GPU idle due to input | GPU feed target sustained during checkpoint cycle |
| Resilience | recovery time, failed requests/jobs | node loss stays within RTO/SLO |
| Operations | upgrade duration, rollback, observability | canary upgrade + verified rollback procedure |
