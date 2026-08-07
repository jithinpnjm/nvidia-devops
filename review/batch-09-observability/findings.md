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

### 12-senior-deep-dive-1-start-with-slo-impact-and-scope.md
- No findings. USE vs RED framing correctly distinguished (resources vs request-driven services) and correctly mapped onto the Layer 1-4 stack from Ch.4.

### 13-senior-deep-dive-2-prometheus-internals-cardinality-and-query-cost.md
- No findings. Recording-rules write-time-vs-read-time tradeoff explained correctly; good cross-referencing discipline instead of duplicating Ch.3 content.

### 14-senior-deep-dive-3-opentelemetry-and-trace-context-across-ai-services.md
- No findings. Agentic fan-out tree vs single-request waterfall distinction is accurate and a good addition (retries must nest as children of the retried span, not siblings).

### 15-senior-deep-dive-4-gpu-observability-with-dcgm-and-driver-evidence.md
- No findings. Xid code table verified against known NVIDIA Xid semantics: 13 (Graphics Engine Exception), 31 (GPU memory page fault), 48 (double-bit ECC/uncorrectable), 62 (internal microcontroller halt), 79 (GPU fell off the bus), 94/95 (contained/uncontained ECC) — all correct codes and correct severity guidance (79/48/62 = drain immediately).

### 16-senior-deep-dive-5-inference-observability-ttft-itl-tpot-and-saturation.md
- No findings. Correct TTFT (admission+prefill, once per request) vs ITL/TPOT (per-token cadence, repeats) distinction; bottleneck-family table is genuinely GPU/inference-specific, not generic web-service latency framing.

### 17-senior-deep-dive-6-incident-workflow-evidence-tree-and-safe-mitigation.md
- No findings. Good discipline on validating recovery via the original symptom metric rather than "pods are green," with a coincidental-recovery counterexample.

### 18-senior-deep-dive-7-alert-design-for-expensive-gpu-systems.md
- No findings. Multi-signal AND-composition PromQL example (SLO breach AND queue saturation) is syntactically plausible and correctly generalizes Ch.8's two-window burn-rate AND pattern to two telemetry planes.

### 19-senior-deep-dive-8-reliability-testing-and-game-days.md
- No findings. Good chaos-engineering/game-day checklist mapped back to specific earlier chapters' evidence chains; explicit "name the hypothesis and success criteria first" discipline.

**F-07 volume summary:** Consistently gold-standard depth throughout all 19 chapters — mechanism-first diagrams, annotated real-looking command output, GPU-fleet-specific SLO/alerting examples (not generic web-service framing), correct DCGM metric names and Xid codes, interview-ready lines per chapter. Only 2 real issues found in the whole volume: 1 medium (burn-rate exhaustion-time arithmetic error in Ch.8) and a low-severity cosmetic pattern (single quotes instead of double quotes in JSON/Prometheus-format code blocks, recurring across several chapters).

## docs/nvidia-zero-to-hero/volume-16 (ZTH-16 — GPU Observability and Operational Health)

### index.md
- No findings. Clear learning arc, good cross-references to Vol 04/06/11/12/13.

### chapter-01-why-gpu-observability-is-fundamentally-different.md
- [SEVERITY: high] Chapter repeatedly cites DCGM metric names that do not exist in DCGM's actual field-ID naming convention. Real DCGM fields use the `DCGM_FI_DEV_*` / `DCGM_FI_PROF_*` prefix (as correctly used throughout F-07's Ch.5 and Deep Dive 4 — e.g. `DCGM_FI_DEV_GPU_UTIL`, `DCGM_FI_PROF_DRAM_ACTIVE`, `DCGM_FI_PROF_SM_OCCUPANCY`, `DCGM_FI_DEV_THERMAL_VIOLATION`, `DCGM_FI_DEV_POWER_VIOLATION`, `DCGM_FI_DEV_ECC_SBE_VOL_TOTAL`). This chapter instead invents plain names with no such field IDs: `GPU_MEMORY_BANDWIDTH_USED`, `GPU_SM_OCCUPANCY`, `GPU_THERMAL_SLOWDOWN`, `GPU_POWER_SLOWDOWN`, `GPU_ECC_ERRORS_CORRECTED`.
  - Evidence: lines 171-181, e.g. "DCGM metric `GPU_MEMORY_BANDWIDTH_USED`: if it's above 80% of peak..."; "SM occupancy from... DCGM `GPU_SM_OCCUPANCY`"; "DCGM exports `GPU_THERMAL_SLOWDOWN` and `GPU_POWER_SLOWDOWN` counters"; "DCGM `GPU_ECC_ERRORS_CORRECTED`".
  - Why it matters for JR2018680: this is precisely the failure mode the review brief calls out — a candidate who memorizes these names and states them in a DCGM/PromQL interview question would be citing fields that don't exist, undermining credibility on a core NVIDIA-specific tool. It is also a direct cross-curriculum inconsistency with F-07, which uses the correct `DCGM_FI_DEV_*` convention throughout.
  - Suggested fix: replace with real DCGM field IDs (`DCGM_FI_PROF_DRAM_ACTIVE` for memory bandwidth utilization ratio, `DCGM_FI_PROF_SM_OCCUPANCY`, `DCGM_FI_DEV_THERMAL_VIOLATION`, `DCGM_FI_DEV_POWER_VIOLATION`, `DCGM_FI_DEV_ECC_SBE_VOL_TOTAL`/`ECC_DBE_VOL_TOTAL`), consistent with F-07 Ch.5.
