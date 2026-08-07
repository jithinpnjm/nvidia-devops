---
title: "Chapter 7 - Multi-Tenancy and Workload Isolation"
slug: "chapter-7-multi-tenancy-and-workload-isolation"
sidebar_position: 7
description: "Chapter 7 - Multi-tenancy and workload isolation — cluster management tooling (BCM, Mission Control, Slurm), quota design, and Run:ai-style GPU sharing."
---

# Chapter 7 — Multi-Tenancy and Workload Isolation

**Learning outcome:** Design a multi-tenant GPU cluster with real isolation guarantees — quota, scheduling fairness, and blast-radius containment — and understand where NVIDIA's cluster management stack (Base Command Manager, Mission Control, Slurm) and orchestration/sharing layers (Kubernetes + Run:ai) each do their job.

## 7.1 Two layers of the problem

Multi-tenancy on a GPU cluster is really two separate problems that get conflated:

1. **Cluster management / provisioning layer** — who owns which physical nodes, how they're imaged and kept healthy, and what job-scheduling substrate (Slurm, Kubernetes) runs on top. This is where **NVIDIA Base Command Manager (BCM)** and **NVIDIA Mission Control** operate.
2. **Workload isolation / sharing layer** — given a set of healthy nodes and a scheduler, how do you guarantee Team A's job can't starve, crash, or read data from Team B's job, while still sharing GPUs efficiently when jobs don't need a whole device. This is where Slurm partitions/QoS, Kubernetes namespaces/quotas, and GPU-sharing orchestrators like **Run:ai** operate.

