---
title: "Chapter 6 - Logs that survive incidents"
slug: "chapter-6-logs-that-survive-incidents"
sidebar_position: 6
description: "Chapter 6 - Logs that survive incidents — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Design event fields, severity and correlation; prevent secrets and noisy duplication.


A useful operational event contains timestamp, service/component, resource identity, operation, outcome, duration, attempt and correlation context where applicable. Log the error once at the layer with operational meaning; repeated stack traces at every layer increase noise. Sensitive prompts/tokens/credentials need explicit redaction policy.


<!-- source-table:2 -->

```text
{
  "event": "model_load_failed",
  "model": "llama-x",
  "node": "gpu-12",
  "duration_ms": 18342,
  "attempt": 2,
  "error_class": "ArtifactTimeout"
}
```
