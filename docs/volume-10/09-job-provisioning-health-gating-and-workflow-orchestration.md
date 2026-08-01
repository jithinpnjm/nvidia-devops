---
title: "Chapter 9 - Job provisioning, health gating and workflow orchestration"
slug: "chapter-9-job-provisioning-health-gating-and-workflow-orchestration"
sidebar_position: 9
description: "Chapter 9 - Job provisioning, health gating and workflow orchestration — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---
**Learning outcome:** Trace the full chain from "cluster exists" to "a job is safely running," explain why health gating sits between cluster-join and scheduling eligibility, and design a health-check gate that catches degraded — not just dead — hardware.

## Start here — availability is not readiness

A node can answer SSH and still be unsafe for a distributed GPU job. It may have a missing GPU, a degraded fabric link, a stale mount, the wrong driver, or residue from the previous job. The purpose of health gating is to convert many low-level facts into one scheduling decision: **may this node receive work now?**

```text
provisioned → booted → configured → health-validated → scheduler-active
                                                       ↓
request → admitted → allocated → prolog → workload → epilog → accounted
```

Each arrow needs an owner, observable evidence, a timeout, and a failure action. A useful check is specific (one contract), bounded (cannot hang), actionable (expected and observed values), safe (critical uncertainty rejects work), and stable (does not drain a node for one noisy sample).

Treat orchestration as a state machine, not a long shell script. Persist the current state and make transitions idempotent so a retry resumes safely:

```python
TRANSIENT = {"registry_timeout", "scheduler_busy", "temporary_dns"}

def next_action(state: str, reason: str) -> str:
    if state == "validated":
        return "admit"
    if reason in TRANSIENT:
        return "retry_with_backoff"
    return "quarantine_and_escalate"
```

Retries are for temporary failures, with a limit and backoff. A deterministic GPU diagnostic failure, incompatible driver, corrupt image, or failed firmware check should quarantine the node and preserve evidence. Blind retries turn a clear fault into queue delay and log noise.

## The full readiness pipeline

A node being physically racked, powered, and network-cabled is nowhere near a node being safe to schedule jobs onto. Every layer this volume has covered up to this point — bare-metal provisioning, BCM/OS imaging, cluster-manager join, Slurm/Kubernetes membership — has to complete *and be verified* before a node should ever appear as schedulable capacity:

```
Bare metal (racked, powered, cabled)
      │  firmware/BIOS validated, RAID/BMC configured
      ▼
Firmware validated (BIOS, BMC, NIC firmware versions match golden baseline)
      │  BCM/OS provisioning (Chapters 1-3): image applied, kernel/driver versions match
      ▼
OS provisioned (Ansible/Terraform-managed config converges — Chapters 5-6)
      │  node registers with cluster manager
      ▼
Cluster-manager joined (Slurm: node appears in `sinfo`; Kubernetes: node appears in `kubectl get nodes`)
      │  prolog / health-check daemon runs BEFORE node is trusted with real work
      ▼
Health-checked (NHC-style checks: GPU count, NCCL smoke test, filesystem mounts, NVLink status)
      │  only nodes that PASS reach this state
      ▼
Scheduler-visible, schedulable (Slurm: state=idle, not drain; Kubernetes: Ready, not tainted)
      │  admission control for the specific job (size, priority, dataset/container pre-staged)
      ▼
Job-eligible — a real job may now land here
```

The critical property of this pipeline: **every stage is a gate, not a checkpoint you pass through once.** A node that joins the cluster manager successfully but fails its health check must go back to `drain`/`NotReady`, not forward to schedulable — and a node that later degrades (a GPU falls off the bus, an NVLink connection flaps) needs the same gate re-applied continuously, not just at boot.

## Why an unhealthy node accepting jobs is worse than running short

It is tempting to treat a marginal node ("it mostly works") as capacity worth keeping in the pool, especially under scheduling pressure. This is a mistake for three concrete reasons:

- **It poisons job results.** A multi-node training job with one degraded node doesn't fail loudly — it often trains *slower* or, worse, converges to a subtly wrong result (e.g., one rank silently dropping/corrupting gradient data due to a flaky NIC) that isn't caught until days later when someone can't reproduce a result.
- **It wastes GPU-hours at the worst possible time.** The waste isn't just the degraded node's own GPU-hours — in a gang-scheduled, synchronized job (Volume 6 Chapter 7), one straggler node's slowdown is multiplied across every other node waiting at the same collective barrier. An 8-node job with one bad node can waste close to 8 nodes' worth of GPU-hours, not one.
- **It creates confusing failure attribution.** Without a health gate, "the job crashed" or "the job was slow" investigations start from zero every time — was it the code, the data, the network, or node 6's flaky NVLink link again? A health-check system that runs *before* scheduling turns "investigate from scratch" into "check whether node 6 failed its gate," which is the entire point of gating early instead of debugging late.

## Prolog/epilog health gating in Slurm

Slurm supports `Prolog`/`Epilog` scripts (cluster-wide, configured in `slurm.conf`) that run before/after every job on a node, and separately supports a dedicated health-check daemon pattern — commonly an NHC-style (Node Health Check) script run on a timer via `HealthCheckProgram`/`HealthCheckInterval`, independent of any specific job. Both mechanisms share the same exit-code convention: **a nonzero exit from the health check drains the node**, removing it from schedulable capacity without an operator having to notice a problem first.

```bash
#!/bin/bash
# Simplified Prolog/NHC-style health-check logic (pseudocode-realistic, not a full script)
# Runs on a timer (HealthCheckInterval) AND/OR as Slurm Prolog before each job.

FAIL=0

# 1. GPU count sanity — did a GPU silently fall off the PCIe bus?
expected_gpus=8
actual_gpus=$(nvidia-smi -L | wc -l)
if [ "$actual_gpus" -ne "$expected_gpus" ]; then
    logger "HEALTHCHECK: expected $expected_gpus GPUs, found $actual_gpus"
    FAIL=1
fi

# 2. DCGM diagnostic — deeper GPU health than a bare device count
if ! dcgmi diag -r 1 >/tmp/dcgm_diag.log 2>&1; then
    logger "HEALTHCHECK: dcgmi diag -r 1 failed, see /tmp/dcgm_diag.log"
    FAIL=1
fi

# 3. NVLink status — link training/degradation the driver won't surface as a hard failure
if nvidia-smi nvlink -s | grep -qi "inactive\|error"; then
    logger "HEALTHCHECK: nvidia-smi nvlink -s reports an inactive/errored link"
    FAIL=1
fi

# 4. Required filesystem mounts present (dataset/checkpoint paths a job will assume exist)
for mnt in /lustre/datasets /lustre/checkpoints; do
    mountpoint -q "$mnt" || { logger "HEALTHCHECK: $mnt not mounted"; FAIL=1; }
done

if [ "$FAIL" -ne 0 ]; then
    # Nonzero exit is the convention Slurm's HealthCheckProgram/Prolog acts on:
    # the node is DRAINED automatically, removed from schedulable capacity,
    # WITHOUT ever accepting the job that was about to land on it.
    exit 1
fi
exit 0
```