A cluster with a perfect scheduler but no provisioning discipline is fragile (nodes drift out of a known-good state). A cluster with perfect provisioning but no isolation discipline is unfair (one team's misbehaving job degrades everyone). You need both.

## 7.2 Cluster management layer: BCM and Mission Control

### NVIDIA Base Command Manager (BCM)

BCM is the provisioning and lifecycle layer under a GPU cluster: node imaging (via a "software image" concept — a golden filesystem image applied at boot, not per-node drift), head-node HA, and a unified view across the node categories a real cluster actually has:

```bash
# BCM device list — heterogeneous roles in one pane
$ cmsh -c "device list"

Type             Hostname     Category    Status
------------------------------------------------
HeadNode         head01       -           UP
HeadNode         head02       -           UP (standby)
PhysicalNode     gpu-node001  gpu-a100    UP
PhysicalNode     gpu-node002  gpu-a100    UP
PhysicalNode     gpu-node003  gpu-a100    DOWN     <- flagged for investigation
EthernetSwitch   sw-leaf-01   -           UP
```

**Category-based configuration** is the core BCM mechanic: nodes are assigned a *category* (e.g., `gpu-a100`), and a driver version, kernel parameters, or Slurm/Kubernetes role change is applied to the category, not hand-edited per node. This is what makes the driver-upgrade canary/promote workflow from Chapter 1 tractable at scale — you promote a *category*, not 200 individual SSH sessions.

```bash
# Roll a driver version to a category, not node-by-node
$ cmsh
% category
% use gpu-a100
% set softwareimage gpu-a100-driver-550
% commit
# All nodes in category gpu-a100 re-provision to the new image on next reboot cycle
```

**Head-node HA** matters operationally because the head node runs the scheduler's control plane (Slurm controller or Kubernetes API server in a BCM-managed stack); if it's a single point of failure, a head-node crash takes down job submission cluster-wide even though every compute node is healthy. BCM's active/standby head-node pair with shared/replicated state is the mechanism that removes that single point of failure.

### NVIDIA Mission Control

Mission Control sits a layer above BCM: it's focused on **large training-run orchestration and resilience** — automatic checkpoint/restart on node failure, job-level health monitoring correlated with cluster telemetry, and workload-aware scheduling for the kind of multi-week, thousand-GPU training runs where a single node failure without automatic recovery can mean losing days of progress.

The operational distinction that matters for interviews: **BCM answers "is this node healthy and running the right software," Mission Control answers "is this training run healthy and will it survive a node failure without manual intervention."** They're complementary layers, not competing tools.

```bash
# Mission Control: automatic checkpoint-and-resume on node failure
# (conceptual API — actual CLI/config varies by deployment)
$ mc job status training-run-llama-70b-a

Status: DEGRADED -> RECOVERING
Node gpu-node047 failed health check at 14:22:03 UTC
Last checkpoint: step 48,200 (14:18:11 UTC, 4 min ago)
Auto-restart: rescheduling 8 ranks to gpu-node091 (replacement)
Resume from checkpoint: step 48,200
Expected data loss: ~4 minutes of compute (240 GPU-minutes)
```

Without this layer, the same node failure means: the job crashes, someone gets paged, someone manually identifies the last good checkpoint, manually resubmits with adjusted rank mapping — the difference between 4 minutes of lost compute and potentially hours of lost compute plus lost engineer time.

## 7.3 Scheduling-layer isolation: Slurm

### Partitions and QoS as the isolation boundary

```bash
$ sinfo -o "%P %a %l %D %N"

PARTITION       AVAIL  TIMELIMIT  NODES  NODELIST
research-small*    up    4:00:00     12  gpu-node[001-012]
research-large     up   72:00:00     24  gpu-node[013-036]
production-infer   up    2:00:00      8  gpu-node[037-044]
```

Partitions give you **hard node-set boundaries** — production inference nodes are physically unreachable from the research partitions, so a runaway research job cannot compete for the same GPUs serving production inference traffic, regardless of scheduling priority.

```bash
# QoS gives you soft, adjustable limits within a partition
$ sacctmgr show qos format=Name,MaxTRESPerUser,MaxWall,Priority

Name              MaxTRESPerUser  MaxWall     Priority
research-standard  gres/gpu=8      1-00:00:00       10
research-priority  gres/gpu=32     3-00:00:00       50
```

```bash
# A user hits their QoS limit — evidence of isolation working correctly
$ sbatch --partition=research-large --qos=research-standard --gres=gpu:16 train.sh
sbatch: error: QOSMaxGRESPerUser
sbatch: error: Batch job submission failed: Job violates accounting/QOS policy
```

This is the correct behavior, not a bug to work around: the researcher requesting 16 GPUs against an 8-GPU QoS cap is stopped at submission time, before consuming any scheduler cycles or blocking other users' jobs in the queue.

### Preemption for priority isolation

```bash
# Priority job preempts a lower-priority job that's using needed capacity
$ sacctmgr show qos research-priority format=Name,Priority,PreemptMode
Name               Priority  PreemptMode
research-priority       50   requeue

# When a research-priority job needs capacity held by a research-standard
# job, Slurm requeues (checkpoints if the job supports it, else restarts)
# the lower-priority job rather than making the priority job wait
$ squeue -j 88213
JOBID  NAME              STATE       REASON
88213  urgent-ablation   PENDING     Resources
# 30 seconds later, after preemption:
88213  urgent-ablation   RUNNING     -
```

**Operational rule:** only make jobs preemptible if they can checkpoint cleanly — preempting a job with no checkpoint support just converts "wait in queue" into "lose all progress and restart," which is worse for the preempted team and doesn't actually improve overall cluster throughput.

## 7.4 Orchestration-layer isolation: Kubernetes + Run:ai-style GPU sharing

### The problem Slurm-style whole-GPU allocation doesn't solve

Slurm partitions and QoS assume jobs request whole GPUs (or a clean multiple). A lot of real workloads — inference serving, small fine-tuning jobs, interactive notebooks — don't need a whole A100. Requiring whole-GPU allocation for a job that uses 20% of a GPU is exactly the over-provisioning waste pattern from Chapter 6.

```bash
# Kubernetes ResourceQuota: hard isolation boundary per namespace
$ kubectl describe resourcequota team-inference-quota -n team-inference

Resource                Used   Hard
--------                ----   ----
requests.nvidia.com/gpu    6      8
```

A namespace ResourceQuota is the Kubernetes-native equivalent of a Slurm QoS cap — it stops a team from consuming more than their allotted share, enforced at admission time.

### Fractional GPU sharing (Run:ai-style scheduler)

Where Run:ai (and similar GPU-orchestration schedulers layered on Kubernetes) add value over raw Kubernetes device-plugin scheduling is **fractional and dynamic** GPU allocation with fairness guarantees, rather than the binary "1 whole GPU or 0" that the default NVIDIA device plugin provides:

```yaml
# Run:ai-style workload spec: guaranteed fraction + burst-to-idle-capacity
apiVersion: run.ai/v2
kind: Workload
metadata:
  name: notebook-alice
spec:
  gpu:
    request: "0.25"        # guaranteed 1/4 of a GPU's compute+memory
    limit: "1.0"            # may burst to a full GPU if idle capacity exists
  scheduler:
    priority: interactive
    preemptible: true       # may be reclaimed if a training job needs the GPU
```

```bash
# Fairness enforcement in action — a low-priority interactive session
# is reclaimed when a higher-priority training job needs the GPU it was
# opportunistically using
$ runai list jobs -p team-research

NAME                PRIORITY      GPU REQ   GPU ACTUAL   STATUS
notebook-alice      interactive   0.25      0.25         Running
notebook-bob        interactive   0.25      1.00         Running    <- bursting into idle capacity
train-job-large     train         8         8            Pending    <- needs bob's burst capacity back
# 15 seconds later:
notebook-bob        interactive   0.25      0.25         Running    <- reclaimed to guaranteed fraction
train-job-large     train         8         8            Running
```

This is the mechanism that makes "guaranteed minimum, opportunistic maximum" work in practice — teams get a fairness floor they can rely on, while idle capacity doesn't sit wasted (connecting back to Chapter 6's fragmentation/idle-allocation waste patterns), and priority workloads can always reclaim what they're entitled to.

