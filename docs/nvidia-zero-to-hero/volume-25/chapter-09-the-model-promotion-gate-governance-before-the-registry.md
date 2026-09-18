---
title: "Chapter 09 — The Model Promotion Gate: Governance Before the Registry"
description: The single mechanism that directly prevents a lucky training run from becoming a production decision — hard, mechanical criteria over folds, baselines, and seeds.
sidebar_position: 10
tags: [model-governance, mlflow-registry, promotion-gate, mlops]
---

# Chapter 09: The Model Promotion Gate: Governance Before the Registry

| Chapter metadata | Value |
|---|---|
| Volume | 25 — MLOps Engineering |
| Difficulty | Advanced |
| Estimated reading time | 50 minutes |
| Primary audience | MLOps Engineers, ML Leads responsible for what actually gets deployed |
| Core question | What specific, mechanical checks turn "this run looks good" into "this model is validated," and why does each one need to be a hard pass/fail rather than a judgment call? |

## WHY

This is the chapter Chapter 1's opening story points directly at. The prior version of this project lost real money because a small number of training runs produced contradictory results, and the most convincing-looking one was trusted and acted on. A promotion gate is the concrete fix: a function, not a person's impression, decides whether a model configuration is even eligible to be considered validated — and every criterion in it exists because of a specific way "looked good" can be wrong.

## WHAT

Four independent checks, all of which must pass:

| Check | What it catches |
|---|---|
| **All folds evaluated** | A partial run (e.g., only 1 of 7 folds) being mistaken for a complete validation |
| **Cross-fold standard deviation below a threshold** | A model that's great on most folds and terrible on one, averaged into a deceptively good mean |
| **Beats a logged baseline on ≥75% of shared folds** | "Better than nothing" being conflated with "better than a simple reference model" |
| **Consistent results across ≥2 additional random seeds** | The exact failure mode from Chapter 1 — a result that doesn't reproduce isn't a result |

## HOW

### Check 1 — All folds evaluated

```python
def check_all_folds_evaluated(parent_run, fold_metrics):
    n_total = int(parent_run.data.params.get("n_folds_total", -1))
    n_run = len(fold_metrics)
    ok = (n_run == n_total) and n_total > 0
    return ok, f"{n_run}/{n_total} folds evaluated"
```

This reads `n_folds_total` back from the **parent run's own logged parameters** (Chapter 4) — the gate doesn't take anyone's word for how many folds were supposed to run, it checks the run's own record against how many fold-children actually exist.

### Check 2 — Cross-fold variance

```python
def check_cross_fold_std(candidate_folds, max_std):
    values = [m.get(PRIMARY_METRIC) for m in candidate_folds.values() if m.get(PRIMARY_METRIC) is not None]
    std = float(np.std(values))
    return std <= max_std, f"cross-fold {PRIMARY_METRIC} std={std:.4f} (max allowed {max_std})"
```

A model whose PR-AUC is 0.55, 0.54, 0.56, 0.53, 0.55, 0.54, 0.56 across 7 folds (low std) is a fundamentally different, more trustworthy claim than one that's 0.75, 0.30, 0.60, 0.35, 0.70, 0.25, 0.65 (same mean, wildly inconsistent) — the mean alone can't distinguish these, which is exactly why the aggregate logging in Chapter 4 always includes std and min alongside mean.

### Check 3 — Beats a logged baseline, fold-by-fold

```python
def check_beats_baseline(candidate_folds, baseline_folds, min_win_ratio):
    shared_folds = sorted(set(candidate_folds) & set(baseline_folds))
    wins = sum(1 for f in shared_folds
               if candidate_folds[f][PRIMARY_METRIC] > baseline_folds[f][PRIMARY_METRIC])
    ratio = wins / len(shared_folds)
    return ratio >= min_win_ratio, f"beat baseline on {wins}/{len(shared_folds)} folds ({ratio:.0%})"
```

The comparison is **fold-by-fold**, not aggregate-to-aggregate — a candidate whose *mean* PR-AUC beats the baseline's mean, but which actually loses to the baseline on most individual folds (because it wins hugely on one or two), should not pass. This is the same "don't let an aggregate hide inconsistency" principle as Check 2, applied to the baseline comparison specifically.

### Check 4 — Seed consistency: the direct fix for the original failure

```python
def check_seed_consistency(client, run_ids, max_spread):
    means = [client.get_run(rid).data.metrics.get(f"{PRIMARY_METRIC}_mean") for rid in run_ids]
    means = [m for m in means if m is not None]
    if len(means) < 2:
        return False, f"need >=2 seed runs, got {len(means)}"
    spread = float(np.max(means) - np.min(means))
    return spread <= max_spread, f"seed-run spread={spread:.4f} across {len(means)} seeds"
```

This check *cannot pass* unless the same configuration was actually re-run with different random seeds and produced consistent results. Notice the check's default behavior when no seed runs are supplied at all:

```python
if seed_run_ids:
    ...
else:
    result.add(False, "no --seed-run-ids given — cannot verify the result reproduces across seeds "
                       "(this is the exact gap that caused the past failure)")
```

**The gate fails closed, not open** — omitting the seed comparison isn't treated as "not applicable," it's treated as an automatic failure. This is a deliberate design choice: a governance check that can be silently skipped by not providing an argument isn't a governance check, it's a suggestion.

### Real output — the gate correctly blocking a real, good-looking run

Run against this project's own actual TCN result after a 1-fold smoke test (not yet a full validation):

```bash
python3 promotion_gate.py --candidate-run-id 1c7e37a0... --baseline-run-id 45624f07...
```

