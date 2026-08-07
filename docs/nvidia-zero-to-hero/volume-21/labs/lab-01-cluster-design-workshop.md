---
title: Lab 01 — Cluster Design Workshop
description: Design a production GPU cluster for given workload requirements. 120 minutes hands-on.
sidebar_position: 1
tags: [lab, cluster-design, workshop]
---

# Lab 01 — Cluster Design Workshop (120 min)

## Objective

Design a production GPU cluster (hardware, topology, software, operations) for a realistic workload. Apply Chapters 1–14 principles.

## Scenario

Your company (startup, $50M Series B) plans to:
1. Train a proprietary 100B-parameter LLM every 3 months (model refresh cycle)
2. Serve Llama-70B inference API (500 QPS peak, 99.5% SLA, <500ms p99 TTFT)
3. Run fine-tuning jobs for enterprise customers (100 concurrent LoRA trainers on 7B base)

Budget: $20M year 1 (CAPEX + OPEX combined)

## Design Phases (120 min total)

### Phase 1: Workload Characterization (20 min)

**Your tasks:**
1. Specify training requirements:
   - Model size, batch size, sequence length
   - Training duration, checkpointing frequency
   - Estimated tokens/sec throughput
   - Cost per training run (target)

2. Specify inference requirements:
   - Model size, precision (FP16, INT8, FP8)
   - QPS (peak, sustained), concurrency, latency SLA
   - Geographic distribution of users
   - Availability target (99.5%, 99.9%)

3. Specify fine-tuning:
   - Base model, LoRA rank
   - Concurrent jobs, per-job GPU requirement
   - SLA (throughput, latency, availability)

**Rubric:** Provide specific numbers (not "large" or "many"). Estimates should be traceable to Chapters 1, 8, 7.

### Phase 2: Infrastructure Sizing (30 min)

**Your tasks (use decision trees from Chapters 2–3):**

1. Choose GPUs (specify H100 vs A100 vs H200, count per node)
   - Justify based on cost per TFLOP, memory requirements
   - Provide CAPEX cost per GPU

2. Design cluster topology
   - Number of nodes, nodes per rack
   - Interconnect choice (NVLink, IB, Ethernet, specify bandwidth)
   - Network cost estimate

3. Estimate facility requirements
   - Power draw (peak, sustained), kW
   - Cooling capacity, COP estimate
   - Cost per kWh (assume $0.12 unless specified)

4. Specify storage
   - Local NVMe (per node, capacity, throughput)
   - Cluster NAS (capacity, throughput)
   - Archive (S3, Glacier)

**Rubric:** All choices must reference cost-per-TFLOP analysis. Topology must support target AllReduce latency (<5ms for 64+ GPU training).

### Phase 3: Cost-Benefit Analysis (25 min)

**Your tasks:**

1. Build cost tree (Chapter 5, 12):
   - CAPEX: GPU, networking, storage, cooling, labor
   - OPEX: Electricity, personnel (est. 2 FTE), maintenance, software
   - 3-year TCO

2. Calculate cost per output:
   - Training: Cost per training run, cost per model iteration
   - Inference: Cost per million tokens, cost per QPS
   - Fine-tuning: Cost per trained LoRA model

3. Optimize within budget:
   - Current design exceeds $20M? Iterate:
     - Defer non-critical features (geo-redundancy → single region)
     - Use spot instances for training (70% discount)
     - Reduce GPU count (accept slightly worse SLA)
   - Target: <$20M year 1

**Rubric:** Cost tree must be internally consistent. Optimization choices must be explicit (e.g., "defer EMEA region to year 2, saving $3M").

### Phase 4: Design Validation (25 min)

**Your tasks:**

1. Verify scaling efficiency (Chapter 3, 7):
   - Estimated AllReduce latency for training
   - Estimated throughput scaling (target >85% efficiency)
   - Identify bottleneck (compute? network? storage?)

2. Verify SLA achievability (Chapter 1, 9):
   - Can your cluster meet 99.5% inference SLA?
   - What happens if one GPU fails? One node? One region?
   - MTTR estimate for common failures

3. Risk assessment:
   - Identify top 3 risks (e.g., network bottleneck, power limits, personnel shortage)
   - Mitigation for each

4. Deployment plan:
   - Rough timeline (weeks to deployment)
   - Key dependencies (e.g., NAS setup, NVIDIA driver support)
   - Go/no-go criteria

**Rubric:** Scaling efficiency >85% required. SLA achievable within stated assumptions. Risks must be specific, not generic.

### Phase 5: Presentation (20 min)

**Deliverables:**

