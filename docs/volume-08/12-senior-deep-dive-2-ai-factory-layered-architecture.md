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
```mermaid
flowchart TD
    subgraph L1["Developer workflows (notebooks, CI/CD, SDKs) - how humans touch the system"]
    end
    subgraph L2["Model/runtime stack (NIM, Triton, vLLM, TensorRT-LLM...) - what actually runs the model"]
    end
    subgraph L3["Scheduler/orchestrator (Kubernetes, Slurm, Run:ai) - CONTROL plane: decides placement"]
    end
    subgraph L4["Provisioning/lifecycle (GPU Operator, node images, drivers) - keeps hosts in a runnable state"]
    end
    subgraph L5["Accelerated compute + high-speed fabric (GPUs, NVLink, NVSwitch, RoCE/InfiniBand) - DATA plane: where actual work and bytes move"]
    end
    subgraph L6["Storage (dataset/checkpoint tier) - feeds the compute layer"]
    end
    L1 --> L2 --> L3 --> L4 --> L5 --> L6
    CC["Identity/security and observability run ACROSS all layers\n(not a layer themselves - a cross-cutting boundary,\nsame as the identity box in Chapter 2's diagram)"]
    CC -.-> L1
    CC -.-> L2
    CC -.-> L3
    CC -.-> L4
    CC -.-> L5
    CC -.-> L6
```
**Why "not GPUs plus Kubernetes" is the correct one-liner to defend:** a customer who thinks they've built an AI factory by provisioning GPUs and installing Kubernetes has covered exactly 2 of these 6 layers, and typically the two that are hardest to get wrong. The layers that actually fail in production — provisioning/lifecycle (driver drift), storage (can't feed the GPUs fast enough), and the model/runtime stack (wrong batching config) — are the ones the "GPUs + K8s" mental model skips entirely.

➕ **Diagram: data path and control path traced through the same layers (the explicit overlay the source text asks for):**
```mermaid
flowchart TD
    subgraph CONTROL["CONTROL: 'what should run, where, with what\nconfig' - declarative desired state, decided here"]
        direction TD
        C1["Developer workflows"]
        C2["Model/runtime stack"]
        C3["Scheduler/orchestrator"]
        C4["Provisioning/lifecycle"]
    end
    subgraph DATA["DATA: the actual bytes - training data,\ncheckpoints, model weights, inference\nrequests, collective traffic"]
        direction TD
        D1["Accelerated compute + fabric"]
        D2["Storage"]
    end
    CROSS["Identity/security and observability run ACROSS both\ncolumns - every control decision and every data\nmovement passes through them"]
    CROSS -.-> CONTROL
    CROSS -.-> DATA
```
The six-layer stack answers "what are the pieces"; this overlay answers "which pieces decide, and which pieces carry" — the same distinction Chapter 2 draws for a single request, now applied to the whole factory.
