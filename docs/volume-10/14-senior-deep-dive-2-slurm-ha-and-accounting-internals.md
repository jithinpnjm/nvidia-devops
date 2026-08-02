---
title: "Senior Deep Dive 2 — Slurm HA and accounting internals"
slug: "senior-deep-dive-2-slurm-ha-and-accounting-internals"
sidebar_position: 14
description: "Senior Deep Dive 2 — Slurm HA and accounting internals — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---

`docs/volume-10/06-slurm-administration-ha-accounting-and-upgrades.md` covers the operational surface of Slurm HA (primary/backup `slurmctld`), fairshare, and version upgrades. This deep dive covers the state-consistency mechanics that make failover *safe* rather than merely configured, the actual fairshare math, and multi-cluster federation.

## Before this deep dive — separate availability, durability, and correctness

These properties are related but not interchangeable:

- **Availability:** clients can submit/query jobs and the scheduler can make progress.
- **Durability:** queue, node, reservation, and accounting state survives failure.
- **Correctness:** no resources are double-allocated and policy is applied consistently.

An HA configuration file proves none of them by itself. Before continuing, be able to trace `sbatch → slurmctld → slurmd` and explain the separate role of `slurmdbd`. For every failover design, identify the authoritative state, consistency mechanism, failure detector, fencing/split-brain protection, recovery objective, and test method.

A safe exercise uses a non-production cluster: submit a long sleep job and queued jobs, capture `squeue`, node state, controller logs, and accounting state, fail the primary through the supported procedure, then compare job IDs, allocations, reasons, and records after takeover. "Backup process started" is not the acceptance criterion; preserved behavior and state are.

## What must be consistent for failover to be safe

A backup `slurmctld` is not a cold standby that simply starts scheduling when the primary disappears — if it started from empty state, every running job's allocation record, every pending job's position in the queue, and every node's current state would be lost or reconstructed wrong, and Slurm would either double-allocate resources or drop jobs. Failover is safe only because both controllers read and write the same `StateSaveLocation`:

```mermaid
flowchart LR
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["shared, POSIX-consistent"]
  n1["slurmctld PRIMARY"]
  n2["StateSaveLocation"]
  n3["(active) writes: job_state, node_state, (shared FS: NFS,"]
  n4["part_state, resv_state on every or replicated"]
  n5["scheduling-relevant change block device)"]
  n6["read at"]
  n7["startup +"]
  n8["periodic"]
  n9["slurmctld BACKUP ◀"]
  n10["(passive, polls on primary heartbeat loss: backup reads latest"]
  n11["primary via state files, becomes active, resumes scheduling"]
  n12["slurm_rpc_ping) from exactly where the primary left off"]
  n1 --> n2
```

The files that matter — `job_state`, `node_state`, `part_state`, `resv_state`, `trigger_state`, `assoc_mgr_state` (the fairshare/QoS association tree) — all live under `StateSaveLocation`, and *both* controllers must have it mounted from the same shared storage (or a synchronously replicated equivalent), because the backup's entire failover contract is "read what the primary last wrote, resume from there." If the backup has a stale or local copy of `StateSaveLocation`, it fails over into a fork of reality — it will believe jobs are running that finished ten minutes ago, or that nodes are idle that are actually allocated, and it will start double-booking. This is why `StateSaveLocation` on shared storage (or DRBD/replicated block storage under it) is a hard requirement, not a tuning knob — the backup being merely *installed* with the right `slurm.conf` (`SlurmctldHost=primary,backup`) is necessary but not sufficient; without the shared state the failover is unsafe even though it "works" superficially (the backup does take over scheduling).

The other consistency requirement, easy to miss: `slurmdbd` (the accounting daemon) is a separate process from `slurmctld` and has its own failover story against its MySQL/MariaDB backend. `slurmctld`'s failover protects scheduling continuity; `slurmdbd`'s availability protects fairshare and QoS enforcement, because `assoc_mgr_state` (the in-memory association/fairshare tree `slurmctld` uses for every scheduling decision) is originally populated from `slurmdbd`. If `slurmdbd` is unreachable at `slurmctld` startup, priority/fairshare/QoS limits run on stale cached association data until `slurmdbd` comes back — jobs still run, but limit enforcement can be wrong in that window.

## Fairshare mechanics beyond "there's a fairshare score"

