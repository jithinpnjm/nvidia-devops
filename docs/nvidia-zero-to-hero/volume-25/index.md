---
title: "Volume 25 — MLOps Engineering: Experiment Tracking, Data Versioning, and Training Pipelines"
sidebar_position: 25
description: "A from-scratch, real-project MLOps build: GPU node provisioning, MLflow, DVC, leakage-safe dataset engineering, multi-branch model architectures, and a promotion gate — documented from an actual production ML project, not a toy example."
---

## Overview

| Chapter metadata | Value |
|---|---|
| Volume | 25 — MLOps Engineering |
| Difficulty | Intermediate → Advanced |
| Estimated total hours | 14-18 hours (chapters + labs) |
| Primary audience | MLOps Engineers, ML Infrastructure Engineers, Platform Engineers moving into AI |
| Core question | How do you build the *governance layer* around model training — versioned data, tracked experiments, and a gate that stops a bad model from reaching production — instead of just writing training code? |

Every other volume in this bootcamp answers "how do you make GPUs go fast." This volume answers a different question: **how do you make sure the model that comes out the other end of all that GPU time is actually trustworthy** — reproducible, comparable across runs, and validated against something more rigorous than "it looked good once."

This volume is built entirely from a real, ongoing project: a time-series "big move" prediction system trained on a live Nebius L40S GPU node, with MLflow and DVC self-hosted on that same box. Every command in this volume was actually run. Every metric shown is a real number from a real run. Two of the chapters exist specifically because something broke in exactly the way described, and the fix is the actual fix that was applied — not a hypothetical.

## Why This Volume Exists

Most GPU infrastructure content (including most of this bootcamp) assumes the training code and data are already correct, and focuses on making them run fast at scale. In practice, a huge fraction of real ML project failure has nothing to do with GPU throughput — it comes from:

