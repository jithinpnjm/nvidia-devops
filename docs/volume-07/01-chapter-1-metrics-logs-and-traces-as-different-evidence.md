---
title: "Chapter 1 - Metrics, logs and traces as different evidence"
slug: "chapter-1-metrics-logs-and-traces-as-different-evidence"
sidebar_position: 1
description: "Chapter 1 - Metrics, logs and traces as different evidence — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
**VOLUME 7**

**Observability, Reliability and Troubleshooting**

From telemetry primitives to SLOs and full-stack incident diagnosis

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises

Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.

*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Know what each telemetry type preserves and choose it by question.

![](pathname:///img/generated/volume-07-01.png)

Figure 1. Each evidence request should discriminate hypotheses and lead to a decision.

| Signal | Strength | Weakness |
|---|---|---|
| Metrics | cheap aggregation, trends, alerting, rates/percentiles | limited event context; labels/cardinality must be designed |
| Logs | rich event details, errors and state transitions | volume/cost; unstructured logs are hard to query |
| Traces | request path, spans and dependency latency | sampling/instrumentation complexity; not a replacement for metrics |

Telemetry is useful when it answers operational questions. Start from a user/workload symptom, define scope and SLO impact, then choose metrics/logs/traces. Dashboard browsing without a hypothesis can waste incident time.

➕ **Why this table is the correct opening move for the whole volume:** every later chapter (SLOs, PromQL, DCGM, incident playbooks) is really just "which of these three evidence types answers this specific question, and what does the other two look like when they lie to you." Memorize the failure mode of each signal, not just its strength:
- Metrics lie by **aggregation** — an average or a rate can look calm while individual requests are starving (see the TTFT-averaging trap in Deep Dive 5 and Chapter 7).
- Logs lie by **absence** — if the log line you need was never emitted (no correlation ID, no error class), no amount of `grep` recovers it after the fact.
- Traces lie by **sampling** — if the exact slow request wasn't sampled, the trace store has nothing to show you, no matter how good your instrumentation is.

➕ **Evidence-selection decision tree (the mechanism behind "choose it by question"):**
```
                     "Something is wrong" (symptom reported)
                                │
                 ┌──────────────┼──────────────────┐
                 ▼                                  ▼
     "Is this happening broadly           "What exactly happened
      or to a subset, and                  to THIS one request/
      is it getting worse?"                 entity?"
                 │                                  │
                 ▼                                  ▼
            METRICS                         LOGS or TRACES
     (rate, error ratio,              │                    │
      percentile, trend)              ▼                    ▼
                 │              "What was the       "How did latency
                 │               internal state       split across
                 │               / error detail       services for
                 │               at that moment?"      this request?"
                 │                    │                    │
                 ▼                    ▼                    ▼
        confirms SCOPE            LOGS                 TRACES
        and SLO impact      (structured event,    (span waterfall,
        → go to Ch.2 SLOs    error_class field)     dependency latency)
```
The point of the tree: metrics answer "how much/how often," logs answer "what state," traces answer "where in the request path." Asking a metric to answer a "what state" question (or grep'ing logs to answer a "how much" question) is the recurring anti-pattern this chapter is warning against.

➕ **Annotated example — the same incident seen through all three signals, showing what each one adds and what it alone cannot tell you:**
```
METRIC (Prometheus):
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
→ 0.023   (2.3% error rate, up from a 0.1% baseline — tells you THAT and HOW MUCH)

LOG (structured event, one of the failing requests):
{"ts":"2026-07-30T14:02:11Z","event":"inference_request_failed","model":"llama-70b",
 "node":"gpu-07","error_class":"CUDAOutOfMemory","request_id":"a91f...","duration_ms":842}
→ tells you WHAT STATE: it's CUDA OOM, not an app crash, not a timeout — and WHERE (gpu-07)

TRACE (span waterfall for request_id a91f...):
gateway(4ms) → auth(2ms) → queue_wait(310ms) → model_server(526ms, ERROR) → [no downstream spans]
→ tells you WHERE IN THE PATH: 310ms was queueing (capacity signal), not the CUDA OOM itself
```
No single signal reconstructs the full incident. The metric told you it was real and quantified it; the log named the mechanism; the trace located it in the request path. This three-signal correlation is the model every later incident playbook chapter (9, 10) assumes you already have internalized.

➕ **Diagram: three evidence pipelines, running in parallel from the same event**
```
                one real-world event: a request fails

  METRICS PIPELINE          LOGS PIPELINE            TRACES PIPELINE
  ────────────────          ─────────────            ───────────────
  counter++ at emit    →    structured event    →    span opened at
  time (cheap, no          written (timestamp,       request entry,
  payload)                 error_class, ids)         closed at exit
        │                        │                         │
        ▼                        ▼                         ▼
  scraped/aggregated  →   shipped to log store →   exported to trace
  into a time series       (indexed by field)        backend (joined
  (rate, percentile)             │                    by trace_id)
        │                        │                         │
        ▼                        ▼                         ▼
  answers "how much/     answers "what state       answers "where in
  how often, since        was it in, and             the request path
  when" cheaply at        why" for ONE event          did the time go"
  fleet scale             (if it was captured)        (if it was sampled)
```
Same incident, three independent capture-and-store pipelines running the whole time — the chapter's table lists their strengths/weaknesses; this diagram is *when* each one commits its record, which is why a metric survives at fleet scale while a specific log line or trace can simply not exist for the one request you care about.

➕ **Shortcut / mnemonic:** *"Metrics count, Logs explain, Traces locate."* If an interviewer asks "why not just use logs for everything," the one-liner answer is: logs don't aggregate cheaply at scale (cardinality/volume cost) and don't natively show causality across services — that's what metrics and traces exist to solve, respectively.

**Interview-ready line:** "I pick telemetry by the shape of the question — metrics for 'how much and since when,' logs for 'what state and why,' traces for 'where in the request path' — and I never trust one signal alone to close an incident."

## Practice
➕ 1. Given only a Prometheus alert firing ("error ratio > 5%, 10m") and nothing else, write the exact next two queries/log searches you'd run before touching any dashboard, and justify the order.
➕ 2. A teammate proposes adding `user_id` and `full_prompt_text` as metric labels "for better debugging." Explain in two sentences why that request belongs in logs/traces instead, tying the answer to Chapter 3's cardinality warning.
