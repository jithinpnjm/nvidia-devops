# Chapter 6: GPU Sharing and Virtualization

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Advanced |
| Estimated reading time | 70 minutes |
| Primary audience | Infrastructure engineers, platform teams |
| Core question | How do you share GPUs safely and fairly? What are the isolation, performance, and cost trade-offs? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Explain MIG (Multi-Instance GPU) architecture and use cases
- Design time-slicing strategies for GPU sharing
- Understand isolation guarantees and failure modes
- Estimate performance impact of sharing
- Make cost vs. isolation trade-offs
- Design fair resource allocation policies

## GPU Sharing Strategies

### Multi-Instance GPU (MIG)

MIG partitions a GPU into independent instances. Each instance has dedicated compute, memory, and cache.

**Architecture (A100 example):**

```
A100 GPU (80 GB memory, 432 CUDA cores per partition)

┌─────────────────────────────────────────────────────┐
│ A100 GPU (40 SMs, 640 GB/s bandwidth)              │
├─────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│ │ MIG-1  │ │ MIG-2  │ │ MIG-3  │ │ MIG-4  │       │
│ │ 1/4 GPU│ │ 1/4 GPU│ │ 1/4 GPU│ │ 1/4 GPU│       │
│ │ 10 SMs │ │ 10 SMs │ │ 10 SMs │ │ 10 SMs │       │
│ │ 20 GB  │ │ 20 GB  │ │ 20 GB  │ │ 20 GB  │       │
│ └────────┘ └────────┘ └────────┘ └────────┘       │
│                                                     │
│ L2 Cache (shared, fair-sharedacross instances)    │
│ HBM (40 GB per instance, independent)             │
└─────────────────────────────────────────────────────┘
```

**Key properties:**

| Property | Value | Implication |
|---|---|---|
| **Profiles available** | 7×MIG-1g (8GB), 3×MIG-2g (16GB), 2×MIG-3g (28GB), 1×MIG-7g (40GB) | Choose granularity matching workload |
| **Isolation** | Compute SM partitioning, memory isolation | One instance doesn't starve others |
| **Switching overhead** | ~1-2 seconds per context switch | Suitable for batch workloads, not real-time |
| **Performance** | ~95-99% of full GPU (L2 cache shared) | Minimal overhead |
| **Max instances** | 7 per GPU (MIG-1g profile) | High parallelism for small jobs |

### Time-Slicing

Time-slicing preempts jobs and switches between them, amortizing GPU cost.

**Comparison:**

| Feature | MIG | Time-Slicing |
|---|---|---|
| Isolation | Hardware (SM-level) | Software (context switching) |
| Overhead | < 1% | 3-10% (context switch cost) |
| Latency guarantee | Yes (dedicated SMs) | No (subject to scheduling) |
| Fairness | Hard partition | Scheduler-based |
| Setup time | ~1 second | Immediate |
| Use case | Production with SLA | Batch/interactive development |

## Interview Questions

### Question 1: Choosing MIG vs. Time-Slicing

**Scenario:** "Your company has mixed workloads: (1) interactive Jupyter notebooks (5-10 users, 2-4 hour sessions), (2) training jobs (1-2 hours, strict SLA targets). You have 8 A100s and want to maximize utilization and fairness. How do you allocate them?"

**Model Answer (4 minutes):**

"This is a classic resource allocation problem. Let me analyze the workloads:

**Workload A: Interactive notebooks**
- Duration: 2-4 hours
- Resource needs: Unpredictable (user-dependent)
- SLA: Soft (users tolerate 1-2 second latency)
- Pattern: Bursty, with idle time between commands

**Workload B: Training jobs**
- Duration: 1-2 hours
- Resource needs: Predictable (fixed batch size)
- SLA: Strict (must complete in time budget)
- Pattern: Steady 90%+ GPU utilization

**Resource strategy:**

I'd allocate:
- **4 A100s to training jobs** with MIG disabled (dedicated SMs)
- **4 A100s to interactive notebooks** with time-slicing enabled

**Why:**

1. **Training jobs need predictability:**
   - Strict 1-2 hour SLA requires isolated GPU resources
   - MIG guarantees 95%+ performance
   - No context-switching overhead

2. **Interactive notebooks tolerate sharing:**
   - Users accept 2-5 second response time between commands
   - Time-slicing overhead (3-10%) is acceptable for interactive workloads
   - Can support 8-16 concurrent users on 4 GPUs via time-slicing

3. **Cost efficiency:**
   - Training GPUs: 4 × 95% utilization = 3.8 GPU-equivalents
   - Notebook GPUs: 4 × 60% utilization (due to idle time) × 7 users × 1.03x overhead = 2.6 GPU-equivalents
   - Total: 6.4 GPU-equivalents of productive work (vs. 8 GPUs)
   - Utilization: 80%

