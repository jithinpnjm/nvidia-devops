---
title: "Senior Deep Dive 8 — Reliability testing and game days"
slug: "senior-deep-dive-8-reliability-testing-and-game-days"
sidebar_position: 19
description: "Senior Deep Dive 8 — Reliability testing and game days — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Run controlled failures: kill model workers, block DNS, remove an EndpointSlice target, fill node image filesystem, introduce API latency, drain a GPU node, interrupt a storage path or isolate a network rail. The goal is to validate detection, failover, runbooks and customer impact assumptions. Chaos is valuable only when the hypothesis and success criteria are explicit.

## Targeted references and reinforcement

**NVIDIA DCGM:** [https://docs.nvidia.com/datacenter/dcgm/latest/contents.html](https://docs.nvidia.com/datacenter/dcgm/latest/contents.html) — GPU telemetry, diagnostics and health APIs.

**NVIDIA NIM benchmarking metrics:** [https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html](https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html) — TTFT and inference performance metric definitions.

**Staff Engineer guide — Observability:** [https://github.com/jithinpnjm/studyguide-staff-engineer](https://github.com/jithinpnjm/studyguide-staff-engineer) — Prometheus/Grafana, cardinality, scaling, alerting and production maintenance themes.

**Vishakha Sadhwani — AI infra skill signal:** [https://www.linkedin.com/in/vsadhwani](https://www.linkedin.com/in/vsadhwani) — Practitioner emphasis on observability, distributed inference, GPU scheduling and cost optimization.

## Senior addendum

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

➕ **Mnemonic index for the whole Deep Dive arc, tying back to Figure A ("correlated evidence, not a single dashboard"):**

*"Scope it, query it cheap, trace the tree, name the Xid, watch the tail not the average, prove the fix, agree twice before paging, rehearse before it's real."* — one clause per Deep Dive, 1 through 8 in order. If you can unpack any clause into the mechanism behind it under interview pressure, you've retained the arc.

➕ **Visual model — a game day is a closed learning loop:**
```
choose failure ─► define expected signals ─► inject safely ─► detect + mitigate ─► measure recovery ─► improve runbook
       ▲                                                                                                     │
       └────────────────────────────── rerun with the next weak assumption ────────────────────────────────┘
```
**Memory hook:** *"Practice the evidence path, not just the failover command."*
