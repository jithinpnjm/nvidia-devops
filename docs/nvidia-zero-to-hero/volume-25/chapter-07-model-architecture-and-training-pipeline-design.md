---
title: Chapter 07 — Model Architecture and Training Pipeline Design
description: Sequence models over raw time-series windows, a shared encode()/forward() pattern that enables multi-timeframe fusion, and the training loop that ties it all to MLflow.
sidebar_position: 8
tags: [pytorch, model-architecture, training-pipeline, multi-timeframe, mlops]
---

# Chapter 07: Model Architecture and Training Pipeline Design

| Chapter metadata | Value |
|---|---|
| Volume | 25 — MLOps Engineering |
| Difficulty | Advanced |
| Estimated reading time | 55 minutes |
| Primary audience | ML Engineers designing model code meant to be swept and compared, not just trained once |
| Core question | How do you structure model code so that trying a new architecture, or fusing multiple data views, is a small addition rather than a rewrite? |

## WHY

A promotion gate (Chapter 9) and a walk-forward evaluation (Chapter 6) are only useful if trying *several* candidate architectures is cheap. If every new architecture idea requires touching the training loop, the data loading, and the metrics code, the practical effect is that far fewer architectures actually get tried — and the whole point of this volume's governance layer is to make trustworthy comparison the *default*, not a heroic effort.

## WHAT

This project's model code has one deliberate structural decision that everything else follows from: **every architecture exposes both an `encode()` method (raw input → pooled feature vector) and a `forward()` method (`encode()` + a classification head).** This single pattern is what makes multi-timeframe fusion (combining a 1-minute view and a 5-minute view of the same underlying data) a composition of existing pieces instead of a new architecture.

```python
class TCN(nn.Module):
    def encode(self, x):           # (batch, lookback, features) -> (batch, feature_dim)
        ...
        return pooled
    def forward(self, x):
        return self.head(self.encode(x)).squeeze(-1)

class LSTMClassifier(nn.Module):
    def encode(self, x):
        _out, (h_n, _c) = self.lstm(x)
        return h_n[-1]
    def forward(self, x):
        return self.head(self.encode(x)).squeeze(-1)
```

## HOW

### Step 1 — Three candidate single-timeframe architectures, one shared interface

| Architecture | Inductive bias | Why it's a reasonable candidate here |
|---|---|---|
| **TCN** (dilated causal 1D convolutions) | Local pattern detection, cheap | Good at short, sharp price-action shapes |
| **LSTM** | Sequential state, remembers longer-range order | Classic time-series baseline |
| **Small Transformer** (self-attention) | Learns which past timesteps matter most, without a fixed recency bias | Can in principle find long-range dependencies a recurrent model might discount |

None of these are exotic — the point of this chapter isn't "use a fancy architecture," it's that comparing three *reasonable* candidates fairly, across every walk-forward fold, is what makes the eventual choice trustworthy (Chapter 9), not the specific architecture list.

### Step 2 — Fusing multiple timeframes as encoder composition

A 5-minute view of the same price data carries different information than a 1-minute view (broader structure vs. fine timing). Rather than inventing a new "multi-timeframe" architecture from scratch, fusion is just: encode each timeframe with its own branch, concatenate, one shared head.

```python
class MultiTimeframeModel(nn.Module):
    def __init__(self, branch_specs: dict):
        # branch_specs: {"1min": ("tcn", {...}), "5min": ("lstm", {...})}
        super().__init__()
        self.branches = nn.ModuleDict({
            tf: build_model(arch_name, **kwargs) for tf, (arch_name, kwargs) in branch_specs.items()
        })
        total_dim = sum(b.feature_dim for b in self.branches.values())
        self.head = nn.Linear(total_dim, 1)

    def forward(self, x_by_tf: dict):
        encoded = [self.branches[tf].encode(x_by_tf[tf]) for tf in x_by_tf]
        return self.head(torch.cat(encoded, dim=-1)).squeeze(-1)
```

