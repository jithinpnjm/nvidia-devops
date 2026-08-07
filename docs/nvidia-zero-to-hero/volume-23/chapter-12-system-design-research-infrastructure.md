# Chapter 12: System Design — Research Infrastructure

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Expert |
| Estimated reading time | 90 minutes |
| Primary audience | Staff/principal engineers, research platform architects |
| Core question | How do you share GPU clusters fairly among competing research teams with unpredictable workloads? |

## Interview Question: Design a Research GPU Cluster

**Constraints (given in interview):**

- Support 50 research teams (professors, students, postdocs)
- Workloads: wildly unpredictable (5 min hyperparameter search to 3-month training)
- 200 GPUs total (fixed budget)
- Goals: Maximize utilization, ensure fairness, minimize wait time
- Fairness metric: All teams should get equal GPU time (weighted by contribution)
- Failure tolerance: Researchers can't afford data loss; must support checkpointing
- Deployment: University cluster (not cloud), shared with other HPC work

**Walkthrough (15-20 minute answer):**

### Phase 1: Understand Workload Characteristics (3 minutes)

**Key questions:**

1. **Job duration distribution:** What's typical? (min, max, median)
   - Assume: median 2 hours, max 72 hours, min 5 min
   - This is bimodal: many short interactive jobs + few long training runs

2. **Fairness definition:** Equal GPU time, or equal job count?
   - Equal GPU time (weighted by contribution)
   - Larger contributions (faculty) get more quota

3. **Preemption tolerance:** Can jobs be interrupted?
   - Long-running: need checkpoints (graceful preemption with 30 sec notice)
   - Interactive: can't preempt (must wait)

4. **Priority:** Is there emergency access (e.g., paper deadline)?
   - Yes, override mechanism with faculty approval

**My assumptions:**

- Poisson job arrival (unpredictable)
- 10% long-running (> 24 hours), 30% medium (1-8 hours), 60% short (< 1 hour)
- Peak: 50 concurrent short jobs (5 min each) → 1 GPU per team on avg
- Must handle burst: 10 teams all submitting 8-GPU jobs simultaneously

### Phase 2: Architecture Overview (4 minutes)

```
┌────────────────────────────────────────────────┐
│ Research Job Portal (web interface)            │
│ ├─ Job submission                              │
│ ├─ Resource quota display                      │
│ └─ Job monitoring & logs                       │
├────────────────────────────────────────────────┤
│ Fair-Share Scheduler (Slurm + custom plugin)  │
│ ├─ Priority queue (fairness-based)            │
│ ├─ Resource limits (per-team quota)           │
│ ├─ Preemption policy (graceful or hard)      │
│ └─ Monitoring & metrics                       │
├────────────────────────────────────────────────┤
│ GPU Cluster (200 GPUs, 25 nodes)              │
│ ├─ All L40S (cost-optimized, versatile)       │
│ ├─ NVMe storage per node (checkpoint cache)   │
│ └─ Network (10Gbps Ethernet, non-critical)   │
├────────────────────────────────────────────────┤
│ Shared Storage                                 │
│ ├─ NFS for checkpoints & logs                 │
│ ├─ Quota per team (1TB for large models)     │
│ └─ Archival (old jobs moved offline)          │
├────────────────────────────────────────────────┤
│ Accounting & Billing                          │
│ ├─ GPU-hour tracking per team                 │
│ ├─ Monthly fairness report                    │
│ └─ Contribution-weighted quotas               │
└────────────────────────────────────────────────┘
```

### Phase 3: Fairness and Resource Allocation (4 minutes)

**Weighted fair-share model:**

```
Team contribution (initial allocation):
- Advisor funds GPU: team gets quota
- $10K hardware investment → 50 GPU-hours/month

Example:
Professor A: Funded $100K worth → 500 GPU-hours/month quota
Professor B: Funded $50K worth → 250 GPU-hours/month quota
Graduate student (self-funded): 50 GPU-hours/month (minimum)

But: Usage is bursty. Some months A uses 600 (exceeds), B uses 100 (wastes).

Solution: Fair-share scheduler with deficit tracking.

Month 1:
  A uses: 600 GPU-hours (quota 500) → deficit = -100
  B uses: 100 GPU-hours (quota 250) → surplus = +150
  Global: 700 used, 750 quota → cluster at 93% utilization

Month 2:
  A submits: 400 GPU-hours but has -100 deficit
            → A's effective quota becomes 400 GPU-hours
  B submits: 350 GPU-hours with +150 surplus credit
            → B's effective quota becomes 400 GPU-hours

Mechanism: Priority queue
- Sort jobs by: (current_usage - quota) / quota
- Jobs with negative score (under quota) go to front
- Jobs with positive score (over quota) go to back
- This smooths bursty usage over time
```

**Implementation:**

