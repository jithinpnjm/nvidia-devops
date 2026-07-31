---
title: "Senior Deep Dive 8 — Reliability testing and game days"
slug: "senior-deep-dive-8-reliability-testing-and-game-days"
sidebar_position: 19
description: "Senior Deep Dive 8 — Reliability testing and game days — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Run controlled failures: kill model workers, block DNS, remove an EndpointSlice target, fill node image filesystem, introduce API latency, drain a GPU node, interrupt a storage path or isolate a network rail. The goal is to validate detection, failover, runbooks and customer impact assumptions. Chaos is valuable only when the hypothesis and success criteria are explicit.

## Targeted references and reinforcement

**NVIDIA DCGM:** [https://docs.nvidia.com/datacenter/dcgm/latest/contents.html](https://docs.nvidia.com/datacenter/dcgm/latest/contents.html) — GPU telemetry, diagnostics and health APIs.

**NVIDIA NIM benchmarking metrics:** [https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html](https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html) — TTFT and inference performance metric definitions.

**Staff Engineer guide — Observability:** [https://github.com/jithinpnjm/studyguide-staff-engineer](https://github.com/jithinpnjm/studyguide-staff-engineer) — Prometheus/Grafana, cardinality, scaling, alerting and production maintenance themes.

**Vishakha Sadhwani — AI infra skill signal:** [https://www.linkedin.com/in/vsadhwani](https://www.linkedin.com/in/vsadhwani) — Practitioner emphasis on observability, distributed inference, GPU scheduling and cost optimization.