Any architecture combination — TCN+TCN, TCN+LSTM, Transformer+Transformer — is just a different `branch_specs` dict, with zero new model code. This is the direct payoff of the `encode()`/`forward()` split from Step 1.

**The leakage-critical part of multi-timeframe fusion isn't the model — it's the data feeding it** (see Chapter 6's cross-reference): the 5-minute branch must only ever see *fully closed* 5-minute bars as of the current 1-minute candle, never the still-forming bucket the current candle is inside. That's enforced in the windowing code, not the model, but it's worth restating here because a fusion architecture makes it *easy* to accidentally wire in a leaky higher-timeframe feed if the windowing code isn't airtight.

### Step 3 — A training function generic over "one timeframe" or "many"

The training loop needs to work identically whether a model takes a plain tensor or a dict of tensors (one per timeframe) — otherwise, adding multi-timeframe support would mean a second, parallel training loop to maintain.

```python
def _to_tensor(X):
    if isinstance(X, dict):
        return {tf: torch.from_numpy(arr).float() for tf, arr in X.items()}
    return torch.from_numpy(X).float()

def _index_batch(X_t, idx):
    if isinstance(X_t, dict):
        return {tf: t[idx] for tf, t in X_t.items()}
    return X_t[idx]
```

Every place the training loop touches `X` goes through these two dispatch functions instead of assuming a plain tensor. The loop body itself — forward pass, loss, backward, optimizer step — never needs to know or care whether it's training a single-branch or multi-branch model:

```python
for epoch in range(epochs):
    for start in range(0, n_train, batch_size):
        idx = perm[start:start + batch_size]
        xb = _to_device(_index_batch(X_train_t, idx), device)
        yb = y_train_t[idx].to(device)
        logits = model(xb)                       # works whether xb is a tensor or a dict
        loss = loss_fn(logits, yb)
        ...
```

### Step 4 — Wiring the loop to MLflow (ties back to Chapter 4)

```python
with mlflow.start_run(run_name=run_name) as parent_run:
    mlflow.log_params({"model": model_name, "lookback": lookback, ...})
    for fold in folds:
        with mlflow.start_run(run_name=f"fold{fold.fold_id}", nested=True):
            fm, _ = train_and_eval_fold(model_name, ..., X_train=train_ds.X, ...)
            mlflow.log_metrics(fm.as_flat_dict())
    mlflow.log_metrics(aggregate_across_folds)   # mean/std/MIN — never just mean
```

## WHEN

Design for a shared `encode()`/`forward()` interface any time you expect to try more than one architecture, or any time fusing multiple input views is even a plausible future direction — retrofitting this separation onto model code that was written assuming a single fixed architecture is far more work than building it in from the start.

## TRADEOFFS

| Design | Cost to add a new architecture | Cost to add a new fused input view |
|---|---|---|
| One monolithic model class, no shared interface | Full rewrite | Full rewrite |
| Shared `encode()`/`forward()` interface (this project) | Implement one new class matching the interface | Zero new model code — just a new `branch_specs` entry |

## PRODUCTION

In production, this same interface separation is what lets a promoted model (Chapter 9) be swapped for an improved architecture later without touching the serving/inference code — anything downstream that calls `model(x)` for a prediction doesn't need to know or care whether `model` is a `TCN`, an `LSTMClassifier`, or a `MultiTimeframeModel`; the interface (`forward(x) -> logit`) is identical across all of them.

## TROUBLESHOOTING

### Scenario 1: A multi-timeframe model trains but produces suspiciously perfect metrics

**Symptom:** The fusion model's validation PR-AUC is dramatically higher than any single-timeframe branch alone.

**Diagnosis:** A dramatic, not-gradual jump is a leakage red flag, not an architecture win — see Chapter 6's leakage discussion. The most likely specific cause here: the higher-timeframe branch is being built from a bar that isn't actually fully closed yet relative to the target candle.

**Evidence vs. Proof:** A suspiciously good metric is evidence, not proof. Proof requires directly testing the windowing code's boundary condition — this project has a dedicated test (`test_htf_branch_never_sees_the_in_progress_bucket`) that checks, for a target candle in the middle of a 5-minute bucket, that the most recent bar in its 5-minute window is the *prior* bucket, never the currently-forming one.

**Resolution:** Run that boundary test explicitly before trusting any multi-timeframe result:
```bash
python3 -m pytest test_windowing.py -k "htf_branch_never_sees" -v
```

### Scenario 2: Shape mismatch error when adding a new architecture

**Symptom:**
```text
RuntimeError: Given groups=1, weight of size [32, 10, 5], expected input[6, 4, 120] to have 10 channels, but got 4 channels instead
```

**Diagnosis:** The model's expected input channel count (`N_FEATURES`, defined once centrally) and the test/calling code's hardcoded tensor shape have drifted out of sync — a real instance of this in the project's own history, when the feature set grew from 4 raw OHLC channels to 10 (adding candle body/wick/range channels) and a test fixture still used the old hardcoded `4`.

**Resolution:** Never hardcode a feature-count literal in more than one place — import the shared constant everywhere:
```python
from windowing import N_FEATURES
x = torch.randn(batch, lookback, N_FEATURES)   # not a hardcoded 4
```

## Interview Preparation

**Conceptual:** "Why is a shared `encode()` method more valuable for a multi-timeframe model than simply concatenating raw inputs from both timeframes before a single model?"

**Model Answer:** "Concatenating raw inputs from two timeframes with different sequence lengths (say, 120 one-minute candles and 24 five-minute candles) doesn't have a natural alignment — you'd need to either upsample the coarser series or truncate/pad awkwardly to force a common shape, which distorts the actual temporal structure of both. Encoding each timeframe separately with its own branch, suited to its own sequence length, and only combining the two *after* each has been pooled into a fixed-size representation avoids that alignment problem entirely — the model learns a representation of 'what the 1-minute view looks like' and 'what the 5-minute view looks like' independently, and the fusion only has to combine two already-comparable, fixed-size vectors, which is a much simpler operation than reconciling two differently-shaped raw sequences."

**Architecture:** "You need to add a third timeframe (15-minute) to an already-working 1-minute + 5-minute fusion model. Walk through what changes."

**Model Answer:** "Given the encoder/branch design from this chapter, this is a small, additive change: derive 15-minute bars the same way the 5-minute branch already does — resampling the same 1-minute source, using only fully-closed bars as of each target candle — add a third entry to `branch_specs` with whatever architecture makes sense for that timeframe, and the `MultiTimeframeModel`'s constructor already sums `feature_dim` across however many branches exist in the dict, so the fusion head's input size adjusts automatically. The only genuinely new work is the data-side leakage test for the new timeframe's closed-bar boundary condition — the model code itself needs essentially no changes, which is the whole point of designing it this way originally."

**Troubleshooting:** "A training loop that worked for single-timeframe models throws an error the moment you switch to a multi-timeframe model. What's the most likely category of bug?"

**Model Answer:** "Almost certainly somewhere the training loop assumed its batch of inputs was a plain tensor rather than a dict of tensors — for instance, indexing a batch with `X[idx]` directly instead of going through a dispatch helper that checks `isinstance(X, dict)` first, or calling `.to(device)` on the whole batch object without recursing into each timeframe's tensor inside a dict. The fix pattern is always the same: any place the loop touches the input data needs to go through a small helper function that handles both the plain-tensor and dict-of-tensors cases, rather than being written assuming only one of them."

## Related Chapters

- **Previous:** Chapter 6 — Building Leakage-Safe Training Datasets
- **Next:** Chapter 8 — Scaling to Multi-Node Distributed Training
- **Related:** Chapter 4 — Experiment Tracking with MLflow — the nested-run logging this chapter's training loop wires into
