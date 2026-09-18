---
title: Chapter 05 — Data Ingestion and Cleaning Pipeline Design
description: Designing a resumable, rate-limit-safe data ingestion pipeline that never loses partial progress — from a real 5-year, 1-minute financial time series downloader.
sidebar_position: 6
tags: [data-engineering, data-cleaning, ingestion, rate-limiting, mlops]
---

# Chapter 05: Data Ingestion and Cleaning Pipeline Design

| Chapter metadata | Value |
|---|---|
| Volume | 25 — MLOps Engineering |
| Difficulty | Intermediate |
| Estimated reading time | 45 minutes |
| Primary audience | MLOps Engineers, Data Engineers building any long-running external-API ingestion job |
| Core question | How do you design a data-pulling pipeline that can be killed at any moment, rerun any number of times, and always converge on a complete, correct dataset — without re-downloading what it already has? |

## WHY

Real data ingestion pipelines fail partway through — a rate limit trips, a network blip drops the connection, a process gets killed. A pipeline written as "loop through the whole date range once, from a script that isn't meant to be rerun" turns every one of those failures into a full restart, which is both slow and, worse, silently risks *masking* real gaps (if a rerun always starts from scratch, an intermittent failure that quietly drops one day's data might never be individually detected, because the next full rerun just overwrites everything with a slightly-different-by-luck result).

The right design goal isn't "never fails" — that's not achievable against a real external API. The right goal is: **every run, regardless of how the previous run ended, converges toward a complete dataset, and running it again when it's already complete does no unnecessary work.**

## WHAT

This project's ingestion pipeline (`data_downloader_new.py`) pulls five years of 1-minute financial candle data from a broker API. Its actual design has four properties, each solving a specific failure mode:

| Property | Failure mode it prevents |
|---|---|
| **Immediate, incremental saves** | A long pull dying midway loses only the last unsaved chunk, not everything since the start |
| **Gap-scanning on every run** (not just tail-extension) | A silently-failed day in the *middle* of an otherwise-complete range never gets left behind |
| **A cached "confirmed no-data days" list** | Market holidays don't get re-requested (and re-fail) on every single rerun forever |
| **Rate-limit-aware retry with backoff** | A `-429` response doesn't cascade into the API banning the client entirely |

## HOW

### Step 1 — Gap detection as the single source of truth for "what to fetch"

Rather than tracking progress in a separate state file, this pipeline treats the **data file on disk itself** as the source of truth. Every run rescans it:

```python
def find_gap_ranges(df, no_data_days, start_date, end_date):
    if df.empty:
        good_days = set()
    else:
        counts = df["datetime"].dt.date.value_counts()
        good_days = set(counts[counts >= MIN_CANDLES_FOR_COMPLETE_DAY].index)

    missing_days = []
    d = start_date
    while d <= end_date:
        if d.weekday() < 5:                      # weekends never trade — skip without even checking
            if d in no_data_days:
                pass                              # confirmed holiday — never re-request
            elif today_is_stale(d):               # today, but market hasn't closed yet
                missing_days.append(d)
            elif d not in good_days:               # missing OR suspiciously few candles
                missing_days.append(d)
        d += timedelta(days=1)
    ...
```

The key design decision: **a day counts as "done" only if it has at least `MIN_CANDLES_FOR_COMPLETE_DAY` rows**, not just "if any row exists for that date." A day that silently failed halfway through a previous run (leaving, say, 12 candles out of an expected ~375) is *not* mistaken for a complete day — it's correctly re-flagged as a gap and refetched. This is the single most important design decision in the whole pipeline: **treat "some data" and "complete data" as different states**, not the same one.

### Step 2 — Save after every chunk, not after the whole run

```python
for chunk in date_chunks:
    data = fetch_chunk(fyers_client, chunk.start, chunk.end)
    existing = save_merged(existing, data)   # <- written to disk immediately, not batched to the end
```

If the process is killed after chunk 3 of 10, chunks 1-3 are already durably on disk. The *next* run's gap scan (Step 1) simply sees less remaining work — there is no separate "resume from checkpoint N" logic to get right, because the gap scan naturally recomputes "what's still missing" from the file's actual current state every time.

### Step 3 — Distinguish "failed, retry it" from "confirmed empty, stop asking"

A naive gap-fill approach would re-request every historical market holiday on every single run forever, since a holiday will always come back empty. This wastes API calls and slows down every future run. The fix: only mark a date as permanently "no data" after a *specific, successful* request for that exact range came back genuinely empty — never after a failure:

```python
fetched_days = set(new_data["datetime"].dt.date) if not new_data.empty else set()
for d in range(range_start, range_end):
    if d.weekday() < 5 and d not in failed_days and d not in fetched_days and d != today:
        no_data_days.add(d)   # confirmed empty — cache this, never ask again
save_no_data_days(no_data_days)
```

`failed_days` (dates whose fetch exhausted retries without a clean success-or-empty response) are deliberately **excluded** from this cache — a temporary failure must remain "missing" so the next run retries it, whereas a confirmed holiday should never be retried again.

### Step 4 — Rate-limit backoff, tuned to the API's actual signal

```python
if response.get("code") == -429:
    wait = 15 * (attempt + 1)     # 15s, 30s, 45s — increasing backoff, not a fixed delay
    time.sleep(wait)
    continue
```

Increasing (not fixed) backoff on repeated rate-limit hits is standard practice: a fixed delay retried immediately at the same interval risks hitting the exact same rate window repeatedly; an increasing delay gives the window more room to clear.

## WHEN

Design ingestion this way (gap-scan + immediate save + confirmed-empty caching) any time a pipeline pulls from a rate-limited or unreliable external source over a wide date/ID range, and especially when the pipeline is expected to be **rerun regularly** to catch up (a live trading data feed, in this project's case, needs to be re-run daily). For a genuine one-shot bulk import that never runs again, this level of resumability is over-engineering — a simple linear pull with basic retry is enough.

## TRADEOFFS

| Approach | Rerun cost when already complete | Risk of masking a real gap |
|---|---|---|
| Full re-pull every run | Highest — always refetches everything | Low, but wasteful |
| Tail-only extension (only fetch from last-known-date forward) | Low | **High** — a gap in the *middle* of the range is never revisited |
| Gap-scan across the full range, every run (this project) | Low once caught up (empty gap list = no API calls) | Low — every rerun re-examines the whole range's completeness, not just the tail |

## PRODUCTION

In production, this exact script is re-run on a schedule (daily, after market close) to pull the newest day's data. Because the gap-scan approach recomputes "what's missing" from the file itself, the same script handles three completely different real scenarios identically, with no special-casing: a normal daily catch-up (one new day to fetch), a multi-day catch-up after the job didn't run for a while (several new days), and a backfill repair after discovering a data-quality issue in the middle of the historical range (whatever specific days are now flagged as incomplete).

## TROUBLESHOOTING

### Scenario 1: A rerun keeps re-fetching the same "empty" days forever

**Symptom:** Every run's log shows the same handful of dates being requested and coming back with `no_data`, run after run, wasting API calls.

**Diagnosis:** Either the no-data cache file isn't being persisted, or those dates are genuinely getting classified as `failed_days` (a real transient error) rather than confirmed-empty, so they never get cached.

**Evidence vs. Proof:** Seeing the same dates requested repeatedly is evidence of a caching problem. It's proof only once you inspect the actual no-data cache file and confirm those dates are absent from it despite repeated `no_data` responses:

```bash
cat data/banknifty_spot_1m_no_data_days.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
```

**Resolution:** If the count isn't growing across runs despite genuinely empty responses, check that `save_no_data_days()` is actually being called after each range (not just at the very end, where an early exception could skip it) and that the file path is writable.

### Scenario 2: A day shows up as "complete" but the data looks wrong

**Symptom:** A specific day has the expected candle count (passes the `MIN_CANDLES_FOR_COMPLETE_DAY` check) but visibly wrong values (e.g., all zeros, or a huge single-candle spike from a bad tick).

**Diagnosis:** Row *count* completeness and row *correctness* are different properties — this pipeline's gap-detection only checks the former.

**Resolution:** This is a real, known limitation, not a bug — count-based completeness is a cheap, effective proxy for "did the fetch mostly succeed," but a genuinely corrupted-but-complete-count day requires a separate data-quality check (e.g., sanity bounds on price/volume, or comparing against a second source) layered on top, not baked into the resumability logic itself.

## Interview Preparation

**Conceptual:** "Why is 'the file has a row for this date' not the same as 'this date is complete', and why does that distinction matter for a resumable pipeline?"

**Model Answer:** "A single row existing for a date only proves *some* data was written for it — it says nothing about whether the fetch for that day fully succeeded or was cut off partway through, for instance by a rate limit hit mid-day. If a resumability check only asks 'does any row exist,' a partially-failed day gets permanently treated as done and never revisited, silently leaving a real gap in the dataset that no future rerun will ever catch, because the naive check has no way to distinguish it from a genuinely complete day. Using a minimum row-count threshold as the completeness bar is a much better proxy — it doesn't guarantee correctness, but it does catch the specific failure mode of 'the fetch started but didn't finish,' which is the actual failure this kind of pipeline needs to be resilient to."

**Architecture:** "Design an ingestion pipeline for a data source with a strict daily rate limit, where the full historical backfill would take longer than one day's quota to complete."

**Model Answer:** "I'd lean entirely on the gap-scan-plus-immediate-save pattern from this chapter: each run pulls as much as the day's rate limit allows, saves incrementally so nothing already fetched is lost when the quota is hit, and simply stops for the day rather than erroring. The next day's run re-scans the full target range, sees exactly what's still missing — which is now smaller than before — and continues from there, with zero explicit 'day 1 of N' bookkeeping required. The rate limit effectively becomes a natural pacing mechanism across multiple runs rather than a single-run obstacle to route around, and the same script handles the ongoing daily-catchup case after the backfill finishes, with no code path change needed."

**Troubleshooting:** "A pipeline that resumes cleanly after crashes still ends up with duplicate rows in the output file after several reruns. What's the likely cause?"

**Model Answer:** "The most likely cause is that the merge-and-save step isn't deduplicating on a unique key before writing — if each run's newly fetched chunk is simply appended to the existing file rather than merged with an explicit `drop_duplicates` on the timestamp column, any overlap between what a previous run already saved and what a new run refetches (which is common and often intentional, e.g., refetching the last day again in case it was incomplete) produces duplicate rows. The fix is making the save step itself idempotent — merge on the natural key, sort, and drop duplicates keeping the newest version, so re-fetching an already-present range is always safe and produces identical output whether it's the first or the fifth time that range was ever fetched."

## Related Chapters

- **Previous:** Chapter 4 — Experiment Tracking with MLflow
- **Next:** Chapter 6 — Building Leakage-Safe Training Datasets for Time-Series ML — what happens to this chapter's cleaned data next
- **Related:** Chapter 3 — Data Versioning with DVC — this chapter's output file is exactly what gets versioned