- [SEVERITY: high] Factual GPU performance error: "a typical A100 should achieve 300+ TFLOP/s on FP32 matrix ops" (line 173). The A100's actual FP32 (CUDA core) peak is ~19.5 TFLOPS; even TF32 Tensor Core throughput is ~156 TFLOPS dense (~312 TFLOPS only with structured sparsity), and that's TF32/Tensor-Core math, not "FP32." No real A100 execution mode reaches "300+ TFLOP/s" on FP32 matrix ops as stated.
  - Evidence: line 173, "Achieved throughput vs. peak throughput: a typical A100 should achieve 300+ TFLOP/s on FP32 matrix ops; if you're seeing 20 TFLOP/s with high utilization, memory bandwidth is the ceiling."
  - Why it matters for JR2018680: GPU peak-FLOPS numbers by precision/mode (FP32 vs TF32 vs FP16/BF16 vs sparsity) are exactly the kind of concrete number an NVIDIA interviewer would sanity-check; citing the wrong peak for the wrong precision is a credibility risk in a hardware-specifics round.
  - Suggested fix: correct to real numbers, e.g. "~19.5 TFLOPS FP32 (CUDA core), ~156 TFLOPS TF32 Tensor Core dense (up to ~312 with sparsity)" and clarify which mode is being measured.
- Otherwise strong chapter: good compute-bound-vs-memory-bound worked example (85% util, 13x throughput difference), correct "nvidia-smi is a polling snapshot, not streaming telemetry" point, correct thermal range framing (A100 operates normally up to ~85°C).

