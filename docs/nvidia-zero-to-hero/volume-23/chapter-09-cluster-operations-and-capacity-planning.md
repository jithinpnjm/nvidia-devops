# Chapter 9: Cluster Operations and Capacity Planning

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Intermediate |
| Estimated reading time | 70 minutes |
| Primary audience | Operations engineers, infrastructure managers, technical leads |
| Core question | How do you design GPU infrastructure for scale? What hardware choices, growth strategies, and cost models matter? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Choose GPU types based on workload requirements and cost trade-offs
- Forecast capacity needs and plan hardware refresh cycles
- Optimize cluster utilization and cost
- Design incident response for GPU failures
- Plan network upgrades and topology
- Balance CapEx and OpEx trade-offs

## GPU Hardware Selection Framework

### Workload-Driven GPU Choices

**Decision tree (simplified):**

```
Workload?
├─ Training (Data parallelism)
│  ├─ < 7B params, < 100B tokens/year → A100 80GB or H100
│  ├─ 7B-70B params, 100B-1T tokens/year → H100 (faster = cheaper ROI)
│  └─ > 70B params → H100 cluster (only option)
│
├─ Inference (Batch/streaming)
│  ├─ Low latency (< 50ms) → L40S (cost-efficient)
│  ├─ Throughput-focused → L40S or A100 (high memory helps)
│  ├─ Dense inference → H100 (high performance)
│  └─ Lightweight (< 10 tokens/sec) → L4 or RTX 5000 (power-efficient)
│
└─ Mixed (Training + Inference)
   ├─ Time-shared GPUs → A100 (versatile)
   ├─ Separate pools → H100 for training, L40S for inference
   └─ Inference at scale → Specialize; avoid splitting resources
```

## Interview Questions

### Question 1: Capacity Planning for Scale

**Scenario:** "You currently operate a 32-GPU cluster (16 A100s, 16 L40S for inference). Training demand is growing 40% YoY. You need to plan for 3 years of capacity. How do you size the cluster, plan hardware refreshes, and manage costs?"

**Model Answer (4 minutes):**

"This is a business and technical planning exercise.

**Demand forecast (3-year projection):**

```
Year 0 (current): 16 A100s (training workload)
  - Peak: 12 A100s simultaneously (80% utilization)
  - Daily: ~8 A100s avg
  
Year 1 (40% growth): 22.4 A100s → round to 24 GPUs
  - Need additional: 8 A100s
  
Year 2 (40% growth): 31.36 A100s → round to 32 GPUs
  - Need additional: 8 A100s
  
Year 3 (40% growth): 43.9 A100s → round to 48 GPUs
  - Need additional: 16 A100s
```

**Hardware refresh strategy:**

A100s are 2-year-old tech. H100 is faster. Should I refresh?

```
Analysis:
- A100: Cost $30K, Performance 300 TFLOPS training
- H100: Cost $40K, Performance 989 TFLOPS training (~3.3×)

Training speedup (40% shorter training) → 40% more throughput
This means H100 effectively costs: $40K ÷ 1.4 = $28.6K per effective GPU

Decision: Refresh to H100 in Year 2 when A100s are 3 years old
```

**Procurement plan:**

| Year | Action | A100s | H100s | L40S | Investment |
|---|---|---|---|---|---|
| 0 | Current | 16 | 0 | 16 | — |
| 1 | Add capacity | 16 | 8 | 16 | $320K (8 H100s × $40K) |
| 2 | Refresh A100s | 0 | 16 | 16 | $960K (refresh 16 A100→H100 + add 8 = 24 new H100s × $40K) |
| 3 | Add capacity | 0 | 32 | 16 | $640K (add 16 H100s × $40K) |

**Total 3-year CapEx: $1.92M** (gross hardware spend at $40K/H100; this does not net out any resale/trade-in value for the 16 retired A100s — if the vendor or a secondary market offers trade-in credit, state that assumption explicitly and subtract it from the Year 2 figure)

**Cost model (annual OpEx):**

