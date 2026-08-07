# Chapter 10: System Design — Training Cluster

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Expert |
| Estimated reading time | 90 minutes |
| Primary audience | Staff/principal engineers, system architects |
| Core question | How do you design a large-scale GPU training cluster? Requirements → architecture → trade-offs. |

## Interview Question: Design a 1000-GPU Training Cluster

**Constraints (given in interview):**

- Support 100 concurrent training jobs
- Models range from 1B to 500B parameters
- Training duration: 1 day to 3 months
- Data: 10-100TB per job (stored on external storage)
- SLA: 99% job completion within time budget
- Team: Ops team of 5 engineers
- Budget: $15M CapEx, $5M/year OpEx

**Walkthrough (15-20 minute verbal answer):**

### Phase 1: Understand Requirements (3 minutes)

**Key questions to clarify:**

1. **Data locality:** Are datasets local (NVMe in cluster) or remote (S3, GCS)?
   - Remote → need fast network (100Gbps InfiniBand)
   - Local → need 2-3 TB NVMe per GPU node

2. **Failure tolerance:** Can training jobs resume from checkpoints?
   - Yes → cluster can be less stable, more aggressive scheduling
   - No → must be rock-solid (impacts cost)

3. **Job priority:** Are all jobs equal, or does one team have priority?
   - Equal → fair scheduling required
   - Tiered → can use priority queues

**My analysis (assume answers):**

- Data is remote (S3)
- Jobs support checkpointing
- All jobs have equal priority
- Peak demand is 100 concurrent jobs × 8 GPUs avg = 800 GPUs active
- Allocate 1000 total (20% buffer for failed nodes, maintenance)

### Phase 2: Architecture Overview (4 minutes)

```
┌──────────────────────────────────────────────────────────┐
│ User Interface / Job Submission (Job REST API)          │
├──────────────────────────────────────────────────────────┤
│ Job Scheduler (Kubernetes + custom scheduler)           │
│ ├─ Queue: 100 pending jobs                              │
│ ├─ Allocate GPUs: Bin-packing + fairness                │
│ └─ Monitor: SLA compliance                              │
├──────────────────────────────────────────────────────────┤
│ GPU Cluster (1000 GPUs across 125 nodes, 8 GPUs/node)  │
│ ├─ Compute: Mix of H100 (training) and L40S (fallback) │
│ ├─ Network: 100Gbps InfiniBand between nodes             │
│ ├─ Storage: 50TB NVMe per node (checkpoints)            │
│ └─ Monitoring: Prometheus, Jaeger, custom metrics       │
├──────────────────────────────────────────────────────────┤
│ Storage Layer                                            │
│ ├─ S3 (data + shared weights)                           │
│ ├─ Shared NFS (experiment logs, metrics)                │
│ └─ Local NVMe (per-node checkpoints, intermediate data) │
└──────────────────────────────────────────────────────────┘
```

### Phase 3: Hardware Design (5 minutes)

**GPU choice:**

```
H100: $40K, 989 TFLOPS, 80GB VRAM
- For 1B-500B models? Overkill for small, essential for large
- Cost per TFLOP: $40 per TFLOP/sec

L40S: $12K, 362 TFLOPS, 48GB VRAM
- Adequate for 1B-100B models
- Cost per TFLOP: $33 per TFLOP/sec (better value!)

Decision: Mix
- 600 H100s ($24M) for large models (100B+)
- 400 L40S ($4.8M) for small-medium models (1B-100B)
- Total CapEx: $28.8M (over-budget!)

Re-optimize:
- 500 H100s ($20M)
- 500 L40S ($6M)
- Total: $26M (still over)

Final:
- 400 H100s ($16M)
- 600 L40S ($7.2M) — some can't run large models
- Total: $23.2M → $15M budget allows only 375 GPUs!

Adjusted final:
- 250 H100s ($10M)
- 200 L40S ($2.4M)
- Total: $12.4M (under budget with $2.6M for infra)
- Limitation: Can only run 450 GPUs, not 1000

Alternative: Use all L40S ($7.2M for 600)
- Leaves $7.8M for compute, network, storage
- Can't train 500B models (no VRAM), but can run 1B-100B models
```

**Recommendation:**

Go with 400 H100s + 200 L40S, accept limitation that only 600 GPUs can run production jobs initially. Plan to scale to 1000 over 2-3 years as budget grows.

**Actually, re-read budget: $15M CapEx**

We need to get more aggressive:

```
Reality check:
- 1000 GPUs × $10K average = $10M hardware
- Network (InfiniBand): 125 nodes × $5K = $625K
- Storage (NVMe): 125 nodes × $20K = $2.5M
- Servers/CPU: 125 nodes × $3K = $375K
- Cooling/power: $1M

Total: $14.5M → FITS in $15M!

Hardware allocation:
- 700 L40S ($8.4M) — cost-effective, runs most models
- 300 used as inference pool or fallback? (no)
  
Revised:
- 600 L40S ($7.2M)
- 200 L4 ($500K) — smaller, cheaper, for inference fine-tuning
- Network: $625K
- Storage: $2.5M
- Servers: $375K
- Power/cooling: $1M
Total: $12.7M ✓
```

### Phase 4: Communication and Synchronization (3 minutes)

**AllReduce bottleneck:**

For 100 concurrent jobs × 4-8 GPUs each = need multi-job AllReduce support.

**Network design:**