### chapter-02-signals-metrics-logs-traces-and-evidence.md
- [SEVERITY: high] Wrong Xid code cited for "GPU has fallen off the bus." Sample kernel log states `NVRM: Xid (PCI:0000:17:00.0): 94, GPU has fallen off the bus.` The real NVIDIA Xid code for "GPU has fallen off the bus" is **Xid 79**, not 94. Xid 94 is actually "Contained ECC error" (correctly listed as such in this same batch's F-07 Senior Deep Dive 4, `docs/volume-07/15-...md`, which the review brief asks to cross-check against). This is a direct within-batch contradiction as well as a standalone factual error against real NVIDIA driver documentation.
  - Evidence: line 243, "NVRM: Xid (PCI:0000:17:00.0): 94, GPU has fallen off the bus." and the surrounding interpretation "Xid 94 is 'GPU fell off bus'..." (line 249).
  - Why it matters for JR2018680: Xid code identification is a named, explicitly-tested topic in this review's own brief (DCGM diagnostics) and is a classic NVIDIA hardware-fault interview probe; citing the wrong Xid number for a well-known fault is a direct, checkable error.
  - Suggested fix: change Xid 94 to Xid 79 in both the log line and the interpretation text; note that 94/95 are contained/uncontained ECC errors (see F-07 Deep Dive 4's correct table for the reference to align to).
- [SEVERITY: low] Malformed Prometheus exposition sample: the `# TYPE` comment line for `DCGM_FI_DEV_FB_USED` is missing its `gauge` type token and instead is concatenated with the GPU-0 metric line, and the GPU-0 sample metric line for `DCGM_FI_DEV_FB_USED` is dropped entirely (only GPU-1's line appears).
  - Evidence: lines 157-159: `# TYPE DCGM_FI_DEV_FB_USED{gpu="0",uuid="GPU-<uuid>"} 28672` immediately followed by `DCGM_FI_DEV_FB_USED{gpu="1",uuid="GPU-<uuid>"} 30000` — compare to the well-formed `DCGM_FI_DEV_GPU_TEMP`/`DCGM_FI_DEV_GPU_UTIL` blocks immediately above/below it, which have both GPU 0 and GPU 1 lines plus a correct `# TYPE ... gauge` line.
  - Why it matters for JR2018680: minor — a reader copy-pasting this exact block into a mock Prometheus exposition test would get a malformed metrics file.
  - Suggested fix: restore `# TYPE DCGM_FI_DEV_FB_USED gauge` and the missing `DCGM_FI_DEV_FB_USED{gpu="0",...} 28672` line, matching the pattern of the other three metric blocks.
- Otherwise this chapter correctly uses real `DCGM_FI_DEV_*` field names throughout (`DCGM_FI_DEV_GPU_TEMP`, `DCGM_FI_DEV_FB_FREE`, `DCGM_FI_DEV_GPU_UTIL`) — good internal consistency with F-07 except for the one Xid error noted above. Also note: this chapter (correct DCGM_FI_DEV_* naming) directly contradicts Chapter 01 of this same volume (which invented `GPU_MEMORY_BANDWIDTH_USED`/`GPU_SM_OCCUPANCY`/etc.) — a within-volume inconsistency in addition to the cross-curriculum one already flagged in Ch.01's finding.

### chapter-03-core-gpu-metrics-and-interpretation.md
- No findings of factual error. Good 3-scenario utilization/memory-bandwidth matrix (memory-bound vs compute-bound vs spinning), correct memory allocated/reserved/free distinction, correct temperature-vs-throttling distinction, sensible (if simplified) power-temperature interaction model presented as a teaching approximation. Good alert-threshold "bad vs good" framing throughout (avoids naive static thresholds).

### chapter-04-dcgm-the-gpu-metrics-foundation.md
- [SEVERITY: high] Same pattern as Ch.01: the "Core DCGM Metrics" tables (Execution/Memory/Reliability, lines 145-169) list field names that are not real DCGM field identifiers — `GPU_UTILIZATION`, `SM_OCCUPANCY`, `SM_CLOCK_THROTTLE_REASON`, `POWER_DRAW`, `THERMAL_SLOWDOWN`, `FB_FREE`, `FB_USED`, `MEMORY_BANDWIDTH_USED`, `GPU_MEMORY_CLOCK_THROTTLE`, `GPU_TEMP`, `ECC_ERRORS_CORRECTED`, `ECC_ERRORS_UNCORRECTED`, `XID_ERRORS`. Real DCGM fields require the `DCGM_FI_DEV_*`/`DCGM_FI_PROF_*` prefix, as this same chapter's own later Prometheus exporter output correctly shows (`DCGM_FI_DEV_GPU_TEMP`, `DCGM_FI_DEV_FB_USED`, `DCGM_FI_DEV_GPU_UTIL`) — i.e. the chapter contradicts itself within a few hundred lines.
  - Evidence: lines 145-169 (three "DCGM Field" tables) vs. lines 221-238 (correct exporter output).
  - Why it matters for JR2018680: a reader would reasonably assume the "Core DCGM Metrics" reference table is the canonical field list to memorize for an interview; it is not real DCGM nomenclature.
  - Suggested fix: rewrite the three tables to use real field IDs (`DCGM_FI_DEV_GPU_UTIL`, `DCGM_FI_PROF_SM_OCCUPANCY`, `DCGM_FI_DEV_CLOCK_THROTTLE_REASONS`, `DCGM_FI_DEV_POWER_USAGE`, `DCGM_FI_DEV_THERMAL_VIOLATION`, `DCGM_FI_DEV_FB_FREE`, `DCGM_FI_DEV_FB_USED`, `DCGM_FI_PROF_DRAM_ACTIVE`, `DCGM_FI_DEV_GPU_TEMP`, `DCGM_FI_DEV_ECC_SBE_VOL_TOTAL`, `DCGM_FI_DEV_ECC_DBE_VOL_TOTAL`, `DCGM_FI_DEV_XID_ERRORS`).

### chapter-05-prometheus-grafana-and-observability-dashboards.md
- [SEVERITY: high] Several PromQL/alert examples use `DCGM_FI_DEV_*`-prefixed names that look authentic (correct prefix) but do not correspond to real DCGM field IDs — more misleading than Ch.01/Ch.04's issue because the correct-looking prefix makes them harder to spot as fabricated. Specifically: `DCGM_FI_DEV_THERMAL_SLOWDOWN` (real field is `DCGM_FI_DEV_THERMAL_VIOLATION`), `DCGM_FI_DEV_TOTAL_ECC_ERRORS` (real fields are separate SBE/DBE counters, e.g. `DCGM_FI_DEV_ECC_SBE_VOL_TOTAL`/`DCGM_FI_DEV_ECC_DBE_VOL_TOTAL` — there is no single combined "TOTAL_ECC_ERRORS" field), `DCGM_FI_DEV_MEMORY_BANDWIDTH_USED` (the real field for this, `DRAM_ACTIVE`, is a `DCGM_FI_PROF_*` profiling field, not a `DCGM_FI_DEV_*` field).
  - Evidence: lines 115-116, 154, 176, 180, 232, 241, 260 (dashboard queries and alert YAML `alerts-gpu.yml`).
  - Why it matters for JR2018680: these are used inside actual alert-rule YAML presented as production-ready — a candidate reciting or reusing this alert file in an interview or take-home would reference nonexistent Prometheus series.
  - Suggested fix: replace with the real field names noted above throughout the dashboard panel list and the `gpu_health` alert group.
- [SEVERITY: medium] Logically incorrect memory-pressure alert expression: `(DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_FREE) > 0.95` (line 241) does not compute "95% of total memory used." Used/Free is a ratio of two partitions of the same total, not used-over-total — e.g. used=20GB, free=20GB gives ratio 1.0 (fires as ">95%") while only 50% of total memory is actually in use; conversely a GPU could be at 90% of total usage (used=36GB, free=4GB, ratio=9.0) and still technically satisfy ">0.95" but the intended semantics ("at 95% of capacity") is not what the formula computes at all — the formula is simply wrong for the stated intent, not just imprecise.
  - Evidence: line 241, `(DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_FREE) > 0.95`, annotated "GPU {{ $labels.gpu }}... is at 95% memory."
  - Why it matters for JR2018680: PromQL correctness for real GPU memory-pressure alerting is directly named in this batch's review brief; an alert that fires at the wrong threshold (or never fires as intended) is a production-relevant bug, not a cosmetic one.
  - Suggested fix: `DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE) > 0.95` (used over total, i.e. used+free).
- Otherwise good: correct Prometheus scrape-config structure, sensible dashboard panel design (fleet overview -> per-GPU drill-down), good data-starvation detection alert using `max_over_time`/`min_over_time` together (syntactically and semantically correct).

### chapter-06-distributed-observability-multi-gpu-and-multi-node.md
- [SEVERITY: low] Continues the same fabricated-DCGM-field pattern noted in Ch.01/04/05: `DCGM_FI_DEV_MEMORY_BANDWIDTH_USED` (line 188, and the metrics table's "GPU Memory Controller" row uses a non-DCGM `nvidia-smi -q | grep "Memory Interface"` query instead) is not a real field — see Ch.05 finding for the correct name (`DCGM_FI_PROF_DRAM_ACTIVE`). Not re-detailed here to avoid duplication; counted toward the volume-wide pattern.
- Otherwise strong chapter: correct layered mental model (single-GPU -> intra-node NVLink/PCIe -> inter-node network -> job coordination), good NCCL all-reduce timing walkthrough with plausible bandwidth arithmetic (2GB/0.0082s ≈ 244 GB/s, close enough to the stated 250 GB/s), sound multi-node straggler-diagnosis worked example.

### chapter-07-traces-profiling-and-deep-performance-diagnosis.md
- [SEVERITY: high] Factual GPU performance error, same class as Ch.01's: the Nsight Compute sample report states "Peak compute: 2.4 TFLOP/s (A100 FP32)" (line 99). The real A100 FP32 (CUDA core) peak is ~19.5 TFLOPS — off by roughly 8x. This is also internally inconsistent with Ch.01's separate (also wrong) claim of "300+ TFLOP/s on FP32 matrix ops" for the same GPU/precision — the two chapters give two different, both-incorrect numbers for the same spec.
  - Evidence: line 99, "Peak compute: 2.4 TFLOP/s (A100 FP32)"; compare to Ch.01 line 173, "a typical A100 should achieve 300+ TFLOP/s on FP32 matrix ops."
  - Why it matters for JR2018680: roofline-model reasoning (achieved FLOPs vs peak FLOPs) is a named topic in this batch's brief and a classic NVIDIA performance-engineering interview question; citing an 8x-wrong peak number undermines the "achieved/peak = 58%" conclusion presented immediately after it (58% of the *wrong* peak is not a real efficiency number).
  - Suggested fix: correct to ~19.5 TFLOPS FP32 (or clarify if TF32 Tensor Core math was intended, in which case ~156 TFLOPS dense), and reconcile with Ch.01's number so the two chapters agree.
- Otherwise strong chapter: correct tool selection (nvidia-smi dmon for orientation, Nsight Compute for kernel-level, Nsys for system-wide timeline), good memory-bound/compute-bound/instruction-bound three-way comparison with plausible occupancy/cache-hit numbers, solid baseline-vs-current regression-detection workflow (all-reduce regression masking a backward-pass improvement).

### chapter-08-common-gpu-failure-modes-and-detection.md
- [SEVERITY: high] Repeats the same wrong Xid code as Ch.02: "NVRM: Xid (PCI:0000:17:00.0): 94, GPU has fallen off the bus." (line 167). Should be Xid 79, not 94 (94 is a contained ECC error per F-07's correct table). Counted as a repeat instance of the Ch.02 finding, not a separate root cause, but flagged again because it appears in this chapter's "Failure Mode 3" section as the canonical example for GPU-fell-off-bus detection — exactly where an interview-prep reader would memorize it.
- [SEVERITY: low] Continues the fabricated-DCGM-field-name pattern (`DCGM_FI_DEV_THERMAL_SLOWDOWN`, `DCGM_FI_DEV_ECC_ERRORS_CORRECTED`, `DCGM_FI_DEV_ECC_ERRORS_UNCORRECTED` are not real field IDs — see Ch.01/04/05 findings for the correct names). Not re-detailed to avoid duplication.
- Otherwise a strong, well-organized failure-mode reference (thermal throttle, ECC spike, bus fall-off, memory fragmentation, straggler GPU) with plausible leading-indicator framing and a clean failure-signature summary table.

### chapter-09-health-checks-and-slos-for-gpu-clusters.md
- [SEVERITY: low] (fixed inline) Missing space in heading "SLO Violationand Impact" corrected to "SLO Violation and Impact."
- No other findings. This is the strongest SLO chapter in ZTH-16 and does exactly what the review brief asks for: GPU-fleet-specific SLIs (GPU availability, GPU health-check pass rate, job completion rate, throughput percentiles, all-reduce latency), not generic web-service framing. Error-budget arithmetic checked correct (99% SLO over 730 hours/month = 7.3 hour budget); the "used 6 hours, 1.3 remaining, new deployments frozen" worked tracking example is a good practical illustration consistent with F-07 Ch.2's error-budget discipline.

### chapter-10-production-troubleshooting-frameworks.md
- No findings. Good decision-tree structure across four failure classes (slow job, temperature, ECC, multi-GPU stall), well-reasoned anti-patterns table (e.g. "don't start with Nsys, it's slow to run" is good triage advice), consistent with earlier chapters' evidence hierarchy.

### chapter-11-observability-for-inference-at-scale.md
- [SEVERITY: medium] Cost-per-request arithmetic is wrong by a factor of 1000. Stated: "Cost: 730 × $3.06 = $2,234/month... Requests/month: 100 req/sec × 86,400 sec/day × 30 days = 259.2M requests... Cost per request: $2,234 / 259.2M = $0.0086 per request." The actual division is $2,234 / 259,200,000 ≈ $0.0000086 per request — the stated answer is 1000x too large (a misplaced decimal/unit error, likely confusing $/request with $/thousand-requests).
  - Evidence: lines 179-187, "Cost per request: $2,234 / 259.2M = $0.0086 per request."
  - Why it matters for JR2018680: inference cost-per-request math is a realistic take-home/interview quantitative question; an 8th-grade-arithmetic-level error undermines the worked example's credibility, and the wrong number would also break the later "FP16 can reduce cost by 30-40%" framing if someone tried to sanity-check it against real cloud GPU pricing.
  - Suggested fix: correct to "$0.0000086 per request (~$8.60 per million requests)."
- [SEVERITY: low] vLLM Prometheus metric names use an underscore prefix (`vllm_request_total`, `vllm_gpu_cache_usage_perc`, `vllm_batch_tokens_per_second`) rather than real vLLM's colon-namespaced convention (`vllm:num_requests_running`, `vllm:gpu_cache_usage_perc`, `vllm:generation_tokens_total`, `vllm:time_to_first_token_seconds`, etc.). Close enough to recognize the intent but not copy-paste-accurate for a real vLLM `/metrics` endpoint.
  - Evidence: lines 100-122 (sample `/metrics` output block).
  - Suggested fix: align to real vLLM metric names (colon-separated namespace, and vLLM's actual TTFT/ITL metric names rather than a generic "latency_seconds" bucket) for consistency with F-07's TTFT/ITL terminology (Deep Dive 5).
- Otherwise strong chapter: correct training-vs-inference characteristics table, good latency-component breakdown (queue wait vs model load vs GPU execution vs post-process) tied to a concrete P50/P99 worked example, sensible cost-optimization levers (batching, precision, distillation, MIG sharing).

### chapter-12-incident-response-and-postmortems.md
- No findings. Well-structured runbooks (thermal, OOM, cluster-availability) with time-boxed steps, good blameless postmortem template with a genuinely instructive "absolute temperature is a lagging indicator; alert on rate of change" lesson, sensible alerts/automation/architecture three-tier prevention framework. Reuses the fabricated `DCGM_FI_DEV_THERMAL_SLOWDOWN` field name from earlier chapters (not re-logged separately; part of the volume-wide pattern already flagged).

## docs/nvidia-zero-to-hero/volume-16/labs

### lab-01-setting-up-dcgm-and-prometheus-for-gpu-monitoring.md
- No findings. Correct, real DCGM field names used throughout (`DCGM_FI_DEV_GPU_TEMP`, `DCGM_FI_DEV_FB_FREE`, `DCGM_FI_DEV_GPU_UTIL`); realistic step-by-step setup with plausible expected output at each stage; good troubleshooting table.

### lab-02-building-and-interpreting-gpu-dashboards.md
- [SEVERITY: medium] Panel 3's memory-usage query repeats the used/free (not used/total) ratio bug already flagged in ZTH-16 Ch.05: `DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_FREE * 100` (line 98) does not compute "% of total memory used" (see Ch.05 finding for the arithmetic explanation). This lab is a clear self-contained proof the formula is a bug, not intentional: Step 5 of this **same file** defines the alert version correctly as `DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE) > 0.9` (line 248) — i.e. the lab contains both the wrong and the right formula for the same quantity a few dozen lines apart.
  - Evidence: line 98 (Panel 3 query, wrong) vs. line 248 (alert rule, correct).
  - Why it matters for JR2018680: a lab is exactly where a candidate would build muscle memory by typing the query themselves; the wrong version is the one presented as the primary dashboard panel to build.
  - Suggested fix: change Panel 3's query to `DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE) * 100`, matching the lab's own later alert rule.
- Otherwise a well-designed hands-on lab: good load-test scenario matrix (idle/light/heavy/memory-pressure) with plausible expected utilization/temp/clock ranges per scenario, good multi-panel correlation discipline in the "Dashboard Interpretation Scenarios" section.

### lab-03-profiling-gpu-performance-and-optimization.md
- [SEVERITY: high] Continues and compounds the volume-wide A100-FP32-peak confusion (see Ch.01, Ch.07 findings), and is internally self-contradictory within this single lab. Step 1's "Expected output (A100)" table shows plain FP32 `torch.matmul` reaching 285-330 TFLOP/s ("approaching A100's peak of ~312 TFLOP/s for FP32," line 79) — this is TF32 Tensor Core-level throughput mislabeled as FP32 (real FP32 CUDA-core peak is ~19.5 TFLOPS). Then Step 5's "compute-bound" benchmark repeats the same ~310 TFLOP/s figure for plain FP32 `torch.matmul`. Then Step 6 explicitly enables `torch.backends.cuda.matmul.allow_tf32 = True` as "the optimization" and reports a 3x speedup over an FP32 "baseline" that, per the lab's own math, computes to only ~122 GFLOP/s (5 iterations × 2×8000³ FLOPs ÷ 42.105s ≈ 1.22×10¹¹ FLOP/s) — roughly 2,700x *slower* than Step 1's reported FP32 throughput for a similarly-sized matmul, despite running functionally the same operation.
  - Evidence: line 79 ("approaching A100's peak of ~312 TFLOP/s for FP32"); line 262-263 (compute-bound kernel at "310.45 TFLOP/s"); lines 299-321 (TF32 "optimization" section, before/after timing).
  - Why it matters for JR2018680: this lab is explicitly a roofline/profiling exercise for JR2018680's performance-engineering rounds; a candidate who internalizes "A100 FP32 peak ≈ 312 TFLOP/s" will misstate a core GPU spec, and the lab's own numbers don't survive a sanity-check (the "before optimization" throughput is inconsistent by three orders of magnitude with the "baseline" shown earlier in the same lab).
  - Suggested fix: use consistent, correct numbers throughout — real A100 FP32 (CUDA core) peak ≈ 19.5 TFLOPS, TF32 Tensor Core dense peak ≈ 156 TFLOPS — and make Step 1's benchmark and Step 6's before/after benchmark arithmetically consistent with each other and with real hardware specs.
- Memory bandwidth figure (A100 peak 1555 GB/s, Step 4) is correct for the A100 40GB SXM/PCIe HBM2 variant — no issue there.

### lab-04-incident-response-simulation.md
- No findings. Well-constructed simulation scripts for thermal throttle, OOM, data starvation, and multi-GPU load imbalance, each with a plausible "expected evidence" trace and tied back to the correct runbook/framework chapter. Good self-assessment rubric.

**ZTH-16 volume summary:** Structurally excellent (mechanism-first diagrams, decision trees, worked examples, interview-ready spoken answers per chapter — matches the depth bar), but has a real and recurring technical-accuracy problem the review brief specifically asked to check for: (1) a volume-wide pattern of fabricated/non-existent DCGM field names across Ch.01, Ch.04, Ch.05, Ch.06, Ch.08, Ch.12 (real DCGM fields require the `DCGM_FI_DEV_*`/`DCGM_FI_PROF_*` prefix; several chapters instead use plain names like `GPU_MEMORY_BANDWIDTH_USED`, `THERMAL_SLOWDOWN`, `ECC_ERRORS_CORRECTED`, or DCGM_FI_DEV_*-prefixed names that look authentic but don't correspond to real fields); (2) a wrong Xid code repeated twice (Ch.02, Ch.08 both cite Xid 94 for "GPU fell off the bus," which is actually Xid 79 — and directly contradicts F-07's correct Xid table in the same batch); (3) A100 FP32 peak-FLOPS confusion repeated three times with three different wrong numbers (Ch.01: "300+ TFLOP/s," Ch.07: "2.4 TFLOP/s," Lab 03: "~312 TFLOP/s" — real FP32 CUDA-core peak is ~19.5 TFLOPS); (4) a memory-pressure PromQL formula bug (used/free instead of used/total) appearing in both Ch.05's alert and Lab 02's dashboard panel, while the correct formula appears elsewhere in the same two files. These are exactly the failure modes ("non-existent DCGM metric names," "PromQL examples syntactically/semantically wrong") the review brief asked to flag, and they cluster in this volume specifically (not in F-07, which was clean throughout).

## docs/nvidia-zero-to-hero/volume-17 (ZTH-17 — Performance Engineering)

Note: all chapter/lab filenames literally say "placeholder" but every file checked contains full, substantive content (163-316 lines each) — this is a naming artifact only, not a content gap. Confirmed by reading chapter 1 in full during Step 0 and chapters 2+ below.

### index.md
- [SEVERITY: medium] Opens with "GPUs can execute at 141 TFLOPS, but kernels achieve 15 TFLOPS" without naming a specific GPU/precision, but Ch.02 of this same volume makes the same "141 TFLOPS" claim explicit as "Peak FP32" for what its own nvidia-smi example identifies as an H100 (line 129, "NVIDIA H100 80GB HBM3"). Real H100 FP32 (CUDA-core, non-Tensor) peak is ~67 TFLOPS (SXM5) / ~51 TFLOPS (PCIe) — not 141. See Ch.02 finding for the specific instance; flagged here because the index's opening hook repeats the same wrong number as the volume's first impression.
  - Suggested fix: use a correct, precision-labeled number (e.g. "~67 TFLOPS FP32" or clearly label 141 as a Tensor Core/mixed-precision figure if that's what was intended, and state which GPU).

### chapter-01-placeholder.md (Performance Engineering Fundamentals)
- No findings (read in full during Step 0). Strong evidence-ladder framing (Level 1-4, from "GPU shows 80% util" to full roofline mechanism), correct H100 roofline arithmetic in the "evidence-based claim" example (89/141 TFLOPS = 63%, consistent with itself), good interview answers.

### chapter-02-placeholder.md (Profiling Tools Landscape)
- [SEVERITY: high] Nsight Compute sample report states "Peak FP32: 141 TFLOPS" (line 77) for what the chapter's own nvidia-smi example (line 129) identifies as an H100 80GB HBM3. The real H100 FP32 (CUDA-core) peak is ~67 TFLOPS (SXM5) — the stated figure is roughly 2x too high. This is the same class of error found repeatedly in ZTH-16 (A100 FP32 peak misstated three different ways); here it recurs for H100 in a different volume.
  - Evidence: line 77, "Peak FP32: 141 TFLOPS"; line 129, GPU identified as "NVIDIA H100 80GB HBM3."
  - Why it matters for JR2018680: roofline "achieved vs peak" reasoning (32% of peak here) is directly named in this batch's brief as a core performance-engineering interview topic; the percentage is only meaningful if the peak number is correct.
  - Suggested fix: correct to ~67 TFLOPS FP32 (SXM5) or clarify if a Tensor Core (TF32/FP16) figure was actually intended, in which case use ~989 TFLOPS TF32 dense (H100 SXM5).
- Otherwise a strong chapter: correct tool-selection reasoning (Nsight Systems for timeline vs Nsight Compute for kernel-level vs CPU profilers for preprocessing), sensible "profiler overhead hides bottlenecks" troubleshooting table, good occupancy explanation in the interview answer.

### chapter-03-placeholder.md (Roofline Model and Analytical Performance)
- [SEVERITY: high] The chapter's core hardware-roofline reference table (line 70-76) has systematically wrong peak-FLOPS numbers across every GPU listed, in a pattern consistent with the same FP32/TF32/Tensor-Core-mislabeling error found repeatedly elsewhere in this batch. Real published specs vs. table:
  - H100 SXM5: table says "Peak FP32: 141 TFLOPS" — real FP32 (CUDA core) is ~67 TFLOPS. 141 is not any standard H100 published number either (TF32 dense is ~989 TFLOPS).
  - A100 80GB: table says "Peak FP32: 78 TFLOPS" — real FP32 is ~19.5 TFLOPS; real TF32 Tensor Core dense is 156 TFLOPS (which the table separately and correctly lists as "Peak TF32: 156" — so the table has the right TF32 number but a wrong, unexplained FP32 number).
  - V100: table says "Peak FP32: 125 TFLOPS" — real V100 FP32 (CUDA core) is ~15.7 TFLOPS; ~125 TFLOPS is roughly V100's FP16 Tensor Core peak, mislabeled as FP32.
  - L40S: FP32 91 TFLOPS is close to correct (~90.5 TFLOPS real), but memory bandwidth "1.46 TB/s" is wrong — real L40S (GDDR6) bandwidth is ~864 GB/s, roughly 1.7x lower than stated.
  - Because this chapter's entire teaching mechanism (compute-intensity crossover point = peak FLOPS / peak bandwidth) is built directly on this table, every crossover value derived from it (70.5 FLOPS/byte for H100, 40.2 for A100, etc.) inherits the wrong anchor numbers, even though the *methodology* (CI = FLOPS/bytes, compare to crossover) is itself correctly taught.
  - Evidence: lines 70-76 (the GPU roofline comparison table); also lines 28-29, 57-58, 61 (141 TFLOPS repeated as the H100 compute roof throughout worked examples).
  - Why it matters for JR2018680: the roofline model is explicitly named in this batch's review brief as a core performance-engineering interview topic, and this table is presented as the memorizable reference for exactly that question — an interviewer who knows real NVIDIA spec sheets would catch these numbers immediately.
  - Suggested fix: rebuild the table from real published spec sheets (H100 SXM5: FP32 67 TFLOPS / TF32 989 TFLOPS dense / HBM3 3.35 TB/s; A100 80GB SXM: FP32 19.5 TFLOPS / TF32 156 TFLOPS dense / HBM2e 2.0 TB/s; V100: FP32 15.7 TFLOPS / FP16 Tensor Core 125 TFLOPS / HBM2 900 GB/s; L40S: FP32 90.5 TFLOPS / HBM bandwidth ~864 GB/s GDDR6), and recompute all crossover points and worked examples from the corrected numbers.
- Otherwise the chapter's teaching methodology itself (compute intensity derivation, roofline plotting, "matches roofline vs doesn't" validation workflow) is sound and pedagogically strong — the problem is entirely in the reference numbers, not the reasoning framework.

### chapter-04-placeholder.md (Bottleneck Identification and Diagnosis)
- No findings. Clean five-class bottleneck decision tree (compute/memory/I/O/network/CPU), realistic multi-bottleneck worked example with plausible percentages, good "busy vs productive" interview answer distinguishing utilization from usefulness.

### chapter-05-placeholder.md (GPU Compute Optimization)
- [SEVERITY: low] Continues using "141 TFLOPS" and "roofline target: 141" as the H100 compute ceiling throughout its worked before/after optimization example (lines 128-146) — inherits the wrong number from Ch.03's finding rather than introducing a new error. Not re-detailed to avoid duplication.
- Otherwise a strong, mechanically sound chapter: correct occupancy/register-pressure math (96 registers × 256 threads = 24,576 bytes/block, checked correct), realistic ILP dependency-chain vs unrolled-independent-ops example, sensible before/after optimization walkthrough (register reduction + block size increase + memory reordering).

### chapter-06-placeholder.md (Memory Optimization)
- [SEVERITY: low] Continues using "2 TB/s" and "141 TFLOPS"-adjacent H100 figures inherited from Ch.03 (e.g. compute roof context in the tiling example). Not re-detailed; part of the same root-cause pattern.
- Otherwise strong: correct compute-intensity arithmetic in the softmax example (2M reads × 4 bytes = 8MB, 8MB/2ms = 4GB/s, checked correct), good coalesced-vs-strided CUDA code contrast, sound tiling data-reuse example showing a kernel moving from memory-bound to compute-bound.

### chapter-07-placeholder.md (Communication and Collective Optimization)
- No findings. H100 NVLink figure (~900 GB/s point-to-point aggregate) is a correct, well-known real spec (matches NVIDIA's published 4th-gen NVLink number). Good ring-vs-tree-vs-recursive-doubling comparison with correct Big-O latency characterization (O(N) vs O(log N)), plausible compute-collective overlap arithmetic, sound "8th GPU didn't help" troubleshooting scenario.

### chapter-08-placeholder.md (Inference Optimization)
- [SEVERITY: high] The KV cache size worked example (lines 79-82) omits the number-of-transformer-layers factor entirely, and its own stated arithmetic doesn't reconcile with its stated result. KV cache size scales with `2 (K,V) × num_layers × batch × seq_len × num_heads × head_dim × bytes_per_element` — this chapter's formula ("2×(batch×seq×heads×head_dim)×2 tokens", line 77) has no layer-count term at all, which for a real 7B model (~32 transformer layers) understates KV cache size by roughly 32x. Separately, plugging the chapter's own stated numbers into its own formula (2 × 32 × 4096 × 128 × 32 × 4 bytes) gives ≈ 4.3 GB, not the stated "= 1 GB per batch" (line 80) — the chapter's own arithmetic doesn't check out even before the missing-layers issue.
  - Evidence: lines 77-82, "KV cache grows with sequence length: 2×(batch×seq×heads×head_dim)×2 tokens (key and value)... KV cache: 2 × 32 × 4096 × 128 × 32 tokens × 4 bytes = 1 GB per batch."
  - Why it matters for JR2018680: KV cache sizing is one of the single most common LLM-serving-infrastructure interview questions (it directly drives max batch size / max context length / GPU memory planning), and omitting the layer-count factor is a conceptual gap, not just a units slip — a candidate who reproduces this formula would undersize KV cache capacity planning by an order of magnitude.
  - Suggested fix: rewrite as `2 × num_layers × batch × seq_len × num_heads × head_dim × bytes_per_element`, and recompute the worked example with a stated layer count (Llama-7B: 32 layers) so the "32 GB of KV cache" downstream claim is derived correctly rather than approximately reverse-engineered.
- Otherwise a strong chapter: correct prefill (compute-heavy) vs decode (memory-latency-bound) distinction, good p50/p99 latency-tail diagnosis table, sensible quantization tradeoff table (FP32→FP16→FP8→INT8 with plausible accuracy/latency tradeoffs), correct decode-latency interview answer (memory latency, not bandwidth, dominates due to serial per-token dependency).

### chapter-09-placeholder.md (Training Optimization)
- No findings. Notably this chapter's "achieved" TFLOPS figures (50 TFLOPS FP32 GEMM, 130 TFLOPS FP16 GEMM) are actually plausible fractions of the *real* H100 peaks (~67 TFLOPS FP32, ~1979 TFLOPS FP16 Tensor Core dense) rather than repeating the volume's usual "141 TFLOPS peak" error — this chapter doesn't restate a wrong peak number, so its relative comparisons hold up. Good gradient-checkpointing memory/compute tradeoff arithmetic, correct pipeline-parallelism bubble-overhead framing, sound AllReduce-as-scaling-bottleneck troubleshooting table.

### chapter-10-placeholder.md (System-Level Performance Tuning)
- [SEVERITY: medium] Two specific hardware numbers appear wrong: (1) "Max boost clocks: 2.55 GHz" and the matching `nvidia-smi -lgc 2550` example (lines 72, 146, 162) — real H100 SXM5 boost clock is ~1.98 GHz, the same figure this chapter itself lists as "Nominal clocks" one line above; there is no real H100 clock mode at 2.55 GHz. (2) "PCIe 5.0 (max): 128 GB/s per direction" (line 113) — real PCIe 5.0 x16 unidirectional bandwidth is ~63-64 GB/s; 128 GB/s is approximately the bidirectional (both directions combined) total, not the per-direction figure as labeled.
  - Evidence: lines 72, 141-146, 162 (clock speed); line 113 (PCIe bandwidth).
  - Why it matters for JR2018680: system-level tuning commands (`nvidia-smi -lgc`) with wrong target clock values are exactly the kind of hands-on detail that would be probed in a bare-metal/hardware round; PCIe bandwidth per-direction vs bidirectional is a common point of confusion this chapter should model correctly rather than repeat.
  - Suggested fix: correct max boost clock to ~1.98 GHz (matching the "nominal" figure — H100 doesn't have a materially higher boost state) and correct PCIe 5.0 x16 to ~64 GB/s per direction (128 GB/s bidirectional aggregate).
- Otherwise a strong chapter: correct 700W H100 SXM5 TDP, correct throttle-at-80°C/shutdown-at-87°C framing, good NUMA/PCIe topology-awareness worked example with plausible latency numbers (400ns local vs 1200ns cross-socket), sound `nvidia-smi topo -m` interpretation guide.

### chapter-11-placeholder.md (Production Performance Monitoring and SLOs)
- No findings. Good SLO YAML structure (latency percentiles, throughput bounds, availability, cost-per-token), sound trend-based regression-detection code (compare to 7-day baseline, not just static threshold), correct tail-latency diagnosis reasoning. Consistent with F-07's SLO philosophy (measurable + actionable, not "fast").

### chapter-12-placeholder.md (Volume Summary and Decision Trees)
- [SEVERITY: low] Repeats the "141 TFLOPS" H100 FP32 peak figure once more in the worked 70B-model optimization journey (line 98, "1200 GFLOPS / 141 TFLOPS peak = 8.5%") — inherited from Ch.03's root-cause finding, not a new error. Not re-detailed.
- Otherwise an excellent capstone chapter: the unified decision tree correctly routes to the right chapter per bottleneck class, the technique catalog's speedup ranges are plausible and consistent with individual chapters' worked examples, and the "Real Optimization Journey" walkthrough's arithmetic checks out internally (100→109→145→160→185 samples/sec, each step's stated percentage gain matches the before/after numbers).