```
Year 1:
- Hardware: 24 GPUs × $20,400/year (amortized $30K over 3 years + refresh fund) ≈ $490K/year
- Power: 24 GPUs × 400W = 9.6 kW; 9.6 kW × 8,760 hrs × $0.15/kWh ≈ $12.6K/year
  (the previous "$1.26M/year" was a 100x arithmetic error — treating kW as if it
  were already a $/year figure without doing the kWh conversion correctly)
- Cooling: $380K/year (kept as a fixed facility allocation, not literally recomputed
  as 30% of the corrected power line — data center cooling capacity is provisioned
  and billed independently of the exact GPU power draw)
- Staff (2 engineers at $200K + overhead): $500K/year
- Networking & storage: $100K/year
- Software licenses & observability: $50K/year
Total OpEx: ≈ $1.53M/year (was wrongly stated as $2.78M/year — the power line
alone accounted for most of the inflation)

Cost per GPU-hour: $1.53M ÷ (24 GPUs × 8,760 hours) ≈ $7.29/GPU-hour
```

**Utilization targets (to hit ROI):**

```
At 40% utilization: 24 × 8,760 × 0.4 = 84,058 GPU-hours/year
Cost per productive GPU-hour: $1.53M ÷ 84,058 ≈ $18.23/GPU-hour

Target: Get utilization to 60%+ to keep cost < $25/GPU-hour
Strategy: Sell spare capacity to other teams (cross-subsidize)
```

**Growth mitigation (avoid stranding capacity):**

- Year 1: Buy H100s (new standard) instead of A100s
- This future-proofs against obsolescence
- A100s become inference pool (end-of-life use case)
- By Year 3, phase out A100s entirely

**Risk mitigation:**

| Risk | Mitigation |
|---|---|
| Demand grows faster than 40% | Keep 20% spare capacity buffer; can add nodes within weeks |
| Demand grows slower | Sell GPU time to external customers |
| Technology leap (new GPU) | Keep H100s at least 2 years; refresh cycle overlaps |
| Power/cooling limits | Negotiate with data center; may need new facility |

**Bottom line:**

Plan for 3-year growth at current trajectory. Refresh to H100 in Year 2 (before A100s become obsolete). Maintain 20% spare capacity. Target 60%+ utilization to achieve cost efficiency."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Moore's law accelerates obsolescence | 2-year-old GPUs are often 50% less capable |
| Utilization drives ROI | Spare capacity is wasted money |
| Growth forecast informs procurement | Over-ordering wastes cash; under-ordering starves teams |
| Hardware refresh cycles | Plan for 3-4 year amortization, not 1 year |

**Follow-up Trap:** "Should we keep all A100s for backward compatibility?"

**Corrective answer:** "No. Old hardware costs the same to operate but performs 50-70% worse. Migrate workloads to H100; use A100s for non-critical jobs or sell them. Backward compatibility is not worth the operational cost."

**Verification Point:** Can the candidate forecast demand, optimize hardware choices, and build multi-year plans?

---

### Question 2: Incident Response and Failure Modes

**Scenario:** "It's 2 AM. Alerting fires: 'GPU 4 on node-5 has detected correctable memory errors (CECCs). If not addressed, it will corrupt model weights in 12-24 hours.' What do you do? How do you prevent this?"

**Model Answer (3 minutes):**

"CECCs (Correctable Error Correcting Codes) are early warning signs of GPU memory failure. 12-24 hours to act.

**Immediate response (next 10 minutes):**

1. **Check how many jobs are running on node-5:**
   ```bash
   kubectl get pods --field-selector spec.nodeName=node-5
   # If critical training job, need to migrate
   ```

2. **Determine impact:**
   - Is this the only GPU on node-5? (If yes, migrate everything)
   - Can we move jobs to other nodes? (Yes → do it now)
   - What's the SLA for affected jobs? (Strict → migrate. Flexible → monitor)

3. **Plan migration:**
   ```bash
   # Cordon node to prevent new pod scheduling
   kubectl cordon node-5
   
   # Drain pods gracefully (triggers PreStop hooks, checkpoints)
   kubectl drain node-5 --ignore-daemonsets --grace-period=300
   
   # Expected: Jobs checkpoint and restart on other nodes
   # If job can't migrate (no checkpointing), must kill it and rerun
   ```

4. **Order replacement:**
   - CECC GPU likely fails within 24 hours
   - Order replacement from supplier (1-2 week lead time)
   - In meantime, run node with GPU disabled

**Short-term fix (until replacement arrives):**