```
Topology: Fat tree (Clos network)
- Core switches (100Gbps): 4 switches
- Aggregation (40Gbps): 8 switches
- Edge (100Gbps per node): 125 nodes
- Over-subscription: 4:1 (core can handle 25% of all traffic)

Bandwidth per node: 100Gbps
For 8-GPU node: 100 Gbps ÷ 8 = 12.5 Gbps per GPU
AllReduce time for 1GB gradient: 1000 Mbps ÷ 12.5 Gbps = 80ms

Is this acceptable? 
- Compute time per iteration: 1-10 seconds
- AllReduce: 80ms = 1-8% overhead
- Yes, acceptable

Alternative (cheaper): Oversubscribed 10:1
- Cost: 50% savings
- AllReduce time: 800ms per gradient
- Overhead: 8-80% (unacceptable at scale!)
Don't do this for training; kills scaling efficiency.
```

**Use NCCL for gradient sync:**

```yaml
Environment:
  NCCL_DEBUG: INFO
  NCCL_SOCKET_IFNAME: eth0  # Use specific NIC
  NCCL_ALGO: Ring  # Ring AllReduce (bandwidth-optimal)
  NCCL_TREE_THRESHOLD: 10485760  # Use tree for < 10MB
```

### Phase 5: Fault Tolerance and Checkpoint Strategy (3 minutes)

**Failure modes:**

1. **Single GPU failure:** Job fails, restart on new GPU (loss = 1 iteration)
2. **Node failure:** Kill all 8 jobs on node, restart from checkpoint
3. **Network partition:** Kill affected jobs (data consistency)

**Checkpointing strategy:**

```python
# Every N iterations, save to NVMe (fast, local)
# Every M iterations, save to S3 (durable, remote)

checkpoint_local_every = 100  # Every 100 iterations to NVMe
checkpoint_remote_every = 1000  # Every 1000 iterations to S3

# Single GPU failure:
# - Loss: 100 iterations (100 seconds)
# - Recovery: Load from local checkpoint, resume

# Node failure:
# - Loss: 1000 iterations (10,000 seconds)
# - Recovery: Load from S3, resume (5-10 min overhead)

# Async upload to prevent stalling:
def async_checkpoint():
    torch.save({...}, '/nvme/checkpoint_local.pt')
    threading.Thread(target=lambda:
        s3.put_object(
            Bucket='checkpoints',
            Key=f'job-{job_id}/checkpoint-{step}.pt',
            Body=open('/nvme/checkpoint_local.pt', 'rb')
        )
    ).start()
```

**Expected downtime (SLA impact):**

- Mean time between failures: 1000 GPU-days (1 failure per 1000/8 = 125 days at full capacity)
- Mean time to recovery: 10 minutes
- Availability: 99.9% ✓

### Phase 6: Scheduling and Fairness (2 minutes)

**Scheduler design:**

```python
class GPUScheduler:
    def schedule(self, pending_jobs):
        # Bin-packing: minimize fragmentation
        # Fairness: ensure no team starves
        
        # Priority: large jobs first (harder to fit)
        sorted_jobs = sort_by(pending_jobs, key=lambda j: j.gpu_count, reverse=True)
        
        for job in sorted_jobs:
            nodes = select_best_nodes(job.gpu_count)
            if nodes:
                allocate_gpus(job, nodes)
            else:
                queue.append(job)  # Backlog
        
        # Fairness: teams with fewer running jobs get priority
        adjust_priority_by_team_load()
```

**SLA monitoring:**

```yaml
Alert if:
- job_queue_time > 30 minutes → scale up or deprioritize low-priority work
- job_completion_time > SLA × 1.1 → check for network congestion
- gpu_failure_rate > 5/month → hardware issue, replace
```

### Phase 7: Cost and ROI (1 minute)

```
CapEx: $15M
OpEx (annual): $5M (power: $2.5M, cooling: $1M, staff: $1.5M)

Return on investment:
- Training cost to user: $33/GPU-hour (OpEx amortized + CapEx)
- Cloud comparable (AWS SageMaker): $80+/GPU-hour
- Savings per user job: 2.4×

Break-even: 2 years (assuming 60% utilization)
Value: $5M/year in cost avoidance
```

## Interview Verification Checklist

- [ ] Clarified all constraints and trade-offs
- [ ] Calculated hardware costs and made trade-offs
- [ ] Designed network topology with bandwidth analysis
- [ ] Planned fault tolerance and checkpoint strategy
- [ ] Designed scheduler for fairness and SLA compliance
- [ ] Estimated cost and ROI
- [ ] Identified risks and mitigation strategies

## Common Follow-ups

**"You're over budget. How do you cut cost 20%?"**

Answer: Use all L40S (drop H100s). Sacrifice 500B model support. Cost: $7.2M, still adds $2M for network/storage, fits in $15M with tight margins.

**"You have only 600 GPUs. One team wants 400 GPUs for a job. How do you handle contention?"**

Answer: 
1. Queue the job for 8 hours (other jobs finish)
2. Or, ask team to split job into 2 × 200 GPU jobs
3. Or, prioritize: is this job critical? If yes, kill lower-priority jobs

**"Node failure mid-training. Job loses 1000 iterations. Is 99% SLA achievable?"**

Answer: 
- Mean time between failures: 1000 GPU-days
- Cluster size: 75 GPUs avg active (600 GPUs ÷ 8 utilization)
- Failures/day: 75 ÷ 1000 = 0.075 failures/day
- 99% SLA requires < 14 minutes downtime/day
- 1000 iterations × 1 sec/iter = 1000 sec = 16 min overhead
- Barely achievable; need better checkpoint strategy or higher MTBF

## Related Chapters

- **Chapter 3:** [Multi-GPU and Distributed Systems](./chapter-03-multi-gpu-and-distributed-systems.md) — AllReduce and scaling
- **Chapter 4:** [Observability and Monitoring](./chapter-04-observability-and-monitoring.md) — SLO design and metrics
- **Chapter 9:** [Cluster Operations](./chapter-09-cluster-operations-and-capacity-planning.md) — hardware selection

