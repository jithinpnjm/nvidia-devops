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

### 05-chapter-5-gpu-observability-with-dcgm.md
- [SEVERITY: low] See cross-cutting single-quote finding (DCGM Prometheus label syntax uses single quotes; also `grep gpu='0'` is not valid shell for filtering a label value — should be `grep 'gpu="0"'`).
- All DCGM_FI_DEV_* metric names used (GPU_UTIL, FB_USED, FB_FREE, GPU_TEMP, POWER_USAGE, SM_CLOCK, XID_ERRORS, ECC_DBE_VOL_TOTAL) are real DCGM field identifiers — verified against known DCGM field naming conventions. Excellent "device health vs workload demand" quadrant model and silent-telemetry-loss (NVML failing but exporter still `up`) worked scenario — this is exactly the depth the review brief asks for (DCGM diagnostics, thermal/health reasoning).

