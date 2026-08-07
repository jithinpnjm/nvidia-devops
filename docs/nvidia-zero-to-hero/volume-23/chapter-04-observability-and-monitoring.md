# Chapter 4: Observability and Monitoring

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Intermediate |
| Estimated reading time | 60 minutes |
| Primary audience | Operations engineers, DevOps, platform teams |
| Core question | How do you measure, monitor, and diagnose GPU infrastructure? What metrics matter? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Design SLOs and SLIs for GPU workloads
- Interpret GPU metrics (utilization, throttling, memory, thermal)
- Diagnose incidents using observability signals
- Design alerting rules that catch real problems without false positives
- Monitor distributed training systems
- Measure cost per compute unit ($/FLOP, $/iteration)

## The Observability Framework

GPU monitoring requires metrics at four levels:

```
┌────────────────────────────────────────────────┐
│ Application Level (training progress)          │
│ - Iterations per second, loss, convergence     │
├────────────────────────────────────────────────┤
│ System Level (resource utilization)            │
│ - GPU/CPU/memory/network utilization           │
├────────────────────────────────────────────────┤
│ Hardware Level (device telemetry)              │
│ - Temperature, power, clock throttling         │
├────────────────────────────────────────────────┤
│ Network Level (communication overhead)         │
│ - AllReduce time, bandwidth, packet loss       │
└────────────────────────────────────────────────┘
```

## Key Metrics and SLOs

### Throughput Metrics

| Metric | Definition | Target | Why it matters |
|---|---|---|---|
| **Iterations/sec** | Training steps per second | Varies (LLM: 100-1000) | Direct measure of training speed |
| **Samples/sec** | Data samples processed per second | Varies (depends on batch size) | Billing metric for cloud |
| **FLOPS utilization** | Actual FLOPS ÷ peak FLOPS | > 70% | Indicates compute efficiency |
| **Memory bandwidth** | GB/s achieved ÷ peak | > 60% | Indicates memory efficiency |

### Quality Metrics

| Metric | Definition | Target | Why it matters |
|---|---|---|---|
| **Loss convergence** | Training loss decreases monotonically | Smooth, no spikes | Detects hanging GPUs, bad gradient |
| **Gradient distribution** | Mean/std of gradients | Stable across ranks | Detects gradient explosion/vanishing |
| **Gradient sync time** | AllReduce latency | Consistent | Detects network congestion |
| **Step duration** | Wall-clock time per iteration | Stable | Detects imbalance, throttling |

### Reliability Metrics

| Metric | Definition | Target | Why it matters |
|---|---|---|---|
| **GPU health** | Thermal throttling, power limit events | 0 events | Indicates cooling/power issues |
| **Error rate** | Failed synchronization, NaN gradients | < 0.1% | Detects hardware/software faults |
| **Uptime** | Time between restarts | > 99% (SLA) | Business metric |
| **Mean Time To Recovery (MTTR)** | Time to detect and recover from failure | < 5 min | Operational efficiency |

## SLO Design Examples

### Training Throughput SLO (for a managed training platform)

```
Service Level Objective:
- 99% of training jobs complete within their estimated time ±10%
- 95% of batches processed within < 500ms per batch (p99)
- Gradient synchronization takes < 5% of total iteration time

Service Level Indicator (SLI):
- Measure actual batch processing time every iteration
- Measure AllReduce time independently
- Compare to baseline (first 10 iterations establish baseline)

Alert if:
- Batch time > baseline × 1.2 for 3 consecutive iterations
- AllReduce time > baseline × 1.5
- Gradient contains NaN
```

### Multi-GPU Training SLO (distributed system)

```
Objective:
- All GPUs in a job remain synchronized (no rank ahead of others)
- Gradient sync completes within expected time (algorithm-dependent)
- No GPU exceeds thermal or power limits during training

Indicator:
- Measure step duration on each GPU independently
- Measure step_duration.max ÷ step_duration.min
- Alert if ratio > 1.1 (10% skew = imbalance)
- Monitor power draw per GPU
- Monitor temperature per GPU
```

## Interview Questions

### Question 1: Designing an SLO for a GPU Cluster

**Scenario:** "You operate a shared GPU cluster for 50 data science teams. Each team trains their own models. You want to define an SLO for 'job turnaround time.' What would you measure, and what would you set as targets?"

**Model Answer (3.5 minutes):**

"This is tricky because different teams have different needs. Let me break it down:

**Business constraint:** Teams want predictable turnaround. But GPUs are shared, so contention is inevitable. I need to define fairness.

**SLO for job turnaround:**

```
99% of GPU-bound jobs (jobs that use 70%+ GPU) that are queued
complete within their baseline time + 20%.

Baseline time = time on a dedicated A100 in perfect conditions
(measured by running benchmark job on empty cluster)
```

**How to measure:**

