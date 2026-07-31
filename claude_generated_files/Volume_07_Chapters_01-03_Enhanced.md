# Chapter 1 — Metrics, logs and traces as different evidence
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Know what each telemetry type preserves and choose it by question.

*(original diagram: media/image1.png — preserved — "Figure 1. Each evidence request should discriminate hypotheses and lead to a decision.")*

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

➕ **Shortcut / mnemonic:** *"Metrics count, Logs explain, Traces locate."* If an interviewer asks "why not just use logs for everything," the one-liner answer is: logs don't aggregate cheaply at scale (cardinality/volume cost) and don't natively show causality across services — that's what metrics and traces exist to solve, respectively.

**Interview-ready line:** "I pick telemetry by the shape of the question — metrics for 'how much and since when,' logs for 'what state and why,' traces for 'where in the request path' — and I never trust one signal alone to close an incident."

## Practice
➕ 1. Given only a Prometheus alert firing ("error ratio > 5%, 10m") and nothing else, write the exact next two queries/log searches you'd run before touching any dashboard, and justify the order.
➕ 2. A teammate proposes adding `user_id` and `full_prompt_text` as metric labels "for better debugging." Explain in two sentences why that request belongs in logs/traces instead, tying the answer to Chapter 3's cardinality warning.

---

# Chapter 2 — SLIs, SLOs and error budgets
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Connect reliability work to measurable user outcomes instead of infrastructure percentages.

An SLI measures an outcome such as successful requests or latency under threshold. An SLO defines the target over a window. Error budget is the tolerated failure proportion. Infrastructure metrics explain causes, but an SLO should usually represent what the service/customer experiences.

```
availability = successful_requests / valid_requests
error_budget = 1 - target_slo
# 99.9% availability -> 0.1% error budget over the window
```

For training platforms, useful SLO-style measures might include job-start latency, successful completion rate, cluster availability or checkpoint/recovery expectations. For inference, request success and latency/tokens are closer to user experience.

➕ **Turning the formula into an actual operating budget — worked arithmetic an interviewer expects instantly:**
```
Target SLO: 99.9% availability, 30-day rolling window
Total requests in window: 50,000,000
error_budget_ratio = 1 - 0.999 = 0.001
error_budget_requests = 50,000,000 * 0.001 = 50,000 failed requests allowed

If today's incident caused 12,000 failed requests:
budget_consumed = 12,000 / 50,000 = 24%  of the ENTIRE MONTH'S budget, in one incident
```
That last line — "24% of the month's budget in one incident" — is the sentence that makes error budgets real to a stakeholder who otherwise hears "99.9%" and assumes it means "basically never fails." Always convert the percentage into an absolute request count and a burn fraction; percentages alone don't communicate urgency.

➕ **ASCII: error budget as a burn-down, and why burn RATE matters more than remaining balance:**
```
Budget remaining (%)
100 │●
    │ ●●
 75 │   ●●●                              ← slow, sustainable burn (normal noise)
    │       ●●●●●●
 50 │             ●●●●●●●●
    │                     ●●●●●●●●●●●●●●●●●●●●●●●●  ← fine, budget lasts the window
 25 │
    │              ▲
  0 │              │ incident: burns 24% in <1 hour
    └──────────────┴─────────────────────────────────────── time (30-day window)
                 THIS is what a burn-rate alert (Ch.8) is designed to catch —
                 not "budget is low" but "budget is draining fast enough to
                 exhaust before the window ends."
```

