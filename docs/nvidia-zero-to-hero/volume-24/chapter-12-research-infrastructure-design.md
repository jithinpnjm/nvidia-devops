# Project 12: Research Infrastructure Design

| Project metadata | Value |
|---|---|
| Volume | 24 — Capstone Projects |
| Difficulty | Advanced |
| Estimated time | 10–12 hours |
| Primary audience | Research Infrastructure Teams, Academic IT, Platform Architects |
| Core objective | Design GPU cluster for academic lab with competing workloads; fair allocation, max utilization, cost transparency |
| Linked interview chapter | Volume 23, Chapter 12: System-Level Design - Research Infrastructure |

## Learning Objectives

By the end of this project, you will be able to:
- Design fair resource allocation policies for heterogeneous workloads
- Implement automated job scheduling with fairness guarantees
- Measure and allocate costs transparently to research groups
- Handle long-running and short-running jobs equitably
- Design for maximum utilization while preventing starvation

## Problem Statement

An AI research lab has 5 research groups (A–E) sharing one 32-GPU cluster. Workload characteristics:

```
Group  Project         Job Type        Typical Size  Frequency
────────────────────────────────────────────────────────────────
A      LLM pretraining Training, 48h    8 GPUs        2×/week
B      Vision research Training, 2h    4 GPUs        10×/week
C      NAS (automated)  Short 30min    1 GPU         100×/week
D      Simulation       Long 72h       2 GPUs        1×/week
E      Inference eval   Short 10min    1 GPU         50×/week
```

**Requirements:**
- No group starved: all groups make progress in reasonable time (< 1 week)
- Fair allocation: within any 2-week window, total GPU-hours allocated proportional to requests
- Max utilization: average cluster utilization > 90%
- Cost transparency: each group sees their cost (GPU hours × rate)
- SLO support: option for "priority" queue (pay more, run faster)

**Unknown (you decide):**
- Scheduling algorithm?
- Priority classes?
- Cost model?
- How to prevent large jobs from starving small jobs?

## Scheduling Challenges

### Challenge 1: Starvation

If Group A (LLM, 8 GPUs, 48h) always gets priority, Group B (4 GPUs, 2h) waits days. Solution: fairness allocation.

### Challenge 2: Utilization

Naive scheduling might leave GPUs idle waiting for a large job to fit. Solution: backfill smaller jobs into gaps.

### Challenge 3: Priority vs Fairness

Group A might argue their 48-hour training is critical; Group E's 10-minute eval is less important. But if E pays more, should they get priority? Solution: separate "priority" and "normal" queues.

## Design Specification

### Scheduling Algorithm

Use **hierarchical fair queuing (HFQ):**

```
Level 1: Group fairness (proportional shares)
  - Group A: 40% of cluster (12.8 GPUs)
  - Group B: 25% of cluster (8 GPUs)
  - Group C: 20% of cluster (6.4 GPUs)
  - Group D: 10% of cluster (3.2 GPUs)
  - Group E: 5% of cluster (1.6 GPUs)

Level 2: Job fairness within group (round-robin)
  - All jobs from same group get equal preference
  - Within Group B, 10 jobs/week → each job gets 1/10 of B's share

Level 3: Backfill (fill GPU gaps)
  - If cluster has idle GPUs, run any available job (regardless of share)
  - Preempt only if needed to satisfy Level 1 share targets
```

### Priority Queue

Separate queue for "priority" jobs (higher rate):

```
Normal queue: $0.20 per GPU-hour
Priority queue: $0.40 per GPU-hour (2× cost)

Priority jobs scheduled immediately (preempt normal jobs if needed)
Normal jobs only preempted to satisfy fairness targets
```

### Cost Model

```
Per-GPU-hour cost: $0.20 (normal), $0.40 (priority)
Includes: GPU amortization, power, cooling, staff

Group A (LLM, 2 jobs/week, 8 GPUs, 48h each):
  Cost: 2 × 8 × 48 × $0.20 = $153.60/week

Group E (eval, 50 jobs/week, 1 GPU, 10min each):
  Cost: 50 × 1 × (10/60) × $0.20 = $1.67/week
```

## Implementation: SLURM Configuration