1. **Baseline:** Run reference ResNet-50 job on empty cluster → 45 minutes
2. **SLI:** Every submitted job is compared to baseline
3. **Metric:** 

```
job_duration_ratio = actual_duration / baseline_duration
Alert if job_duration_ratio > 1.2 for jobs > 30 minutes
```

**Why this works:**

- **Percentile matters:** 99% SLO allows occasional long-running jobs (1 in 100 can be slow)
- **Baseline normalization:** Accounts for different job sizes
- **20% buffer:** Realistic for shared systems (contention, scheduling overhead)
- **GPU-bound filter:** Don't count I/O-bound jobs (they sit idle anyway)

**Enforcement:**

- If a job exceeds 1.2× baseline, automatically:
  1. Alert on-call engineer
  2. Check if it's due to cluster contention (query other jobs running)
  3. If yes, deprioritize other jobs or kill low-priority jobs to unblock
  4. If no, investigate the job itself (bad code, bug, etc.)

**Secondary SLO (resource allocation fairness):**

```
Each team's GPU quota is enforced: 
- Team A: 20 GPUs max concurrent
- Team B: 15 GPUs max
- etc.

Alert if any team exceeds quota for > 1 minute (grace period for rounding)
```

**Cost SLO (dollars per training hour):**

```
Target: < $10/GPU-hour (including facilities, power, ops staff)
Measure: (total_facility_cost / month) / (total_GPU_hours / month)
```

This ensures we're not wasting money on idle GPUs."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Baseline normalization | Jobs vary in size; SLO must account for this |
| Percentile-based SLOs | 99% is realistic; 100% is impossible |
| Alert thresholds | Must distinguish real problems from normal variance |
| Fairness metrics | Prevent one team from starving others |

**Follow-up Trap:** "Why not use 100% as the SLO?"

**Corrective answer:** "Impossible. Shared systems have contention. At some point, every job gets delayed. 99% is aggressive but achievable. 100% would require over-provisioning by 50%+ to account for worst-case contention."

**Verification Point:** Can the candidate define realistic SLOs, choose appropriate SLIs, and set alert thresholds?

---

### Question 2: Diagnosing Slow Training

**Scenario:** "A training job that normally takes 2 hours is now taking 3 hours. Profiling data: GPU utilization is still 85%, batch processing time is unchanged, but gradient synchronization time increased from 2 sec to 8 sec. What's wrong?"

**Model Answer (2.5 minutes):**

"Gradient sync time is the bottleneck. It's increased 4×. This points to network congestion.

**Diagnostic steps:**

1. **Check if it's inter-GPU or inter-node:**
   - If all 8 GPUs on one node: NVLink (600 GB/s) shouldn't throttle
   - If GPUs are on different nodes: InfiniBand/Ethernet (25-100 GB/s) is the constraint

2. **Check network traffic:**
   ```bash
   ibnetdiscover  # InfiniBand status
   ethtool -S eth0  # Ethernet stats
   netstat -i  # Overall link utilization
   ```
   Expected: If 1.2 GB gradients × 8 GPUs × 25 GB/s link → ~5 sec. Actual 8 sec suggests congestion.

3. **Check other jobs on the cluster:**
   ```bash
   nvidia-smi process  # What else is running?
   nccl-tests bandwidth  # Measure actual AllReduce bandwidth
   ```
   If another job is running AllReduce simultaneously, links saturate.

4. **Check NCCL algorithm:**
   ```
   export NCCL_DEBUG=INFO  # Logs which algorithm NCCL chose
   ```
   If it's using naive algorithm instead of optimized tree/ring, that's the problem.

**Most likely causes (in order):**

1. **Network contention (50%):** Another job is using the same links
   - Fix: Kill other job or wait for it to complete

2. **Suboptimal NCCL algorithm (30%):** NCCL picked wrong algorithm
   - Fix: Set environment variable `NCCL_ALGO=Ring` or `NCCL_ALGO=Tree`

3. **Hardware failure (15%):** One link degraded from 25 GB/s to 6 GB/s
   - Fix: Replace network card or GPU

4. **Kernel bug (5%):** Gradient size increased due to bug
   - Fix: Check model weights size (run `model.numel() * 2 / 1e9` for FP16)

**Recommended order of investigation:**

1. Measure actual AllReduce time with nccl-tests (5 min)
2. Check for other jobs running (1 min)
3. Check NCCL algorithm setting (1 min)
4. If still slow, hardware investigation (30 min)"

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Gradient sync is critical path | 8 sec out of 120 sec = 6.7% overhead, but it grows with scale |
| Network bandwidth contention | Shared links mean other jobs impact your performance |
| NCCL algorithm selection | Automatic, but can be overridden if suboptimal |
| Reproducibility | Run same job on different cluster or time to validate |

**Follow-up Trap:** "Can't I just increase network bandwidth?"

