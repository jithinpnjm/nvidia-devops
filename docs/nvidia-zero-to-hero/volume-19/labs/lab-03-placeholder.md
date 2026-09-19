---
title: "Lab 3 - Capacity Forecasting: Growth Projection from Historical Metrics"
slug: "lab-3-capacity-forecasting-growth-projection"
sidebar_position: 3
description: "Lab 3 - Build and defend a capacity forecast from raw utilization data, including a deliberately unreconciled example to debug."
---

# Lab 3 — Capacity Forecasting: Growth Projection from Historical Metrics

## Overview

This lab has two parts. Part A has you build a forecast from raw data, matching Chapter 3's methodology. Part B gives you someone else's forecast that doesn't reconcile with its own inputs — the same class of error Chapter 3 itself originally contained before correction — and has you find and fix it, which is a skill worth practicing deliberately: sanity-checking a forecast you didn't build, under the assumption it might be wrong.

## Duration

90 minutes

## Prerequisites

- Chapter 3: Capacity Planning and Forecasting
- Basic familiarity with linear regression (or a calculator/spreadsheet/Python)

## Lab Objectives

- Build a utilization forecast from raw weekly data and derive a procurement recommendation
- Distinguish average-utilization forecasts from peak (p99) forecasts and explain why both matter
- Detect and correct an internally inconsistent forecast presented as authoritative
- Practice a calendar-arithmetic sanity check as a standard part of reviewing any forecast

## Exercise 1: Build a Forecast

Raw data, 10 weeks of a 16-GPU cluster:

```
week   avg_util%   p99_util%
1        38          72
2        41          75
3        39          71
4        44          79
5        46          83
6        43          77
7        48          85
8        45          80
9        50          88
10       47          82
```

**Task:**
1. Compute the linear trend (slope, intercept) for `avg_util%` over these 10 weeks.
2. Forecast average utilization at week 20 and week 30.
3. Given procurement lead time of 10 weeks, and that jobs start queueing when p99 utilization crosses 90%, estimate roughly which week p99 will cross 90% (you can extrapolate p99's trend the same way, or apply the average-forecast's relative growth rate to the p99 baseline — state which method you used).
4. State, in one sentence, when procurement should be initiated and why.

## Exercise 1 Solution

**Step 1 — linear trend:**

Mean week = 5.5, mean avg_util = (38+41+39+44+46+43+48+45+50+47)/10 = 44.1

Using least-squares (Σ(x-x̄)(y-ȳ)/Σ(x-x̄)² = 91.5/82.5): slope ≈ **+1.11%/week**, intercept = 44.1 - 1.11×5.5 ≈ **38.0%**

**Step 2 — forecast:**
- Week 20: 38.0 + 1.11×20 ≈ 60.2%
- Week 30: 38.0 + 1.11×30 ≈ 71.3%

**Step 3 — p99 crossing 90%:**
Run the same OLS procedure on the `p99_util%` column: mean p99 = 79.2%, slope ≈ +1.44%/week (Σ(x-x̄)(y-ȳ)/Σ(x-x̄)² = 119.0/82.5), intercept ≈ 79.2 - 1.44×5.5 ≈ 71.3%. So p99(week) ≈ 71.3 + 1.44×week. Setting 71.3 + 1.44w = 90 → w ≈ 13.0 — **p99 crosses the 90% queueing threshold around week 13**, using the p99 column's own trend directly rather than approximating from the average-utilization forecast (that shortcut is worth avoiding — it compounds two different error terms and, as this recomputation shows, can give a noticeably different answer than fitting p99 directly).

**Step 4:** With p99 crossing the 90% queueing threshold around week 13 and a 10-week procurement lead time, **the order needs to be placed by roughly week 3** — there is very little slack. This is the same lesson as Chapter 3: the *average* utilization forecast (comfortable until week 20+, at 60%) would have you believe there's no urgency, but the *peak* forecast is what actually drives the procurement deadline, and in this dataset that deadline is only a few weeks out.

## Exercise 2: Debug an Unreconciled Forecast

A colleague hands you this forecast for sign-off. Something is wrong with it. Find it.

```
Input data: weeks 1-8, avg_util% = [50, 52, 49, 55, 53, 58, 54, 60]
(mean = 53.875)

Colleague's regression output:
"Trend: +3.5% per week"
"Forecast week 9: 63.4%"
"Forecast week 16: 88.9%"
```

