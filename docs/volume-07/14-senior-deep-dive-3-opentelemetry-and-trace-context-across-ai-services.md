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
    R["user_request (trace_id=X)"] --> P["agent_planning_span"]
    P --> T1["tool_call_1 (web_search)"]
    P --> T2["tool_call_2 (calculator)"]
    P --> T3["tool_call_3 (retrieval)"]
    T3 --> RT1["retry_attempt_1 (failed, timeout)"]
    T3 --> RT2["retry_attempt_2 (succeeded)"]
    T1 --> S["final_synthesis_span"]
    T2 --> S
    RT2 --> S
```

Three parallel children fan out from `agent_planning_span`, and `tool_call_3`'s two attempts nest as *its own children* rather than as siblings of `tool_call_1`/`tool_call_2`. A single user action becoming "dozens of downstream operations" (the original text's own phrase) means the waterfall from Ch.7 — a linear sequence — is the wrong mental picture for agentic tracing; it's a **tree**, and retries specifically must nest as children of the operation they're retrying, or the trace misrepresents causality (it would look like 3 independent retrieval attempts instead of 1 operation that needed 2 tries).