`nvidia-smi -L` and `dcgmi diag -r 1` catch different failure classes deliberately: a GPU count check catches a card that fell off the bus entirely or a driver that failed to enumerate it; `dcgmi diag -r 1` (DCGM's level-1 diagnostic, fast enough to run per-job or on a short interval) catches ECC errors, thermal throttling, and other in-spec-but-degraded conditions a bare device count would miss; the NVLink check catches the specific failure class the worked scenario below is built around — a link that's technically present but degraded or inactive, which neither of the first two checks would necessarily catch.

## Job-provisioning patterns for AI/HPC

- **Pre-staging datasets/containers before a large job starts.** A multi-node job that begins by having every rank independently pull a multi-GB container image or dataset from a shared filesystem creates a thundering-herd I/O spike exactly at job start — the same moment the job is most sensitive to startup latency. Pre-staging (warming a container image cache via Enroot per Chapter 8, or pre-copying a dataset shard to node-local NVMe scratch) before the job's allocation begins removes this from the job's critical path entirely.
- **Warm-pool vs. cold-start GPU capacity.** A "warm" node — already health-checked, already carrying the right container image in cache, driver/firmware already validated — can accept a job in seconds. A "cold" node pulled fresh from a maintenance/provisioning cycle has to run the entire readiness pipeline above before it's trustworthy, which for a large training job is a real latency cost worth planning capacity around (keeping a small buffer of pre-validated warm nodes rather than provisioning strictly on demand).
- **Admission control for expensive multi-node jobs.** Because a gang-scheduled job either gets all N nodes or effectively none of its progress (Volume 6 Chapter 7's `(Resources)` reason), admission control for large jobs should verify not just raw node count but that the *specific* nodes about to be allocated have recently passed health checks — admitting a 64-node job onto a mix of long-validated and just-rejoined-but-not-yet-rechecked nodes reintroduces exactly the risk health gating exists to prevent.

## Worked scenario

**Situation:** A node with a flaky NVLink connection kept getting scheduled into multi-node training jobs and silently degrading them, until a health-check gate specifically probing NVLink status was added.

1. **Before the fix:** the node passes `sinfo` membership (it's reachable, Slurm considers it healthy by default absent a specific check), passes a basic `nvidia-smi -L` count check (all 8 GPUs enumerate fine — the *card* is present, only one *link* between two of them is degraded), and gets scheduled into training jobs normally.
2. **Symptom pattern that should have raised suspicion earlier:** jobs that happened to land on this node ran measurably slower or occasionally reported anomalous loss curves, but not consistently — because the effect only appears when the training job's NCCL topology actually routes a collective over the specific degraded NVLink pair, which depends on which GPUs within the node get used by which ranks. This intermittency is exactly why it went undiagnosed for a while: "sometimes slow, sometimes fine" on the same node reads like noise, not a hardware fault, until someone correlates job placement against node ID.
3. **Diagnosis, once suspected:** `nvidia-smi nvlink -s` on the node directly shows one link reporting an inactive or error state that a basic device-count check would never surface — the GPU is enumerated fine, the *link* between two specific GPUs is the actual fault.
4. **Fix:** add the NVLink-status check (step 3 in the health-check script above) to the periodic `HealthCheckProgram` and/or job Prolog, so that a degraded link causes the node to auto-drain the *moment* the check runs, rather than waiting for a human to notice a pattern across weeks of job-anomaly reports.
5. **Structural lesson:** a health check is only as good as the specific failure modes it probes for — "the GPU is there" (device count) and "the GPU is healthy end-to-end for this specific link" (NVLink status) are different claims, and the gap between them is exactly where this node hid for as long as it did.

**Conclusion:** health gates need to be designed against the actual failure modes of the hardware in front of you, not just a generic liveness check — a device that enumerates fine can still have a specific degraded interconnect that only a targeted check (and, ultimately, only a job that happens to route traffic over it) will reveal.

**Mnemonic:** "**Enumerated is not the same as healthy.**" A GPU count check proves the card exists; it proves nothing about the quality of any specific link, mount, or driver state the job will actually depend on.

**Interview-ready line:** "Node health gating has to sit between cluster-manager join and scheduler-visibility as an enforced gate, not an optional dashboard — because a node that's reachable and enumerates its GPUs correctly can still have a degraded NVLink or a stale mount that only shows up once a real multi-node job routes traffic over it, and by then you've poisoned the job's results and burned every other node's GPU-hours waiting at the same barrier."

## Practice

1. Walk through why a node failing its health check should be drained rather than simply left out of that one job's allocation — what's the risk of "just don't schedule this specific job here" as a response?
2. In the pseudocode health-check script above, why does it run four independently-failing checks (GPU count, DCGM diagnostic, NVLink status, filesystem mounts) instead of one combined "is the node okay" check?
3. Explain, using the gang-scheduling concept from Volume 6 Chapter 7, why one degraded node in an 8-node job wastes closer to 8 nodes' worth of GPU-hours than 1.
4. What operational cost does "cold-start" GPU capacity impose on a large training job's launch latency that a warm pool avoids, and what has to be true of a node for it to safely be considered "warm"?
5. Why did the NVLink-degradation failure in the worked scenario present as intermittent rather than as a consistent, obviously reproducible failure?
