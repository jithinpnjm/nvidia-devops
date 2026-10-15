---
title: Lab 01 — Cluster Design Workshop
description: Design a production GPU cluster for given workload requirements. 120 minutes hands-on.
sidebar_position: 1
tags: [lab, cluster-design, workshop]
---

# Lab 01 — Cluster Design Workshop (120 min)


> **Note on figures:** Prices, efficiencies, and throughput figures in this lab are illustrative planning assumptions. The reference solution shows how to derive numbers, not benchmark results.

## Objective

Design a production GPU cluster (hardware, topology, software, operations) for a realistic workload. Apply Chapters 1–14 principles.

## Scenario

Your company (startup, $50M Series B) plans to:
1. Refresh a proprietary 70B-parameter LLM every 3 months by continued pre-training on about 100B new tokens
2. Serve Llama-70B inference API (500 QPS peak, 99.5% SLA, &lt;500ms p99 TTFT)
3. Run fine-tuning jobs for enterprise customers (100 concurrent LoRA trainers on an 8B base)

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

**Rubric:** All choices must reference cost-per-TFLOP analysis. Topology must support the target training efficiency (validate with nccl-tests bus bandwidth and an assumed exposed-communication share).

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
     - Use spot or reserved capacity for interruption-tolerant training (check current discounts)
     - Reduce GPU count (accept slightly worse SLA)
   - Target: &lt;$20M year 1

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

**Rubric:** Justify your scaling-efficiency assumption (for example 85%) with the exposed-communication argument from Chapters 3 and 7. SLA achievable within stated assumptions. Risks must be specific, not generic.

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
CLUSTER DESIGN FOR $20M BUDGET (reference approach)

Training (continued pre-training, 70B model, 100B new tokens per refresh):
  Work: FLOPs ≈ 6 × params × tokens = 6 × 70e9 × 100e9 = 4.2e22
  GPUs: 128 H100 SXM5 (16 nodes), peak 126,592 TFLOPS BF16 dense (Chapter 02)
  Assumed MFU 40% -> 50.6 PFLOPS sustained -> 4.2e22 / 5.06e16 ≈ 8.3e5 s ≈ 9.6 days
  Tokens/s ≈ 100e9 / 8.3e5 ≈ 120,000 tokens/s
  Cost per run: electricity ≈ 16 × 10.2 kW × 1.35 PUE ≈ 220 kW × 230 h × $0.12 ≈ $6K, plus
  hardware amortization ≈ $4.56M × 9.6 / 1095 days ≈ $40K  -> roughly $46K per run
  Checkpointing: sharded checkpoints every few hours (Chapter 04)

Inference (Llama-3-70B, 500 QPS peak, 99.5%):
  Per 2-GPU replica ≈ 15.2 QPS (Chapter 08 assumption) -> 33 replicas for 500 QPS
  Add a spare node: 9 nodes × 8 GPU = 72 GPUs = 36 replicas ≈ 547 QPS
  Single region, N+1 at node level; 99.5% allows ~3.6 hours downtime/month

Fine-tuning:
  16 A100 80GB (2 nodes), LoRA on an 8B base, multi-tenant scheduling
  Concurrency set by memory: ~16 GB shared base per GPU plus per-job overhead (Chapter 01)

Hardware and CAPEX (illustrative):
  Training pod: 16 nodes × $285K = $4.56M + fabric $0.4M
  Inference: 9 nodes × $285K = $2.57M
  Fine-tuning: 2 A100 nodes ≈ $0.4M
  Storage, power, cooling, install: ≈ $1.0M
  TOTAL CAPEX: ≈ $8.9M

OPEX year 1 (illustrative):
  Electricity: 27 nodes × 10.2 kW × 60% avg × 1.35 PUE ≈ 223 kW × 8760 × $0.12 ≈ $234K
  Personnel: 3 FTE × $150K = $450K
  Maintenance/support (1% of CAPEX): ≈ $89K
  Software and licenses: ≈ $50K
  TOTAL OPEX: ≈ $0.82M

Year-1 total ≈ $9.7M, leaving about half the $20M budget for a second region (Chapter 09),
spare capacity, or a larger training pod.
```

## Rubric & Scoring

| Dimension | Excellent (100%) | Good (80%) | Acceptable (60%) | Fail (&lt;60%) |
|---|---|---|---|---|
| **Workload specification** | Specific numbers (model size, QPS, latency); traceable to assumptions | Generally specific; most parameters given | Vague; missing key parameters (e.g., model size) | No specification or contradictory |
| **GPU selection** | Justified by cost/TFLOP, memory needs, verified against workload | GPU choice reasonable but justification incomplete | GPU choice made but not justified | Wrong choice (e.g., a single 80GB GPU for an unquantized 70B model) |
| **Topology & network** | Rail-optimized fabric with a stated communication-overhead target; cost-optimized | Reasonable topology; overhead plausible | Topology specified; overhead assumptions unclear | Topology doesn't support stated workload |
| **Cost analysis** | Detailed CAPEX/OPEX tree; cost per output calculated; within budget | Cost breakdown present; cost per output calculated; at or slightly over budget | Basic cost estimate; cost per output not calculated | No cost analysis or vastly over/under budget |
| **Scaling efficiency** | >85% efficiency verified; bottleneck identified & mitigated | ~80% efficiency; bottleneck identified | Efficiency >70% but not justified | Efficiency &lt;70% or not addressed |
| **SLA achievability** | SLA met under stated assumptions; risk mitigation for common failures | SLA met but mitigation incomplete | SLA plausible but assumptions questionable | SLA not achievable with stated design |
| **Presentation** | Clear, concise; answers critique; trade-offs articulated | Clear; mostly answers questions | Understandable; some gaps | Unclear or unprepared |

## Success Criteria

- [ ] Cluster design fits within $20M budget
- [ ] Training plan derived from FLOPs = 6 × params × tokens, an explicit MFU assumption, and a resulting time-to-train
- [ ] Inference serves 500 QPS with &lt;500ms p99 TTFT
- [ ] SLA achievable (specify availability per component)
- [ ] Communication overhead estimate stated and validated with nccl-tests (if 64+ GPU training)
- [ ] Cost per output calculated and defended
- [ ] Design can be presented in 10 minutes with visual aids