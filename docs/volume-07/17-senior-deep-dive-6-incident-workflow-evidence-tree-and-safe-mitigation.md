---
title: "Senior Deep Dive 6 — Incident workflow: evidence tree and safe mitigation"
slug: "senior-deep-dive-6-incident-workflow-evidence-tree-and-safe-mitigation"
sidebar_position: 17
description: "Senior Deep Dive 6 — Incident workflow: evidence tree and safe mitigation — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
Separate mitigation from root cause. Draining a node, rolling back a release or reducing concurrency may restore service, but the incident is not understood until evidence explains why the action worked. Preserve logs, metrics, manifests, versions and topology before destructive remediation when possible.

**•** Define symptom and blast radius; identify the first known-bad interval.

**•** List top hypotheses across application, orchestration, host, GPU, network and storage.

**•** Choose the cheapest/highest-information test for each hypothesis.

**•** Mitigate only when the customer/SLO requires it; record what changed.

**•** Validate recovery with the original symptom metric, not “pods are green”.

**•** Perform root-cause and contributing-factor analysis; create prevention or faster-detection actions.