```python
class FairShareScheduler:
    def score_job(self, job, team_id):
        quota = team_quota[team_id]
        current_usage = team_usage[team_id]
        deficit = (current_usage - quota) / quota
        
        # Negative deficit = priority boost
        # Positive deficit = deprioritization
        priority = -deficit
        
        # Boost small jobs (reduce fragmentation)
        priority += 0.1 if job.gpu_count < 4 else 0
        
        return priority
    
    def schedule_next_job(self):
        pending = sort_jobs_by_priority(self.queue, self.score_job)
        
        for job in pending:
            nodes = find_best_fit(job.gpu_count)
            if nodes:
                launch_job(job, nodes)
                self.queue.remove(job)
                break  # One job per scheduling round
```

**Team quota display (monthly):**

```
Professor A:
  Quota: 500 GPU-hours/month
  Used (YTD): 400 GPU-hours (80% of quota)
  Deficit: 0 (on track)
  Pending jobs: 2 (requesting 16 GPU-hours)
  Est. completion: 5 days

Professor B:
  Quota: 250 GPU-hours/month
  Used (YTD): 300 GPU-hours (120% of quota!)
  Deficit: -50 GPU-hours (over budget)
  Pending jobs: 0
  Action: B's next job will be deprioritized until deficit clears
```

### Phase 4: Preemption and Checkpointing (3 minutes)

**Preemption policy:**

```
Short jobs (< 1 hour):
  - Non-preemptible (interactive use cases)
  - If queue > 10 jobs waiting, cancel oldest short job
  
Medium jobs (1-8 hours):
  - Preemptible with 30-second notice
  - SIGTERM sent → app has 30 sec to checkpoint
  - Example: training loop sets signal handler, saves model, exits
  
Long jobs (> 8 hours):
  - Preemptible only if fair-share score demands it
  - Only preempt if team is > 2× over quota
```

**Checkpointing protocol:**

```python
import signal
import torch

class CheckpointedTrainer:
    def __init__(self):
        self.checkpoint_dir = '/nfs/checkpoints'
        signal.signal(signal.SIGTERM, self.on_sigterm)
    
    def on_sigterm(self, sig, frame):
        """Graceful shutdown on preemption."""
        print("SIGTERM: Saving checkpoint...")
        
        # Save to NFS (durable)
        checkpoint = {
            'model': self.model.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'epoch': self.epoch,
            'step': self.step,
        }
        
        path = f'{self.checkpoint_dir}/job-{os.getenv("SLURM_JOB_ID")}.pt'
        torch.save(checkpoint, path)
        print(f"Checkpoint saved to {path}")
        
        exit(0)  # Exit gracefully
    
    def train(self):
        # Resume from checkpoint if it exists
        if self.load_checkpoint():
            print(f"Resumed from epoch {self.epoch}")
        
        for epoch in range(self.start_epoch, num_epochs):
            for step, batch in enumerate(dataloader, start=self.start_step):
                # ... training ...
                
                # Periodic local checkpoint (faster)
                if step % 100 == 0:
                    torch.save(checkpoint, '/local_nvme/checkpoint.pt')
```

**Expected behavior:**

```
Timeline:
0s:   Job receives SIGTERM
0-30s: App saves checkpoint (typically 5-10 sec)
30s:  If not exited, SIGKILL (force kill)
45s:  New job starts on freed GPUs
90s:  Old job restarts on available GPU
      (loads checkpoint, resumes from saved step)

Loss: ~2 minutes of wall-clock time
      But: No computation lost (resume from checkpoint)
```

### Phase 5: Failure Handling and Resilience (2 minutes)

**Failure scenarios:**

```
1. Job crashes (out of memory):
   - Auto-restart with reduced batch size
   - Notify user, suggest smaller job size
   
2. Node failure (hardware):
   - Kill all 8 jobs on node
   - Auto-relaunch on other nodes
   - Expected: ~5 min recovery (load checkpoint)
   
3. Network disconnect:
   - NFS unavailable → can't load checkpoint
   - Keep local NVMe cache as fallback
   - Restart from local cache (lose some progress)
   
4. Storage failure:
   - Checkpoint lost, must restart from scratch
   - Risk: 72-hour job wasted
   - Mitigation: Daily backup to tape archive
```

**Resilience strategy:**

```
Tiered checkpointing:
├─ Local NVMe (fast, hourly): < 5 min to recover
├─ NFS (durable, every 8 hours): Survives node crash
└─ Tape archive (slow, daily): Survives storage failure

Cost-benefit:
- Local NVMe: 0 cost (already there)
- NFS: 1-2% overhead (async writes)
- Tape: negligible (nightly, off-hours)
```

### Phase 6: Cost and Scalability (1 minute)

**Cost model (3-year):**

```
Hardware: 25 nodes × 8 L40S × $12K = $2.4M
Network: $100K
Storage (NFS): $200K
Total CapEx: $2.7M

OpEx (annual):
- Power: 200 GPUs × 400W × 8,760 hrs × $0.15/kWh = $1.05M
- Cooling: $350K
- Staff (1.5 FTE): $300K
- Maintenance: $150K
Total OpEx: $1.85M/year

Cost per GPU-hour: $1.85M ÷ (200 × 8,760 × 0.6 utilization) = $44/GPU-hour
Research universities often accept this (subsidized by grants).
```

