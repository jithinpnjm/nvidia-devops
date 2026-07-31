# Chapter 7 — Traces and distributed latency
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Use spans to decompose request latency across gateway, queue, model server and dependencies.

A trace connects causal work across services. For inference, spans can separate gateway/auth, queueing, retrieval, model prefill/decode, external tool calls and state-store latency. Tracing is most valuable when services propagate context consistently and span attributes are bounded/meaningful.

➕ **Span waterfall, made visual — the artifact this chapter is describing in prose, drawn out:**
```
trace_id=a91f2c...  total=842ms
├─ gateway/auth              [0───4ms]
├─ queue_wait                [4────────────────────────314ms]     ← 310ms, the biggest single chunk
├─ retrieval (vector DB)     [314──────342ms]                     28ms
├─ model_server/prefill      [342──────────────────410ms]         68ms  ← TTFT-relevant, see Deep Dive 5
├─ model_server/decode       [410────────────────────────────────────────840ms]  430ms ← ITL-relevant
└─ response_serialize        [840─842ms]                          2ms
```
Reading this waterfall the way an interviewer wants: total latency (842ms) is dominated by two things — `queue_wait` (310ms, a **capacity/admission** problem, nothing to do with the model) and `decode` (430ms, a **per-token generation** cost, proportional to output length). A team that only looks at "average end-to-end latency" would blend these two completely different bottleneck families into one number and optimize the wrong thing — this is the trace-level version of the averaging trap that Chapter 1 and Deep Dive 5 warn about at the metrics level.

➕ **Sample OpenTelemetry span JSON (what actually gets exported/stored, one span from the waterfall above), annotated:**
```json
{
  "trace_id": "a91f2c4b8e...",
  "span_id": "7d3e1a",
  "parent_span_id": "44b021",
  "name": "model_server/prefill",
  "start_time_unix_nano": 1753876800342000000,
  "end_time_unix_nano": 1753876800410000000,
  "attributes": {
    "model": "llama-70b",
    "deployment": "prod-east",
    "input_tokens": 812,
    "gpu_node": "gpu-07"
  },
  "status": {"code": "OK"}
}
```
`parent_span_id` is the field that reconstructs the waterfall's nesting — without consistent propagation of `trace_id`/`parent_span_id` across a service boundary (an HTTP header, a queue message attribute), the two sides of that boundary produce **orphaned, unjoinable traces** — this is exactly the "propagate context consistently" requirement the chapter's last sentence names, made concrete: it is a hard technical requirement, not a nice-to-have.