**Task:** Without assuming the colleague is right, independently compute the actual trend from the input data and check whether their forecast numbers follow from it. State specifically what's wrong (a math error, a mislabeled input, or something else) and what the corrected forecast should be.

## Exercise 2 Solution

**Independent computation:**
Mean week = 4.5, mean util = 53.875

Deviations (week - 4.5): -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5
Deviations (util - 53.875): -3.875, -1.875, -4.875, 1.125, -0.875, 4.125, 0.125, 6.125

Σ(x-x̄)(y-ȳ) = (-3.5×-3.875)+(-2.5×-1.875)+(-1.5×-4.875)+(-0.5×1.125)+(0.5×-0.875)+(1.5×4.125)+(2.5×0.125)+(3.5×6.125)
= 13.56+4.69+7.31-0.56-0.44+6.19+0.31+21.44 = 52.5

Σ(x-x̄)² = 12.25+6.25+2.25+0.25+0.25+2.25+6.25+12.25 = 42

Slope = 52.5/42 = **1.25%/week**, not 3.5%/week as claimed — the colleague's slope is nearly 3x too high.

Intercept = 53.875 - 1.25×4.5 = 48.25

Corrected forecast:
- Week 9: 48.25 + 1.25×9 = 59.5% (colleague claimed 63.4% — overstated)
- Week 16: 48.25 + 1.25×16 = 68.25% (colleague claimed 88.9% — substantially overstated, by more than 20 points)

**What's wrong:** the claimed slope of +3.5%/week doesn't match the input data at all — most likely the colleague either fit the regression against different data than what's shown (a stale dataset pasted into new code, a copy-paste from a different cluster's numbers — the exact class of error flagged in Chapter 3's own original mistake), or made an arithmetic error in the regression calculation itself. **The fix isn't to "average" the two forecasts or split the difference — it's to recompute from the stated input data and treat the original numbers as unreliable until the discrepancy's source is identified.** In a real review, the next step would be asking the colleague to show the actual code/data that produced their numbers, since a 3x slope discrepancy this large usually means the code was run against the wrong input, not a subtle rounding difference.

## Exercise 3: Calendar Sanity Check

Given the Exercise 2 corrected forecast (week 9 is 8 weeks after week 1; if week 1 started Sep 1, week 9 ≈ Oct 27), your colleague's report also states: *"Forecast week 16 (end of February) shows continued growth toward capacity limits."*

**Task:** Is "end of February" a correct calendar label for week 16, given week 1 = Sep 1? Show your work.

## Exercise 3 Solution

Week 1 = Sep 1. Week 16 is 15 weeks later = 15×7 = 105 days after Sep 1 ≈ **December 15**, not "end of February." End of February would be roughly week 26 (25 weeks × 7 = 175 days ≈ Feb 23). This is the same ~2.5-month calendar-mislabeling error pattern found in Chapter 3's original text — and it's worth checking independently every time, because a wrong calendar label can make an urgent procurement deadline look comfortably distant (or vice versa), which is exactly the kind of error that has real budget consequences if it goes uncaught into a procurement decision.

## Verification

Upon completion, verify your work with:
- Your Exercise 1 slope/intercept were computed independently (shown work), not just pattern-matched to Chapter 3's example
- Your Exercise 1 answer correctly identifies the p99-driven deadline as the binding constraint, not the more comfortable average-utilization forecast
- Your Exercise 2 identifies the specific magnitude of the discrepancy (slope off by ~3x) and does not simply average or split the difference between the two forecasts
- Your Exercise 3 shows the explicit day-count arithmetic, not just a restated conclusion

## Discussion Questions

- If you received Exercise 2's forecast under deadline pressure and didn't have time for an independent recomputation, what's the minimum sanity check you could run instead (e.g., order-of-magnitude, plausibility bounds) that would still catch a 3x slope error?
- What process would you put in place so a forecast like Exercise 2's version never reaches a procurement sign-off meeting without being independently reproduced first?
- Chapter 3 states average and peak (p99) utilization "tell different stories." Give a hypothetical dataset where they'd point to *opposite* procurement conclusions, and explain how you'd resolve the conflict.

## Related Chapters

- Chapter 3: Capacity Planning and Forecasting
- Chapter 6: Cost Optimization and Resource Efficiency (procurement decisions should be evidence-gated, same discipline as forecast verification)