➕ **Worked scenario — why an SLO must be the customer's SLO, not an infra metric wearing an SLO's clothes:**
> **Situation:** A training platform team sets an SLO on "node uptime ≥ 99.5%." Nodes are up 99.7% all quarter — SLO green throughout. Customers repeatedly complain training jobs "never actually finish on time."
> 1. Node uptime measures the *infrastructure's* claim, not the *job's* outcome — a node can be "up" (kubelet healthy, not cordoned) while its GPU is thermal-throttling, its NCCL collective is retrying, or its checkpoint write is silently failing.
> 2. The correct SLI is closer to the source-listed candidates for training platforms: job-start latency and successful completion rate — an SLI that fails exactly when the customer's actual experience fails.
> 3. Re-measuring with "successful completion rate" reveals 91% — a real, budget-consuming reliability problem the node-uptime metric had been masking for a full quarter.
> **Conclusion:** an SLO that can stay green while customers are unhappy is measuring the wrong thing — this is the single most common SLO-design mistake, and it is exactly the "infrastructure metrics explain causes, SLOs should represent customer experience" line from the original text made concrete.

➕ **Shortcut:** *"If the SLO can be green while a customer is angry, it's the wrong SLI."* Use this as your gut check whenever asked to review someone else's proposed SLO in an interview.

**Interview-ready line:** "An error budget converts an abstract percentage into a concrete number of failures you're allowed before it's a policy conversation, not just an engineering one — that's what makes it actionable instead of aspirational."

## Practice
➕ 3. A service has a 99.95% latency SLO (p99 < 300ms) over a 7-day window with 20M requests/day. After a bad deploy, p99 breaches for 40 minutes. Estimate roughly how many requests were affected and what fraction of the weekly error budget that consumes, stating your assumptions.
➕ 4. Propose one SLI each for: (a) a GPU training cluster, (b) an LLM inference endpoint — and for each, name one infra metric a team might mistakenly substitute for it, using the node-uptime scenario above as the template for why that substitution fails.

---

# Chapter 3 — Prometheus mental model and PromQL reasoning
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Understand counters, gauges, histograms, rates and label dimensions before copying queries.

| Metric type | Use |
|---|---|
| Counter | monotonic event total; apply rate()/increase() over time |
| Gauge | current value that can go up/down |
| Histogram | bucketed observations enabling distributions/quantiles with aggregation |
| Summary | client-side quantiles/count/sum; aggregation trade-offs |

```promql
# Request rate
sum(rate(http_requests_total{job="api"}[5m]))

# 5xx ratio
sum(rate(http_requests_total{job="api",status=~"5.."}[5m]))
/
sum(rate(http_requests_total{job="api"}[5m]))
```

Always inspect label cardinality. User IDs, request IDs or unbounded model/session identifiers can explode time-series count. Use logs/traces for high-cardinality event identity when metrics do not need it.

➕ **Sample PromQL query result, annotated — what `rate()` is actually computing under the hood:**
```
$ curl -s 'http://prom:9090/api/v1/query?query=rate(http_requests_total{job="api"}[5m])' | jq .
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {"job": "api", "instance": "10.0.4.12:8080", "status": "200"},
        "value": [1753876800, "42.7"]     ← 42.7 requests/sec, averaged over the trailing 5m window
      },
      {
        "metric": {"job": "api", "instance": "10.0.4.13:8080", "status": "200"},
        "value": [1753876800, "0.03"]     ← this instance is nearly idle — worth asking why vs its sibling
      }
    ]
  }
}
```
`rate()` looks at the counter's increase across the range vector, divides by the elapsed seconds, and — critically — extrapolates slightly at the edges and **auto-handles counter resets** (process restart resetting the counter to 0). This last point is the single most-asked PromQL interview detail: `rate()` is not "the difference between two points," it's reset-aware, which is exactly why you use `rate()`/`increase()` on counters and never raw subtraction.

