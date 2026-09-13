---
title: "Chapter 10 — End-to-End Case Study: BankNifty Big-Move Prediction Pipeline"
description: The full pipeline from Chapters 1-9, narrated as one continuous real project — every command, every bug, every real metric, in the order they actually happened.
sidebar_position: 11
tags: [case-study, end-to-end, mlops, capstone]
---

# Chapter 10: End-to-End Case Study: BankNifty Big-Move Prediction Pipeline

| Chapter metadata | Value |
|---|---|
| Volume | 25 — MLOps Engineering |
| Difficulty | Advanced |
| Estimated reading time | 45 minutes |
| Primary audience | Anyone who read Chapters 1-9 and wants to see them as one story instead of nine separate tools |
| Core question | What does it actually look like when all of this runs together on a real project, in the order it really happened — including the parts that broke? |

## The Problem

Predict whether BankNifty (an Indian stock market index) will move at least ±0.3% within the next 45 one-minute candles, using nothing but raw 1-minute price history — no hand-picked technical indicators, because the project's prior attempt at exactly that (picking "important" features from one or two training runs) had already lost real money on a contradictory, non-reproducible result. This time, every step had to be versioned, tracked, and validated before being trusted.

## Step 1 — Infrastructure (Chapter 2)

A single Nebius L40S GPU VM, provisioned and verified layer by layer:

```bash
nvidia-smi                                              # driver + GPU visible
sudo docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi   # GPU visible INSIDE a container
lsblk -d -o NAME,SIZE,TYPE                              # found a 93G unformatted volume
sudo mkfs.ext4 -F /dev/vdc && sudo mount /dev/vdc /data/mlops
sudo ufw allow OpenSSH && sudo ufw --force enable
```

Every one of these was a real command against a real box, and each step's success was *verified*, not assumed — the driver and container toolkit turned out to already be preinstalled on this VM's image, which saved real setup time, but that was discovered by checking, not by assuming a fresh image needed the full install sequence.

## Step 2 — The Two Tracking Systems (Chapters 3 & 4)

MLflow (Postgres backend, artifacts on the mounted volume) and DVC (SSH remote to the same volume) were both stood up on the same box:

```bash
docker compose up -d --build   # hit the psycopg2 missing-driver bug on first boot, fixed with a 2-line custom image
dvc remote add -d nebius "ssh://jithin@<vm-ip>/data/mlops/dvc-store"
dvc add data/processed/banknifty_bigmove_full_*.parquet && dvc push
```

Both were verified with real round-trip tests, not just "the command didn't error": MLflow by logging a run, tearing down and recreating the containers, and confirming the run was still queryable; DVC by pushing a real file and then directly inspecting the remote's content-addressed store over SSH to confirm the bytes actually landed.

## Step 3 — Data Ingestion (Chapter 5) → Labeling & Splits (Chapter 6)

The raw 1-minute data came from a resumable, gap-scanning downloader already built earlier in the project — 463,641 rows spanning 2021-09-13 to 2026-09-11, confirmed complete via its own gap-detection logic finding zero missing ranges.

Labeling turned that into 407,751 labeled rows (a **37.7% positive rate** — not a rare-event problem) with 55,890 rows deliberately kept as context-only (no defined label, but still needed as lookback history):

```bash
python3 build_labeled_dataset.py
#    Total rows (kept)    : 463641
#    Rows with a label    : 407751
#    Positive rate        : 0.3770 (153733 positives)
```

Walk-forward splitting then produced 7 folds plus a holdout — and this is where the chapter 6 bug was actually caught, live, during this project:

```bash
python3 splits.py
#   holdout (untouched): 2026-02-16 -> 2026-07-15    # WRONG — real data goes to 2026-09-11
```

The fix (holdout absorbs the full remainder instead of being capped at one block) was applied, re-verified against the real dataset, and a permanent regression test was added encoding this exact scenario so it can never silently regress again.

## Step 4 — Model Architecture (Chapter 7)

Three single-timeframe candidates (TCN, LSTM, small Transformer), all sharing an `encode()`/`forward()` interface, plus a multi-timeframe fusion model (1-minute + 5-minute branches) — added specifically because, mid-project, the person driving this work asked a sharp, well-founded question: *"are we actually letting the model see candle shape (body/wick/color) and multi-timeframe structure, or just raw numbers?"* The answer led to two real, substantive additions:

1. Raising the per-candle feature count from 4 (raw OHLC) to 10 (adding body, wick, range, and color — all still lossless functions of OHLC, not hand-picked indicators).
2. A genuine multi-timeframe fusion branch, with a dedicated test (`test_htf_branch_never_sees_the_in_progress_bucket`) proving the 5-minute branch never leaks the still-forming bucket.

## Step 5 — The Promotion Gate (Chapter 9)

Before running a real sweep, the gate itself was smoke-tested against a deliberately incomplete result — a single-fold TCN run — to prove it would correctly refuse to promote:

```text
=== Promotion gate ===
  FAIL: 1/7 folds evaluated
  PASS: cross-fold pr_auc std=0.0000 (max allowed 0.15)
  PASS: beat baseline on 1/1 folds (100%, need >=75%)
  FAIL: no --seed-run-ids given — cannot verify the result reproduces across seeds

Overall: FAIL — not promoted
```

This is the single most important verification in the whole project: **the gate was proven to say no before it was ever asked to say yes.**

## Step 6 — The Real Sweep

