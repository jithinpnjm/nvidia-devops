# Chapter 7 — Slurm scheduling model
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Understand jobs, allocations, partitions, nodes and why HPC schedulers optimize a different operating model from general service orchestration.

Slurm allocates resources to batch/interactive jobs across partitions and nodes, with scheduling priorities, reservations, topology and accounting features suited to HPC. Users submit jobs; the scheduler grants allocations; launch tools start tasks. The natural unit is often a job requiring a coordinated set of resources rather than a long-lived microservice.

```
sinfo
squeue
scontrol show node <node>
scontrol show job <jobid>
sacct -j <jobid> --format=JobID,State,Elapsed,AllocTRES,ExitCode
```

➕ **The Slurm object model, drawn out — "jobs, allocations, partitions, nodes" as a hierarchy:**
```
Cluster
  └── Partition "gpu-a100"  (a named subset of nodes + policy: max time, priority, access)
         └── Node gpu-node-03  (physical/virtual host, has GRES: gpu:8)
         └── Node gpu-node-04
                └── Job 40231 (submitted by user, requests resources)
                       └── Allocation  (the specific nodes/GPUs/cores GRANTED to this job)
                              └── Job Step 0  (srun invocation #1 within the allocation — e.g. rank launch)
                              └── Job Step 1  (a second srun — e.g. a follow-up profiling pass)
```
The distinction worth being precise about in an interview: a **job** is a request + accounting record; an **allocation** is the concrete resource grant; a **step** is one execution *within* that grant. A single job can run multiple steps sequentially or concurrently inside one allocation — this is how a Slurm job can, e.g., run a short data-staging step and then the main multi-hour training step without releasing and re-requesting the allocation in between.

➕ **Sample `sinfo` output, annotated:**
```
$ sinfo
PARTITION   AVAIL  TIMELIMIT  NODES  STATE  NODELIST
gpu-a100*      up   7-00:00:0     6   idle  gpu-node-[01-06]
gpu-a100*      up   7-00:00:0     2  alloc  gpu-node-[07-08]
gpu-a100*      up   7-00:00:0     1   drain gpu-node-09        ← taken out of scheduling, NOT down
gpu-h100       up   3-00:00:0     4   idle  gpu-node-[10-13]
```
`drain` is the state to know cold: the node is still up and reachable, but Slurm will not schedule new jobs on it — usually set deliberately (pending maintenance, or a prolog script failed and auto-drained it per Deep Dive 5). This is different from `down` (unreachable/failed) and different from `alloc` (fully busy but healthy) — conflating "drain" with "broken" is a common junior-engineer mistake this table should immunize you against.

➕ **Sample `squeue` output, annotated:**
```
$ squeue
  JOBID PARTITION     NAME     USER  ST       TIME  NODES NODELIST(REASON)
  40231   gpu-a100  llm-pt-8b   jdoe   R    3:12:08      8 gpu-node-[01-08]
  40255   gpu-a100    eval-run   asmith  PD       0:00      2 (Priority)          ← pending, lower priority
  40256   gpu-a100  big-sweep   bchen   PD       0:00     16 (Resources)          ← pending, not enough free nodes
```
`ST=PD` with reason `(Priority)` versus `(Resources)` is a genuinely different answer to "why is my job not running yet" — `(Priority)` means capacity exists but a higher fair-share/priority job is ahead of you in queue; `(Resources)` means there is not currently enough free capacity for your request, full stop, regardless of priority. Telling a customer/user the wrong one of these is a common support miss.