➕ **PromQL query evaluation, visualized (what actually happens when you run the 5xx-ratio query above):**
```
Step 1: instant vector selector expands to label-matched series
   http_requests_total{job="api",status=~"5.."}
        ├── {job="api",status="500",instance="A"} → samples over last 5m
        ├── {job="api",status="502",instance="A"} → samples over last 5m
        └── {job="api",status="500",instance="B"} → samples over last 5m
Step 2: rate([5m]) computed PER SERIES independently
        ├── series A/500 → 0.8 req/s
        ├── series A/502 → 0.1 req/s
        └── series B/500 → 0.3 req/s
Step 3: sum() aggregates across the label dimension, collapsing to ONE series
        → 1.2 req/s total 5xx
Step 4: divide by the denominator's own sum(rate(...)) (separately computed, same steps)
        → 1.2 / 210.4 = 0.0057  (0.57% error ratio)
```
The reason this matters operationally: if you `sum()` before `rate()` (i.e. `rate(sum(http_requests_total)[5m])`), you get a *syntax error* — Prometheus won't even let you do it in that order, because `rate()` requires a range vector, and `sum()` produces an instant vector. This ordering constraint is a good "do you actually know PromQL or just copy queries" filter question.

➕ **Cardinality-explosion scenario — the AI-inference-specific version of the label-cardinality warning above:**
> **Situation:** An inference gateway team adds `request_id` and `session_id` as labels on `inference_requests_total` "to make querying individual requests easier in Prometheus." Within a week, Prometheus memory usage grows from 4GB to 60GB and query latency for basic dashboards goes from 200ms to 12+ seconds.
> 1. Every unique combination of label values creates a new time series. `request_id` is unique per request by definition — this metric now creates a brand-new, never-reused time series for every single inference call, forever (until retention expires).
> 2. Check the actual blast radius: `prometheus_tsdb_head_series` (total active series) and `count by (__name__)(count({__name__=~".+"}))` to find which metric name dominates cardinality — `topk(10, count by (job)({__name__="inference_requests_total"}))` narrows it to the offending job.
> 3. Root cause and fix: `request_id`/`session_id` belong in **logs or trace attributes**, never in a metric label — this is exactly Chapter 1's evidence-selection tree: "what happened to THIS one request" is a logs/traces question, not a metrics question.
> 4. Remediation is not gentle: dropping the label going forward stops new cardinality growth, but the already-ingested high-cardinality series stay in TSDB until retention rolls them off — sometimes a `tombstone`/manual block deletion is warranted if memory pressure is acute.
> **Conclusion:** cardinality mistakes don't show up as errors — they show up as a slow, silent Prometheus memory/latency degradation, which makes them one of the harder "why is monitoring itself unhealthy" incidents to attribute quickly. Deep Dive 2 expands on the query-cost mechanics.

➕ **Shortcut — the one command to sanity-check cardinality risk on any metric before it ships:**
```bash
curl -s 'http://prom:9090/api/v1/query?query=count(count by (__name__)({__name__=~"your_metric.*"}))'
# or, more directly, ask "does any label on this metric have unbounded distinct values?"
# unbounded label smell test: user_id, request_id, session_id, pod UID, raw prompt text, IP address
```
**Mnemonic:** *"If a human could not write down all possible values of a label on a whiteboard, it doesn't belong on a metric."*

**Interview-ready line:** "Counters answer 'how much happened,' gauges answer 'what's the level right now,' and histograms answer 'what's the distribution' — and I check label cardinality before I ship a metric, not after Prometheus falls over."

## Practice
1. Write a PromQL expression for 5xx ratio and state assumptions about labels. *(also listed under Chapter 11's original Practice — the assumption to state explicitly: `status` is a label with low-cardinality bucketed values like "200"/"404"/"500", not raw numeric codes exploded further, and `job` scopes to one service.)*

➕ 2. A histogram metric `inference_duration_seconds` has buckets `[0.1, 0.5, 1, 2, 5, +Inf]`. Write the `histogram_quantile(0.95, ...)` query for p95 latency, and explain in one sentence why bucket boundary choice (not just the query) determines how *accurate* that p95 actually is.
➕ 3. Explain why a Summary's client-side quantile cannot be aggregated across instances (e.g. you cannot average five p99 Summary values from five pods to get a fleet-wide p99), while a histogram's `histogram_quantile()` can be computed correctly after `sum by (le)` across pods first.