**Resource enforcement:**

```yaml
ResourceQuota:
  training-team:
    GPUs: 4 A100s
    Memory: 160 GB (40 GB × 4)
    SLA: 95% uptime, < 2 hour training
    
  notebook-users:
    GPUs: 4 A100s (time-sliced)
    Memory: 80 GB shared (10 GB per user × 8 concurrent)
    SLA: < 5 second response to commands (soft)
```

**Monitoring:**

- Training: Track job completion time, flag any SLA misses
- Notebooks: Track queue length for GPU access, alert if > 3 users waiting

**Evolution:**

If training workload grows and needs 6 GPUs, I'd:
1. Reduce notebook resources to 2 GPUs (still supports 5-8 users with time-slicing)
2. Or, recommend adding 2 GPUs total (cost vs. SLA trade-off)"

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Workload characteristics drive strategy | SLA-sensitive = dedicated. Best-effort = shared. |
| MIG overhead is minimal | 1-5% performance cost for hardware isolation |
| Time-slicing scales to many users | 8-16 concurrent low-resource jobs on 4 GPUs |
| Cost trade-off | Sharing increases utilization but reduces isolation |

**Follow-up Trap:** "Why not put everything on time-slicing and save cost?"

**Corrective answer:** "Time-slicing introduces unpredictability. Training jobs might miss SLA due to context-switch delays. MIG guarantees 95%+ performance, which is worth the reduced utilization. It's a classic reliability vs. efficiency trade-off."

**Verification Point:** Can the candidate match resource allocation strategy to workload characteristics?

---

### Question 2: Isolation Failures in Shared GPU Systems

**Scenario:** "You're running two jobs on the same GPU via time-slicing: Job A (training) and Job B (inference). Job A occasionally hits spikes in memory usage, causing OOM errors, even though Job B is not memory-intensive. Why is isolation failing?"

**Model Answer (2.5 minutes):**

"Time-slicing shares memory and caches. When Job A's context switches out, its GPU memory stays allocated. If Job A allocates peak memory during one epoch, then Job B starts, they're competing for the same 40 GB.

**Memory layout:**

```
GPU Memory (40 GB):
┌─────────────────────────────────┐
│ Job A: 25 GB (sometimes peaks   │
│        to 30 GB during forward)  │
├─────────────────────────────────┤
│ Job B: 12 GB (inference model)  │
├─────────────────────────────────┤
│ Free: 3 GB (OOM!)               │
└─────────────────────────────────┘
```

When Job A hits 30 GB:
- Remaining: 10 GB
- Job B needs 12 GB
- OOM error

**Why isolation failed:**

1. **Soft memory limits:** Time-slicing doesn't enforce per-job memory budgets. It's best-effort.
2. **Memory fragmentation:** Job A's memory might be fragmented, requiring defrag (which blocks Job B).
3. **Peak vs. average:** Job A uses 25 GB on average but 30 GB at peak. No reservation for that peak.

**Solutions (in order of effectiveness):**

