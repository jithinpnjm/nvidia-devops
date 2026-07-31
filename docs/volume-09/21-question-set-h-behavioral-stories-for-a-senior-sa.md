---
title: "Question set H — Behavioral stories for a senior SA"
slug: "question-set-h-behavioral-stories-for-a-senior-sa"
sidebar_position: 21
description: "Question set H — Behavioral stories for a senior SA — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
Prepare evidence-rich stories around: a production incident where you reduced uncertainty; a design where you rejected a fashionable technology; a disagreement with an application/customer team; a cost optimization that preserved reliability; an automation that replaced manual toil; a migration with risk control; and a situation where you explained a complex system to a non-specialist stakeholder. Use situation/context briefly, spend most time on decisions, trade-offs and measurable outcome.

## ➕ Additions

➕ **Diagram: advisory-vs-autonomous, the reusable decision for any "automation that replaced manual toil" story:**
```
Automation candidate identified (manual, repetitive, toil)
                │
                ▼
   What's the cost of a FALSE POSITIVE action?
                │
        ┌───────┴────────┐
        ▼                 ▼
  Low / reversible    High / asymmetric
  (e.g. re-run a      (e.g. drain a
   report)             healthy node)
        │                 │
        ▼                 ▼
  Automate fully      Automate DETECTION only; keep the ACTION
  end-to-end          advisory (ranked list, human confirms)
```
This is the judgment call worth naming explicitly in a behavioral story — choosing a less-automated option deliberately, because the failure cost is asymmetric, reads as more senior than "I automated it."

➕ **Extra worked story sketch (new) — filling a gap the original theme table doesn't explicitly cover: "an automation that replaced manual toil" (named in Question set H but with no worked example anywhere in the source):**
> **Situation/Task:** Weekly GPU node health checks (driver version drift, Xid history, ECC error trend) were done manually by whoever was on-call, taking ~3 hours and frequently skipped under load.
> **Action:** I wrote a scheduled job that pulled `nvidia-smi`/DCGM data fleet-wide, classified nodes using thresholds derived from Chapter 5's Xid-severity distinctions (hardware-likely vs software-recoverable), and posted a ranked drain-candidate list to the team channel automatically. The key decision was making it advisory (post a ranked list) rather than fully automated draining — I explicitly chose not to auto-drain nodes because a false positive draining a healthy node under load has a worse blast radius than a 10-minute delay for a human to confirm.
> **Result:** Manual check time went from ~3 hours/week to ~15 minutes of review, and mean time to detect a degrading GPU node dropped from "next scheduled manual check" (up to a week) to under an hour.
> **Interview-ready line:** "The judgment call worth highlighting isn't the automation itself, it's choosing advisory-not-autonomous action for anything with an asymmetric failure cost — that's usually the more senior decision than 'I automated it.'"

## Practice
➕ 4. Draft your own "automation that replaced manual toil" story using the sketch above as a template — specifically identify one decision in your story where you chose a *less* automated / *less* aggressive option deliberately, and be ready to explain why.
