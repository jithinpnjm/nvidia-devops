---
title: "Chapter 6 - AI inference architecture questions"
slug: "chapter-6-ai-inference-architecture-questions"
sidebar_position: 6
description: "Chapter 6 - AI inference architecture questions — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
> Learning outcome Use workload metrics, serving mechanics and SLOs to justify GPU count, sharing and scaling.

| Prompt | What interviewer wants to hear |
| --- | --- |
| Scale an LLM service | queue/concurrency/TTFT/TPOT/tokens + cold start + GPU granularity, not CPU-only HPA |
| MIG vs time slicing | workload fit, isolation, latency variance, hardware support, operational complexity |
| Triton/NIM/vLLM | benchmark target model/hardware; distinguish model server from gateway/platform |
| Low GPU utilization | could be low demand, input starvation, batching issue, CPU/network/storage bottleneck |

When asked for a number of GPUs, state that capacity is benchmark-derived. You can explain the formula: required throughput divided by measured per-replica throughput at SLO, rounded for replica/GPU granularity, then add availability/peak headroom.

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

## Practice
➕ 5. Given a workload with steady-state 400 req/s at SLO, a benchmarked single-replica throughput of 55 req/s at the same SLO, and a requirement for N+1 node-failure tolerance plus 30% burst headroom, compute the GPU count out loud, narrating each step of the formula above.
➕ 6. Explain, in one sentence each, why "GPU utilization" alone is a poor autoscaling trigger for an LLM-serving HPA, and name the two metrics (from this chapter) you'd use instead.

➕ **Visual model — derive fleet size from work and resilience:**
```
required SLO throughput ─► replicas at benchmarked SLO ─► N+1 failure headroom ─► burst / cold-start margin
          │                                                                        │
          └── request mix, prompt/output length, model and cache state ───────────┘
```
**Memory hook:** *"Benchmark at the SLO, then add the failure you promised to survive."*
