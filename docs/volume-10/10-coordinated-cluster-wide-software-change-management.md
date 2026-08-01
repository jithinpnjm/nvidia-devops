---
title: "Chapter 10 - Coordinated cluster-wide software change management"
slug: "chapter-10-coordinated-cluster-wide-software-change-management"
sidebar_position: 10
description: "Chapter 10 - Coordinated cluster-wide software change management — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---

**Learning outcome:** Given a proposed change at any single layer of a GPU/AI cluster's software stack, build the compatibility matrix that change touches, design a canary that is actually representative of the fleet, and sequence a maintenance window that respects long-running HPC jobs instead of just evicting everything.

## Start here — a change is a hypothesis with a blast radius

Every production change asserts: "this new state will improve or preserve service." The change plan must say how you will test that assertion before exposing the whole fleet.

| Question | Beginner answer | Production-quality answer |
|---|---|---|
| What changes? | "Upgrade the driver" | Exact current/target versions, packages, configs, images, and dependencies |
| Where? | "GPU nodes" | Named categories, hardware generations, racks, partitions, and tenant impact |
| How validated? | "`nvidia-smi` works" | Boot, diagnostics, representative training, network/storage, correctness, and performance thresholds |
| When stop? | "If it fails" | Measurable abort conditions and decision owner |
| How recover? | "Roll back" | Tested steps, retained artifacts/state, firmware downgrade constraints, and recovery time |

Use four rollout stages:

```text
lab/reproduction → representative canary → limited failure-domain wave → fleet waves
       evidence          compatibility          blast-radius check          scale
```

A canary must represent the compatibility dimensions affected by the change: GPU and NIC model, firmware, OS/kernel, rack/fabric path, storage path, workload type, and security policy. One convenient spare server is not representative merely because it is available.

Before touching nodes, write entry conditions and backups, drain behavior, measurable success and abort thresholds, decision ownership, rollback steps, and a hold period between waves. Rollback is not always symmetric: configuration may revert quickly; database schema, firmware, filesystem metadata, and security material may not. When reversal is unsafe, plan roll-forward recovery, redundant capacity, or a vendor-supported restore before approval.

## The problem: no layer changes alone

A Kubernetes Deployment rollout has one axis of versioning that matters operationally — the container image tag — and the platform (ReplicaSet, PDB, readiness probes) absorbs the rest. A GPU/AI cluster has no such single axis. The stack that has to agree with itself, node by node, looks like this:

```
BMC/firmware   →  host OS/kernel  →  NVIDIA driver  →  CUDA toolkit  →
container runtime (Enroot/containerd)  →  orchestrator (Slurm or Kubernetes)  →
CNI/Network Operator + NIC/switch firmware  →  storage client (Lustre/NFS/GPUDirect)  →
MPI/NCCL library
```

Each arrow is a compatibility contract, not a formality. Bump the kernel and the driver's kernel module may fail to build (`DKMS` failure on boot). Bump the driver and the CUDA toolkit's minimum-driver-version check fails at process launch. Bump NCCL and it may probe NIC firmware capabilities it didn't probe before, silently falling back to a slower transport instead of erroring — the job runs, just 3x slower, which is worse than a hard failure because nobody pages on it. None of these are hypothetical; they are the standard failure modes vendors document in release notes and the ones this chapter assumes you already know how to look up per-layer. Volume 3's Kubernetes upgrade chapter covers the orchestrator-version-skew slice of this problem in isolation; volume 4's driver/CUDA compatibility Deep Dive covers the driver/CUDA slice in isolation. This chapter is what sits above both: the cluster doesn't get to change one layer at a time and assume the others are unaffected, because in practice they're rarely changed in true isolation — a maintenance window that touches the driver very often also touches firmware or the kernel, because that's when you have the node drained anyway.

## The compatibility matrix as the artifact you protect

Before any coordinated change, the concrete deliverable is a matrix: current known-good combination, proposed new combination, and which pairwise contracts in between have been validated versus merely assumed.

```
LAYER              CURRENT (known-good)     PROPOSED             VALIDATED?
─────────────────────────────────────────────────────────────────────────────
BMC/firmware        2.14.3                    2.16.0               vendor compat matrix only
Host OS/kernel      Ubuntu 22.04 / 5.15.0-101  unchanged            —
NVIDIA driver       535.129.03                 550.90.07            YES — driver/CUDA table
CUDA toolkit        12.2                       12.4                 YES — driver/CUDA table
Container runtime   Enroot 3.4.1 + Pyxis 0.16  unchanged            —
Orchestrator        Slurm 23.02.7              unchanged            —
NIC firmware        ConnectX-7 22.35.1012      unchanged            NOT RE-CHECKED — assumed fine
NCCL                2.18.5                     2.20.5               NO — this is the gap
```