```bash
# Define resource limits per group
cat /etc/slurm/slurm.conf

# Add QOS (Quality of Service) for fairness
sacctmgr add qos normal priority=100 maxgpus=40 maxjobsperuser=10 timeout=259200
sacctmgr add qos priority priority=200 maxgpus=32 maxjobsperuser=5 timeout=86400

# Assign groups to QOS
sacctmgr add account group-a qos=normal,priority parent=root
sacctmgr add account group-b qos=normal,priority parent=root
sacctmgr add account group-c qos=normal,priority parent=root
sacctmgr add account group-d qos=normal,priority parent=root
sacctmgr add account group-e qos=normal,priority parent=root

# Set GPU limits per group (fairness targets)
sacctmgr set account group-a set priority=1000 maxgpus=13  # 40% of 32
sacctmgr set account group-b set priority=900 maxgpus=8    # 25% of 32
sacctmgr set account group-c set priority=800 maxgpus=6    # 20% of 32
sacctmgr set account group-d set priority=700 maxgpus=3    # 10% of 32
sacctmgr set account group-e set priority=600 maxgpus=2    # 5% of 32
```

## Fairness Verification

**Measurement over 2 weeks:**

```
Group  Requested(GPUh)  Allocated(GPUh)  Fair Share(%)  Status
──────────────────────────────────────────────────────────────
A      307.2            307.2            40.0%          ✓ Fair
B      192.0            192.0            25.0%          ✓ Fair
C      153.6            153.6            20.0%          ✓ Fair
D      76.8             76.8             10.0%          ✓ Fair
E      38.4             38.4             5.0%           ✓ Fair
────────────────────────────────────────────────────────────
Total   768.0            768.0            100.0%         ✓ Fair

Cluster utilization: 768 GPU-hours / (32 GPUs × 14 days × 24 hours) = 7.1% ✗ NOT meeting the >90% target
Starvation check: All groups scheduled within 1 week ✓
```

**This does not meet the >90% utilization success criterion, and that's worth surfacing rather than glossing over.** The five groups' fair-share allocation only uses 768 of the 10,752 GPU-hours available over 2 weeks (32 GPUs × 14 days × 24 hours) — 7.1%, not 91%. That's consistent with the workload table in the Problem Statement: even at each group's stated typical frequency (e.g., Group A's 2×/week, 8-GPU, 48h jobs), total demand across all 5 groups is only ~2,100 GPU-hours per 2 weeks (~19.5% utilization) — nowhere near 90%. To actually hit the >90% target, the cluster needs **backfill scheduling**: filling the ~8,900 GPU-hours/2wk of otherwise-idle capacity with additional, lower-priority work (extra jobs beyond groups' typical cadence, opportunistic/best-effort jobs, or a queue of deferrable work) whenever the fair-share-guaranteed jobs aren't using their full allocation. This is exactly the fix already called out in the Production Troubleshooting table below ("Cluster utilization only 60%... Implement backfill") — treat that as a required part of this design, not an optional afterthought, since without it the utilization target isn't met at all.

## Real Output: Job Scheduling Log

```
JobID  Group  Type          Size  Duration  Status        SubmitTime  StartTime   EndTime
────────────────────────────────────────────────────────────────────────────────────────
4001   A      LLM-train     8 GPU 48h       RUNNING       Mon 09:00   Mon 09:15   Wed 09:15
4002   B      Vision        4 GPU 2h        RUNNING       Mon 10:00   Mon 10:05   Mon 12:05
4003   C      NAS           1 GPU 30min     RUNNING       Mon 11:00   Mon 11:02   Mon 11:32
4004   A      Eval          2 GPU 1h        QUEUED        Mon 12:00   (waiting)   —
4005   E      Inference     1 GPU 10min     RUNNING       Mon 13:00   Mon 13:00   Mon 13:10
4006   D      Simulation    2 GPU 72h       QUEUED        Mon 14:00   (waiting)   —
4007   C      NAS           1 GPU 30min     QUEUED        Mon 15:00   (waiting)   —
4008   B      Vision        4 GPU 2h        QUEUED        Tue 08:00   (waiting)   —

Legend:
  RUNNING: Job is currently executing
  QUEUED: Job is waiting for GPU resources
  Estimated wait time for 4002: 3 hours (until 4001 finishes)
  Estimated wait time for 4006: 48 hours (backfill schedule)
```

