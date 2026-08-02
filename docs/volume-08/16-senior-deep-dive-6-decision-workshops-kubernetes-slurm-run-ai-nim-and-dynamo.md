---
title: "Chapter 16 — Decision workshops: Kubernetes, Slurm, Run:ai, NIM and Dynamo"
slug: "senior-deep-dive-6-decision-workshops-kubernetes-slurm-run-ai-nim-and-dynamo"
sidebar_position: 16
description: "Chapter 6 — Decision workshops: Kubernetes, Slurm, Run:ai, NIM and Dynamo — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
The correct answer is often a composition. Kubernetes may host long-running inference, platform APIs and operators. Slurm may run tightly coupled batch training. Run:ai may provide AI-aware scheduling and GPU allocation on Kubernetes. NIM provides packaged model serving; Dynamo coordinates distributed inference when advanced routing, cache management or disaggregated serving is justified. Every layer adds capability and operational responsibility; only add it to solve an explicit requirement.

## Build from the normal path

**The 5-component composition, drawn as a layering diagram (extends Chapter 4's binary K8s-vs-Slurm decision tree to the full 5-way composition space named here):**
```mermaid
flowchart TD
    A["Batch training"] --> B["Slurm (or K8s+Kueue/Volcano,\nper Ch.4's split)"]
    C["Long-running inference"] --> D["Kubernetes (platform APIs,\noperators, GitOps)"]
    D --> E["Run:ai (AI-aware scheduling/allocation ON TOP\nof Kubernetes - adds fair-share, quota, and\nGPU-fractioning intelligence the raw K8s\nscheduler doesn't have natively)"]
    E --> F["NIM (packaged model serving - the actual\ninference engine/runtime running IN the\npods Run:ai/K8s scheduled)"]
    F --> G["Dynamo (ONLY if disaggregated serving,\nadvanced routing, or KV-cache management\nacross replicas is an explicit, validated\nrequirement - not a default add-on)"]
```
**The "only add it to solve an explicit requirement" line, turned into a check anyone can run in a design review:** for every layer in this stack, ask "which discovery fact (Chapter 1) or PoC-validated uncertainty (Chapter 6/Deep Dive 4) does this component resolve?" If a layer's answer is "it's a good practice" or "it's what everyone uses," rather than a specific requirement, that's a complexity add without a justification — and every added layer is also an added on-call surface, an added upgrade dependency, and an added failure domain (Chapter 2's control/data-path reasoning applies to each one individually).

**Diagram: the per-layer add/don't-add check, run against each candidate component:**
```mermaid
flowchart TD
    A["For each candidate layer (Run:ai, NIM, Dynamo, ...)"] --> Q["'Which discovery fact (Ch.1) or PoC-validated\nuncertainty (Ch.6/DD4) does this layer resolve?'"]
    Q --> S["Specific requirement"]
    Q --> B["'Best practice' / 'everyone uses it'"]
    S --> ADD["ADD the layer (accept its on-call\nsurface, upgrade dep., failure domain)"]
    B --> SKIP["DON'T add it - it's complexity without a\njustification: an unjustified failure\ndomain, nothing else"]
```
