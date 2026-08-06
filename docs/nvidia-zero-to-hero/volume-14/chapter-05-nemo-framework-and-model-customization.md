---
title: Chapter 05 — NeMo Framework and Model Customization
description: Understand NeMo workflows for training, fine-tuning, evaluation, and model customization.
sidebar_position: 6
tags: [nemo, customization, training]
---

# NeMo Framework and Model Customization

Model customization connects data governance, distributed training, evaluation, checkpointing, and deployment.

## Workflow

```mermaid
flowchart LR
    Base[Base Model]
    Data[Curated Data]
    Train[NeMo Training or Fine-Tuning]
    Checkpoint[Checkpoint]
    Evaluate[Evaluation]
    Package[Deployable Artifact]
    Serve[NIM or Serving Runtime]

    Base --> Train
    Data --> Train --> Checkpoint --> Evaluate --> Package --> Serve
```

## Infrastructure Requirements

The platform must size GPU memory, parallelism, network, storage, data loading, checkpoints, and experiment tracking. Fine-tuning is smaller than pretraining only in relative terms; it can still be a distributed production workload.

## Governance

Record base-model revision, dataset lineage, training configuration, code commit, container digest, checkpoint metadata, evaluation results, and approval.

## Troubleshooting

Low GPU utilization may come from data preparation, storage, communication, or checkpointing. Profile the full pipeline before adding accelerators.
