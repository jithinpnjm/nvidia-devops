---
title: "Senior Deep Dive 1 — Start with SLO impact and scope"
slug: "senior-deep-dive-1-start-with-slo-impact-and-scope"
sidebar_position: 12
description: "Senior Deep Dive 1 — Start with SLO impact and scope — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Troubleshooting starts by defining what is wrong in measurable terms: which users/workloads, which region/cluster/node/model, since when, and which SLO or business behavior is affected. Establish a baseline and recent changes. This prevents an engineer from drowning in dashboards and makes every subsequent query an attempt to falsify a hypothesis.

USE (utilization, saturation, errors) is useful for resources; RED (rate, errors, duration) is useful for request-driven services. Neither replaces system understanding. For a GPU inference endpoint, useful dimensions include request rate, errors, queue depth, TTFT/ITL, tokens/s, GPU memory/utilization, KV pressure, model worker health and fabric/storage signals.
