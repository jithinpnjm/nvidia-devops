# Chapter 6 — AI inference architecture questions
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Use workload metrics, serving mechanics and SLOs to justify GPU count, sharing and scaling.

| Prompt | What interviewer wants to hear |
|---|---|
| Scale an LLM service | queue/concurrency/TTFT/TPOT/tokens + cold start + GPU granularity, not CPU-only HPA |
| MIG vs time slicing | workload fit, isolation, latency variance, hardware support, operational complexity |
| Triton/NIM/vLLM | benchmark target model/hardware; distinguish model server from gateway/platform |
| Low GPU utilization | could be low demand, input starvation, batching issue, CPU/network/storage bottleneck |

When asked for a number of GPUs, state that capacity is benchmark-derived. You can explain the formula: required throughput divided by measured per-replica throughput at SLO, rounded for replica/GPU granularity, then add availability/peak headroom.

---

## Original — Question set E: AI inference architecture

| Prompt | Expected reasoning |
|---|---|
| TTFT high, ITL normal | queue/prefill/input length/model load/cache routing |
| ITL high under concurrency | decode/KV/memory pressure/batching |
| When disaggregate prefill/decode? | different resource shapes + fast KV transfer + measured benefit |
| Round-robin vs KV-aware routing | cache reuse/load balance/worker state/failure complexity |
| Scale on what metric? | queue/tokens/SLO/engine state, warmup/model load, GPU scarcity |

---

## ➕ Additions

➕ **Capacity-sizing formula as a mini decision flow (the exact structure for "how many GPUs do I need"):**
```
Required throughput (req/s or tokens/s at target SLO)
                │
                ▼
÷ Measured per-replica throughput AT THE SAME SLO   ← must be benchmarked,
  (not vendor spec-sheet peak)                          never assumed
                │
                ▼
= raw replica count (round UP to GPU/replica granularity —
                       MIG slice, full GPU, or multi-GPU replica)
                │
                ▼
+ availability headroom (N+1 / N+2 for node failure)
+ peak/burst headroom (traffic variance above steady-state mean)
                │
                ▼
= GPU count to provision
```
➕ **Interview-ready line for the "how many GPUs" question, verbatim:** "I can't give you a number without a benchmark — but I can give you the formula: required throughput divided by measured per-replica throughput *at your SLO*, rounded up to your GPU/replica granularity, plus availability and burst headroom. The benchmark is the only step that can't be skipped."

➕ **TTFT vs TPOT/ITL — the distinction worth being crisp about cold, since the original table assumes you already know these terms:**
- **TTFT (time to first token):** dominated by queueing + prefill (processing the full input prompt before generation starts). Long input prompts and queue depth are the usual suspects.
- **TPOT/ITL (time per output token / inter-token latency):** dominated by the decode loop — one token at a time, KV-cache-bound, memory-bandwidth-bound rather than compute-bound. Concurrency (how many requests share decode-phase GPU time) is the usual suspect.
- **Why the distinction matters operationally:** "TTFT high, ITL normal" and "ITL high, TTFT normal" point at *completely different* subsystems (prefill/queue vs decode/batching) even though both show up to a user as "the response feels slow" — collapsing them into one metric loses the diagnostic signal.

➕ **Sample annotated output — diagnosing "ITL high under concurrency" with real engine metrics (vLLM-style):**
```
$ curl -s localhost:8000/metrics | grep -E "num_requests_running|gpu_cache_usage|time_per_output_token"
vllm:num_requests_running        24
vllm:gpu_cache_usage_perc        0.97      ← KV cache is nearly full
vllm:time_per_output_token_seconds_sum   184.2
vllm:time_per_output_token_seconds_count 9200
```
`gpu_cache_usage_perc=0.97` is the smoking gun: the KV cache is nearly exhausted, which forces the scheduler into smaller batches or preemption/swap to make room — that's exactly what inflates per-token decode latency under concurrency, independent of raw GPU compute headroom. **Interview-ready line:** "ITL degrading under load is usually a KV-cache-capacity story before it's a compute-capacity story — check `gpu_cache_usage` before assuming you need more GPUs."

➕ **Extra worked scenario (new) — "when to disaggregate prefill/decode," made concrete with numbers:**
> **Situation:** A 70B-parameter model serving long-context RAG requests (avg 6,000 input tokens, avg 200 output tokens) shows highly variable TTFT (200ms-4s) even at moderate load.
> 1. Clarify: is variability correlated with input length, or independent of it? (Long-context prefill is itself compute-heavy and can co-locate badly with decode-phase requests competing for the same GPU.)
> 2. Model: on a single-engine (non-disaggregated) server, a long prefill request occupies the GPU compute path in a way that can stall in-flight decode-phase requests behind it — this is the mechanism, not just "it's busy."
> 3. Hypothesize: prefill-heavy traffic mix (6,000 input : 200 output ratio is prefill-dominated) is a strong candidate for disaggregating prefill onto separate GPU pool(s) from decode, so long prefills stop stalling other requests' decode steps.
> 4. Evidence needed: measure whether TTFT variance correlates specifically with concurrent long-prefill requests in the trace, and benchmark disaggregated vs monolithic serving on the actual input distribution — the KV-cache transfer cost between prefill and decode workers (over NVLink/RDMA) has to be fast enough not to eat the benefit.
> 5. Recommend: only adopt disaggregation after the benchmark shows the transfer overhead is smaller than the stalling it removes — for short-context, decode-dominated workloads, disaggregation is usually not worth the added operational complexity (two pools, KV transfer infra, more failure modes).
> **Interview-ready line:** "Disaggregating prefill and decode is a real technique with a real cost — extra hop, extra infra, extra failure surface — so I'd only recommend it once a benchmark shows the stalling problem outweighs the KV-transfer cost, not by default."

## Practice
➕ 5. Given a workload with steady-state 400 req/s at SLO, a benchmarked single-replica throughput of 55 req/s at the same SLO, and a requirement for N+1 node-failure tolerance plus 30% burst headroom, compute the GPU count out loud, narrating each step of the formula above.
➕ 6. Explain, in one sentence each, why "GPU utilization" alone is a poor autoscaling trigger for an LLM-serving HPA, and name the two metrics (from this chapter) you'd use instead.