## 7.5 Isolation decision tree

```mermaid
flowchart TD
    A["New tenant/workload<br/>type onboarding"] --> B{"Does this workload<br/>need a whole GPU or<br/>more (large training)?"}
    B -->|Yes| C["Slurm partition + QoS,<br/>or Kubernetes namespace<br/>with whole-GPU device plugin"]
    B -->|No, fractional need<br/>(inference, notebooks,<br/>small fine-tunes)| D["Kubernetes + fractional<br/>GPU scheduler (Run:ai-style)<br/>with guaranteed floor"]
    C --> E{"Does this workload need<br/>multi-week resilience<br/>(large distributed training)?"}
    E -->|Yes| F["Mission Control checkpoint/<br/>restart orchestration on top<br/>of the scheduler"]
    E -->|No| G["Standard scheduler-level<br/>retry/requeue is sufficient"]
    D --> H{"Is this tenant's workload<br/>trusted to share a node<br/>with others (no hard<br/>compliance boundary)?"}
    H -->|Yes| I["Fractional sharing with<br/>preemption/burst policy"]
    H -->|No, compliance/<br/>security boundary| J["Dedicated node pool<br/>(hard isolation, see Ch08)"]
```

## 7.6 Production troubleshooting table

| Symptom | Evidence | Root Cause | Fix | Verification |
|---|---|---|---|---|
| One team's job starves others despite quota configured | `sacctmgr`/`kubectl describe resourcequota` shows quota exists but isn't being enforced at submission | Quota applied to wrong scope (user vs. account/namespace) or preemption disabled so low-priority jobs never yield | Verify quota scope matches actual submission identity; enable preemption with checkpoint support for lower-priority QoS | Over-quota submissions rejected at submission time, not after running |
| Notebook/interactive GPUs show high allocation, near-zero utilization overnight | Ties to Chapter 6's idle-allocation waste pattern | No fractional-sharing floor/burst policy — sessions hold whole GPUs indefinitely | Move interactive workloads to a fractional scheduler with guaranteed floor + idle-timeout eviction | Notebook GPU-hours drop, without teams reporting resource starvation |
| Driver upgrade rolled to one node category breaks a different category's jobs | BCM category assignment shows overlapping/incorrect category membership | Node was miscategorized (e.g., an inference node tagged into a training category) | Audit category membership before every rollout; separate categories per workload type, not just per hardware type | Rollout scoped correctly; unaffected categories show zero incidents |
| Large training run loses hours of progress on a single node failure | No checkpoint/restart orchestration in place; manual resubmission required | Mission Control (or equivalent checkpoint/restart automation) not deployed for this job class | Deploy automatic checkpoint-and-resume orchestration for any job above a duration/scale threshold | Node failure recovery measured in minutes, not hours, with data loss bounded to time-since-last-checkpoint |
| Preempted job restarts from scratch instead of resuming | Job has no checkpoint support, was made preemptible anyway | Preemptible flag applied uniformly without checking job checkpoint capability | Only mark jobs preemptible if they implement periodic checkpointing; otherwise use partition/QoS isolation instead of preemption | Preempted jobs resume from last checkpoint, not from step 0 |

