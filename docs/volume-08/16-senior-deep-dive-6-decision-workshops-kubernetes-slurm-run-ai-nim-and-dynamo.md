---
title: "Senior Deep Dive 6 — Decision workshops: Kubernetes, Slurm, Run:ai, NIM and Dynamo"
slug: "senior-deep-dive-6-decision-workshops-kubernetes-slurm-run-ai-nim-and-dynamo"
sidebar_position: 16
description: "Senior Deep Dive 6 — Decision workshops: Kubernetes, Slurm, Run:ai, NIM and Dynamo — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
The correct answer is often a composition. Kubernetes may host long-running inference, platform APIs and operators. Slurm may run tightly coupled batch training. Run:ai may provide AI-aware scheduling and GPU allocation on Kubernetes. NIM provides packaged model serving; Dynamo coordinates distributed inference when advanced routing, cache management or disaggregated serving is justified. Every layer adds capability and operational responsibility; only add it to solve an explicit requirement.