1. 1-page executive summary:
   - Cluster size (# GPUs, cost)
   - Expected performance (training throughput, inference QPS, fine-tuning concurrency)
   - Availability/SLA
   - Cost per output

2. Detailed design document (5 pages):
   - Topology diagram (ASCII or hand-drawn photo)
   - Cost tree (CAPEX/OPEX breakdown)
   - Scaling efficiency analysis (AllReduce latency, throughput prediction)
   - Risk mitigation

3. 10-min presentation to instructor:
   - Justify key decisions (GPU choice, topology, cost optimization)
   - Defend against critique (e.g., "AllReduce will be your bottleneck; how will you mitigate?")
   - Answer: What would you do differently with 2x budget? 0.5x budget?

## Example Solution (Reference)

```yaml
CLUSTER DESIGN FOR $20M BUDGET

Training:
  GPU: 64 H100 SXM5 (8 nodes × 8 GPU)
  Model: Llama-100B (3 month training cycle)
  Training throughput: 26M tokens/sec (85% scaling efficiency)
  Training cost: $150K per run (3-day duration, 64 GPU)
  Checkpointing: Every 8 hours (10 min write time, hidden in background)

Inference:
  GPU: 32 H100 SXM5 (4 nodes × 8 GPU, or use 32 H100 PCIe if cost-sensitive)
  Model: Llama-70B, 2-GPU tensor parallelism = 16 inference replicas
  Throughput: 243 QPS per GPU × 32 GPU = ~500 QPS (target: met)
  Latency p99 TTFT: ~300ms (batching + prefill overhead, acceptable)
  Availability: 99.5% (no geographic redundancy, single region)

Fine-tuning:
  GPU: 16 A100 80GB (cost-optimized vs training)
  Concurrency: 40 LoRA trainers (overbooking, multi-tenant scheduling)
  Cost per trained model: $5K

Total cluster:
  Hardware: 64 + 32 + 16 = 112 GPUs (~$3.4M CAPEX)
  Compute nodes: 14 nodes × $15K = $210K
  Networking: IB HDR (cheaper than NDR) = $150K
  Cooling/Power/Storage: $300K
  TOTAL CAPEX: ~$4.1M

OPEX year 1:
  Electricity: 90 kW × 8760 × $0.12 = $95K
  Personnel: 2 FTE × $150K = $300K
  Maintenance: $50K
  TOTAL OPEX: $445K

3-year total: $4.1M + ($445K × 3) = $5.435M (well under $20M!)

Remaining budget allocation:
  - Year 2: Add 2nd region ($4M) for geographic redundancy
  - Year 3: Upgrade to H200 GPUs for larger models ($3M)
  - Buffer: $6.6M for operational contingencies, support staff, upgrades
```

## Rubric & Scoring

| Dimension | Excellent (100%) | Good (80%) | Acceptable (60%) | Fail (<60%) |
|---|---|---|---|---|
| **Workload specification** | Specific numbers (model size, QPS, latency); traceable to assumptions | Generally specific; most parameters given | Vague; missing key parameters (e.g., model size) | No specification or contradictory |
| **GPU selection** | Justified by cost/TFLOP, memory needs, verified against workload | GPU choice reasonable but justification incomplete | GPU choice made but not justified | Wrong choice (e.g., A100 for 100B model unquantized) |
| **Topology & network** | Supports AllReduce <5ms for 64+ GPU training; cost-optimized | Reasonable topology; AllReduce latency plausible | Topology specified; latency assumptions unclear | Topology doesn't support stated workload |
| **Cost analysis** | Detailed CAPEX/OPEX tree; cost per output calculated; within budget | Cost breakdown present; cost per output calculated; at or slightly over budget | Basic cost estimate; cost per output not calculated | No cost analysis or vastly over/under budget |
| **Scaling efficiency** | >85% efficiency verified; bottleneck identified & mitigated | ~80% efficiency; bottleneck identified | Efficiency >70% but not justified | Efficiency <70% or not addressed |
| **SLA achievability** | SLA met under stated assumptions; risk mitigation for common failures | SLA met but mitigation incomplete | SLA plausible but assumptions questionable | SLA not achievable with stated design |
| **Presentation** | Clear, concise; answers critique; trade-offs articulated | Clear; mostly answers questions | Understandable; some gaps | Unclear or unprepared |

## Success Criteria

- [ ] Cluster design fits within $20M budget
- [ ] Training throughput >25M tokens/sec (Llama-100B in 3 days → requires >2.8B tokens/sec)
- [ ] Inference serves 500 QPS with <500ms p99 TTFT
- [ ] SLA achievable (specify availability per component)
- [ ] AllReduce latency <5ms (if 64+ GPU training)
- [ ] Cost per output calculated and defended
- [ ] Design can be presented in 10 minutes with visual aids

