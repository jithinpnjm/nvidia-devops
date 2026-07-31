---
title: "Senior Deep Dive 3 — OpenTelemetry and trace context across AI services"
slug: "senior-deep-dive-3-opentelemetry-and-trace-context-across-ai-services"
sidebar_position: 14
description: "Senior Deep Dive 3 — OpenTelemetry and trace context across AI services — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Traces become valuable when a user request spans gateway, retrieval, reranking, inference and tool calls. Carry a correlation/trace context through those boundaries and attach low-cardinality attributes such as model, deployment, region and operation. Avoid embedding prompts or secrets in telemetry by default. For agentic systems, trace fan-out and retries because a single user action can become dozens of downstream operations.