With every piece verified independently, the full sweep ran: both baselines and all four model configurations, across all 7 real walk-forward folds, 15 real epochs each, on the actual GPU:

```bash
python3 run_experiment.py --model baseline_naive
python3 run_experiment.py --model baseline_logreg
python3 run_experiment.py --model tcn --epochs 15 --seed 0
python3 run_experiment.py --model lstm --epochs 15 --seed 0
python3 run_experiment.py --model transformer --epochs 15 --seed 0
python3 run_experiment_mtf.py --branch-1min tcn --branch-5min lstm --epochs 15 --seed 0
```

| Model | ROC-AUC (mean, 7 folds) | PR-AUC (mean, 7 folds) |
|---|---|---|
| baseline_naive | 0.500 | (= per-fold positive rate) |
| baseline_logreg | 0.610 | — |
| **TCN** | **0.705** | **0.505** |
| LSTM | 0.678 | 0.480 |
| **Transformer** | **0.708** | **0.505** |
| 1min-TCN + 5min-LSTM fusion | 0.669 | 0.461 |

Every one of these numbers is a real, MLflow-logged result from all 7 real chronological folds — not a smoke test. TCN and the Transformer are essentially tied, both clearly ahead of both baselines and of the LSTM. The genuinely interesting result: **the multi-timeframe fusion model did worse than either single-timeframe model alone** — a real, useful negative finding this pipeline was built to surface honestly rather than paper over. (A cross-fold std of 0.0387 on the fusion model's ROC-AUC, versus tighter per-fold consistency on TCN/Transformer, is itself part of why it underperformed — see Chapter 9's Check 2.)

**What happens next, per Chapter 9, is not "pick the best number and ship it."** With TCN and Transformer essentially tied, both were queued for 2 additional seed re-runs (Check 4) before either can be considered for promotion:

```bash
python3 run_experiment.py --model transformer --epochs 15 --seed 1
python3 run_experiment.py --model transformer --epochs 15 --seed 2
python3 run_experiment.py --model tcn --epochs 15 --seed 1
python3 run_experiment.py --model tcn --epochs 15 --seed 2
```

Only once those four additional full-fold runs complete does it become meaningful to run `promotion_gate.py` for real, with actual `--baseline-run-id` and `--seed-run-ids` arguments — and only a PASS on every check would justify `mlflow.register_model()`. The gate does not care that the numbers above look promising. That's the entire point of Chapter 9.

## What This Case Study Actually Demonstrates

Not "here is a good trading model" — it's too early in the process to claim that, and this chapter deliberately doesn't. What it demonstrates is the thing this whole volume is about: **every step of getting to this table was verified independently, versioned, and logged, and the very last step — deciding whether any of these numbers justifies a promoted model — is a mechanical gate, not a person looking at a table and picking the biggest number.** That discipline is the actual deliverable of an MLOps pipeline, not any single model's accuracy.

## Interview Preparation

**Conceptual:** "Walk through this case study and identify the one point where the old, ungoverned approach (Chapter 1) would have already stopped and shipped something."

**Model Answer:** "The old approach would very plausibly have stopped right at the sweep table in Step 6 — see that the Transformer and TCN both clearly beat the baselines, pick the Transformer since it's marginally ahead, and treat that as the answer. Everything from that point in this case study onward — finishing the multi-timeframe comparison, rerunning with multiple seeds, and running the actual promotion gate rather than eyeballing the table — is exactly the governance layer that was missing before, and it's specifically designed to catch the scenario where 0.708 vs. 0.705 is noise rather than a real difference, which a human comparing two numbers in a table has no way to distinguish without the seed-consistency check."

**Architecture:** "If you were told this project needs to scale from one asset (BankNifty) to fifty, what would you change first, based on this volume's chapters?"

**Model Answer:** "I would not touch the model architecture or the promotion gate logic at all initially — those are already asset-agnostic. The first real change is at the ingestion layer (Chapter 5): the resumable, gap-scanning downloader pattern needs to run per-asset, and the MLflow experiment naming/tagging (Chapter 4) needs an asset dimension added so fifty assets' runs don't collide in one experiment namespace. I'd also revisit Chapter 8's scaling question directly at that point — fifty assets' worth of independent sweeps is a textbook case for kind #2 scaling (parallel independent runs across multiple GPUs), not kind #1 (DDP), since each asset's model is still small and independent of the others."

**Troubleshooting:** "A stakeholder asks why, given the Transformer's numbers look good, the model isn't in production yet. How do you explain this using the case study?"

**Model Answer:** "I'd point directly to Step 5 and Step 6 of this case study: the promotion gate was proven, ahead of time, to correctly refuse an incomplete or unreproduced result — that's not a formality, it's the actual mechanism that failed to exist in this project's earlier, costly attempt. The Transformer's 0.708 ROC-AUC is real and promising, but it's currently based on one random seed; the gate specifically requires at least two more seed runs showing consistent results before a configuration is considered stable, precisely because a single run's result — no matter how good it looks — was exactly what went wrong last time. The delay between 'good-looking number' and 'production model' is the deliberate cost of not repeating that mistake."

## Related Chapters

- **Previous:** [Chapter 9 — The Model Promotion Gate](./chapter-09-the-model-promotion-gate-governance-before-the-registry.md)
- **Full circle:** [Chapter 1 — Why MLOps](./chapter-01-why-mlops-the-cost-of-ungoverned-ml.md) — read it again after this chapter; the opening story should now read as a specific, preventable sequence of missing steps
