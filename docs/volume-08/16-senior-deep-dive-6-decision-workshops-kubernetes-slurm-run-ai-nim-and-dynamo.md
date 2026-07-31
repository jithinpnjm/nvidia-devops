---
title: "Senior Deep Dive 6 — Decision workshops: Kubernetes, Slurm, Run:ai, NIM and Dynamo"
slug: "senior-deep-dive-6-decision-workshops-kubernetes-slurm-run-ai-nim-and-dynamo"
sidebar_position: 16
description: "Senior Deep Dive 6 — Decision workshops: Kubernetes, Slurm, Run:ai, NIM and Dynamo — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
The correct answer is often a composition. Kubernetes may host long-running inference, platform APIs and operators. Slurm may run tightly coupled batch training. Run:ai may provide AI-aware scheduling and GPU allocation on Kubernetes. NIM provides packaged model serving; Dynamo coordinates distributed inference when advanced routing, cache management or disaggregated serving is justified. Every layer adds capability and operational responsibility; only add it to solve an explicit requirement.

## Senior addendum

➕ **The 5-component composition, drawn as a layering diagram (extends Chapter 4's binary K8s-vs-Slurm decision tree to the full 5-way composition space named here):**
```
   Batch training ─────────▶ Slurm (or K8s+Kueue/Volcano, per Ch.4's split)
   Long-running inference ──▶ Kubernetes (platform APIs, operators, GitOps)
                                     │
                                     ▼
                         Run:ai (AI-aware scheduling/allocation
                         ON TOP of Kubernetes — adds fair-share,
                         quota, and GPU-fractioning intelligence
                         the raw K8s scheduler doesn't have natively)
                                     │
                                     ▼
                         NIM (packaged model serving — the actual
                         inference engine/runtime running IN the
                         pods Run:ai/K8s scheduled)
                                     │
                                     ▼
                         Dynamo (ONLY if disaggregated serving,
                         advanced routing, or KV-cache management
                         across replicas is an explicit, validated
                         requirement — not a default add-on)
```
➕ **The "only add it to solve an explicit requirement" line, turned into a check anyone can run in a design review:** for every layer in this stack, ask "which discovery fact (Chapter 1) or PoC-validated uncertainty (Chapter 6/Deep Dive 4) does this component resolve?" If a layer's answer is "it's a good practice" or "it's what everyone uses," rather than a specific requirement, that's a complexity add without a justification — and every added layer is also an added on-call surface, an added upgrade dependency, and an added failure domain (Chapter 2's control/data-path reasoning applies to each one individually).

➕ **Diagram: the per-layer add/don't-add check, run against each candidate component:**
```
For each candidate layer (Run:ai, NIM, Dynamo, ...):
        │
        ▼
   "Which discovery fact (Ch.1) or PoC-validated
    uncertainty (Ch.6/DD4) does this layer resolve?"
        │
   ┌────┴────┐
   ▼         ▼
 Specific     "Best practice" /
 requirement  "everyone uses it"
   │              │
   ▼              ▼
 ADD the layer   DON'T add it — it's
 (accept its      complexity without a
 on-call surface, justification: an
 upgrade dep.,    unjustified failure
 failure domain)  domain, nothing else
```