**Scaling to 1000 GPUs:**

```
Linear scaling: 
- 1000 GPUs would cost $13.5M CapEx
- $9.25M/year OpEx
- But scheduler complexity increases

Challenges at 1000 GPUs:
1. Scheduling overhead: Fair-share algorithm must run O(log n) time
2. Storage contention: 1000 jobs all saving checkpoints simultaneously
3. Network congestion: Checkpoint write = burst of NFS traffic
4. Fairness becomes harder: tracking 500 teams gets complex

Solutions:
- Use hierarchical scheduling (cluster within cluster)
- Shard storage (team-dedicated NFS mounts)
- Implement checkpoint throttling (stagger writes)
```

### Phase 7: Monitoring and Fairness Verification (1 minute)

**Dashboards:**

```
Team view:
- Quota used (this month, YTD)
- Job queue (how long until my job runs?)
- Storage usage
- Checkpoint recovery success rate

Admin view:
- Cluster utilization (target 60-70%)
- Fairness index (Jain's: target > 0.85)
- Job distribution (duration, GPU count)
- Node health (failures, maintenance)
```

**Alert thresholds:**

```
- Fairness < 0.8 → deprioritize over-quota teams
- Utilization < 50% for 1 week → growth opportunity
- Utilization > 90% → scale cluster or reduce quotas
- Failed checkpoint recovery > 5% → investigate storage
```

## Interview Verification Checklist

- [ ] Understood workload characteristics (bursty, unpredictable)
- [ ] Designed fair-share algorithm (weighted by contribution)
- [ ] Planned preemption strategy (graceful, with checkpointing)
- [ ] Designed resilience (tiered checkpointing, failure recovery)
- [ ] Calculated cost and identified scaling challenges
- [ ] Explained fairness metrics and monitoring
- [ ] Addressed concerns about user experience and acceptance

## Common Follow-ups

**"A team's long job is preempted every 2 hours. How do you prevent this?"**

Answer:
1. Increase their quota (buy more GPU time)
2. Reduce cluster over-subscription (accept lower utilization)
3. Prioritize long jobs (age-based: older jobs get priority)
4. Offer "reserved" time slot (e.g., 3 AM - 7 AM exclusive)

**"One team funds the entire cluster. Do they get priority?"**

Answer:
- Yes, via contribution-weighted quotas
- But: fairness prevents monopoly
- All teams get minimum (e.g., 10 GPU-hours/month)
- Excess quota (for funding team) is flexible
- This keeps small teams engaged

**"Fairness algorithm seems complex. Can you simplify?"**

Answer:
- Simplified: FIFO queue with per-team max (hard limits)
- Tradeoff: No deficit tracking, can't borrow from future
- Pros: Simple to implement, teams understand limits
- Cons: Underutilization (no flexibility), less fairness

## Key Concepts

**Fair-share in distributed systems:**
- Deficit tracking allows bursty usage
- Priority by deficit smooths demand
- Requires monthly reconciliation

**Preemption for research workloads:**
- Must be graceful (not forced)
- Checkpointing is essential
- Long jobs get protection from frequent preemption

**Storage for research:**
- Tiered (local → NFS → tape)
- Enables recovery from different failure modes
- Overhead: < 5% for typical workloads

## Related Chapters

- **Chapter 6:** [GPU Sharing](./chapter-06-gpu-sharing-and-virtualization.md) — fairness and isolation
- **Chapter 7:** [Kubernetes Scheduling](./chapter-07-kubernetes-and-container-orchestration.md) — scheduler design
- **Chapter 9:** [Cluster Operations](./chapter-09-cluster-operations-and-capacity-planning.md) — hardware and cost planning
- **Volume 21:** AI Factory (reference architectures)

---

## Volume 23 Conclusion

This volume covered 12 chapters of GPU systems engineering interview preparation:

**Chapters 1-6 (Technical Depth):**
- GPU architecture, CUDA optimization, distributed systems, observability, performance analysis, GPU sharing

**Chapters 7-9 (Infrastructure & Operations):**
- Kubernetes scheduling, security & compliance, cluster operations & capacity planning

**Chapters 10-12 (System Design):**
- Training clusters, inference serving, research infrastructure

Each chapter included real interview questions, model answers, follow-up traps, verification points, and practical guidance. Total: 50+ interview questions, 50+ first-person explanations, 15+ system design walkthroughs, 20+ follow-up traps.

Use this material to:
1. **Study:** Work through chapters 1-9 sequentially
2. **Practice:** Tackle system design questions (chapters 10-12) in groups
3. **Interview:** Reference the model answers and reasoning frameworks
4. **Teach:** Use as mentorship material for junior engineers

Good luck with your interviews!

