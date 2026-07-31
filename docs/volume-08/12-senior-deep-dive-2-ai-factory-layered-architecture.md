---
title: "Senior Deep Dive 2 — AI factory layered architecture"
slug: "senior-deep-dive-2-ai-factory-layered-architecture"
sidebar_position: 12
description: "Senior Deep Dive 2 — AI factory layered architecture — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
![](pathname:///img/generated/volume-08-03.png)

_Figure B. Architecture reviews must connect user workloads to orchestration, accelerated compute, network, storage and operations._

An AI factory is an integrated system, not “GPUs plus Kubernetes”. Compute nodes, high-speed fabric, storage, provisioning/lifecycle, scheduler/orchestrator, model/runtime stack, observability, identity/security and developer workflows must form one operational product. The data path and control path should be explicit in the diagram.

## Senior addendum

➕ **The layered view, drawn (extends Chapter 2's six-path diagram from a request-flow view to a full-stack view — this is genuinely new, not a re-derivation):**
```
┌───────────────────────────────────────────────────────────┐
│  Developer workflows (notebooks, CI/CD, SDKs)              │  ← how humans touch the system
├───────────────────────────────────────────────────────────┤
│  Model/runtime stack (NIM, Triton, vLLM, TensorRT-LLM...)   │  ← what actually runs the model
├───────────────────────────────────────────────────────────┤
│  Scheduler/orchestrator (Kubernetes, Slurm, Run:ai)         │  ← CONTROL plane: decides placement
├───────────────────────────────────────────────────────────┤
│  Provisioning/lifecycle (GPU Operator, node images, drivers)│  ← keeps hosts in a runnable state
├───────────────────────────────────────────────────────────┤
│  Accelerated compute + high-speed fabric (GPUs, NVLink,     │  ← DATA plane: where actual work
│  NVSwitch, RoCE/InfiniBand)                                 │     and bytes move
├───────────────────────────────────────────────────────────┤
│  Storage (dataset/checkpoint tier)                          │  ← feeds the compute layer
└───────────────────────────────────────────────────────────┘
        Identity/security and observability run ACROSS all layers
        (not a layer themselves — a cross-cutting boundary, same
        as the identity box in Chapter 2's diagram)
```
**Why "not GPUs plus Kubernetes" is the correct one-liner to defend:** a customer who thinks they've built an AI factory by provisioning GPUs and installing Kubernetes has covered exactly 2 of these 6 layers, and typically the two that are hardest to get wrong. The layers that actually fail in production — provisioning/lifecycle (driver drift), storage (can't feed the GPUs fast enough), and the model/runtime stack (wrong batching config) — are the ones the "GPUs + K8s" mental model skips entirely.

➕ **Diagram: data path and control path traced through the same layers (the explicit overlay the source text asks for):**
```
   Developer workflows          ──┐
   Model/runtime stack            │  CONTROL: "what should run, where,
   Scheduler/orchestrator         │  with what config" — declarative
   Provisioning/lifecycle       ──┘  desired state, decided here

   Accelerated compute + fabric ──┐  DATA: the actual bytes — training
   Storage                        │  data, checkpoints, model weights,
                                 ──┘  inference requests, collective traffic

   Identity/security and observability run ACROSS both columns —
   every control decision and every data movement passes through them
```
The six-layer stack answers "what are the pieces"; this overlay answers "which pieces decide, and which pieces carry" — the same distinction Chapter 2 draws for a single request, now applied to the whole factory.
