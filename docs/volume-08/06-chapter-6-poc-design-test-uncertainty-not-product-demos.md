---
title: "Chapter 6 - PoC design: test uncertainty, not product demos"
slug: "chapter-6-poc-design-test-uncertainty-not-product-demos"
sidebar_position: 6
description: "Chapter 6 - PoC design: test uncertainty, not product demos — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
> Learning outcome Define hypotheses, metrics, controls and pass/fail criteria before building.

A good PoC answers the risky questions that block a production decision. Example hypothesis: "On H100 with candidate serving engine X, model Y can sustain 200 concurrent requests with P95 TTFT < 1 s and cost < €Z/1M tokens." The PoC needs request distribution, warm/cold state, instrumentation, comparison baseline and repeatability.

```
PoC hypothesis
 -> test environment + versions
 -> workload generator + data
 -> metrics/SLO
 -> baseline
 -> experiment matrix
 -> pass/fail criteria
 -> decision and residual risks
```

## Worked scenario
**Situation:** Customer asks for a 2-week PoC of "GPU Kubernetes."

1. Ask what production decision the PoC should enable: lifecycle automation, serving performance, distributed training, tenancy, networking?
2. Choose 2–3 hypotheses rather than attempting every platform feature.
3. Define measurable pass/fail and a baseline.
4. Use production-representative security/network/storage constraints where they affect the hypothesis.
5. Produce a decision report: validated, failed, unknown, recommendation, next risk.

**Conclusion:** A PoC is an experiment with a decision outcome, not a showroom.

---

➕ **The PoC pipeline, with the failure mode at each stage named (the source's arrow-diagram, annotated):**
```
PoC hypothesis            ← FAILURE MODE: no hypothesis, just "try the platform"
   │                         (a demo has no pass/fail; a PoC must)
   ▼
test environment+versions ← FAILURE MODE: lab environment unlike production
   │                         (different storage tier, no real network topology)
   ▼
workload generator+data   ← FAILURE MODE: synthetic load unlike real traffic
   │                         shape (steady-state load hides tail-latency bugs
   │                         that only bursty/real traffic distributions reveal)
   ▼
metrics/SLO                ← FAILURE MODE: measuring averages, not P95/P99
   │
   ▼
baseline                   ← FAILURE MODE: no baseline — "200 req/s" means
   │                         nothing without "...vs X req/s today"
   ▼
experiment matrix          ← FAILURE MODE: testing every feature shallowly
   │                         instead of 2-3 hypotheses deeply
   ▼
pass/fail criteria         ← FAILURE MODE: criteria defined AFTER seeing
   │                         results (moving the goalposts to match outcome)
   ▼
decision + residual risks  ← FAILURE MODE: report says "it works" with no
                              stated unknowns — a PoC that found zero risk
                              probably wasn't testing anything risky
```
Each arrow in the source diagram is actually a place experienced SAs have seen a PoC go wrong — walking an interviewer through *this* version (failure mode at each stage) is a stronger answer than reciting the stage names.

➕ **Mnemonic: "HEWMBEd" → Hypothesis, Environment, Workload, Metrics, Baseline, Experiment matrix, (pass/fail) Decision.** Awkward on purpose — it forces you to slow down and name each stage rather than skip from "hypothesis" straight to "results," which is exactly the shortcut that turns a PoC into an unfalsifiable demo.

➕ **Sample annotated pass/fail criteria artifact — the missing worked example, for the exact two hypothesis types Practice question 3 asks for:**
```
HYPOTHESIS A — GPU Operator lifecycle automation
"GPU Operator can perform a driver upgrade across a 20-node pool with
zero unplanned inference downtime, completing within a 4-hour
maintenance window."

  Metric                     Pass threshold           Baseline (today, manual)
  Upgrade duration            ≤ 4 hours                ~14 hours across 20 nodes
  Unplanned pod evictions     0 (only planned drains)  N/A — manual has planned outage
  Rollback time if failed     ≤ 30 min                 N/A — no rollback path today
  ➤ WHY these thresholds: "4 hours" isn't arbitrary — it's the customer's
    stated maintenance window from discovery. A PoC that succeeds in 6
    hours technically "worked" but FAILS this criterion, because the
    criterion encodes an actual operational constraint, not a nice-to-have.

HYPOTHESIS B — LLM P95 latency at target concurrency
"Model Y on serving engine X sustains 200 concurrent requests with
P95 TTFT < 1s and P95 inter-token latency < 50ms, at ≤ €Z/1M tokens."

  Metric                     Pass threshold           Baseline (naive single-GPU)
  P95 TTFT                   < 1.0s                   2.3s (measured, no batching)
  P95 inter-token latency    < 50ms                   80ms
  Cost per 1M tokens          ≤ €Z (customer's number) N/A — no production number yet
  Concurrency at pass         200 sustained, not burst  peaks at 40 before queueing
  ➤ WHY these are different criteria in KIND, not just number: Hypothesis A
    is almost entirely an OPERATIONS test (can we change this system safely
    within a business constraint); Hypothesis B is almost entirely a
    PERFORMANCE test (does this system meet an SLO at load). Conflating them
    into one PoC plan is the single most common scoping mistake — they need
    different environments, different instrumentation, and often different
    people running them.
```

➕ **Extra worked scenario — the "customer asks for a 2-week PoC of everything" trap, handled live:**
> **Situation:** the customer's actual ask (per the source scenario) is "PoC of GPU Kubernetes" with no scoping. In the room, before agreeing to anything, the SA's job is step 1: "what production decision should this PoC unblock?" If the customer can't answer that in one sentence, the PoC itself is premature — the actual next step is *more discovery* (Chapter 1), not a PoC plan.
> Suppose the customer's honest answer, after being pushed, turns out to be "we're not sure GPU Operator will survive our air-gapped update process." That's now a single, sharp hypothesis (a Deep Dive 5-flavored operations risk), and the 2-week window should be spent entirely on Hypothesis A above, not split across latency benchmarking the customer never actually needed answered.
> **Interview-ready line:** "A 2-week PoC of 'GPU Kubernetes' is a scoping failure waiting to happen — my first move is always to find the one or two decisions actually blocked, because 2 weeks is enough time to answer 2 real questions well and not enough to answer 10 shallowly."

➕ **The unfalsifiable-PoC test (a sanity check worth naming explicitly):** if you can't describe, in advance, a result that would make the PoC a FAIL, it isn't a PoC — it's a showroom with extra steps. Before starting, ask: "what does failure look like, concretely, in numbers?" If nobody can answer, the pass/fail step (step 3 in the worked scenario) hasn't actually been done yet, regardless of what the plan document says.

## Practice
1. Ask what production decision the PoC should enable: lifecycle automation, serving performance, distributed training, tenancy, networking?
2. Choose 2–3 hypotheses rather than attempting every platform feature.
3. Write PoC success criteria for GPU Operator lifecycle automation and for LLM P95 latency — two very different hypotheses.

➕ 4. Using the unfalsifiable-PoC test above, review a PoC plan you've written or seen in the past and identify whether it had a concrete, numeric FAIL condition stated before execution — if not, retroactively write one and explain what evidence would have triggered it.
➕ 5. A stakeholder wants the PoC report to say "GPU Kubernetes works great" with no caveats, because it's going into a board deck. Write the one-paragraph version of the decision report format (validated / failed / unknown / recommendation / next risk) that keeps the residual-risk honesty intact while still being usable in that deck — name what you would NOT compromise on.