| Solution | Cost | Difficulty | Isolation |
|---|---|---|---|
| **MIG (hardware isolation)** | None (same GPU) | Easy | Perfect isolation |
| **Cgroups memory limits** | Software overhead ~2% | Medium | Enforced limits per container |
| **Job scheduling (don't co-schedule)** | Reduced utilization | Easy | Prevent resource conflict |
| **Memory pooling + preallocation** | Complexity | Hard | Predictable memory usage |

**Recommended fix:**

If only time-slicing is available (no MIG support), enforce memory limits via cgroups:

```bash
# Limit Job A to 28 GB
cgcreate -g memory:/jobA
echo 28G > /cgroup/memory/jobA/memory.limit_in_bytes

# Limit Job B to 10 GB
echo 10G > /cgroup/memory/jobB/memory.limit_in_bytes
```

This way:
- Job A can use up to 28 GB
- Job B has guaranteed 10 GB
- Free: 2 GB for kernel and overhead

**If this is production:**
Use MIG instead. Hardware isolation is worth the ~5% performance loss."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Soft limits can fail | Time-slicing trusts jobs to stay within bounds |
| Peak vs. average memory | Isolated systems must reserve for peak, not average |
| Cgroups enforce limits | Linux kernel-level memory enforcement |
| MIG removes ambiguity | Hardware partition means no sharing, no OOM surprises |

**Follow-up Trap:** "Can I use GPU memory compaction to prevent fragmentation?"

**Corrective answer:** "GPU memory compaction is expensive (~10-50ms). On time-sliced systems, triggers during context switch would stall both jobs. It's a workaround, not a solution. Real fix is MIG or strict memory limits."

**Verification Point:** Can the candidate diagnose isolation failures and propose layered mitigation strategies?

---

### Question 3: Fair Resource Allocation Under Sharing

**Scenario:** "You run a GPU cluster with time-slicing. 10 users submit jobs; some are fast (1 minute), some are slow (30 minutes). How do you ensure fairness? What policy would you use?"

**Model Answer (3 minutes):**

"Fairness in shared systems is non-trivial. Different policies optimize for different goals:

**Policy 1: FIFO (First In, First Out)**

```
Queue: [Fast-1, Slow-1, Fast-2, Slow-2, ...]
Execution: Fast-1 (1 min) → Slow-1 (30 min) → ...
```

**Pros:** Simple
**Cons:** Slow jobs starve fast jobs. Average wait time is high.
**Fairness metric:** FIFO is unfair to short jobs

**Policy 2: Fair Share (proportional)**

```
Each user gets equal GPU time
User A gets 5 minutes GPU time, then User B gets 5 minutes
Even if A's job is still running
```

**Pros:** Ensures no user starves
**Cons:** Frequent context switches increase overhead
**Fairness metric:** Proportional fairness (good for multi-user systems)

**Policy 3: Priority Queue (by job duration)**

```
Queue sorted by: estimated_duration
Short jobs (< 5 min) run first, then medium, then long
```

**Pros:** Minimizes average wait time
**Cons:** Long jobs might starve
**Fairness metric:** Minimize flow time (weighted by job size)

**Recommended: Hybrid policy**

```yaml
Scheduling:
  - Priority 1 (highest): Jobs < 5 minutes (preempt immediately)
  - Priority 2: Jobs 5-30 minutes (preempt after 15 min)
  - Priority 3: Jobs > 30 minutes (preempt after 30 min, low frequency)
  - Fairness: Round-robin among same-priority jobs

Prevents:
  - Short jobs starving (P1 preempts)
  - Long jobs starving (minimum run time before preemption)
  - Excessive context switches (limited to 3-4 per hour)
```

**Fairness measurement:**

```
Jain's Fairness Index = (sum(wait_time))^2 / (N × sum(wait_time^2))
Range: 0 (unfair) to 1 (perfectly fair)
Target: > 0.8

Measure weekly and alert if < 0.75
```

**Example trace:**

```
Time  Event
 0    Fast-1 submitted
 1    Fast-1 starts
 2    Slow-1 submitted (waits 8 min)
 5    Fast-2 submitted
 8    Slow-1 starts (waited 8 min), Fast-2 waits in priority queue
15    Fast-2 preempts Slow-1 (priority), runs 1 min
16    Slow-1 resumes (guaranteed rotation)
30    Fast-1, Fast-2 done
35    Slow-1 done

Fairness: Fast jobs run < 2 sec latency, Slow jobs get rotation
```

**If unfairness persists:**

1. **Increase GPU count** → reduce contention
2. **Separate workload tiers** → critical jobs get dedicated GPUs
3. **Implement backpressure** → reject jobs if queue > threshold"

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Fairness policies affect all users | FIFO starves short jobs. Need adaptive scheduling. |
| Preemption is a tool | Balance between fairness and context-switch overhead |
| Measurement drives policy | Jain's index lets you quantify fairness |
| Long-tail jobs are hard | 30-minute jobs need protection against starvation |

**Follow-up Trap:** "Why not just give each user their own GPU?"

**Corrective answer:** "Cost. 10 users × 1 GPU = $10/month per user (at cloud prices) vs. 2 GPUs shared = $2/month per user. Sharing is 5× cheaper. Fair scheduling trades cost savings for complexity."

**Verification Point:** Can the candidate design fair scheduling policies and measure fairness quantitatively?

## Isolation Verification Checklist

Before deploying shared GPU systems:

- [ ] Measure baseline performance on full GPU
- [ ] Measure performance with sharing (MIG or time-slicing)
- [ ] Verify no jobs can starve others (resource limits)
- [ ] Test failure mode (what if one job crashes?)
- [ ] Verify fair resource distribution (scheduler fairness)
- [ ] Measure cost per unit ($/training hour, $/inference)

## Related Chapters

- **Chapter 7:** [Kubernetes and Container Orchestration](./chapter-07-kubernetes-and-container-orchestration.md) — resource scheduling
- **Chapter 9:** [Cluster Operations](./chapter-09-cluster-operations-and-capacity-planning.md) — capacity planning with sharing
- **Volume 11:** GPU sharing (deep dive)

