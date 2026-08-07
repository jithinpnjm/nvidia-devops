# Chapter 9: Scientific Research and Simulation

| Chapter metadata | Value |
|---|---|
| Volume | 22 — Customer Workshops |
| Difficulty | Advanced |
| Estimated reading time | 40 minutes |

## Overview

Scientific simulations differ from ML workloads:
- Single jobs run for days/weeks (not seconds)
- Data volume: terabytes per simulation
- Checkpointing is critical (can't lose 3 days of compute)
- Reproducibility is paramount (bit-identical results)

## Use Case: Climate Modeling (100-year forecast)

### Requirements
- Resolution: 0.1° × 0.1° grid (~100M grid points)
- Duration: 100-year forecast
- Models: MOM6 ocean + CAM atmosphere
- Ensemble size: 10 runs (uncertainty quantification)
- Total compute: 12 petaflop-seconds
- Timeline: 6 months
- Budget: $500K capital

### Architecture: 32 A100s + NVMe burst buffer

**Why 32 A100s:**
- 1.6 petaflops sustained (good for 6-month timeline)
- NVMe burst buffer (500TB) for 50GB checkpoints
- Checkpoint every 10 steps (every 2.4 hours)
- Archive asynchronously to cold storage

**Compute breakdown:**
- 10 runs × 1,200 steps × 1 petaflop-sec = 12 petaflop-seconds
- 32 A100s = 1.6 petaflops → ~7.5 days per run
- Pipelined: 3 runs in parallel, complete 6 months ✓

**Cost model:**
- Hardware (3-year): $560K/year
- Power: $438K/year
- Staff: $100K/year
- **3-year TCO: $1.25M/year**

**vs Cloud:**
- Supercomputer time: $5K per run × 10 = $50K (one-time)
- But limited availability; must batch annually
- Long-term: own infrastructure 10× cheaper at 100+ simulations/year

## Failure Recovery

**Checkpoint strategy:**
- Write checkpoint every 10 steps (every 2.4 hours)
- If crash mid-checkpoint: lose <2.4 hours compute
- If entire cluster fails: restart from previous successful checkpoint
- Expected failures: ~1 per 2-month job

## Related Chapters

This concludes the 9-chapter survey of GPU deployment across industries.