➕ **Worked scenario — TTFT degradation masked by an averaged latency dashboard, using this chapter's spans to find what the dashboard couldn't:**
> **Situation:** An inference service's dashboard shows "average end-to-end latency: 450ms, stable" for a week. A specific enterprise customer escalates that "the model feels like it's thinking forever before it starts responding" — their UX streams tokens, so users perceive TTFT, not total latency.
> 1. The average is a blend across all customers/request shapes; a customer sending long prompts (large `input_tokens`, hence long prefill) is invisible in a fleet-wide average dominated by short-prompt traffic.
> 2. Pull traces filtered to that customer's requests (via a `customer_id` **span attribute** — never a metric label, per Chapter 3's cardinality rule) — the waterfall shows `prefill` climbing from ~70ms to 900ms+ over the week while `decode` stays flat.
> 3. Cross-check against a metric that *isn't* an average: `histogram_quantile(0.95, ...)` on prefill duration, segmented by input-length bucket — confirms it's not one customer's imagination, p95 prefill for long-input requests has genuinely regressed.
> 4. Root cause direction: prefill duration scales with input length and available compute — check batching/scheduling (are long-prompt requests being batched inefficiently with short ones?) and KV-cache/memory pressure (Deep Dive 5's exact bottleneck-family table).
> **Conclusion:** "average is stable" and "no customer is having a bad time" are different claims — this scenario is the trace-level sibling of the throttling-vs-average trap from Volume 1 Chapter 1, applied to inference latency instead of CPU.

➕ **Shortcut:** *"Averages hide, percentiles narrow, traces name."* A metric average tells you nothing is dramatically extreme on average; a percentile tells you how bad the tail is; a trace tells you exactly which span in exactly which request is the tail. Use all three in that order when a customer reports "it's slow" but dashboards look fine.

**Interview-ready line:** "A trace decomposes 'it's slow' into which span, in which service, for which request shape — that's the only telemetry type that can distinguish a queueing problem from a prefill problem from a decode problem, and those three have completely different fixes."

## Practice
➕ 1. Given the span waterfall above, write the PromQL-style question (not the query — the question in words) you'd ask of metrics to confirm whether the 310ms `queue_wait` is a fleet-wide capacity problem or isolated to this one trace.
➕ 2. Explain why `customer_id` is safe as a span attribute but unsafe as a Prometheus label, referencing both Chapter 1's evidence-selection tree and Chapter 3's cardinality rule in your answer.

---

# Chapter 8 — Alert design and runbooks
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Alert on actionable risk to an SLO or critical dependency, then make the first diagnostic steps deterministic.

A good alert tells the responder what is broken, scope, severity and where to begin. Avoid alerting on every transient metric threshold. Multi-window burn-rate approaches can detect fast and slow SLO consumption. Infrastructure alerts remain appropriate for imminent hard failures such as disk exhaustion or GPU hardware errors when action is required before user impact.

| Bad alert | Better question |
|---|---|
| CPU > 80% | Is service latency/error budget burning because CPU saturation is limiting work? |
| GPU util > 90% | Is queue/latency rising or is the GPU efficiently serving demand? |
| Pod restarted | Is restart rate abnormal and causing availability impact? |
| Disk 70% | At current growth, when will capacity breach safe threshold? |

➕ **Multi-window burn-rate alerting, worked with real numbers (the mechanism behind "detect fast and slow SLO consumption"):**
```
SLO: 99.9% (0.1% error budget) over 30 days
Fast-burn window: 1 hour    | Slow-burn window: 6 hours
Fast-burn threshold: burning budget 14.4x normal rate  (exhausts a 30-day budget in ~1 day if sustained)
Slow-burn threshold: burning budget 6x normal rate     (exhausts a 30-day budget in ~5 days if sustained)

fast_burn_rate = error_ratio_1h / 0.001
slow_burn_rate = error_ratio_6h / 0.001

ALERT: fast_burn_rate > 14.4 AND slow_burn_rate > 6   ← page immediately, high confidence + fast
ALERT: slow_burn_rate > 6 AND fast_burn_rate < 14.4   ← ticket/lower urgency, sustained but not acute
```
The reason for the AND-of-two-windows structure: a short window alone is noisy (a 2-minute blip trips it and pages someone for nothing); a long window alone is slow (by the time a 6-hour average notices, you've already burned hours of budget). Requiring both windows to agree is what makes the alert both *fast* and *precise* — this two-window pattern is Google SRE's published methodology and is worth citing by name.

➕ **Sample alert payload, annotated for what makes it "good" per this chapter's own definition (what's broken / scope / severity / where to begin):**
```json
{
  "alertname": "InferenceSLOFastBurn",
  "severity": "page",
  "summary": "Inference error budget burning 18x normal rate (fast+slow window agree)",
  "scope": "service=llm-gateway region=us-east deployment=prod",
  "since": "2026-07-30T14:00:00Z",
  "current_error_ratio_1h": 0.018,
  "current_error_ratio_6h": 0.007,
  "runbook_url": "https://runbooks.internal/inference-slo-burn",
  "first_diagnostic_step": "check DCGM_FI_DEV_XID_ERRORS and CUDAOutOfMemory error_class rate for scope above"
}
```
Every one of this chapter's four required fields (what's broken, scope, severity, where to begin) maps to a literal field in the payload — `summary`, `scope`, `severity`, `first_diagnostic_step`/`runbook_url`. If your alert payload can't fill in all four, it fails this chapter's own bar before it ever fires.

