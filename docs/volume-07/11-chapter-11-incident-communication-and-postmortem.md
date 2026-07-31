---
title: "Chapter 11 - Incident communication and postmortem"
slug: "chapter-11-incident-communication-and-postmortem"
sidebar_position: 11
description: "Chapter 11 - Incident communication and postmortem — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Separate mitigation, root cause, contributing factors and prevention; communicate by audience.

During an incident, communicate impact, scope, current hypothesis/evidence, mitigation and next decision time. Afterward, root cause should describe the mechanism that produced failure; contributing factors explain why impact was larger or detection/recovery slower. Action items should change systems/processes, not say "be more careful."

## Practice
1. Write a PromQL expression for 5xx ratio and state assumptions about labels.
2. Design three GPU alerts: one hardware-health, one capacity, one inference SLO alert.
3. For a CrashLoop, list the exact Kubernetes evidence that distinguishes OOM from app exit.
4. Write a one-paragraph executive incident update without losing factual accuracy.

## Targeted references
[NVIDIA: Monitoring GPUs in Kubernetes with DCGM](https://developer.nvidia.com/blog/monitoring-gpus-in-kubernetes-with-dcgm/) - GPU telemetry -> exporter -> Prometheus/Grafana.

[NVIDIA: GPU Usage Monitor](https://developer.nvidia.com/blog/get-real-time-visibility-into-gpu-usage-across-kubernetes-clusters/) - Recent integrated GPU/Kubernetes visibility pattern.

[Prometheus documentation](https://prometheus.io/docs/) - Metric model, PromQL and alerting reference.

➕ **ASCII: the incident-timeline field structure this chapter's opening paragraph is describing, made concrete — the "five things to say" template:**
```
T+0    DETECTED    "Impact: X% error rate on inference-gateway, us-east.
                     Scope: affects tenants A,B,C, not D. Since: 14:02 UTC."
T+8m   UPDATE       "Hypothesis: correlates with driver rollout at 13:58.
                     Evidence: DCGM Xid errors on gpu-nodes 04-09.
                     Mitigation in progress: draining affected nodes.
                     Next update: 14:30 or on change, whichever first."
T+22m  MITIGATED    "Nodes drained, traffic rerouted. Error rate back to baseline
                     at 14:24. Root cause investigation continues — this is
                     NOT yet a resolved incident, monitoring for recurrence."
T+3d   POSTMORTEM   root cause / contributing factors / action items (below)
```
Every update follows the same five-field shape (impact, scope, hypothesis+evidence, mitigation, next decision time) the chapter names — the discipline is saying all five *every time*, even "no change since last update," because silence during an incident is read as "nothing is happening" by anyone watching.

➕ **Root cause vs contributing factor vs action item, disambiguated with one incident run through all three — because conflating them is the most common postmortem-writing mistake:**
```
ROOT CAUSE (the mechanism):
  "A driver rollout introduced a regression causing Xid 79 (GPU fell off the bus)
   errors under sustained load on affected nodes."

CONTRIBUTING FACTORS (why impact was LARGER or detection/recovery SLOWER
— explicitly NOT the same claim as root cause):
  - No canary/staged rollout for the driver update — it hit 100% of the
    affected node pool simultaneously, which is why blast radius was large.
  - DCGM Xid-error alerting existed but had a 30-minute-sustained threshold
    tuned for noise reduction — this delayed detection by ~18 minutes versus
    a threshold tuned for this specific error's known severity.

ACTION ITEMS (must change systems/process, per the chapter's explicit ban
on "be more careful"):
  - Require staged/canary rollout for all driver/firmware changes touching
    >10% of GPU fleet in one change window. [systemic — a rollout policy]
  - Add a separate, lower-threshold, higher-severity alert specifically for
    Xid error codes on NVIDIA's own "hardware fault, act now" list, distinct
    from the general sustained-error alert. [systemic — a new alert rule]
  - NOT an action item: "engineers should double-check driver rollouts before
    pushing" — this is exactly the "be more careful" pattern the chapter
    explicitly rules out; it changes no system or process.
```

➕ **Worked scenario — writing the executive update the original Practice question 4 asks for, shown end to end with the discipline of "without losing factual accuracy":**
> **Situation:** The Xid-79 incident above needs a one-paragraph update for a VP with no infrastructure background, 10 minutes after mitigation.
> **Draft:** *"Between 14:02 and 14:24 UTC, a subset of inference traffic (tenants A, B, C; roughly 8% of total request volume) experienced elevated errors due to a hardware-level fault on several GPU nodes, triggered by a driver update earlier that day. We detected the issue via automated monitoring, took the affected nodes out of service, and restored normal error rates within 22 minutes. No data was lost. We are still completing root-cause analysis and will follow up with prevention steps, including changes to how driver updates are rolled out."*
> Why this preserves accuracy while dropping jargon: "Xid 79" becomes "hardware-level fault" (accurate, not dumbed-down-wrong); "8% of total request volume" is a real, checkable number, not a vague "some users"; "we are still completing root-cause analysis" is an honest hedge — it does not claim root cause is already fully known just to sound resolved, which is a common and damaging exec-update failure mode (prematurely declaring root cause before evidence supports it).
> **Conclusion:** the skill being tested isn't "write simpler sentences," it's "preserve every factually load-bearing number and honesty-hedge while removing jargon" — that's a materially harder skill than plain simplification, and it's what Practice #4 is actually checking for.

➕ **Shortcut:** *"Impact, scope, hypothesis+evidence, mitigation, next update — say all five, every time, even if one is 'unchanged.'"* This is the field checklist for every incident comms update, live or postmortem.

**Interview-ready line:** "Root cause is the mechanism that broke; contributing factors are why it was worse or slower to catch than it had to be; action items change a system or a process — never a person's diligence — and I keep those three things in visibly separate sections so a postmortem doesn't quietly turn into blame."

## Practice
➕ 5. Take the contributing-factors list above and, for each one, write the action item that directly closes it — confirm every contributing factor has a corresponding systemic fix, not just the root cause.
➕ 6. Rewrite the executive update above assuming root cause was *not* yet known at the time of the update (only mitigation had happened) — identify which sentence changes and why the honesty-hedge becomes even more load-bearing in that version.

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 7

**Observability, reliability engineering and evidence-led troubleshooting**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-07-02.png)

_Figure A. High-confidence diagnosis comes from correlated evidence, not from a single dashboard._

➕ **Visual model — communication changes as certainty grows:**
```
detect ─► acknowledge ─► scope / mitigate ─► update cadence ─► resolve ─► postmortem
           what users feel     what changed + risk       facts, owners, follow-up
```
**Memory hook:** *"State impact, state action, state uncertainty."* A good incident update is neither a raw investigation log nor a premature root-cause claim.