## Production Troubleshooting

| Observation | Root Cause | Diagnostic | Fix |
|---|---|---|---|
| Group C's jobs starving (queue > 20 jobs, wait > 24h) | Group A's large jobs (8 GPU × 48h) monopolize cluster; fairness target not enforced | Check `squeue -A group-c -l` (show queued jobs); check `sacct -A group-a` (total allocation) | Lower priority of Group A's large jobs or split into smaller jobs; enforce fairness targets with preemption |
| Cluster utilization only 60% (target 90%) | Small jobs don't backfill; large jobs waiting, small jobs waiting independently | Check GPU allocation: `sinfo -N -O NodeHost,CPUsLoad,Memory,GPUs,GPULoad` | Implement backfill: when cluster idle, run any available job regardless of fairness share |
| Group A job preempted mid-run; lost 10 hours of computation | Fairness enforcement preempted to balance shares; Group A exceeded 40% target | Check SLURM preemption log: `scontrol show job [jobid]` | Add preemption grace period (30 min) for large jobs; checkpoint before preemption |
| Cost allocation doesn't match usage (Group A billed $100, but used 160 GPUs) | Billing system didn't track priority queue premium (2×) or didn't round correctly | Check SLURM accounting: `sacct -o Account,AllocGPUS,AllocCPUS,TotalCPU` | Implement detailed cost tracking; audit monthly bills against actual usage |

## Solution Walkthrough

### Phase 1: Define Fairness Targets

Allocate GPUs to groups based on number of researchers and project importance:

```
Group A (5 researchers, critical project): 40% = 12.8 GPUs
Group B (4 researchers): 25% = 8 GPUs
Group C (3 researchers): 20% = 6.4 GPUs
Group D (2 researchers): 10% = 3.2 GPUs
Group E (1 researcher): 5% = 1.6 GPUs
```

### Phase 2: Implement Fair Queuing

Use SLURM's QOS and association system:

```bash
# Create QOS
sacctmgr add qos normal priority=100

# Assign groups
sacctmgr add account group-a -p root
sacctmgr add account group-b -p root
...

# Set max GPU limits per group
for group in group-a group-b group-c group-d group-e; do
  sacctmgr modify account $group set maxgpus=<limit>
done
```

### Phase 3: Test Fairness

Submit sample workload matching real usage:

```bash
# Submit 2 Group A jobs (8 GPU, 48h each)
for i in 1 2; do
  sbatch --account=group-a --gpus-per-node=8 --time=2-00:00:00 train_llm.sh
done

# Submit 10 Group B jobs (4 GPU, 2h each)
for i in {1..10}; do
  sbatch --account=group-b --gpus-per-node=4 --time=2:00:00 train_vision.sh
done

# ... other groups similarly

# Monitor allocation
watch -n 60 'squeue -O JobID,Account,AllocGPUS,TimeLeft -S -Account'

# Check cumulative allocation
sacct -S 2026-07-24 -E 2026-08-07 -o Account,AllocGPUS | awk '{sum[$1]+=$2} END {for (g in sum) print g, sum[g]}'
```

### Phase 4: Add Cost Accounting

Track cost per group:

```bash
# Query SLURM accounting
sacct -S 2026-07-24 -E 2026-08-07 -o Account,AllocGPUS -p > usage.csv

# Calculate cost
python -c "
import csv
rate = 0.20  # $/GPU-hour
with open('usage.csv') as f:
    reader = csv.reader(f, delimiter='|')
    for row in reader:
        group, gpus = row[0], int(row[1])
        cost = gpus * rate
        print(f'{group}: {gpus} GPU-hours = \${cost:.2f}')
"
```

### Phase 5: Monitor and Adjust

Weekly review:

```bash
# Check if fairness targets are met
sacct -S 2026-07-24 -E 2026-08-07 -o Account,TotalCPU | awk '{sum[$1]+=$2} END {for (g in sum) print g, sum[g]/480}' # 480h/week

# Check for starvation (queue depth, wait times)
squeue -S -t -o JobID,Account,Priority,Reason -l | grep PENDING

# Check utilization
nvidia-smi
# If < 90%, implement backfill or adjust job submission policies
```

## Interview Preparation

