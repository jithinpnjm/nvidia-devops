# Chapter 4 — Kubernetes observability: object state plus runtime evidence
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Combine kube-state-style desired/observed state, kubelet/container metrics and application telemetry.

Kubernetes incidents require both control-plane/object evidence and runtime telemetry. A Pending Pod is best explained by status/events/scheduler constraints; CPU graphs cannot tell you why it never scheduled. A Running-but-slow Pod requires application and node/cgroup metrics. Choose the data source that owns the fact.

```bash
kubectl get events --sort-by=.lastTimestamp
kubectl get pod <pod> -o yaml
kubectl describe node <node>
```

➕ **"Choose the data source that owns the fact" — a lookup table because this line is the whole chapter compressed, and it's exactly what an interviewer is checking you can produce on demand:**
| Fact you need | Owning data source | Why the wrong source fails you |
|---|---|---|
| Why didn't this Pod get scheduled | `kubectl describe pod` events, scheduler | CPU/GPU dashboards show cluster capacity, not *this Pod's* placement constraints (taints, affinity, resource fit) |
| Why did this container restart | Pod status (`lastState.terminated`), kubelet | Prometheus container-restart *count* tells you it happened, not the reason (OOMKilled vs app exit vs liveness probe) |
| Why is a Running Pod slow | cgroup/node metrics (cpu.stat, memory.stat), APM/traces | Pod `phase: Running` is binary — it says nothing about performance |
| Why is GPU utilization low for a Running training Pod | DCGM + app-level step-time logs (Ch.5) | Kubernetes has no native concept of GPU utilization at all — it only tracks the device *allocation*, not usage |
| Why did a node go NotReady | node conditions + kubelet/journal logs | Pod-level events on that node will lag or vanish once the node stops reporting |