```bash
# Disable GPU 4 on node-5 (keep node operational for CPU jobs)
nvidia-smi -pm 1 -i 4  # Persistence mode
nvidia-smi -i 4 --query-gpu=index,name --format=csv  # Verify it's in use

# Update Kubernetes to exclude this GPU from allocation
kubectl patch node node-5 -p '{"spec":{"taints":[{"key":"nvidia.com/gpu","value":"damaged","effect":"NoSchedule"}]}}'

# Pods requesting GPUs won't schedule on node-5 (can still run CPU-only)
```

**Long-term prevention:**

```yaml
# Monitor CECC events globally
alert_rule:
  name: GPU_CECC_Detected
  condition: cecc_count > 0
  action:
    - Page on-call
    - Initiate node drain within 2 hours
    - Flag for hardware replacement

# Weekly report: 
# - Which GPUs had CECCs?
# - Which need replacement?
# - Failure trend analysis (which model numbers fail most?)
```

**Post-mortem (after replacement):**

1. **Hardware analysis:** Send failed GPU to NVIDIA for RMA
2. **Workload replay:** Did any jobs lose data? Check checkpoint logs.
3. **Preventive upgrade:** If other GPUs have high CECC count, replace batch of 4-5 GPUs proactively
4. **Process improvement:** Add CECC monitoring earlier; don't wait for device to fail completely

**Preventive strategy (best practice):**

```
Weekly CECC monitoring:
├─ 0-5 CECCs: Monitor
├─ 5-10 CECCs: Plan replacement
├─ 10+ CECCs: Replace immediately (risk of UE = unrecoverable error)

Quarterly GPU health report:
├─ Identify GPUs with trending CECC increase
├─ Proactively replace before failure
├─ 20% reduction in surprise failures
```

**Failure mode matrix:**

| Failure | Detection | Response Time | Impact |
|---|---|---|---|
| CECC events | Monitoring | &lt; 2 hours | Graceful drain, minimal impact |
| UE (uncorrectable error) | Immediate crash | Immediate | Job loses checkpoint, must restart |
| Power failure | Alert | Seconds | Entire node down, auto-restart |
| Overheating | Throttling | &lt; 1 min | Degraded performance, auto-migrate if threshold crossed |

The key is **early detection + fast response**. CECC gives 12-24 hours to act; use that window."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Early signals matter | CECCs predict failures; act before they happen |
| Graceful degradation | Drain node before complete failure |
| Checkpointing is essential | Without it, failed GPU = lost computation |
| Preventive replacement | Replace at 10 CECCs; cheaper than emergency replacement |

**Follow-up Trap:** "Can't we just run with CECCs and hope it doesn't fail?"

**Corrective answer:** "No. CECC → UE progression is common. A single UE can corrupt model weights silently. Training resumes with bad data, producing garbage models. Better to migrate and replace proactively."

**Verification Point:** Can the candidate design incident response and failure prevention strategies?

---

### Question 3: Cost Optimization and Utilization

**Scenario:** "Your cluster is running at 35% average utilization (12 out of 32 GPUs used). CFO says 'Utilization is too low; we're wasting money.' What's your analysis? How do you improve utilization without compromising SLA?"

**Model Answer (2.5 minutes):**

"35% utilization is low, but context matters. Let me investigate:

**First: Understand the utilization pattern**

```
Hour 9-11 AM:  85% (peak research jobs)
Hour 12-4 PM:  25% (students on lunch, batching jobs paused)
Hour 5-8 PM:   40% (evening inference)
Night/weekend: 5% (minimal activity)

Average: 35%
Baseline (if we shut down at night): ~50%
```

**Root cause of low utilization:**

1. **Batch job scheduling:** Teams batch jobs to run during peak hours only (9-11 AM)
2. **Resource hoarding:** Teams request 8 GPUs but use 4 (buffer for safety)
3. **Research workload:** Unpredictable; can't fill time between experiments

**Improvement strategies (prioritized by ROI):**

| Strategy | Impact | Effort | Cost |
|---|---|---|---|
| **Move to continuous batching** | +10-15% util | Low | None (process change) |
| **Offer "spot" capacity (preemptible)** | +8-12% util | Medium | Ops cost (churn) |
| **Sell external access** | +20%+ util | High | Sales + legal |
| **Consolidate small jobs** | +3-5% util | Low | None |
| **Time-slicing for interactive** | +5-8% util | Medium | Shared cluster ops cost |

