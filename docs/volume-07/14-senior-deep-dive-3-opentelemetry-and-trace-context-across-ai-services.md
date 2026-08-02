---
title: "Senior Deep Dive 3 — OpenTelemetry and trace context across AI services"
slug: "senior-deep-dive-3-opentelemetry-and-trace-context-across-ai-services"
sidebar_position: 14
description: "Senior Deep Dive 3 — OpenTelemetry and trace context across AI services — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Traces become valuable when a user request spans gateway, retrieval, reranking, inference and tool calls. Carry a correlation/trace context through those boundaries and attach low-cardinality attributes such as model, deployment, region and operation. Avoid embedding prompts or secrets in telemetry by default. For agentic systems, trace fan-out and retries because a single user action can become dozens of downstream operations.

## Senior addendum

*(original text preserved — Ch.7 already covers the single-request span waterfall and context-propagation requirement in depth; the genuinely new piece is fan-out)*

➕ **Agentic fan-out, visualized — why "trace the request" becomes "trace the tree" for agentic systems:**

```mermaid
flowchart TD
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["user_request (trace_id=X)"]
  n1["agent_planning_span"]
  n2["tool_call_1 (web_search)"]
  n3["tool_call_2 (calculator) fan-out: 3 parallel children,"]
  n4["tool_call_3 (retrieval, RETRY x2) one with retries nested under it"]
  n5["retry_attempt_1 (failed, timeout)"]
  n6["retry_attempt_2 (succeeded)"]
  n7["final_synthesis_span"]
```

A single user action becoming "dozens of downstream operations" (the original text's own phrase) means the waterfall from Ch.7 — a linear sequence — is the wrong mental picture for agentic tracing; it's a **tree**, and retries specifically must nest as children of the operation they're retrying, not as siblings, or the trace misrepresents causality (it would look like 3 independent retrieval attempts instead of 1 operation that needed 2 tries).
