# Volume 7 — Senior Deep Dives 1-8: Addendum
*(the original Deep Dive text is already strong — real mechanisms, real query examples, correctly pitched at senior level. Several Deep Dives directly extend chapters that now have their own diagrams/outputs/scenarios. Rather than duplicate, this addendum adds only what's genuinely new: cross-references, the couple of gaps worth closing with a diagram or real output, and an interview-ready mnemonic index.)*

*(original figure: media/image2.png — preserved — "Figure A. High-confidence diagnosis comes from correlated evidence, not from a single dashboard.")*

## Quick cross-reference (use both halves together, not as duplicates)
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

## Senior Deep Dive 1 — Start with SLO impact and scope
*(original text preserved — mostly reinforces Ch.1/Ch.2; USE/RED framing is the one addition worth making concrete)*

➕ **USE vs RED — two lenses for two different failure directions, not interchangeable:**
| Framework | Applies to | Asks |
|---|---|---|
| USE (Utilization, Saturation, Errors) | a **resource** (GPU, CPU, NIC, disk) | "is this thing near its limit or already failing internally?" |
| RED (Rate, Errors, Duration) | a **request-driven service** | "how much traffic, how much of it failed, how long did it take?" |

For a GPU inference endpoint, the Deep Dive's own dimension list (request rate, errors, queue depth, TTFT/ITL, tokens/s, GPU memory/utilization, KV pressure, model worker health, fabric/storage signals) is RED (request rate, errors, TTFT/ITL as duration) applied to the *service* layered on top of USE (GPU memory/utilization, fabric signals) applied to the *resources* underneath it — this is the same Layer 1-4 stack from Chapter 4's addendum, just named with the industry-standard framework labels. Worth citing both acronyms by name in an interview; it signals you know this is established methodology, not something you invented mid-incident.

## Senior Deep Dive 2 — Prometheus internals, cardinality and query cost
*(original text and PromQL examples preserved — Ch.3's addendum already covers cardinality mechanics and query evaluation order in depth; cross-reference rather than re-derive)*

See Chapter 3's addendum for: the step-by-step PromQL evaluation walkthrough, the cardinality-explosion worked scenario (`request_id` as a label), and the `histogram_quantile` mechanics. The one genuinely new point here: **recording rules trade write-time cost for read-time cost** — a recording rule precomputes an expensive expression on ingest so dashboards querying it are cheap reads instead of expensive aggregations recomputed on every page load. The operational question this Deep Dive adds beyond Ch.3: *"what failure will this metric distinguish"* — a metric or recording rule that can't change a diagnosis or capacity decision is cost without value, which is the same discipline as Ch.6's "don't log four times" applied to the metrics plane instead of logs.

## Senior Deep Dive 3 — OpenTelemetry and trace context across AI services
*(original text preserved — Ch.7 already covers the single-request span waterfall and context-propagation requirement in depth; the genuinely new piece is fan-out)*

➕ **Agentic fan-out, visualized — why "trace the request" becomes "trace the tree" for agentic systems:**
```
user_request (trace_id=X)
  ├─ agent_planning_span
  ├─ tool_call_1 (web_search)          ─┐
  ├─ tool_call_2 (calculator)           ├─ fan-out: 3 parallel children,
  ├─ tool_call_3 (retrieval, RETRY x2)  ─┘   one with retries nested under it
  │     ├─ retry_attempt_1 (failed, timeout)
  │     └─ retry_attempt_2 (succeeded)
  └─ final_synthesis_span
```
A single user action becoming "dozens of downstream operations" (the original text's own phrase) means the waterfall from Ch.7 — a linear sequence — is the wrong mental picture for agentic tracing; it's a **tree**, and retries specifically must nest as children of the operation they're retrying, not as siblings, or the trace misrepresents causality (it would look like 3 independent retrieval attempts instead of 1 operation that needed 2 tries).

## Senior Deep Dive 4 — GPU observability with DCGM and driver evidence
*(original text preserved — Ch.5's addendum already covers the DCGM metric set, UUID-vs-index, and a silent-telemetry-loss scenario in depth; the genuinely new piece is the Xid table this Deep Dive names but doesn't enumerate)*

➕ **Common Xid codes worth recognizing by number, not just "check driver logs" — a lookup table for the interview:**
| Xid | Meaning | Typical response |
|---|---|---|
| 13 | Graphics Engine Exception | often app/kernel-launch fault; check the specific CUDA call |
| 31 | GPU memory page fault | often an application bug (invalid pointer/address) |
| 48 | Double-bit ECC error (uncorrectable) | hardware memory fault — drain and RMA-track the GPU |
| 62 | Internal micro-controller halt | firmware/hardware issue — drain node |
| 79 | GPU has fallen off the bus | severe — PCIe/power/hardware fault, drain immediately, used in Ch.11's worked postmortem |
| 94/95 | Contained/uncontained ECC error | correlate with Xid 48 pattern; contained = isolated, uncontained = broader impact |
Xid codes are what turn "driver logs provide context" (the original line) into an actual triage table — cross-reference `dmesg`/`journalctl` Xid lines against DCGM's `DCGM_FI_DEV_XID_ERRORS` counter (Ch.5's metric list) to confirm the device-level metric and the driver-level log agree, then act on severity: 79/48/62 warrant immediate drain, 13/31 warrant an application-code look first.

## Senior Deep Dive 5 — Inference observability: TTFT, ITL/TPOT and saturation
*(original text, figure, and bottleneck-family table preserved in full — Ch.7's worked scenario already demonstrates this table in a concrete TTFT-degradation incident; treat that scenario as this Deep Dive's worked example)*

*(original figure: media/image3.png — preserved — "Figure B. End-to-end latency hides several different scaling pressures.")*

No further addition needed here beyond the cross-reference — Ch.7's addendum already shows the exact bottleneck-family table in action against a real customer complaint, which is stronger than adding a second synthetic example.

## Senior Deep Dive 6 — Incident workflow: evidence tree and safe mitigation
*(original text and bulleted workflow preserved in full)*

➕ **"Mitigation restores service; root cause explains why it worked" — the discipline made concrete, because this line is easy to state and easy to skip under pressure:**
> A team drains a node during the Ch.11 Xid-79 incident and error rates recover. It would be tempting to close the incident there — service is restored, the graph is green. The workflow's own bullet list requires one more step first: *"Validate recovery with the original symptom metric, not 'pods are green.'"* Confirming the *error-ratio metric itself* (not just Pod status) returned to baseline is the difference between "we did something and it happened to get better" and "we know the drain is what fixed it" — a coincidental recovery (e.g. traffic simply dropped at the same moment) would pass a "pods are green" check but fail an error-ratio check if the underlying fault were still present and traffic later returned.

## Senior Deep Dive 7 — Alert design for expensive GPU systems
*(original text preserved — Ch.8's addendum already covers burn-rate math and alert-payload design in depth; the genuinely new piece is multi-signal composition)*

➕ **Multi-signal alert composition, one concrete example extending Ch.8's burn-rate alert with the "GPU utilization alone" trap this Deep Dive names:**
```promql
# BAD (single-signal, exactly what this Deep Dive warns against):
DCGM_FI_DEV_GPU_UTIL > 90

# BETTER (multi-signal — sustained SLO violation AND queue saturation together):
(
  histogram_quantile(0.95, sum by (le)(rate(inference_ttft_seconds_bucket[10m]))) > 2.0
)
and
(
  sum(inference_queue_depth) > 50
)
```
The AND composition mirrors Ch.8's fast+slow burn-rate AND structure exactly — both are "require two independent signals to agree before paging" to suppress false positives, just composed across *different signal types* here (SLO + capacity) instead of *different time windows*. Worth naming this as the same underlying principle applied twice: agreement across independent signals is what buys precision, whether the two signals are two time windows or two telemetry planes.

## Senior Deep Dive 8 — Reliability testing and game days
*(original text and failure-injection list preserved in full)*

➕ **The game-day list, mapped to which chapter's evidence chain it's actually rehearsing — turns the list from "things to break" into "which playbook this validates":**
| Injected failure | Rehearses |
|---|---|
| kill model workers | Ch.9 CrashLoop evidence chain (exit code, reason, logs -p) |
| block DNS | classic infra troubleshooting, not GPU-specific — tests alerting breadth |
| remove an EndpointSlice target | Ch.4's object-state-vs-runtime distinction (Service still "exists," routing silently degrades) |
| fill node image filesystem | disk-exhaustion alert from Ch.8's table ("Disk 70%" better-question row) |
| introduce API latency | Ch.7 trace-based latency decomposition — does the team reach for traces or guess? |
| drain a GPU node | Ch.10's fabric-layer evidence and Ch.9's Pending-Pod bin-packing scenario |
| interrupt a storage path | Ch.10 step 6 (storage/checkpoint latency) |
| isolate a network rail | Ch.10 step 5 (fabric evidence) — the NVLink/IB counters and pairwise benchmark |
**Interview-ready line:** "A game day is only valuable if I can name, in advance, which specific alert and which specific runbook step it's supposed to prove — 'let's see what breaks' isn't a hypothesis, it's a fishing expedition."

## Targeted references and reinforcement
*(original reference list preserved in full)*

**NVIDIA DCGM:** https://docs.nvidia.com/datacenter/dcgm/latest/contents.html — GPU telemetry, diagnostics and health APIs.

**NVIDIA NIM benchmarking metrics:** https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html — TTFT and inference performance metric definitions.

**Staff Engineer guide — Observability:** https://github.com/jithinpnjm/studyguide-staff-engineer — Prometheus/Grafana, cardinality, scaling, alerting and production maintenance themes.

**Vishakha Sadhwani — AI infra skill signal:** https://www.linkedin.com/in/vsadhwani — Practitioner emphasis on observability, distributed inference, GPU scheduling and cost optimization.

➕ **Mnemonic index for the whole Deep Dive arc, tying back to Figure A ("correlated evidence, not a single dashboard"):**
*"Scope it, query it cheap, trace the tree, name the Xid, watch the tail not the average, prove the fix, agree twice before paging, rehearse before it's real."* — one clause per Deep Dive, 1 through 8 in order. If you can unpack any clause into the mechanism behind it under interview pressure, you've retained the arc.