- Training on a dataset that silently changed between two "identical" runs, so nobody can explain why results differ.
- A single lucky training run being mistaken for a real result, and a real-money decision being made on it.
- A subtle data leak (the model seeing information it wouldn't have at prediction time) that makes offline metrics look great and live performance fall apart.
- No record of *which* code, *which* data, and *which* hyperparameters produced *which* model weights — so six months later, nobody can reproduce or audit the "production" model.

MLOps is the discipline of closing all four of those holes *before* a model is trusted with anything real. This volume teaches it the way it actually gets learned: by building the governance layer around a real training pipeline, hitting real bugs in that layer, and fixing them.

## What You'll Learn

**Chapters 1-2: Foundations and Infrastructure**
- Why MLOps exists as a discipline distinct from both DevOps and data science — the failure modes it specifically defends against
- Provisioning a GPU node for training from a cold start: driver, Docker, `nvidia-container-toolkit`, persistent storage, firewall — and what "already provisioned" looks like when a cloud image ships GPU-ready

**Chapters 3-4: The Two Tracking Systems**
- Data versioning with DVC: what problem it solves that Git alone can't, how its remote model works, and a real SSH-remote setup with a real push/pull round-trip
- Experiment tracking with MLflow: tracking server vs. backend store vs. artifact store, nested runs for cross-validation, and a real self-hosted Docker Compose stack (Postgres + MLflow) including a dependency bug that broke it on first boot

**Chapters 5-6: Data Engineering**
- Designing a resumable, rate-limit-safe ingestion pipeline for a continuously-updated external data source — gap-scanning, immediate saves, and a confirmed-empty cache so holidays aren't re-requested forever
- Building leakage-safe labels and walk-forward splits for time-series ML — including a real off-by-one bug that silently dropped weeks of the most recent data, caught by testing the boundary condition directly

**Chapters 7-8: Model Architecture and Scaling**
- Sequence model architectures (TCN, LSTM, small Transformer) and multi-timeframe fusion — how to combine a 1-minute and a 5-minute view of the same data without leaking the in-progress candle from the coarser timeframe, via a shared `encode()`/`forward()` interface
- Scaling to multi-node distributed training — the two genuinely different meanings of "scaling," why this project needed neither in the DDP/FSDP sense, and exactly what would change if it did (with a direct hand-off to Volume 13 for the deep mechanics)

**Chapters 9-10: Governance and the Full Picture**
- The promotion gate: the single piece of engineering that directly prevents "one good-looking run" from becoming a production decision
- A full narrated case study tying every previous chapter together into the one pipeline that was actually built and run — including the real sweep results

## Key Concepts at a Glance

| Concept | What it prevents | Where it lives in this project |
|---|---|---|
| Data versioning (DVC) | "Which exact data produced this model?" being unanswerable | `banknifty_bigmove_ml/data/` + `.dvc` pointer files, SSH remote on the GPU box |
| Experiment tracking (MLflow) | Trusting memory/screenshots instead of a queryable record of every run | Self-hosted MLflow + Postgres, nested runs (parent = config, child = fold) |
| Walk-forward, chronological splits | A time-series model quietly "seeing the future" during validation | `splits.py` — expanding train window, non-overlapping validation blocks |
| Leakage-safe labeling | A label that's computed using data the model wouldn't have at prediction time | `label_logic.py` — forward-only rolling windows, per-session boundaries |
| Promotion gate | One lucky run being mistaken for a validated model | `promotion_gate.py` — all-folds, cross-fold variance, beats-baseline, seed-consistency checks |

## Production Deployment Model

In this project, the GPU node itself hosts the entire MLOps stack — MLflow tracking server, its Postgres backend, the DVC remote, and the training container — rather than depending on external managed services. This is a deliberate, cost-appropriate choice for a single-node, single-project setup: it keeps every moving part visible over one SSH connection, at the cost of not being how a multi-team, multi-cluster organization would run it (Volume 19: Production Operations covers what changes once there are many models, many teams, and many clusters sharing this infrastructure).

## How to Use This Volume

1. **Read Chapters 1-2 first** — they establish why the rest matters and the ground the labs actually run on.
2. **Run the labs against a real GPU box if you can** (a single cheap cloud GPU instance is enough — this project used one L40S, not a cluster). MLOps is not learnable by reading configuration files; run the actual `docker compose up`, actual `dvc push`, actual training run.
3. **Read the bugs, not just the happy path.** Chapters 4, 5, and 6 each contain a real bug this project hit in production-adjacent code. Understanding *why* the fix works is more valuable than the config itself.
4. **Chapter 10 is the payoff** — read it last, after the concepts from 1-9 are familiar, and it will read as a single coherent story instead of a list of tools.

## Labs

- **Lab 01: Provision a GPU Node and Verify the Stack** (45 min) — driver, Docker, `nvidia-container-toolkit`, GPU-visible-in-container proof
- **Lab 02: Stand Up a Self-Hosted MLflow + Postgres Tracking Server** (60 min) — Docker Compose stack, persistence-survives-restart proof
- **Lab 03: Wire a DVC Remote Over SSH and Version a Dataset** (40 min) — push/pull round-trip against a real remote
- **Lab 04: Build a Leakage-Safe Label and Walk-Forward Split Pipeline** (75 min) — write the boundary-condition tests before trusting the pipeline
- **Lab 05: Implement a Promotion Gate and Watch It Correctly Block a Model** (60 min) — prove the gate refuses a real run for a real, correct reason
- **Lab 06: Run a Multi-Configuration Sweep in Parallel Across GPUs** (50 min) — the "many independent runs" scaling pattern from Chapter 8, applied to a real sweep

## Related Volumes

- **Volume 10** — Kubernetes GPU Platform (how this single-node setup generalizes to a scheduler-managed multi-tenant platform)
- **Volume 13** — Distributed Training Foundations (this volume's models are small enough for one GPU; Volume 13 covers what changes once they aren't)
- **Volume 16** — GPU Observability and Operational Health (monitoring the infrastructure this volume's stack runs on)
- **Volume 19** — Production Operations (what changes once this single-node setup needs to serve many teams)
