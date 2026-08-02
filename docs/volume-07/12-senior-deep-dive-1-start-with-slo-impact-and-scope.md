---
title: "Chapter 12 — Start with SLO impact and scope"
slug: "senior-deep-dive-1-start-with-slo-impact-and-scope"
sidebar_position: 12
description: "Chapter 1 — Start with SLO impact and scope — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Troubleshooting starts by defining what is wrong in measurable terms: which users/workloads, which region/cluster/node/model, since when, and which SLO or business behavior is affected. Establish a baseline and recent changes. This prevents an engineer from drowning in dashboards and makes every subsequent query an attempt to falsify a hypothesis.

USE (utilization, saturation, errors) is useful for resources; RED (rate, errors, duration) is useful for request-driven services. Neither replaces system understanding. For a GPU inference endpoint, useful dimensions include request rate, errors, queue depth, TTFT/ITL, tokens/s, GPU memory/utilization, KV pressure, model worker health and fabric/storage signals.

## Build from the normal path

*(the original Deep Dive text is already strong — real mechanisms, real query examples, correctly pitched at senior level. Several Deep Dives directly extend chapters that now have their own diagrams/outputs/scenarios. Rather than duplicate, this addendum adds only what's genuinely new: cross-references, the couple of gaps worth closing with a diagram or real output, and an interview-ready mnemonic index.)*

### Quick cross-reference (use both halves together, not as duplicates)

| Deep Dive | Extends chapter | What's genuinely new in the Deep Dive vs the chapter |
|---|---|---|
| 1 — SLO impact and scope | Ch.1, Ch.2 | USE vs RED framing as two distinct lenses (resources vs requests) — not covered in Ch.1/2, see below |
| 2 — Prometheus internals, cardinality, query cost | Ch.3 | query-cost mechanics (samples scanned, recording rules, federation) beyond what Ch.3's cardinality warning covers |
| 3 — OpenTelemetry and trace context | Ch.7 | agentic fan-out/retry framing — genuinely new, not in Ch.7's single-request waterfall |
| 4 — DCGM and driver evidence | Ch.5 | Xid-to-driver-log correlation and UUID-survives-rescheduling — see Ch.5's addendum, this note adds the Xid table |
| 5 — TTFT/ITL/TPOT and saturation | Ch.7 | the bottleneck-family table is new ground; Ch.7's scenario already demonstrates it in practice |
| 6 — evidence tree and safe mitigation | Ch.9, Ch.10 | mitigation-vs-root-cause discipline — see below, worth one worked example |
| 7 — alert design for GPU systems | Ch.8 | multi-signal alert composition — extends Ch.8's burn-rate math with a second dimension |
| 8 — reliability testing and game days | new ground | closest thing to a pre-flight chaos-engineering checklist for this role — see below |

### Chapter 1 — Start with SLO impact and scope
**USE vs RED — two lenses for two different failure directions, not interchangeable:**

| Framework | Applies to | Asks |
|---|---|---|
| USE (Utilization, Saturation, Errors) | a **resource** (GPU, CPU, NIC, disk) | "is this thing near its limit or already failing internally?" |
| RED (Rate, Errors, Duration) | a **request-driven service** | "how much traffic, how much of it failed, how long did it take?" |

For a GPU inference endpoint, the Deep Dive's own dimension list (request rate, errors, queue depth, TTFT/ITL, tokens/s, GPU memory/utilization, KV pressure, model worker health, fabric/storage signals) is RED (request rate, errors, TTFT/ITL as duration) applied to the *service* layered on top of USE (GPU memory/utilization, fabric signals) applied to the *resources* underneath it — this is the same Layer 1-4 stack from Chapter 4's addendum, just named with the industry-standard framework labels. Worth citing both acronyms by name in an interview; it signals you know this is established methodology, not something you invented mid-incident.