The point of drawing it as a table is that "validated" is a per-cell claim, not a per-change claim. A change that touches three layers (driver, CUDA, NCCL here) needs three pairwise validations plus the interactions between them — driver-to-NCCL compatibility is a real, separately documented contract, not something that falls out of driver-to-CUDA and CUDA-to-NCCL being individually fine. Rows you did not intend to touch — NIC firmware in this example — still belong in the matrix, marked as unchanged, because the worked scenario below is exactly the failure mode of skipping that row.

```
                         ┌─────────────────────────────┐
                         │   KNOWN-GOOD COMBINATION      │
                         │  (the thing under protection)  │
                         └───────────────┬───────────────┘
   BMC/firmware  ────────────────────────┤
   Host OS/kernel  ──────────────────────┤
   NVIDIA driver  ────────────────────────┤   any single row moving without
   CUDA toolkit  ─────────────────────────┤   re-validating its neighbors
   Container runtime  ────────────────────┤   breaks the whole column, not
   Orchestrator  ──────────────────────────┤   just that row
   CNI / fabric firmware  ─────────────────┤
   Storage client  ────────────────────────┤
   MPI / NCCL  ────────────────────────────┘
```

## Change sequencing: why order is not arbitrary

Two sequencing rules come directly out of the matrix:

1. **Validate driver+CUDA compatibility before touching the orchestrator version.** The orchestrator (Slurm or Kubernetes) schedules work onto nodes; it does not itself execute GPU code, so an orchestrator bump can proceed or roll back independently of whether the driver/CUDA pair underneath it is sound. Coupling the two changes in one window just means a driver regression gets misdiagnosed as an orchestrator regression, doubling triage time.
2. **Validate network fabric firmware before touching NCCL-dependent workloads.** NCCL's transport selection (NVLink, GPUDirect RDMA over InfiniBand/RoCE, or fallback to sockets) is negotiated using capabilities it reads from the NIC/switch stack at startup. A NIC firmware mismatch doesn't usually produce an error — it produces a silent transport downgrade. Firmware is also the layer with the least tooling for automated rollback (see below), so it should be settled and stable *before* you introduce a new NCCL version that will exercise it differently, not bundled into the same window as an experiment.

General rule: sequence changes from the layer that is hardest to observe and hardest to roll back (firmware) toward the layer that is easiest to observe and easiest to roll back (a container image or a Python-level library pin), validating each boundary before crossing the next one.

## Canary at cluster scale, not Deployment scale

A Kubernetes canary is a percentage of Pods behind a Service. A cluster-wide software canary is a cordoned-and-drained *subset of physical nodes* carrying the full proposed stack — firmware, OS, driver, CUDA, NCCL together — while the rest of the fleet stays on the known-good combination:

```
kubectl cordon gpu-node-{041..048}          # or: scontrol update nodename=gpu-node-[041-048] state=drain reason="canary"
# drain-when-idle, not evict-now — see maintenance-window planning below
# apply firmware + OS + driver + CUDA + NCCL bump to gpu-node-{041..048} only
# run canary-validation gate (below)
# only on full pass: proceed to next wave
```

### Canary-validation gate — a realistic checklist

```
[ ] nvidia-smi -q on every canary node: no Pending/ERR ECC, driver version matches target
[ ] dcgm-diag -r 3 (level-3 diagnostics: memory, PCIe, NVLink bandwidth, thermals) — PASS on all canary nodes
[ ] nccl-tests all_reduce_perf across the canary set only, node-pair and full-canary-set runs —
    bus bandwidth within 5% of the pre-change baseline recorded for this exact node/NIC combination
[ ] representative training smoke job (small model, same framework/container image as production,
    multi-node, at least 2 canary nodes) completes within known-good wall-clock envelope
[ ] representative inference smoke job: P99 latency and throughput within baseline band
[ ] slurmd / kubelet fully re-registered, no repeated GPU Xid errors in dmesg/journal over a
    soak window (minimum one full job-length cycle, not just minutes)
[ ] rollback path for this exact node set has been rehearsed, not just documented
```

Every gate item is a pass/fail against a recorded baseline, not a subjective "looks fine." The `nccl-tests` bandwidth number specifically is what catches the failure mode in the worked scenario below, because it is sensitive to fabric-layer behavior that `nvidia-smi` and a generic smoke job are not.

## Maintenance-window planning for HPC: you cannot just evict everything

Kubernetes-style "cordon and drain now, PDB permitting" assumes workloads are short-lived and restart cheaply. HPC jobs routinely run for days and are not restart-cheap — evicting a 4-day, 512-GPU MPI job at hour 90 to hit a maintenance window is a resource-cost decision, not a technical inconvenience. The standard pattern is:

- **Drain-when-idle, not evict-now**: mark target nodes `DRAIN` in Slurm (`scontrol update nodename=... state=drain reason="maint-window-2026-08"`); the scheduler stops placing new jobs there but lets running jobs finish naturally. The node is unavailable for *new* work immediately, and for the maintenance action itself only once its current job completes.
- **Checkpoint-aware scheduling of maintenance**: for jobs too long-running to simply wait out (multi-day training runs), coordinate with the job owner on a checkpoint boundary — most large training frameworks checkpoint on an interval — and schedule the maintenance action for the window immediately after a checkpoint completes, so a forced requeue loses at most one checkpoint interval of work, not the whole run.
- **Wave the fleet, not the window**: a maintenance window is a wall-clock slot for *starting* a wave, not for completing it — waves of nodes finish draining and get updated on their own schedule as their jobs end, and the "window" is really "the period during which this wave is allowed to start draining."

## Rollback planning when the change touches firmware

A bad container image rolls back with `kubectl rollout undo` in seconds. A bad BMC or NIC firmware flash does not have an equivalent one-command undo:

- Firmware rollback requires a second flash-and-reboot cycle, with the same risk profile as the forward flash (a failed flash can leave a BMC unresponsive, requiring physical/out-of-band recovery).
- Some firmware changes are one-way by vendor design (security-relevant firmware that refuses downgrade below a minimum version).
- The realistic mitigation is not "have a rollback for firmware" — it's "treat firmware changes as the least reversible layer and gate them with the most validation," which is exactly why the sequencing rule above puts firmware first in the validate-before-you-proceed order, and why the canary wave for a firmware-inclusive change should be smaller and held longer than a canary wave for, say, a container runtime bump.

## Worked scenario: the canary that wasn't representative

A team scheduled a coordinated driver 535→550, CUDA 12.2→12.4, NCCL 2.18→2.20 bump. The canary set (8 nodes) passed every gate item above cleanly — `dcgm-diag`, `nccl-tests`, and the training smoke job all came back within baseline. The change was rolled out fleet-wide over three waves.

Within hours of the second wave, roughly 20% of production multi-node training jobs started failing with NCCL timeout errors, while the rest of the fleet ran fine. Root cause: the canary's 8 nodes all happened to be on ConnectX-6 NICs at one firmware revision, but 20% of the fleet was on ConnectX-7 NICs at a different firmware revision — a hardware generation the canary simply didn't contain. NCCL 2.20's updated transport-capability negotiation code path interacted with that specific firmware revision in a way none of the canary nodes could have exposed, because none of them ran it.

The lesson is not "canaries don't work" — it's that **canary representativeness matters as much as canary presence**. A canary that passes every gate item but samples only one hardware/firmware variant out of several present in the fleet has validated one column of the compatibility matrix, not the whole fleet's. The fix going forward: the canary node selection criteria became an explicit, audited step — stratified by NIC model *and* firmware revision *and* GPU SKU, not just "grab 8 idle nodes" — before any coordinated change is allowed to proceed past the canary gate.

## Mnemonic

**"Matrix, Sequence, Represent, Rehearse."** Build the compatibility matrix before touching anything. Sequence changes from least-reversible (firmware) to most-reversible (container image). Make sure the canary represents every hardware/firmware variant in the fleet, not just whatever nodes were idle. Rehearse the rollback for the least-reversible layer before you need it, not after.

## Interview-ready line

"On a GPU cluster, a canary that passes is evidence about the hardware and firmware variants it actually contains — nothing more. I stratify canary node selection by NIC model, firmware revision, and GPU SKU explicitly, because a canary that's merely present but not representative is how a driver/CUDA/NCCL bump passes validation and still breaks a fifth of the fleet."

## Practice

1. Draw the compatibility matrix for a change that bumps only the container runtime (Enroot version) and explain which rows genuinely don't need re-validation versus which ones a reviewer might wrongly assume don't.
2. A 6-day, 256-GPU training job is running on a node scheduled for a maintenance window in 18 hours. Using drain-when-idle and checkpoint-aware scheduling, describe the concrete sequence of scheduler and job-owner actions you'd take, and state what you'd do if the job has no checkpointing implemented at all.
3. Explain why validating driver+CUDA compatibility before an orchestrator version bump reduces triage time specifically, using a concrete failure symptom that would otherwise be ambiguous between the two layers.
4. Design a canary-validation gate for a change that touches only NIC/switch firmware (no driver/CUDA/NCCL change). Which items from this chapter's gate checklist still apply, and what would you add that's specific to a firmware-only change?
5. A firmware vendor's new release is described as "one-way" (no supported downgrade path below the new minimum version). What does this change about how large your first canary wave should be, and why, compared to a fully-reversible container-runtime change?