Slurm's default multifactor priority plugin computes a fairshare component from **usage decayed over time**, not raw cumulative usage — this is the mechanism that answers "why doesn't one burst of jobs permanently tank a group's priority."

- Every association (user/account/partition combination) accumulates *raw usage* (CPU-seconds × TRES weight, effectively normalized resource-seconds) as jobs complete.
- That usage is decayed on a half-life set by `PriorityDecayHalfLife` (commonly 7 or 14 days in production configs). Usage from a job 14 days ago (at the default half-life) counts for half as much as usage from today; usage from 28 days ago counts for a quarter. This is literally a radioactive-decay model applied to compute consumption.
- The fairshare *score* itself is not raw decayed usage — it's decayed usage **normalized against the association's allocated share** of the tree. An account with 20% of a fairshare tree's shares that has consumed 20% of the (decayed) cluster usage gets a fairshare factor near 0.5 (right at parity); consuming more than its share pushes the factor toward 0, consuming less pushes it toward 1. `sshare -l` shows this directly:

```
sshare -l -A team-vision
# Account   User   RawShares  NormShares  RawUsage   EffectvUsage  FairShare
# team-vision       -         0.20         0.20      842391          0.34         0.62
```

`FairShare=0.62` above means team-vision has been under-consuming relative to its 20% allocation, so its jobs get a priority boost. If that team then submits 500 jobs in one afternoon, `RawUsage`/`EffectvUsage` rises immediately and `FairShare` drops toward 0 for their *next* submissions — but critically, that drop is against the decayed history, so it self-corrects: the burst ages out over the next one to two half-lives (roughly two to four weeks at a 14-day half-life) and their fairshare factor recovers automatically, without any admin intervention, as long as the burst doesn't repeat. A **sustained** high-usage pattern — the same account consistently over-consuming every week — never lets the decayed usage average back down, because new usage keeps arriving before the old usage has decayed out, which is exactly the "one burst forgiven, a pattern isn't" behavior the source chapter alludes to.

This is also why `PriorityDecayHalfLife` is a cluster-policy decision, not just a config default: a short half-life (e.g., 1 day) makes the scheduler forgive usage almost immediately — fairshare becomes close to "who used the GPUs in the last day," favoring bursty fairness. A long half-life (e.g., 30+ days) makes historical usage sticky — a group that over-consumed a month ago is still being penalized today, favoring long-run fairness at the cost of slow recovery for teams that had one legitimate heavy month (e.g., a paper deadline).

## Multi-cluster federation, briefly

Slurm federation (`sacctmgr add federation`) lets multiple independently-managed Slurm clusters share one `slurmdbd` accounting backend and present a federated view — `squeue --federation` shows jobs across all member clusters, and a job submitted to the federation can be routed to whichever member cluster has capacity, with `slurmdbd` acting as the single source of truth for fairshare across the whole federation rather than per-cluster. This matters operationally when a site has, e.g., a research cluster and a production cluster that need combined accounting/fairshare — federation lets central IT enforce one usage policy without merging the clusters' `slurmctld`/node management under one control plane. Each member cluster keeps its own `slurmctld` and its own HA pair as described above; federation only changes accounting/routing, not the failover mechanics within a single cluster.

## Worked scenario

`team-genomics` has been running steadily under its fairshare allocation for two months (`FairShare≈0.7`, jobs scheduling promptly). On Friday they submit 2,000 short jobs to backfill a grant deadline. By Monday, other teams are complaining that genomics jobs are starving everyone else. Checking `sshare -l -A team-genomics` shows `FairShare` has dropped to 0.05 — expected, they blew through several days of decayed-usage headroom in one weekend. The question is whether to intervene: given a 14-day `PriorityDecayHalfLife`, this recovers on its own within roughly two to three weeks without any admin action, purely from decay, *provided genomics doesn't repeat the burst*. If they do repeat it every week, that's no longer a burst — that's their new sustained usage pattern, and a real conversation about their allocated share (`RawShares`) is needed instead of waiting for decay that will never catch up.

## Interview-ready line

"Slurm failover is only as safe as `StateSaveLocation` being genuinely shared, synchronously-consistent storage between primary and backup — a backup with the right `slurm.conf` but its own copy of the state files will take over scheduling and immediately start making decisions against stale reality; and fairshare recovers from a one-time burst automatically because usage decays on a half-life, but a sustained pattern never decays out because new usage keeps arriving before the old usage ages off."
