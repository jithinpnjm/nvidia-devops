# Batch 09 — Observability & Performance — Findings

(Summary will be added at the top once review is complete.)

## Cross-cutting finding (applies to many files across F-07 and ZTH-16/17)

- [SEVERITY: low] Code/output blocks that are meant to represent JSON, Prometheus exposition format, or shell output consistently use single quotes (`'`) instead of double quotes (`"`) for keys/label values, e.g. `DCGM_FI_DEV_GPU_UTIL{gpu='0',...}` and JSON `{'timestamp': '...'}`. Real Prometheus text exposition format and JSON both require double quotes; this looks like a markdown/smart-quote conversion artifact repeated throughout the doc set.
  - Evidence: `docs/volume-07/03-...promql...md` line ~33-45 (fake `curl | jq` JSON output uses single quotes); `docs/volume-07/05-...dcgm.md` line 24-32 (`grep gpu='0'`, DCGM metric line label syntax uses single quotes).
  - Why it matters for JR2018680: a candidate who memorizes/copy-pastes these examples verbatim onto a whiteboard or into a terminal during a live interview would produce syntactically invalid PromQL exposition format or invalid JSON — a correctness tell in a hands-on round.
  - Suggested fix: global find/replace of single quotes with double quotes inside fenced code blocks depicting JSON/Prometheus/shell output (follow-up authoring pass, not done inline here given the volume of occurrences).

## docs/volume-07 (F-07 — Observability, Reliability and Troubleshooting)

### 01-chapter-1-metrics-logs-and-traces-as-different-evidence.md
- No findings. Gold-standard depth: evidence-selection decision tree, three-signal worked incident correlation, mnemonic, interview-ready lines. SLO/error-budget arithmetic checked correct.

### 02-chapter-2-slis-slos-and-error-budgets.md
- No findings. GPU-fleet-specific SLO example (node uptime vs job completion rate) is exactly the right depth per the review brief — explicitly warns against generic infra-metric SLOs. Error-budget burn-rate arithmetic checked correct (50M req/month, 0.1% budget = 50,000 req, 12,000 failures = 24% burn — correct).

### 03-chapter-3-prometheus-mental-model-and-promql-reasoning.md
- [SEVERITY: low] See cross-cutting single-quote finding above (fake `curl | jq` JSON output block).
- Otherwise strong: correctly explains `rate()` is reset-aware and range-vector-only (why `rate(sum(...))` is a syntax error), correct distinction between histogram `histogram_quantile()` aggregatability vs Summary quantiles not being aggregatable across instances.

### 04-chapter-4-kubernetes-observability-object-state-plus-runtime-evidence.md
- No findings. Strong layered evidence-ownership model (scheduler/kubelet/cgroup/DCGM/app), annotated real-looking `kubectl describe pod` events output, good "Running but lying" GPU training worked scenario.

### 06-chapter-6-logs-that-survive-incidents.md
- No findings. Excellent OOMKilled-vs-CUDAOutOfMemory "two failure planes" distinction (correctly explains cgroup/host-memory kill vs CUDA device-framebuffer OOM look identical in `kubectl get pod` but need different fixes) — exactly the depth-of-mechanism the review brief wants.

### 07-chapter-7-traces-and-distributed-latency.md
- No findings. Correct W3C traceparent header explanation, correct span/trace_id/parent_span_id propagation mechanics, good TTFT-vs-average-latency worked scenario tied to Deep Dive 5.

### 08-chapter-8-alert-design-and-runbooks.md
- [SEVERITY: medium] Multi-window burn-rate arithmetic error: text states "Fast-burn threshold: burning budget 14.4x normal rate (exhausts a 30-day budget in ~1 day if sustained)". 30 days / 14.4 ≈ 2.08 days, not ~1 day. This is Google SRE's published multi-window burn-rate table (14.4x over 1h/5m windows exhausts a 30-day budget in ~2 days at 2% consumed per hour; 6x over 6h/30m exhausts in ~5 days) — the doc's own 6x/"~5 days" figure is correct (30/6=5), only the 14.4x/"~1 day" figure is wrong.
  - Evidence: line 25, "Fast-burn threshold: burning budget 14.4x normal rate (exhausts a 30-day budget in ~1 day if sustained)".
  - Why it matters for JR2018680: burn-rate alerting is a canonical SRE/observability interview topic (explicitly called out in this batch's brief); citing the wrong exhaustion time while citing Google's methodology by name is exactly the kind of arithmetic slip an interviewer probing SLO math would catch.
  - Suggested fix: change "~1 day" to "~2 days" (30/14.4 ≈ 2.08 days).

### 05-chapter-5-gpu-observability-with-dcgm.md
- [SEVERITY: low] See cross-cutting single-quote finding (DCGM Prometheus label syntax uses single quotes; also `grep gpu='0'` is not valid shell for filtering a label value — should be `grep 'gpu="0"'`).
- All DCGM_FI_DEV_* metric names used (GPU_UTIL, FB_USED, FB_FREE, GPU_TEMP, POWER_USAGE, SM_CLOCK, XID_ERRORS, ECC_DBE_VOL_TOTAL) are real DCGM field identifiers — verified against known DCGM field naming conventions. Excellent "device health vs workload demand" quadrant model and silent-telemetry-loss (NVML failing but exporter still `up`) worked scenario — this is exactly the depth the review brief asks for (DCGM diagnostics, thermal/health reasoning).

### 09-chapter-9-incident-playbook-pending-pods-crashloops-and-oom.md
- No findings. Correct exit-code decoding (137=SIGKILL/OOMKilled, 143=SIGTERM, 139=SIGSEGV), correct bin-packing-vs-raw-capacity GPU scheduling nuance (anti-affinity + fragmented free GPUs), reinforces OOMKilled vs CUDAOutOfMemory distinction well.

### 10-chapter-10-incident-playbook-gpu-workload-slow-or-failing.md
- No findings. Strong fabric-layer evidence walkthrough (`nvidia-smi nvlink -e`, `ibstat`, `ib_write_bw`), correct explanation that a synchronous collective is gated by its slowest link/participant, correct ordering rationale (GPU before host before fabric before storage).

### 11-chapter-11-incident-communication-and-postmortem.md
- No findings. Clean root-cause vs contributing-factor vs action-item disambiguation with a concrete Xid-79 example; explicitly bans "be more careful" action items; good exec-communication worked example preserving factual load (percentages, honest hedging on root cause).