➕ **Sample `scontrol show job` and `sacct` output, annotated (the accounting/forensics half of the toolset):**
```
$ scontrol show job 40231 | grep -E 'JobState|Reason|NodeList|TRES'
   JobState=RUNNING Reason=None
   NodeList=gpu-node-[01-08]
   TRES=cpu=64,mem=512G,gres/gpu=8,node=8

$ sacct -j 40199 --format=JobID,State,Elapsed,AllocTRES,ExitCode
JobID           State    Elapsed        AllocTRES ExitCode
40199        TIMEOUT   7-00:00:00 cpu=64,gres/gpu=8      0:0    ← ran to its wall-clock limit, was killed — NOT a crash
40199.0      CANCELLED  6-23:58:41 cpu=64,gres/gpu=8      0:0
```
`State=TIMEOUT` with `ExitCode=0:0` is a specific, important pattern: the job's own code never returned a nonzero exit — it was still healthy and running when Slurm's wall-clock limit killed it. This is a scheduling/checkpoint-cadence problem ("your job needs more wall time, or needs to checkpoint more often so a restart doesn't waste 7 days"), not an application-crash problem — and `sacct` is the only place this distinction is visible after the fact, since the live job is already gone by the time anyone investigates.

➕ **Shortcut — the one-line answer for "why is Slurm different from a Kubernetes-style scheduler" worth having ready:** *"Kubernetes schedules independent, restartable units against a continuously-reconciled desired state; Slurm schedules a coordinated, often-gang, often wall-clock-bounded allocation against a queue — the natural unit is 'this job gets these N nodes for this long,' not 'keep this replica count running forever.'"*

➕ **Worked scenario — combining these tools to explain a stuck queue:**
> **Situation:** A researcher asks why their 16-node job (`40256` above) has been `PD` for six hours on a partition that "looks empty in the dashboard."
> 1. `squeue` shows reason `(Resources)` — not priority. So it genuinely is a capacity question, not a fairness one.
> 2. `sinfo` shows only 6 nodes `idle` in that partition, but the job needs 16 — the "looks empty" dashboard was probably showing aggregate GPU utilization percentage, not free *node count*, and 6 idle nodes out of, say, 9 total can look like "mostly idle" while still being short of 16.
> 3. `scontrol show node <one of the alloc nodes>` confirms those 2 nodes are legitimately allocated to job `40231`, which per `squeue` has 3+ hours of an unknown total wall-clock remaining.
> 4. Answer to the researcher: the partition is capacity-constrained for a job of this size specifically, not broken — options are wait, request a smaller node count, or ask whether `40231` has a bounded remaining time you can plan around via `scontrol show job 40231`'s `EndTime` field.
> **Interview-ready line:** "A queue looking 'mostly idle' on a utilization dashboard and a queue having enough *free, contiguous* capacity for a specific job's request are different claims — gang-scheduled HPC jobs need N whole nodes, not N/total percent."

## Practice
➕ 1. Explain the difference between a Slurm job, an allocation, and a job step to someone who only knows Kubernetes Pods and Deployments.
➕ 2. Given `sacct` showing `State=TIMEOUT ExitCode=0:0` for a training job, write the one-sentence diagnosis and the one operational recommendation you'd give the researcher.

---
# Chapter 8 — Kubernetes, Slurm or both
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Choose orchestration by workload and operating model, not by platform loyalty.

| Dimension | Kubernetes strength | Slurm strength |
|---|---|---|
| Long-lived services | native Deployments/Services/operators | not primary design center |
| Batch HPC jobs | possible via jobs/operators | core scheduling model |
| Application ecosystem | cloud-native service/platform ecosystem | HPC job ecosystem/tooling |
| GPU gang/coordinated jobs | requires scheduler/operator patterns | native HPC allocation concepts |
| Platform self-service/API extensibility | CRDs/operators/GitOps | HPC workflow/accounting integration |

Hybrid environments can integrate the two, but integration adds lifecycle and ownership questions. A Solutions Architect should discover which workloads, teams and operational processes must be preserved before recommending consolidation.