**Q: How do you design fair resource allocation for a multi-group cluster?**

**A:** (Spoken answer)

"Fairness is about ensuring every group makes progress, and allocations reflect their share of requests.

I'd start by defining fair shares. If the lab has 5 groups of equal size, each gets 20%. But if Group A has twice as many researchers, they get 40%; others get 15% each.

Then I'd use a scheduling algorithm like hierarchical fair queuing. It works in two levels:
1. Group level: Each group gets their fair share of GPUs
2. Job level: Within a group, jobs compete equally

The key is preventing starvation: if Group A keeps submitting 8-GPU jobs, and they fill the cluster, Group E's tiny 1-GPU jobs wait forever. To fix this, I enforce fairness with preemption: if Group A exceeds their 40% share, I preempt their lowest-priority job and schedule Group E's job.

But preemption is harsh; it costs computation. So I add backfilling: when the cluster has idle GPUs, I run any job (regardless of group) to fill the gaps. This maximizes utilization without violating fairness targets.

For cost transparency, I track GPU-hours per group and bill accordingly. Group A might pay $100/week (160 GPU-hours × $0.20/hour), Group E might pay $2 (10 GPU-hours).

In practice, I'd use SLURM or Kubernetes with resource quotas and priority classes, monitor fairness weekly, and adjust targets if groups complain they're waiting too long."

**Q: What if a group's workload changes? E.g., Group A suddenly needs 50% of cluster instead of 40%.**

**A:** "I'd have a conversation with the group: is this temporary (a 3-month project) or permanent? If temporary, I'd adjust their quota temporarily. If permanent, I'd rebalance all groups.

Practically, I'd do:
1. Measure their current usage and wait times
2. Propose a new allocation: Group A 50%, others adjusted down
3. Implement the change
4. Monitor fairness for 2 weeks
5. Adjust if needed

Also, I'd offer a premium queue: if Group A is willing to pay 2× the cost, they can jump ahead. Some labs are fine with paying for higher priority."

## Evaluation Rubric

| Criterion | Excellent (100%) | Good (80%) | Acceptable (60%) | Needs Work (<60%) |
|---|---|---|---|---|
| **Fairness design** | Clear allocation algorithm with fairness proofs; prevents starvation | Good algorithm with starvation prevention | Algorithm described but limited fairness guarantees | No formal fairness or starvation analysis |
| **Implementation** | Fully implemented with SLURM/Kubernetes; verified fair over 2-week period | Mostly implemented; fairness verified | Partial implementation; fairness tested partially | No implementation or verification |
| **Utilization** | 90%+ cluster utilization achieved with fairness | 85%+ utilization | 75%+ utilization | <75% or utilization not measured |
| **Cost tracking** | Detailed cost per group; billing verified accurate | Cost tracking working, minor discrepancies | Basic cost calculation | No cost tracking |
| **Starvation prevention** | No group waits >1 week; verified with tests | Groups wait <2 weeks | Some waits >2 weeks | Starvation observed or not tested |

## Key Takeaways

1. **Fairness requires enforcement:** Allocate GPU shares to groups; preempt if needed to enforce.
2. **Starvation is subtle:** Large jobs can block small jobs; backfilling + fairness prevents this.
3. **Utilization matters:** Fair allocation alone can leave GPUs idle; backfilling fills gaps.
4. **Cost transparency builds trust:** Labs accept fairness if they understand and can predict costs.
5. **Monitor continuously:** Fairness and utilization targets drift over time; weekly audits catch problems early.

## Discussion Questions

1. If Group A's research is considered "more important" than Group E's, should they get priority in the fair queue?
2. Design a "time-of-day" allocation: morning hours priority for Group A, evening for Group E (different peak times).
3. How would you handle a new group wanting to join the cluster? Adjust everyone's shares or add headroom?
4. Estimate the cost to add 16 more GPUs; how would you allocate new capacity?
5. Design a job preemption strategy that minimizes wasted computation (checkpoint before killing).

## Cross-References

- **Volume 23, Chapter 12:** System-Level Design - Research Infrastructure
- **Volume 15:** Cluster Scheduling and Resource Allocation
- **Volume 21:** Cost Allocation and FinOps
- Tools: SLURM, Kubernetes, NVIDIA GPU Operator, Prometheus