```text
=== Promotion gate ===
  FAIL: 1/7 folds evaluated
  PASS: cross-fold pr_auc std=0.0000 (max allowed 0.15)
  PASS: beat baseline on 1/1 folds (100%, need >=75%)
  FAIL: no --seed-run-ids given — cannot verify the result reproduces across seeds

Overall: FAIL — not promoted
```

Note what this output shows: the model's *one available data point* genuinely beat the baseline (100% win rate on the single fold it saw) — and the gate still correctly refused to promote it, because a single fold beating a baseline once is not the same claim as "validated." This is the gate working exactly as designed, not a false negative.

## WHEN

Run every candidate configuration through this full gate before considering it for the MLflow Model Registry — never register a model based on an aggregate metric alone, and never skip the seed-consistency check "just this once" under time pressure, since time pressure is precisely the condition under which the original failure happened.

## TRADEOFFS

| Approach | Risk of promoting a false positive | Iteration speed |
|---|---|---|
| Trust the best-looking single run (the original failure mode) | High | Fastest |
| Check aggregate metric only (mean across folds) | Medium — hides per-fold inconsistency (Check 2/3) | Fast |
| Full gate: all folds + cross-fold std + baseline + seed consistency | Lowest | Slowest — requires the full fold set run multiple times per candidate |

The gate's cost is real: validating one configuration properly means running it across every fold, at least 3 times total (1 original seed + 2 more). That's the deliberate price of the guarantee.

## PRODUCTION

In production, only a configuration that has passed every check gets `mlflow.register_model()` called on it, and the promotion event itself should be logged as an auditable, tagged action — who/when/why — so there's a permanent record of *which* run's evaluation justified the promotion, separate from the run's own metrics. This project's registry integration is intentionally not yet built past the gate function itself — registering a model is the very last step, gated entirely on this chapter's checks passing first.

## TROUBLESHOOTING

### Scenario 1: A genuinely good model fails the gate on cross-fold std

**Symptom:** A model with a strong mean PR-AUC fails Check 2 because one particular fold performs much worse than the others.

**Diagnosis:** This is very often not a bug in the model — it's a real regime difference in that fold's time period (a genuine market/data regime the model wasn't equally good in), which the gate is correctly surfacing rather than hiding.

**Evidence vs. Proof:** A high std is evidence of fold-specific behavior. It's not proof the model is bad — it's proof the model's performance isn't uniform across time, which is exactly the information a single aggregate number would have hidden.

**Resolution:** Don't loosen the std threshold to force a pass — investigate the specific weak fold's date range for a plausible cause (Chapter 6's split definitions make it trivial to identify exactly which calendar period that fold covers), and treat the finding as information about the model's regime-dependence, not an obstacle to route around.

### Scenario 2: Seed-consistency check fails even though each individual seed's aggregate looks reasonable

**Symptom:** Three seed runs each individually pass Checks 1-3, but Check 4 fails because their aggregate means differ by more than the allowed spread.

**Diagnosis:** The model or training procedure has more run-to-run variance than the threshold tolerates — a real property of the configuration, not a measurement error.

**Resolution:** This is the gate doing its job — the correct response is either to accept that this configuration isn't stable enough to trust, or to address the actual source of instability (e.g., a learning rate too high for the batch size, or genuine underfitting causing high-variance final weights), not to widen the spread threshold to make an unstable configuration pass.

## Interview Preparation

**Conceptual:** "Why does the promotion gate compare metrics fold-by-fold against a baseline, rather than just comparing the two aggregate means?"

**Model Answer:** "Comparing aggregate means can hide exactly the kind of inconsistency the rest of the gate is designed to catch — a candidate could have a higher mean than the baseline purely by winning hugely on one or two folds while losing on most of the others, which is a much weaker and less trustworthy claim than consistently beating the baseline across the majority of folds. Fold-by-fold comparison, counting how many individual folds the candidate actually wins, is a stricter and more honest test of 'is this actually better' than comparing two single summary numbers that can each individually hide a lot of internal variance."

**Architecture:** "Design a promotion gate for a different domain — say, a fraud-detection model — using the same principles as this chapter's four checks."

**Model Answer:** "I'd keep the same four-check shape, adapted to the domain: all folds evaluated (probably time-based folds here too, since fraud patterns shift over time), cross-fold variance bounded (a fraud model that's great in some months and terrible in others is a real risk, the same as this chapter's finance example), beats a simple baseline like a rule-based or logistic-regression fraud score fold-by-fold, and seed-consistency across multiple training runs of the same configuration. I'd likely add a domain-specific fifth check for something like a minimum recall at a fixed false-positive-rate threshold, since for fraud detection the operating point (not just overall AUC) is often the actual business requirement — but the underlying philosophy, that promotion requires passing hard mechanical checks rather than a reviewer's impression of one dashboard, transfers directly."

**Troubleshooting:** "A team wants to add a 'manual override' path to skip the promotion gate for an urgent deployment. How would you respond?"

**Model Answer:** "I'd push back specifically because 'urgent deployment' is precisely the condition under which the original failure this gate was built to prevent actually happened — time pressure is the recurring reason teams skip validation discipline. If there's a genuine, recurring business need for faster iteration, the right fix is investing in making the full gate run faster (parallelizing fold training across GPUs, as covered in Chapter 8's kind #2 scaling), not adding a bypass that will inevitably get used under exactly the pressure that makes it most dangerous. A gate with an override isn't a gate — it's a suggestion with extra steps."

## Related Chapters

- **Previous:** Chapter 8 — Scaling to Multi-Node Distributed Training
- **Next:** Chapter 10 — End-to-End Case Study
- **Related:** Chapter 1 — Why MLOps — the failure mode this chapter's gate directly prevents