**Corrective answer:** "Yes, but expensive. Upgrading from 25 GB/s (single EDR IB) to 100 GB/s (HDR IB) or 200 Gbps Ethernet costs $50K per node. First, fix algorithmic issues (NCCL tuning, job scheduling). Network upgrades are last resort."

**Verification Point:** Can the candidate diagnose distributed training slowdowns using systematic profiling?

---

### Question 3: Calculating Cost Per Training

**Scenario:** "Your cluster costs $2M/year to operate (power, cooling, amortized hardware). Last month you ran 10,000 GPU-hours of training. What's the cost per GPU-hour? What's the cost per training iteration for a job that runs 100K iterations on 8 GPUs?"

**Model Answer (2 minutes):**

"**Cost per GPU-hour:**

```
$2M/year ÷ (365 days × 24 hours) = $228/GPU-hour

Wait, that seems high. Let me recalculate:
$2M ÷ 365 days ÷ 24 hours = $228/hour total cost
If cluster has 256 GPUs: $228 ÷ 256 = $0.89/GPU-hour

Hmm, that's too low. Let me think differently:
$2M/year ÷ (365 × 24) = $228/hour for entire facility
Assuming 256 GPUs running 8,760 hours/year = 2.2M GPU-hours theoretical max
Actual used: 10,000 GPU-hours/month × 12 = 120,000 GPU-hours/year (5% utilization)

Cost per GPU-hour = $2M ÷ 120,000 = **$16.67/GPU-hour**
```

That's realistic for on-prem infrastructure (includes staff, power, cooling, space, capital amortization).

**Cost per iteration (100K iterations, 8 GPUs):**

```
Job duration: 100K iterations × 8 GPUs × time_per_iter
Assume 5 sec per iteration on 8 GPUs = 500,000 sec = 139 hours
At $16.67/GPU-hour × 8 GPUs = $133/hour
Total cost: $133 × 139 hours = **$18,487**

Per iteration: $18,487 ÷ 100,000 = **$0.185 per iteration**
```

**Optimization opportunities:**

1. **Increase cluster utilization:** Currently at 5%. Target 70%.
   - Cost per GPU-hour drops to $2.38
   - Cost per iteration drops to $0.027

2. **Optimize training speed:** Each second saved is money.
   - 1 sec saved × 139 hours × 8 GPUs × $2.38 = **$26 saved**

3. **Use cheaper GPUs (if appropriate):** L40S instead of A100
   - Hardware cost: 30% cheaper
   - But slightly slower (maybe 15% longer training)
   - Net: 15-20% cost savings

**Visualization:**

```
Current cost model:
- Facility cost (amortized): $10/GPU-hour
- Power: $4/GPU-hour
- Staff (ops): $2/GPU-hour
- Software: $0.67/GPU-hour
Total: $16.67/GPU-hour
```

This breakdown shows where to optimize."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Utilization drives cost | Low utilization spreads fixed costs over fewer GPU-hours |
| Cost per iteration | Directly impacts training budget and ROI |
| Infrastructure amortization | 3-5 year hardware lifetime means 20-33% annual cost |
| Optimization ROI | $0.185/iteration × 100K = $18.5K. A 1% speedup saves $185. |

**Follow-up Trap:** "If I buy more expensive GPUs (H100 vs. L40S), does training cost more?"

**Corrective answer:** "Yes and no. H100 costs 3-4× more per GPU, but trains 2-3× faster. Net effect: H100 training costs 1.5-2× more total, but trains faster. If you have a deadline, H100 is worth it. If you have flexible timing, L40S is cheaper."

**Verification Point:** Can the candidate calculate infrastructure cost per GPU-hour and understand cost drivers?

## Monitoring Best Practices

**Alert rules (examples):**

```yaml
GPU_THROTTLE_ALERT:
  condition: throttle_events > 0
  action: Page on-call, check cooling
  
GRADIENT_NAN_ALERT:
  condition: gradient_contains_nan
  action: Kill job, investigate loss explosion
  
ALLREDUCE_SLOW_ALERT:
  condition: allreduce_time > baseline × 1.5
  action: Alert ops, check network
  
MEMORY_PRESSURE_ALERT:
  condition: gpu_memory_percent > 95%
  action: Reduce batch size (if possible) or kill job
```

**Dashboards (what to track):**

1. **Cluster health:** Utilization, temperature, power, throttling events
2. **Job health:** Throughput, convergence, gradient distribution
3. **Network health:** AllReduce time, bandwidth, packet loss
4. **Cost:** GPU-hours per day, cost per job, utilization trend

## Related Chapters

- **Chapter 3:** [Multi-GPU and Distributed Systems](./chapter-03-multi-gpu-and-distributed-systems.md) — communication metrics
- **Chapter 8:** [Security and Compliance](./chapter-08-security-and-compliance.md) — audit and compliance monitoring
- **Chapter 9:** [Cluster Operations](./chapter-09-cluster-operations-and-capacity-planning.md) — capacity and cost
- **Volume 16:** Observability (deep dive)