➕ **The decision table above, converted into a decision tree you can actually walk an interviewer through:**
```
Is the workload a long-lived, always-on service with independent replica lifecycle (e.g. inference endpoint)?
  YES ──▶ Kubernetes (Deployments/HPA/Services — this is the native model)
  NO, it's a bounded batch job needing N coordinated nodes for a fixed duration
      │
      ├── Does the org already have deep HPC tooling/accounting/user culture (sinfo/sbatch muscle memory,
      │    fair-share policy, existing Slurm accounting integration)?
      │       YES ──▶ Slurm (don't fight existing operational maturity)
      │       NO  ──▶ Either is viable; Kubernetes if the team is cloud-native-fluent and wants one
      │               control plane for training AND serving; Slurm if gang-scheduling/HPC-native
      │               features (topology-aware placement, backfill, complex QoS) are load-bearing
      │
      └── Does inference/serving ALSO need to coexist on the same hardware pool?
              YES ──▶ Hybrid, with explicit node/driver/network ownership boundaries (Deep Dive 6) —
                       or Kubernetes-only with a batch-friendly scheduler add-on (e.g. Kueue, Volcano)
```
This tree is the practical version of "choose by workload and operating model, not platform loyalty" — the first branch point is workload *shape* (long-lived vs bounded), the second is organizational *maturity*, not a feature checklist comparison.

➕ **Worked scenario — the exact question a Senior SA gets asked in a real deal cycle:**
> **Situation:** A customer runs 80% batch LLM pretraining (large, multi-week jobs, dedicated GPU pool) and 20% online inference (many small, latency-sensitive endpoints, needs autoscaling) on the same physical GPU fleet, and asks "should we migrate our Slurm training estate to Kubernetes so we only maintain one platform?"
> 1. Resist the premise that "one platform" is automatically the right goal — ask what operational pain "two platforms" is actually causing today (if the honest answer is "none, we just heard Kubernetes is more modern," that's not a technical requirement).
> 2. Name the real tradeoff precisely: consolidating onto Kubernetes-only means re-implementing gang-scheduling, backfill, fair-share, and topology-aware placement that Slurm already provides natively — via Kueue/Volcano/a custom operator — which is real engineering investment, not a checkbox migration.
> 3. Conversely, staying dual-platform means solving the *hybrid* ownership questions from Deep Dive 6 explicitly: who owns node draining/firmware updates, how does the fabric config differ (if at all) for Slurm-managed vs Kubernetes-managed nodes, and is there a shared node pool or a hard partition between the two.
> 4. A defensible recommendation for this specific 80/20 split: keep Slurm for the 80% batch pretraining (it's the workload Slurm is designed for, and disrupting a working multi-week-job pipeline for platform purity is high risk, low reward), run the 20% inference on Kubernetes (it's the workload Kubernetes is designed for), and invest the migration effort instead in *clean node-pool boundaries and shared observability* between the two — solving the actual pain (if any) without a wholesale platform swap.
> **Interview-ready line:** "Consolidation should follow demonstrated operational pain, not platform preference — and '80% of our workload already runs well on the scheduler built for it' is a strong prior against migrating that 80%."

➕ **Shortcut — mnemonic for the whole chapter, worth saying as an opener to this exact interview question:** *"Kubernetes is a control plane for things that should keep running; Slurm is a control plane for things that should run once, to completion, with a queue. Ask which one your workload is before asking which platform is 'better.'"*

## Practice
1. Explain RDMA to a Kubernetes engineer using the data path rather than protocol jargon.
2. List five checks for a suspected RoCE performance issue.
3. Design a storage benchmark that resembles model startup rather than training reads.
4. Compare Kubernetes and Slurm for an organization with 80% batch training and 20% online inference.

➕ 5. A customer with a healthy, working Slurm estate for 100% batch training asks whether they should add Kubernetes purely to get GitOps-style declarative deployment for their (currently manually-scripted) job submission pipeline. Using this chapter's decision tree, explain why this is a different question from "should we migrate off Slurm," and what you'd actually recommend.
➕ 6. Using Chapter 7's `sacct State=TIMEOUT` pattern and this chapter's decision tree, explain why a bounded-wall-clock, checkpoint-and-resume batch job is a worse fit for a naive Kubernetes Deployment (which assumes indefinite restart-forever semantics) than for Slurm — and what Kubernetes-native construct (Job, not Deployment) closes most of that gap.

## Targeted references
[NVIDIA Kubernetes technical blog](https://developer.nvidia.com/blog/tag/kubernetes/) - Includes recent 2026 Slurm/Kubernetes and GPU cluster validation material.

[NVIDIA Network Operator](https://docs.nvidia.com/networking/display/cokan10) - Use current docs for supported configurations; verify release/version in your environment.
