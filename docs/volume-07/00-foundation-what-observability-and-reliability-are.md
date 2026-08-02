---
title: "Foundation — what observability and reliability engineering are"
slug: "foundation-observability-and-reliability"
sidebar_position: 0
description: "A beginner orientation to evidence, user impact, SLOs, incidents and safe troubleshooting."
source_document: "Authored directly as the Volume 7 foundation chapter."
---

# Foundation — what observability and reliability engineering are

## What this volume is trying to teach

Reliability engineering keeps a service useful under expected operation and failure. Observability helps engineers understand internal system behavior from emitted evidence. Monitoring asks known questions continuously; observability also supports investigation when the exact failure was not predicted in advance.

Neither means collecting every possible metric. The goal is to connect user-visible outcomes to evidence across the request or job path.

## The first mental model

| Evidence | Best at answering | Limitation |
|---|---|---|
| Metric | How much, how often, and how it changes over time | Usually lacks per-event detail |
| Log | What a component reported about a specific event | Can be noisy, missing or unstructured |
| Trace | Where one distributed request spent time | Sampling and instrumentation affect coverage |
| Event/state | What an orchestrator or system changed and why | Often describes control-plane view, not outcome |
| Profile | Where code or hardware spends resources | Requires focused collection and interpretation |

Use them together. A dashboard suggests scope and timing; logs/events explain decisions; traces locate latency; profiles prove resource use at deeper levels.

## Essential language

- An **SLI** is a measured indicator of service behavior, such as successful-request ratio.
- An **SLO** is a target for an SLI over a defined window.
- An **SLA** is a business/contractual commitment and may include consequences.
- An **error budget** is the allowed unreliability implied by an SLO.
- **Latency** is time taken; **throughput** is work completed per time; **saturation** is pressure on a constrained resource.
- An **alert** calls for attention because action may be required.
- An **incident** is service impact requiring coordinated response.
- A **runbook** is an executable decision aid for a known operational situation.

## Start from impact, not the loudest component

A high CPU metric may be healthy useful work. A failed replica may be harmless if redundancy absorbs it. Conversely, a small latency increase may violate a strict inference SLO. Begin with affected users/workloads, scope, duration and objective; then map downward to dependencies.

## A real-life example

An AI service has normal HTTP success rate but slow first-token latency. CPU and GPU metrics alone cannot locate the delay. Trace queueing, model routing, prefill, cache behavior and downstream dependencies; correlate request-length and concurrency distributions. Reliability is defined by the service outcome, not whether each component process is alive.

## Define reliability from a user's journey

For an inference API, a candidate SLI might be:

```text
good requests / eligible requests
```

"Good" must be explicit: correct HTTP result, completed within a latency threshold, and perhaps valid model response. "Eligible" must define exclusions carefully; excluding every difficult request makes the SLI dishonest.

An SLO of 99.9% good requests over 30 days permits approximately 0.1% bad eligible requests. If there are 10 million eligible requests, the budget is about 10,000 bad requests. Error budgets let teams discuss reliability and change risk quantitatively; they do not mean deliberately causing failures.

## Metrics: understand value types before PromQL

| Type | Behavior | Example |
|---|---|---|
| Counter | generally increases until process restart | requests completed, errors, bytes sent |
| Gauge | can increase or decrease | queue depth, memory in use, temperature |
| Histogram | counts observations in configured buckets plus sum/count | request duration, batch size |

For a counter, the raw value since process start is rarely the service rate you want. Prometheus `rate()` estimates per-second change over a range:

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

This is an example error ratio. Production queries must account for label definitions, missing series, resets, traffic volume and which requests qualify.

**Cardinality** is the number of distinct label combinations. Labels such as unbounded request ID, user ID or raw URL can create enormous series counts and cost. Put high-cardinality detail in logs/traces rather than every metric label.

## Logs that can survive an incident

A useful structured record includes stable time, severity, service/component, operation, outcome and correlation identifiers where appropriate:

```json
{
  "timestamp": "2026-08-02T10:14:21.482Z",
  "severity": "ERROR",
  "service": "model-router",
  "operation": "select_replica",
  "model": "example-70b",
  "request_id": "req-8f12",
  "reason": "no_ready_replica",
  "queue_depth": 42
}
```

Do not log prompts, credentials or customer data by default. Decide redaction and retention as security/privacy requirements.

## Traces: one request across boundaries

A trace is composed of spans representing timed operations. Parent/child relationships show the critical path across services.

```mermaid
flowchart LR
  A[Gateway span] --> B[Authentication span]
  A --> C[Model routing span]
  C --> D[Queue span]
  D --> E[Inference span]
  E --> F[Postprocess/stream span]
```

A slow trace helps locate where this sampled request spent time. It does not by itself establish fleet frequency or cause; correlate trace attributes with metrics and logs.

## GPU and AI observability needs workload outcomes

Layer metrics:

| Layer | Examples |
|---|---|
| User/API | success, TTFT, inter-token latency, total latency |
| Queue/engine | waiting requests, batch size, execution count, cache pressure |
| GPU | activity, memory allocation, power, clocks, errors |
| Host | CPU, memory pressure, storage/network behavior |
| Distributed | per-rank step time, collective time, stragglers |

GPU activity can be high while users receive poor throughput or latency. Conversely, low GPU activity may be expected during sparse traffic. Alert on service risk/actionable failure, then use component telemetry for diagnosis.

## Incident evidence tree

**Symptom:** P99 TTFT increased from 2s to 9s.

1. Confirm SLI query, time window and affected models/regions/tenants.
2. Check request arrival, input-length and concurrency distributions.
3. Separate queue time from prefill/engine time using metrics/traces.
4. Compare ready replicas and recent deployments/model reloads.
5. Correlate engine batch/admission/cache behavior.
6. Compare GPU/CPU/network/storage evidence only for affected replicas/nodes.
7. Choose the smallest safe mitigation: traffic shift, rollback, capacity, admission control or isolation based on evidence.
8. Validate the original TTFT SLI, not only component recovery.
9. Preserve timeline and create prevention actions with owners.

## Alert-design questions

Before paging:

- Is a user or critical capability at risk?
- Is urgency appropriate to the evaluation window?
- Can the receiver take a meaningful action?
- Does the alert identify service, scope and runbook?
- Will maintenance or low traffic make the signal misleading?
- Are duplicate symptoms grouped?

## Guided exercise

Given 60 minutes of request counts and latency histograms:

1. define the eligible request population;
2. calculate success and latency SLIs;
3. graph traffic, errors and latency together;
4. segment by model/region without uncontrolled cardinality;
5. propose one page, one ticket-level alert and one dashboard-only signal;
6. write the first three runbook decisions for the page.

## Official and local references

- [Prometheus documentation](https://prometheus.io/docs/)
- [Prometheus metric types](https://prometheus.io/docs/concepts/metric_types/)
- [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [OpenTelemetry concepts](https://opentelemetry.io/docs/concepts/)
- [Google SRE book](https://sre.google/sre-book/table-of-contents/)
- [NVIDIA DCGM Learn](https://docs.nvidia.com/datacenter/dcgm/latest/learn/)
- [Triton metrics](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/metrics.html)
- Local Staff guide: `consolidated_guides/observability_consolidated.md`
- Local SRE foundation: `09-observability-slos-and-incident-response.md`

## How to study this volume

Learn evidence types, SLIs/SLOs and Prometheus reasoning first. Then add Kubernetes/GPU visibility, logs, traces, alerts and incident workflows. For every dashboard or alert, write the decision it enables. Postpone senior internals until you can build an evidence tree from user symptom to component boundary.