**Recommended: Start with continuous batching**

```python
# Instead of: submit 8 GPU job, wait for completion
# Do this: stream jobs continuously with sliding window

# Current pattern:
9:00 AM: Submit big job (8 GPUs) → finishes 11:00 AM → idle until tomorrow
11:00 AM - 9:00 AM next day: 22 hours idle

# New pattern:
9:00 AM: Submit job-A (8 GPUs)
10:00 AM: Submit job-B (8 GPUs)  # While A still running
11:00 AM: A finishes, B still running; submit job-C
...

# Net effect:
- GPUs stay busy 9 AM - 5 PM without scheduling changes
- +30% throughput (3 jobs in space of 1)
```

**Utilization after optimization:**

```
Old (peak 85%, avg 35%):
- Wasted capacity 9-11 AM: 4 GPUs idle (safety buffer)
- Wasted capacity 12-5 PM: 24 GPUs idle (batch schedule)

New (continuous streaming):
- Peak 9-5 PM: 95% (8 GPUs fully subscribed, 4 buffer)
- Night: 10% (baseline monitoring jobs)
- Average: 50-55%

Improvement: 35% → 50% = +42% more throughput, 0 new GPUs
```

**Cost impact:**

```
Current cost: ≈$2.04M/year for 32 GPUs (scaling Question 1's corrected
24-GPU OpEx model of $1.53M/year by 32/24)
If utilization improves to 50%:
- Same cost, 42% more throughput
- Cost per GPU-hour at 35% avg utilization: $2.04M ÷ (32 × 8,760 × 0.35) ≈ $20.79/GPU-hour
- Cost per GPU-hour at 50% avg utilization: $2.04M ÷ (32 × 8,760 × 0.50) ≈ $14.55/GPU-hour
- So: $20.79 → $14.55 per GPU-hour (not $33 → $23, which carried over the
  chapter's uncorrected power-cost error)

Alternative: Reduce from 32 to 24 GPUs:
- Cost: ≈$1.53M/year (25% fewer GPUs → 25% lower cost, matching Question 1's
  corrected 24-GPU total directly)
- Utilization: 50% on 24 = same throughput as 35% on 32
```

**Change management:**

Before imposing this on teams:

1. **Soft-launch:** Offer 'continuous batch' as opt-in
2. **Incentivize:** Teams that use it get priority for new GPUs
3. **Monitor:** Track actual utilization gains per team
4. **Enforce:** Once proven, make it default (3-6 month rollout)

**If still need 20% more capacity reduction:**

```
Offer 'spot' GPUs (preemptible):
- 20% cheaper than reserved
- Suitable for fault-tolerant jobs (ML training with checkpointing)
- Trade: Can be killed on 5 minutes notice
- Usage: Fill off-peak hours (12-5 PM) with spot jobs

Expected: 10-15% additional utilization from spot capacity
```

**Final recommendation:**

Improve utilization to 50-55% through process changes (no CapEx), then re-assess. Don't cut capacity yet—growth might consume the spare."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Utilization has patterns | 9-11 AM peak ≠ all-day average; understand the shape |
| Batch scheduling is human problem | Fix process before buying more hardware |
| Spot capacity is leverage | Preemptible jobs fill off-peak hours cheaply |
| Don't over-rotate on utilization | 50% is healthy; allows for bursts and maintenance |

**Follow-up Trap:** "Should we cut to 24 GPUs to save cost?"

**Corrective answer:** "No, yet. Cutting capacity might create new bottleneck. If teams wait in queue > 1 hour for GPUs, you've hurt productivity. Better to improve scheduling first, then rightsizе."

**Verification Point:** Can the candidate analyze utilization patterns and propose targeted improvements?

## Related Chapters

- **Chapter 4:** [Observability and Monitoring](./chapter-04-observability-and-monitoring.md) — cost tracking and SLO
- **Chapter 7:** [Kubernetes and Container Orchestration](./chapter-07-kubernetes-and-container-orchestration.md) — resource scheduling
- **Volume 21:** AI Factory (reference architectures)

