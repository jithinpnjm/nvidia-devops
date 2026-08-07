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