➕ **Sample `kubectl describe pod` events output, annotated field by field (the pattern this volume's Chapter 9 incident playbook depends on):**
```
$ kubectl describe pod inference-worker-7f9c-xk2p1
...
Events:
  Type     Reason            Age                From               Message
  ----     ------            ----               ----               -------
  Normal   Scheduled         12m                default-scheduler  Successfully assigned default/inference-worker-7f9c-xk2p1 to gpu-node-07
  Normal   Pulled            12m                kubelet            Container image already present on machine
  Normal   Created           12m                kubelet            Created container model-server
  Normal   Started           12m                kubelet            Started container model-server
  Warning  Unhealthy         2m (x6 over 5m)    kubelet            Liveness probe failed: Get "http://10.1.2.3:8000/health": context deadline exceeded
  Normal   Killing           2m                 kubelet            Container model-server failed liveness probe, will be restarted
  Warning  BackOff           30s (x2 over 45s)  kubelet            Back-off restarting failed container
```
Reading order that matters: **Scheduled → Pulled → Created → Started** is the happy path (already 12m old, so placement wasn't the problem here). The pivot is the `Unhealthy` line — `x6 over 5m` tells you this is a *repeated, worsening* pattern, not a one-off blip, and `context deadline exceeded` (not "connection refused") tells you the probe request reached the container but didn't get an answer in time — that's a latency/hang signature, not a crash signature. `BackOff` at the bottom is CrashLoopBackOff forming — the Age/count fields (`x2 over 45s`) tell you the backoff interval is compressing, i.e. it's actively getting worse, not stabilizing.

➕ **ASCII: the evidence layers for a Kubernetes incident, and which chapter/tool owns each layer:**
```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Application / SLO evidence   → metrics+logs+traces │  Ch.1-3, 6, 7
├─────────────────────────────────────────────────────────────┤
│ Layer 3: GPU device evidence          → DCGM, nvidia-smi    │  Ch.5
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Container/cgroup runtime     → cpu.stat, OOM, exit │  this chapter, Ch.9
│          code, kubelet                                       │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Kubernetes object/control    → kubectl describe,   │  this chapter, Ch.9
│          plane state                    events, scheduler   │
└─────────────────────────────────────────────────────────────┘
   Incident triage direction: TOP-DOWN if the symptom is "SLO burning"
                               (start at Layer 4, descend only as far as evidence forces you)
                               BOTTOM-UP if the symptom is "Pod stuck/not scheduling"
                               (Layer 1 first — it's a cheap check, and it rules out an
                               entire category before you touch runtime telemetry at all)
```

➕ **Worked scenario — the "Running but the data source lies" trap, specific to GPU workloads:**
> **Situation:** A GPU training Pod shows `Status: Running`, 0 restarts, all probes green for 6 hours. The training job's loss curve has been flat (not decreasing) for the last 2 hours. `kubectl get pod` shows nothing wrong.
> 1. Kubernetes object state is telling the truth about what it owns: the container process is alive, probes pass, no restarts. It has zero visibility into *whether the GPU is doing useful work* — that's outside its ownership boundary entirely.
> 2. Next data source, by the ownership table above: DCGM. `DCGM_FI_DEV_GPU_UTIL` for this Pod's GPU shows 98% — GPU looks busy.
> 3. High GPU util + flat loss is the tell for a training bug (bad gradient, NaN propagating silently, learning rate collapsed, or a distributed-training desync where the job is busy-spinning on a stuck collective) — not an infrastructure problem at all.
> 4. This is the point where the evidence correctly hands off to Layer 4 (application telemetry) — infra data sources (Layers 1-3) have all been exonerated, in order, and that exoneration is itself the finding.
> **Conclusion:** "green everywhere in kubectl and DCGM" can still mean the workload is broken — object-state and device-state evidence bound the *infrastructure's* correctness, not the *job's* correctness. Knowing where that boundary sits, and saying so explicitly, is what separates infra-fluent from infra-only reasoning in an interview.

➕ **Shortcut:** *"Pod phase is a lie detector for the container, not for the workload."* `Running` only certifies "the process kubelet started is still alive" — everything else needs its own evidence source, per the ownership table above.

**Interview-ready line:** "Kubernetes object state and runtime telemetry answer different questions — a Pending Pod is a scheduler-evidence problem, a slow Running Pod is a cgroup/application-evidence problem, and conflating the two is the most common wasted-time pattern I see in incident response."

## Practice
➕ 1. For each of these five symptoms, name which layer (1-4, from the ASCII diagram) owns the answer and one command/query you'd run first: (a) Pod stuck Pending 20 minutes, (b) Pod restarted 8 times in an hour, (c) node shows NotReady, (d) GPU util pinned at 100% but inference latency is fine, (e) inference latency p99 tripled with no restarts anywhere.
➕ 2. Reproduce the "Running but lying" scenario in a lab: deploy a Pod with a liveness probe that always passes but have the container's actual workload silently deadlock (e.g. a script that passes health checks via a separate thread while the main work loop hangs). Confirm `kubectl get pod` shows healthy the entire time.

---

# Chapter 5 — GPU observability with DCGM
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Separate device health/utilization from workload demand and performance.

DCGM Exporter can expose GPU utilization, framebuffer memory, temperature, power and error/health-related metrics to Prometheus. Add Kubernetes ownership labels/joins so engineers can answer "which workload owns this GPU?" rather than staring at GPU index numbers.

For inference autoscaling, queue/demand metrics from the serving layer may be stronger triggers. For training, step time and collective/network behavior should be correlated with device utilization. The operational model is multi-layer.

## Practitioner lens
**Sagar Desai: GPU utilization is not service saturation**
A public post illustrates the distinction between DCGM hardware metrics and inference-server queue/request metrics. Use GPU telemetry to understand the device; use service telemetry to understand user demand and SLO saturation.

[Public source](https://www.linkedin.com/posts/sagar-s-desai_kubernetes-gpu-nvidia-activity-7413160079337684992-fOZI)

➕ **Sample DCGM Exporter Prometheus output, annotated field by field — the metric set worth having memorized:**
```
$ curl -s http://localhost:9400/metrics | grep -E "DCGM_FI_DEV" | grep gpu="0"
DCGM_FI_DEV_GPU_UTIL{gpu="0",UUID="GPU-a1b2...",Hostname="gpu-node-07",pod="train-job-0",namespace="ml"} 97
DCGM_FI_DEV_FB_USED{gpu="0",UUID="GPU-a1b2...",pod="train-job-0"} 38214        ← MiB of framebuffer (device memory) used
DCGM_FI_DEV_FB_FREE{gpu="0",UUID="GPU-a1b2...",pod="train-job-0"} 2136         ← only ~2GB headroom left on an 80GB A100 slice
DCGM_FI_DEV_GPU_TEMP{gpu="0",UUID="GPU-a1b2...",pod="train-job-0"} 79          ← °C, within normal range (<85 typical throttle point)
DCGM_FI_DEV_POWER_USAGE{gpu="0",UUID="GPU-a1b2...",pod="train-job-0"} 385.4    ← watts, near TDP — GPU is genuinely working, not idling
DCGM_FI_DEV_SM_CLOCK{gpu="0",UUID="GPU-a1b2...",pod="train-job-0"} 1410       ← MHz; compare to rated boost clock to spot throttling
DCGM_FI_DEV_XID_ERRORS{gpu="0",UUID="GPU-a1b2...",pod="train-job-0"} 0        ← 0 is what you want; nonzero means driver-level fault events
DCGM_FI_DEV_ECC_DBE_VOL_TOTAL{gpu="0",UUID="GPU-a1b2...",pod="train-job-0"} 0 ← uncorrectable ECC errors; nonzero = hardware memory fault, not software
```
Reading order for a "is this GPU healthy vs busy" triage: **XID_ERRORS and ECC_DBE first** (any nonzero value here overrides everything else — it's a hardware-fault signal, go straight to Chapter 10/Deep Dive 4), then **UTIL+POWER+SM_CLOCK together** (all three should move together; if UTIL is high but POWER is low and SM_CLOCK is depressed, that's a throttling or stalling signature, not genuine compute), then **FB_USED/FB_FREE** (memory pressure — this is the metric that predicts CUDA OOM before it happens, seconds to minutes ahead).

➕ **ASCII: the multi-layer model the chapter names, made visual — device health vs workload demand are orthogonal axes, not one scale:**
```
                    High GPU util (DCGM)
                           │
     Quadrant A            │            Quadrant B
     "genuinely busy,      │            "busy but inefficient —
      healthy device"      │             check batch size, kernel
                           │             launch overhead, memory-
  ─────────────────────────┼───────────  bound ops"
                           │
     Quadrant D            │            Quadrant C
     "idle device,         │            "device thinks it's busy,
      healthy — normal     │             but service queue/latency
      if demand is low"    │             is degrading anyway —
                           │             THIS is the Sagar Desai
                    Low GPU util        trap: util alone can't see it"
                    (DCGM)
        ← Low service saturation (queue depth, TTFT) ... High →
```
The chapter's practitioner-lens point sits in **Quadrant C's boundary**: a service can be saturated (queue growing, TTFT rising) while GPU_UTIL reads modestly, because the bottleneck is elsewhere (CPU-side tokenization, network, batching inefficiency, a single stuck worker not receiving traffic). Conversely Quadrant B is the inverse trap — util is pegged at 100% but that doesn't mean the GPU is doing useful work per request; it can mean tiny batch sizes driving kernel-launch-overhead-bound execution.

➕ **Worked scenario — silent DCGM telemetry loss (an evidence-availability failure, not a GPU failure):**
> **Situation:** An inference fleet's Grafana dashboards show `DCGM_FI_DEV_GPU_UTIL` flatlined at exactly 0 for 6 GPUs starting at 03:14, coincident with a driver update rollout. No alerts fired. Customers report normal service the whole time.
> 1. First hypothesis (wrong, but the tempting one): "6 GPUs went idle" — check inference request logs for those nodes: traffic and successful responses are completely normal throughout.
> 2. Second hypothesis (correct): the DCGM exporter itself lost the ability to query the driver post-update (a common NVML/driver-version mismatch failure mode) and is emitting a stale/zero last-known value instead of failing the scrape outright.
> 3. Confirming evidence: `up{job="dcgm-exporter"}` for those targets is still `1` (the exporter process is alive and scraping succeeds) — but `DCGM_FI_DEV_GPU_UTIL` staying at exactly 0.000 with zero variance for 6 straight hours, while every *other* correlated metric (power, temp) also flatlines at implausible fixed values, is the actual tell: the exporter is returning cached/default values because its NVML calls are failing silently.
> 4. Fix: match DCGM exporter/driver version compatibility explicitly in the upgrade runbook; add an alert not just on `up`, but on **metric variance** (e.g. `stddev_over_time(DCGM_FI_DEV_GPU_UTIL[30m]) == 0` while the node has active Pod scheduling) as a "telemetry is alive but not trustworthy" signal — this is a materially different failure than `up == 0`, and most DCGM alerting only checks the latter.
> **Conclusion:** a monitoring pipeline being *reachable* is not the same claim as it being *truthful* — silent telemetry loss (exporter up, values frozen/wrong) is a distinct and dangerous failure mode from telemetry being simply absent, because dashboards look populated and nobody notices.

➕ **Shortcut:** *"Correlate GPU UUID, not GPU index."* GPU index numbers (`gpu="0"`) can be reassigned across reboots/reschedules; `UUID` is the only identity guaranteed to survive them — this is exactly why the chapter calls for "Kubernetes ownership labels/joins," and it's the concrete mechanism behind Deep Dive 4's "correlate GPU UUID... so an incident survives node renumbering."

**Interview-ready line:** "DCGM tells me if the device is healthy and busy; it can't tell me if the *service* is saturated — those are two different telemetry planes, and I alert on both because high GPU utilization and a healthy customer experience are correlated, not identical."

## Practice
➕ 1. Using the metric list above, write the PromQL to alert on "framebuffer memory within 5% of capacity for 10 minutes" as an early-warning signal ahead of CUDA OOM, and explain why this is a better lead-time signal than alerting on the OOM event itself.
➕ 2. Design the "telemetry is alive but not trustworthy" alert from the scenario above as an actual PromQL expression, and state what legitimate (non-failure) condition could also produce zero variance, so you can explain why your alert wouldn't false-positive on it (hint: a genuinely idle, unscheduled GPU).

---

# Chapter 6 — Logs that survive incidents
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Design event fields, severity and correlation; prevent secrets and noisy duplication.

A useful operational event contains timestamp, service/component, resource identity, operation, outcome, duration, attempt and correlation context where applicable. Log the error once at the layer with operational meaning; repeated stack traces at every layer increase noise. Sensitive prompts/tokens/credentials need explicit redaction policy.

```json
{
  "event": "model_load_failed",
  "model": "llama-x",
  "node": "gpu-12",
  "duration_ms": 18342,
  "attempt": 2,
  "error_class": "ArtifactTimeout"
}
```

➕ **The field list, as a checklist you can recite — annotate WHY each field earns its place, not just that it exists:**
| Field | Why it survives an incident |
|---|---|
| timestamp | orders events across services; without it, causality is a guess |
| service/component | scopes blast radius immediately — "which of my 40 services" |
| resource identity | (node, pod, GPU UUID, model name) — lets you join across DCGM/K8s/logs, per Ch.4/5 |
| operation | names what was being attempted, not just that something failed |
| outcome | success/failure as a structured field, not buried in free text — enables counting |
| duration | turns a log line into a latency data point — bridges logs toward metrics |
| attempt | distinguishes "failed once" from "failed and is retrying" — different urgency |
| correlation context | (trace/request ID) — the join key back to traces, per Ch.1/7 |

➕ **The "log once at the layer with meaning" principle, shown as the anti-pattern it prevents:**
```
BAD — the same failure logged 4 times, once per layer, all with stack traces:
[gateway]      ERROR: downstream call failed: <500-line stack trace>
[retry-wrapper] ERROR: retry exhausted: <500-line stack trace>
[model-server] ERROR: CUDA out of memory: <500-line stack trace>
[gpu-driver]    ERROR: XID 79 (GPU fell off the bus): <driver dump>
→ 4x the log volume, and an on-call engineer has to manually realize these are the SAME event.

GOOD — one structured event at the layer that has operational meaning (model-server,
where the actual mechanism is known), with attempt/correlation context letting the
gateway's failure be joined back to it instead of re-describing it:
{"event":"inference_failed","layer":"model-server","error_class":"CUDAOutOfMemory",
 "request_id":"a91f...","attempt":2,"upstream_retry_of":"gw-req-77213"}
→ gateway logs a ONE-LINE reference: {"event":"upstream_failed","request_id":"a91f...","forwarded_from":"model-server"}
```
➕ **The specific error_class distinction this chapter's own sample JSON invites you to generalize — and the one that most commonly gets alerting wrong (tie-in to Chapter 8/9): `OOMKilled` (cgroup/Kubernetes-level, host memory) vs `CUDAOutOfMemory` (device framebuffer memory) are different failure planes with different fixes** — raising a Kubernetes memory limit does nothing for the second, and adding GPU memory/reducing batch size does nothing for the first. A log's `error_class` field is frequently the *only* place this distinction survives, because `kubectl get pod` will show both as "container exited non-zero" with no further detail.

➕ **Redaction policy — worked example, because "explicit redaction policy" as a phrase without a mechanism is not something you can demonstrate in an interview:**
```python
REDACT_KEYS = {"authorization", "api_key", "token", "password", "prompt", "completion"}

def safe_log_fields(raw: dict) -> dict:
    return {
        k: ("<redacted>" if k.lower() in REDACT_KEYS else v)
        for k, v in raw.items()
    }

# {"event": "inference_request", "model": "llama-x", "prompt": "<redacted>", "duration_ms": 812}
```
The operational trap: `prompt`/`completion` text is exactly the field engineers most want during debugging ("what input caused this crash?") and exactly the field most likely to contain PII or be contractually restricted from long-term log retention — this is a real tension, not a solved problem. The usual resolution: redact by default in the durable log sink, but allow short-TTL, access-controlled debug capture (e.g. a separate, tightly-retained store) opt-in per incident, not blanket capture.

➕ **Worked scenario — the AI-specific version of "log the error once, not four times," where the duplication is *cost*, not just noise:**
> **Situation:** An inference fleet logs the full prompt and full generated completion on every request "for debuggability," at 2,000 requests/sec, average combined prompt+completion of 4KB. Log ingestion costs and storage have become one of the platform's largest line items, and the security team has separately flagged prompt-body retention as a compliance risk.
> 1. Volume math: 2,000 req/s * 4KB * 86,400s/day ≈ 690 GB/day of raw text logging, most of which is never read.
> 2. This is the direct AI-infrastructure analogue of the chapter's "repeated stack traces at every layer increase noise" warning — except here the redundant/excessive data is the payload itself, not repetition across layers.
> 3. Fix: log structured metadata (model, token counts, duration, error_class, request_id) on every request by default; gate full prompt/completion capture behind sampling (e.g. 1% of traffic, or 100% only on already-failed requests) and the redaction policy above.
> **Conclusion:** "rich event details" (this chapter's stated strength of logs, from Chapter 1's table) has a cost curve — the right design captures richness *conditionally* (on failure, on sample), not unconditionally on every request.

➕ **Shortcut:** *"Structured field beats free-text grep, every time you'd need to count something."* If you ever find yourself writing a regex to extract a duration or error type out of a log message, that's a signal the field should have been structured at emission time, not parsed at query time.

**Interview-ready line:** "A log line's value is in its structured fields, not its prose — timestamp, resource identity, outcome, duration and a correlation ID are what let an incident be reconstructed and joined against metrics and traces after the fact."

## Practice
➕ 1. Take the chapter's own `model_load_failed` JSON example and add the two fields from the checklist table it's missing (correlation context, operation-as-distinct-from-event-name) — write the corrected JSON.
➕ 2. Design the sampling policy referenced in the worked scenario above as a concrete rule (e.g. "capture full prompt/completion if X, else only metadata") and justify the specific threshold you chose.