## 7.7 Interview preparation

**Q: "What's the difference between Slurm partitions/QoS and a Kubernetes + Run:ai-style setup for multi-tenancy, and when would you use each?"**

A: "Slurm partitions and QoS give you hard node-set boundaries and per-user/per-account resource caps, and they assume workloads request whole GPUs or clean multiples — that's the right model for large batch training jobs where a job genuinely needs 8 or 64 GPUs together. Kubernetes with a fractional GPU scheduler like Run:ai solves a different problem: workloads that don't need a whole GPU — inference serving, notebooks, small fine-tunes — where forcing whole-GPU allocation just creates the over-provisioning waste I'd flag in a cost review. In practice, a mature cluster runs both: Slurm-style partitioning for the large training workloads, and a fractional Kubernetes scheduler for everything else, sharing the same physical fleet managed underneath by something like BCM."

**Q: "How does NVIDIA Base Command Manager relate to Mission Control — aren't they solving the same problem?"**

A: "No, they operate at different layers. BCM is about node lifecycle and configuration — is this physical node running the right OS image, driver version, and role, and is that consistent across a whole category of nodes so I can safely roll changes at scale. Mission Control is about job-level resilience for large distributed training runs — when a node fails mid-training, does the job automatically checkpoint, identify healthy replacement capacity, and resume, or does it just crash and page someone. You need BCM's provisioning discipline regardless of what's running on the cluster; you need Mission Control specifically when you're running multi-day, thousand-GPU training jobs where manual recovery from a single node failure is unacceptably expensive."

**Q: "A team says fractional GPU sharing is 'unsafe' because their job might get starved by other tenants. How do you respond?"**

A: "I'd separate their concern into what fractional sharing actually guarantees versus what they're assuming. A well-configured fractional scheduler gives every workload a guaranteed floor — the fraction they requested — and only allows *opportunistic bursting* beyond that floor into currently-idle capacity, which gets reclaimed the moment a higher-priority or full-allocation job needs it. So their guaranteed floor is never starved; what changes is that they can't assume they'll always get more than their floor for free. If their workload genuinely needs a hard, non-negotiable full-GPU allocation — say, a latency-sensitive production inference service — that's a legitimate case for a dedicated node pool or Slurm-style whole-GPU allocation instead of fractional sharing, and that's a workload-classification decision, not a reason to avoid fractional sharing everywhere."

## Key Takeaways

1. Multi-tenancy is two layers: cluster provisioning/lifecycle (BCM, Mission Control) and workload isolation/sharing (Slurm partitions/QoS, Kubernetes namespaces, Run:ai-style fractional schedulers) — don't conflate them.
2. BCM's category-based configuration is what makes fleet-wide changes (driver upgrades, from Chapter 1) tractable instead of per-node manual work.
3. Mission Control's checkpoint/restart orchestration is what turns a single node failure in a multi-week training run from "lose hours, page someone" into "lose minutes, recover automatically."
4. Slurm QoS and Kubernetes ResourceQuotas are both admission-time enforcement — the goal is rejecting or queueing over-quota work before it consumes scheduler cycles, not after.
5. Fractional GPU sharing (Run:ai-style) needs a guaranteed floor plus reclaimable burst capacity to be both fair and efficient; only make jobs preemptible if they can actually checkpoint.

## Cross References

- Chapter 1: Cluster Lifecycle and Upgrade Operations — category-based rollout is the BCM mechanism behind that chapter's canary/promote workflow
- Chapter 6: Cost Optimization and Resource Efficiency — fragmentation and idle-allocation waste patterns this chapter's isolation mechanisms address
- Chapter 8: Security Operations and Compliance — when isolation requirements escalate from "fair sharing" to "hard compliance boundary"
- Volume 10-11: Kubernetes GPU scheduling mechanics and device plugins