➕ **The "Better question" column, extended with the GPU-specific alert design trap this chapter's table doesn't spell out yet — missed OOMKilled vs CUDA OOM in alerting:**
> **Situation:** A single alert rule fires on "container restart count > threshold" for GPU inference Pods. It pages on-call for both a Kubernetes `OOMKilled` event (host memory exhaustion — fixable by raising the Pod's memory limit) and a `CUDAOutOfMemory` application exit (device framebuffer exhaustion — fixable by reducing batch size or model sharding, memory limit is irrelevant). On-call keeps "fixing" the wrong knob because the alert doesn't distinguish them.
> 1. This is a direct instance of the "Pod restarted → is restart rate abnormal and causing availability impact" better-question row — but it's actually one layer worse: even the *better question* doesn't split by root cause.
> 2. Fix: alert should branch on `error_class` (from Chapter 6's structured logging) or on the distinguishing Kubernetes evidence Chapter 11's Practice question 3 asks for (`OOMKilled` reason in container status vs a non-OOM nonzero exit code with a CUDA error string in logs) — two separate alerts, two separate runbook links.
> **Conclusion:** an alert that can't distinguish two root causes needing two different fixes will train on-call to apply the wrong fix by habit — this is the concrete AI-infra failure mode behind "alert on actionable risk," because "restart count high" isn't actionable on its own, only the *specific* branch is.

➕ **Shortcut:** *"If the alert's fix isn't obvious from the alert, the alert is incomplete — not the runbook."* A well-designed alert payload plus scope should make the *first* diagnostic step obvious without opening a runbook at all; the runbook exists for steps 2+.

**Interview-ready line:** "I design alerts around SLO burn rate with paired fast/slow windows for precision plus speed, and every alert payload carries enough scope and first-step guidance that a new on-call engineer doesn't need the runbook open just to start."

## Practice
➕ 1. Using the burn-rate arithmetic above, compute the fast-burn threshold multiplier for a 99.95% SLO (instead of 99.9%) with the same 1-day/5-day budget-exhaustion targets, and explain why a tighter SLO needs a *different* multiplier, not the same 14.4x.
➕ 2. Redesign the "Pod restarted" alert from the worked scenario into two separate alert definitions (one for `OOMKilled`, one for `CUDAOutOfMemory`), specifying the distinguishing evidence field each one keys off.

---

# Chapter 9 — Incident playbook: Pending Pods, CrashLoops and OOM
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Use object/event evidence before host-level investigation, then descend the stack.

## Worked scenario
**Situation:** A production Pod is Pending for 15 minutes.

1. kubectl describe Pod and read scheduling events: resource, taint, affinity, PVC, topology or admission reason.
2. Check eligible nodes and allocatable/requested resources.
3. Check PVC binding/topology and quota if referenced.
4. Check autoscaler ability/limits only if adding a node could satisfy the Pod.
5. Make one change that directly addresses the proven constraint.

**Conclusion:** Pending is a desired placement problem; start with scheduler evidence, not container logs.

➕ **Sample `kubectl describe pod` output for a GPU-specific Pending case, annotated (the event message that actually names the constraint):**
```
$ kubectl describe pod gpu-train-job-9f2a
...
Events:
  Type     Reason            Age   From               Message
  ----     ------            ----  ----               -------
  Warning  FailedScheduling  15m   default-scheduler  0/12 nodes are available: 8 Insufficient nvidia.com/gpu,
                                                        4 node(s) had untolerated taint {dedicated: training-only}.
```
This single event line answers both "how many nodes were even candidates" (0 of 12) and "why, split by reason" (8 lacked free GPU allocatable capacity, 4 were tainted and this Pod has no matching toleration). The arithmetic check that follows immediately: `kubectl describe node <gpu-node> | grep -A5 Allocated` to confirm whether the 8 GPU-insufficient nodes are *genuinely* full or whether requested-vs-allocatable accounting is the actual problem (e.g. a stuck Pod holding a GPU request without using it).

➕ **ASCII: the Pending-Pod evidence tree, generalized from steps 1-5 above:**
```
Pod Pending
    │
    ▼
kubectl describe pod → read Events reason string
    │
    ├─ "Insufficient <resource>"        → check node allocatable vs requested (step 2)
    ├─ "untolerated taint"              → check taints/tolerations/affinity (step 1)
    ├─ "node(s) had volume node affinity conflict" / PVC pending → check PVC/topology/quota (step 3)
    ├─ "0/N nodes available" + all reasons above ruled out → is cluster autoscaler capable/at limit? (step 4)
    └─ no FailedScheduling event at all, Pod just sitting  → check for admission webhook / quota rejection
        (different symptom — scheduler never even attempted placement)
```

➕ **Worked scenario — the specific GPU-fleet variant of "Pending," where the resource math is the whole answer:**
> **Situation:** A GPU training job requests 8x A100 with a strict pod-anti-affinity rule (all 8 GPUs on the same node, for NVLink locality). Cluster has 4 nodes, each with 8 A100s, currently running smaller 1-2 GPU inference jobs scattered across all 4 nodes such that no single node has 8 free.
> 1. `FailedScheduling` event: "0/4 nodes are available: 4 Insufficient nvidia.com/gpu" — technically true per-node, even though the *cluster-wide* free GPU count (say, 10 free GPUs total) looks like it should be enough.
> 2. The gap is bin-packing, not raw capacity: Kubernetes' default scheduler doesn't defragment running workloads to make room; it only places new Pods into existing free capacity shaped correctly.
> 3. Fix directions, with tradeoffs: (a) descheduler/bin-packing policy to consolidate small jobs — disruptive, has its own risk; (b) reserve/cordon a node ahead of large training jobs via scheduling policy — wastes capacity when not in use; (c) relax the anti-affinity to allow the job across nodes with a slower interconnect — changes the job's own performance profile.
> **Conclusion:** "Insufficient nvidia.com/gpu" can mean either "genuinely out of GPUs" or "enough GPUs exist but not shaped/located right for this Pod's constraints" — the fix is completely different depending on which, and the allocatable-vs-requested-vs-*fragmentation* distinction is the senior-level addition to a Pending investigation.

## Worked scenario
**Situation:** A Pod alternates Running and CrashLoopBackOff.

1. Read current/previous container termination reason and exit code.
2. Read previous logs (kubectl logs -p) because the last process instance may already be gone.
3. Separate application exit, OOM, probe-triggered restart and external eviction/node failure.
4. Reproduce with the same config/secret/env if safe; do not simply increase restart backoff.

**Conclusion:** CrashLoopBackOff is a retry state, not the root cause.

➕ **Sample `kubectl get pod -o yaml` container status, annotated — the exact fields step 1 is asking you to read:**
```yaml
containerStatuses:
- name: model-server
  restartCount: 7
  lastState:
    terminated:
      reason: OOMKilled          ← this is the answer step 1/3 want; NOT "app exit"
      exitCode: 137              ← 137 = 128+9 = SIGKILL, consistent with OOMKilled
      startedAt: "2026-07-30T13:58:02Z"
      finishedAt: "2026-07-30T14:01:47Z"
  state:
    waiting:
      reason: CrashLoopBackOff   ← the retry STATE, not the cause — this is the chapter's own conclusion line, in yaml form
```
`exitCode: 137` paired with `reason: OOMKilled` is unambiguous — this is Kubernetes/cgroup memory enforcement, the fix is a memory limit/request change or a memory leak investigation in the app, and it has **nothing to do with CUDA memory**. Contrast with an app-level crash: `reason: Error`, `exitCode: 1` (or whatever the app's own exit convention is), `lastState.terminated.message` populated with an app-specific string — that's step 3's "application exit" branch, and the fix lives in application code, not resource limits.

➕ **Shortcut — the exit-code decoder every senior SRE should have memorized cold:**
```
exitCode 0    → clean exit (shouldn't be in CrashLoopBackOff at all — check the app's own restart logic)
exitCode 1    → generic app error (check logs -p for the actual message)
exitCode 137  → 128+9 = SIGKILL — OOMKilled (check reason field) or manual kill -9 / eviction
exitCode 143  → 128+15 = SIGTERM — graceful shutdown signal received (check if it handled it correctly)
exitCode 139  → 128+11 = SIGSEGV — segfault, usually native code/library issue, not "the app decided to exit"
```
**Mnemonic:** *subtract 128 from any exit code ≥128 and you get the signal number.*

➕ **Worked scenario — OOMKilled vs CUDA OOM, the distinction Chapter 11's own Practice question 3 asks you to articulate, worked end to end here:**
> **Situation:** Two GPU Pods both restart repeatedly. Pod A: `restartCount: 5`, `lastState.terminated.reason: OOMKilled`, `exitCode: 137`. Pod B: `restartCount: 5`, `lastState.terminated.reason: Error`, `exitCode: 1`, and `kubectl logs -p` on Pod B shows `RuntimeError: CUDA out of memory. Tried to allocate 2.00 GiB...`.
> 1. Pod A's OOM is enforced by the **Kubernetes/cgroup memory controller** on host RAM — Kubernetes killed it, and it shows up as `reason: OOMKilled` because Kubernetes *knows* it did this.
> 2. Pod B's OOM is enforced by the **CUDA driver/runtime** on GPU framebuffer memory — Kubernetes has no visibility into GPU memory at all (per Chapter 4's ownership table), so it just sees an ordinary nonzero application exit; the *only* place the real cause survives is the application's own log line.
> 3. This means: if you only ever look at Kubernetes-level fields (`reason`, `exitCode`) and never `kubectl logs -p`, Pod B's CUDA OOM is **indistinguishable from any other app crash** — you would misdiagnose it as "flaky application code" and waste time in the wrong codebase.
> **Conclusion:** the distinguishing evidence for CUDA OOM specifically requires descending to logs even when Kubernetes fields look like a routine app error — this is the direct answer to Chapter 11 Practice #3, worked with real field values instead of stated abstractly.

**Interview-ready line:** "CrashLoopBackOff is Kubernetes' retry policy talking, not the failure — the actual cause is always one of exit code plus termination reason plus previous logs, and OOMKilled versus a CUDA-OOM string in the logs are two different fixes wearing the same restart count."

## Practice
➕ 1. Given `exitCode: 143` and `reason: Error` on a Pod that restarts every time right after a rolling deploy of a *different* service, name the two most likely explanations and the one piece of evidence that would distinguish them (hint: was this Pod's termination initiated by its own app, or externally).
➕ 2. Write the one-line `kubectl` command to pull `lastState.terminated.reason` and `exitCode` for every Pod in a namespace at once, so you don't have to `describe` each Pod individually during an incident with many restarting Pods.
