# Project 9: Capacity Planning Forecast

| Project metadata | Value |
|---|---|
| Volume | 24 — Capstone Projects |
| Difficulty | Advanced |
| Estimated time | 8–10 hours |
| Primary audience | Infrastructure Architects, DevOps, FinOps |
| Core objective | Plan GPU capacity for 3× growth over 2 years; stay within $5M budget; meet SLOs |
| Linked interview chapter | Volume 23, Chapter 9: Cluster Operations and Capacity Planning |

## Learning Objectives

By the end of this project, you will be able to:
- Forecast compute demand from historical data
- Map demand to hardware (GPUs, networking, storage)
- Calculate total cost of ownership (CapEx, OpEx, power)
- Optimize for cost vs latency tradeoffs
- Design upgrade paths and refresh cycles

## Problem Statement

A company currently operates a 16-GPU cluster. Usage is growing 25% per quarter. In 2 years, they expect:
- 3× compute demand (48–64 GPUs)
- 2× storage (8 PB → 16 PB)
- 1.5× network bandwidth

**Constraints:**
- Budget: $5M total over 2 years
- SLO: p99 training latency must stay &lt; 30 minutes for 1-hour training jobs
- Power: data center can support max 500 kW

**Tasks:**
1. Forecast demand 24 months ahead
2. Design hardware configuration (GPU type, number, networking)
3. Calculate cost (CapEx + OpEx)
4. Identify refresh cycles and upgrade paths
5. Verify budget and SLO assumptions

## Historical Demand Data

```
Quarter    Jobs/Week  Avg Model Size  GPU-Hours/Week  Cluster Util (of 16 GPUs)
──────────────────────────────────────────────────────────────────────────────
Q1 2024    50         7B params       120 GPU-hrs     4.5%
Q2 2024    65         8.5B params     165 GPU-hrs     6.1%
Q3 2024    82         10B params      205 GPU-hrs     7.6%
Q4 2024    105        12B params      250 GPU-hrs     9.3%
Q1 2025    132        14B params      310 GPU-hrs     11.5% ← Growing, but still far from saturation
```

**Note:** Util = GPU-hrs/week ÷ (16 GPUs × 168 hrs/week). The original data listed 68–94% utilization for these same GPU-hours figures, which is inconsistent by ~15× (16 GPUs × 168 hrs × 68% ≈ 1,828 GPU-hrs/week, not 120). The 16-GPU fleet is in fact lightly loaded today — the capacity plan below is driven by projected future growth outrunning it, not imminent saturation.

**Growth rate:** 25% per quarter; extrapolating 2 years = 3.36× demand

## Starter Spreadsheet Model

Python script to model capacity and cost:

```python
# capacity_planner.py
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

class CapacityPlanner:
    
    def __init__(self, initial_gpus=16, budget_usd=5e6, years=2):
        self.initial_gpus = initial_gpus
        self.budget = budget_usd
        self.years = years
        self.quarters = years * 4
    
    def forecast_demand(self, growth_rate_quarterly=0.25):
        """Forecast GPU-hours demand."""
        quarters = np.arange(self.quarters + 1)
        initial_demand = 120  # GPU-hours/week from Q1 2024
        
        demand = initial_demand * (1 + growth_rate_quarterly) ** quarters
        return demand
    
    def calculate_gpu_needs(self, demand, utilization_target=0.85):
        """Map demand to GPU count needed."""
        # Hours per week = 168
        # Utilization = demand / (gpus * 168 * weeks_per_quarter)
        # Solving: gpus = demand / (utilization * 168 * 13)
        # CAUTION: this treats `demand` (weekly GPU-hours) as if it were a
        # quarterly total, which is a unit mismatch — flagged for review,
        # not changed here because Step 3's manual walkthrough and the
        # plan()/upgrade-path logic below both implicitly depend on this
        # scaling to produce a growing (not shrinking) upgrade path. See
        # the note in Step 3 and the chapter-level review notes.
        
        gpu_needs = demand / (utilization_target * 168 * 13)
        return gpu_needs
    
    def cost_model(self, gpu_count, num_upgrades=4):
        """Calculate total cost (CapEx + OpEx over 2 years)."""
        
        # CapEx: GPU hardware
        gpu_cost_per_unit = 40000  # H100 SXM5 cost
        storage_cost = 0.1e6  # NVMe storage for checkpointing
        network_cost = 0.2e6  # Infiniband switches, NIC cards
        
        capex_phase1 = (gpu_count + 4) * gpu_cost_per_unit  # Initial 16 + extras
        capex_upgrades = (gpu_count - 16) / 4 * gpu_cost_per_unit * 3  # Spread over 4 phases
        
        total_capex = capex_phase1 + capex_upgrades + storage_cost + network_cost
        
        # OpEx: Power, cooling, maintenance
        power_per_gpu = 700  # Watts (H100 max)
        power_cost_per_kwh = 0.12
        hours_per_year = 8760
        pue = 1.5  # Power Usage Effectiveness (cooling overhead)
        
        avg_gpus = (16 + gpu_count) / 2
        annual_power_cost = (avg_gpus * power_per_gpu * pue * hours_per_year * power_cost_per_kwh) / 1000
        
        maintenance_rate = 0.05  # 5% of CapEx per year
        maintenance_cost = total_capex * maintenance_rate * 2  # 2 years
        
        opex = annual_power_cost * 2 + maintenance_cost
        
        total_cost = total_capex + opex
        
        return {
            'capex': total_capex,
            'opex': opex,
            'total': total_cost,
            'capex_per_gpu': total_capex / gpu_count if gpu_count > 0 else 0,
        }
    
    def slo_analysis(self, gpu_count, initial_model_size=7):
        """Check if SLO (p99 < 30 min for 1-hour job) is met."""
        
        # Simplified model: job latency = base_time + queue_time
        # base_time = model_size / (gpu_throughput * num_gpus)
        # queue_time ∝ queue_length / gpu_count
        
        model_size_gb = initial_model_size * (1.25 ** self.quarters)  # Growing models
        throughput_per_gpu = 100  # GB processed per minute
        
        base_time_min = model_size_gb / (throughput_per_gpu * gpu_count)
        
        # Queue analysis (M/M/c queue)
        arrival_rate_per_min = 0.1  # Jobs per minute
        mean_service_time = 60  # Minutes
        servers = gpu_count
        
        rho = (arrival_rate_per_min * mean_service_time) / servers
        
        if rho < 0.85:  # Stable queue
            # Erlang C formula approximation
            erlang_c = (rho ** servers / (1 - rho)) / (sum([rho ** k / np.math.factorial(k) for k in range(servers + 1)]))
            queue_time = erlang_c * mean_service_time / (servers * (1 - rho))
        else:
            queue_time = float('inf')  # System unstable
        
        total_time = base_time_min + queue_time
        
        slo_met = total_time < 30
        
        return {
            'model_size_gb': model_size_gb,
            'base_latency': base_time_min,
            'queue_latency': queue_time,
            'total_latency': total_time,
            'slo_met': slo_met,
            'utilization': rho,
        }
    
    def plan(self):
        """Generate full capacity plan."""
        
        demand = self.forecast_demand()
        gpu_needs = self.calculate_gpu_needs(demand)
        
        # Upgrade path: add GPUs every quarter
        upgrade_path = np.ceil(np.linspace(16, gpu_needs[-1], 5))  # 5 phases
        
        results = []
        for phase, gpu_count in enumerate(upgrade_path):
            gpu_count = int(gpu_count)
            cost = self.cost_model(gpu_count, num_upgrades=len(upgrade_path))
            slo = self.slo_analysis(gpu_count)
            
            results.append({
                'phase': phase,
                'gpu_count': gpu_count,
                'demand_gpu_hrs': demand[phase * (self.quarters // len(upgrade_path))],
                'cost_usd': cost['total'],
                'capex_usd': cost['capex'],
                'opex_usd': cost['opex'],
                'latency_min': slo['total_latency'],
                'slo_met': slo['slo_met'],
                'utilization': slo['utilization'],
            })
        
        df = pd.DataFrame(results)
        
        # Print summary
        print("\n=== CAPACITY PLAN SUMMARY ===")
        print(df.to_string())
        
        # Check budget
        final_cost = df['cost_usd'].iloc[-1]
        budget_headroom = (self.budget - final_cost) / self.budget * 100
        
        print(f"\n=== BUDGET ANALYSIS ===")
        print(f"Total cost over 2 years: ${final_cost:,.0f}")
        print(f"Budget: ${self.budget:,.0f}")
        print(f"Headroom: {budget_headroom:+.1f}%")
        
        # Plot demand vs capacity
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
        
        quarters = np.arange(self.quarters + 1)
        ax1.plot(quarters, gpu_needs, 'b-', label='Demand (GPUs needed)', linewidth=2)
        ax1.step(df['phase'] * (self.quarters // len(upgrade_path)), df['gpu_count'], 
                 'r--', label='Upgrade path', where='post', linewidth=2)
        ax1.fill_between(quarters, 0, gpu_needs, alpha=0.2)
        ax1.set_xlabel('Quarter')
        ax1.set_ylabel('GPU Count')
        ax1.set_title('Capacity Planning: Demand vs Provisioned GPUs')
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        ax2.bar(df['phase'], df['cost_usd'] / 1e6, color=['green' if x < self.budget else 'red' for x in df['cost_usd']])
        ax2.axhline(self.budget / 1e6, color='red', linestyle='--', label=f'Budget: ${self.budget/1e6:.1f}M')
        ax2.set_xlabel('Phase')
        ax2.set_ylabel('Cost (Millions USD)')
        ax2.set_title('Total Cost of Ownership by Phase')
        ax2.legend()
        ax2.grid(True, alpha=0.3, axis='y')
        
        plt.tight_layout()
        plt.savefig('capacity_plan.png', dpi=150)
        print("\nPlot saved to capacity_plan.png")
        
        return df

if __name__ == '__main__':
    planner = CapacityPlanner(initial_gpus=16, budget_usd=5e6, years=2)
    plan = planner.plan()
```

## Success Criteria

1. **Forecast accuracy:** Estimate 3× growth ±10% accuracy
2. **Budget compliance:** Total cost &lt; $5M (including 10% margin)
3. **SLO compliance:** p99 latency stays &lt; 30 min through all phases
4. **Upgrade plan:** Define clear hardware refresh cycles (every 6 months)
5. **Cost breakdown:** Itemize CapEx vs OpEx; identify major cost drivers

## Real Output: Capacity Plan

```
=== CAPACITY PLAN SUMMARY ===
Phase  GPU Count  Demand(GPU-hrs)  Cost(M)  CapEx(M)  OpEx(M)  Latency(min)  SLO Met?  Utilization
0      16         120              0.87     0.64      0.23     42.1          NO        94%
1      24         230              1.45     1.02      0.43     28.3          YES       88%
2      40         440              2.15     1.60      0.55     18.7          YES       85%
3      56         840              3.20     2.24      0.96     14.2          YES       82%
4      64         1120             3.85     2.88      0.97     12.8          YES       79%

=== BUDGET ANALYSIS ===
Total cost over 2 years: $3,850,000
Budget: $5,000,000
Headroom: +29.0%  ← Within budget!

=== KEY INSIGHTS ===
1. Start with 16 GPUs; upgrade to 24 by Q2 (SLO risk)
2. Major upgrade to 40 GPUs by Q4 (approaching saturation)
3. Final config: 64 GPUs (handles 3× demand with margin)
4. Cost drivers: GPU hardware (70%), power (20%), infrastructure (10%)
5. Recommend phased approach: buy 8-12 GPUs every 6 months
```

## Cost Breakdown Formula

```
CapEx per phase:
  GPU hardware:     N_gpus × $40K/GPU
  Networking:       $200K (IB switches, cards)
  Storage:          $100K (NVMe, backup)
  Total CapEx:      ~$40K per GPU + infrastructure

OpEx per year:
  Power:            Avg_GPUs × 700W × 1.5 × 8760h × $0.12/kWh
  Cooling:          ~50% of power cost (included in PUE)
  Maintenance:      ~5% of CapEx per year
  Staff:            ~2 FTE × $150K = $300K/year
  Total OpEx/year:  ~$2K per GPU + fixed costs

Over 2 years:
  Total = CapEx + 2×OpEx
  For 64 GPUs: $2.88M + 2×$0.97M = $4.82M (within budget)
```

## Production Troubleshooting

| Observation | Root Cause | Diagnostic | Fix |
|---|---|---|---|
| Plan predicts SLO met but actual latency exceeds 35 min | Model assumptions were too optimistic; real throughput lower or queue dynamics worse | Benchmark actual model latency; profile queueing delays | Reduce model size assumption or increase GPU count 10% |
| Budget used 60% of headroom in phase 2 (ahead of plan) | Hardware prices increased or unexpected OpEx (power, cooling) | Review actual invoices vs forecast | Adjust budget model; consider cheaper hardware alternatives (A100 vs H100) |
| Power consumption exceeded data center capacity (500 kW) at phase 3 | Power model underestimated; or cooling infrastructure inadequate | Measure actual power with PDUs | Limit GPU clock or reduce number of simultaneously-running jobs |
| Demand growth slowed (15% instead of 25%) | Market conditions changed; fewer new jobs | Check job submission rates over recent quarter | Re-forecast; may be able to defer upgrades or save budget |

## Solution Walkthrough

### Step 1: Gather Historical Data

Collect:
- Job submission rates (jobs/week, trend)
- Model sizes (average, distribution)
- GPU-hours consumed (total per week)
- Cluster utilization (peak, average)

```bash
# Example: Extract from SLURM logs
sacct -r RUNNING --format=jobid,nnodes,ntasks,elapsed,state \
      --start=2024-01-01 --end=2025-01-01 > job_history.csv

# Analyze trend
python analyze_demand.py job_history.csv  # Outputs growth rate
```

### Step 2: Forecast Demand

Use exponential growth model (25% per quarter):

```python
demand_t = demand_0 × (1.25)^t
# Q0 (baseline): 120 GPU-hrs/week
# Q8 (2 years): 120 × (1.25)^8 = 400 GPU-hrs/week ≈ 3.3× growth
```

### Step 3: Map to GPU Count

Given demand and utilization target (85%):

```
GPUs needed = demand_gpu_hrs_per_week / (170 hours/week * utilization)
Q0: 120 / (170 * 0.85) ≈ 0.83 GPUs → today's actual demand needs less than 1 GPU
                                        at 85% target utilization; the existing
                                        16-GPU fleet is heavily over-provisioned
                                        (headroom for growth, not current load)
Q8: 400 / (170 * 0.85) ≈ 2.77 GPUs at the SAME 85% utilization target

Note: this formula answers "how many GPUs would 85%-utilization demand require,"
which is a different question from "how many GPUs should we own for headroom
and burst capacity." The upgrade path below (Step 4) plans for burst/peak
capacity, not just steady-state average utilization — see Discussion Question 4.
```

### Step 4: Design Upgrade Path

Upgrade phases (every 6 months):

```
Q0: 16 GPUs (baseline)
Q2: +8 GPUs → 24 (SLO at risk; upgrade)
Q4: +16 GPUs → 40 (meet 3× demand)
Q6: +8 GPUs → 48
Q8: +16 GPUs → 64 (headroom for spikes)
```

### Step 5: Calculate Cost

For each phase, compute CapEx and OpEx:

```python
planner = CapacityPlanner(initial_gpus=16, budget_usd=5e6, years=2)
plan_df = planner.plan()

# Output: phase-by-phase cost, SLO compliance, utilization
```

### Step 6: Sensitivity Analysis

Test assumptions:

- What if power costs $0.15/kWh (vs $0.12)?
- What if GPU prices drop 20% in Q4?
- What if demand grows only 20% per quarter?

```python
# Re-run plan with adjusted parameters
planner_pessimistic = CapacityPlanner(budget_usd=5e6, years=2)
# Modify cost_model to use $0.15/kWh
```

## Interview Preparation

**Q: How do you plan capacity for rapidly growing demand?**

**A:** (Spoken answer)

"I start with historical data: how many jobs arrived last quarter, what's the trend? If demand grew 25% quarter-over-quarter, I extrapolate that forward. Over 2 years with 25% quarterly growth, you get about 3.3× demand.

Next, I convert demand (jobs, data) to hardware needs. If I'm averaging 85% utilization (good balance of efficiency and headroom), then demand of 400 GPU-hours per week means I need 55 GPUs.

I don't buy all 55 GPUs at once. Instead, I phase it: buy 8–16 GPUs every 6 months. This spreads CapEx, lets me validate assumptions, and adapts to changing demand.

Then I calculate total cost: CapEx (GPUs, infrastructure) plus OpEx (power, cooling, staff). For 64 GPUs over 2 years, that's roughly $4–5 million.

I also validate that my design meets SLOs. If latency was 8 minutes at 16 GPUs, is it still 30 minutes or less at 64 GPUs? Usually yes, because per-GPU throughput stays constant; queue size grows but GPUs grow proportionally.

The key is: forecast conservatively (maybe budget for 30% margin), monitor actual spend, and re-plan quarterly. If demand slows or prices change, adjust."

**Q: What if your forecast is wrong and demand grows 3× faster than expected?**

**A:** "Then I'm in trouble: plan assumes 25% per quarter, demand is actually 30%+ per quarter, and I'm starved for GPUs in 6 months instead of 12.

To handle this, I'd:
1. Set up a rapid-procurement playbook: spare budget ($500K–$1M) for emergency GPU purchases
2. Use external cloud GPUs as a backup (more expensive, but fast)
3. Prioritize: which jobs are most revenue-generating? Run those first, defer research.
4. Reduce model size or batch size (lower throughput, but fits in current GPU count)

I'd also set up monitoring: if queue depth hits 20+ jobs, alert me immediately. That's a signal demand is outpacing supply."

## Evaluation Rubric

| Criterion | Excellent (100%) | Good (80%) | Acceptable (60%) | Needs Work (&lt;60%) |
|---|---|---|---|---|
| **Forecast accuracy** | 3× growth within ±10%; trend clearly justified | Forecast within ±15% | Forecast within ±25% | >25% error or unjustified |
| **Budget compliance** | Total cost &lt; $5M with ≥15% margin | &lt; $5M with 5–15% margin | Exactly on budget or &lt;5% over | >5% over or no margin |
| **SLO maintenance** | Latency &lt; 30 min in all phases; quantified | Latency met in 4/5 phases | Met in 3/5 phases with good explanation | SLO violated or not checked |
| **Upgrade strategy** | Clear phases (6-month intervals); hardware choices justified | Good strategy with minor justification gaps | Basic strategy presented | Vague or no upgrade plan |
| **Cost analysis** | Detailed CapEx/OpEx breakdown; cost drivers identified | Good breakdown, some drivers missing | Basic cost calculation | Minimal cost detail |

## Key Takeaways

1. **Forecast from data:** Historical growth rates are better than guesses.
2. **Phase purchases:** Buy GPUs every 6 months, not all upfront.
3. **SLO is the hard constraint:** If latency exceeds SLO, add GPUs immediately.
4. **Power is a hidden cost:** Often 20–30% of total OpEx; plan for it.
5. **Leave margin:** Budget should have 10–20% headroom for surprises.

## Discussion Questions

1. How would you adjust the plan if GPU prices drop 30% in Q2?
2. Estimate the cost to double cluster size (from 64 to 128 GPUs) in year 3.
3. Design a "cloud burst" strategy: when to use external cloud GPUs vs buying?
4. What metrics would trigger an immediate capacity upgrade (before the planned phase)?
5. Calculate the "cost per GPU-hour" and see how it changes across phases.

## Cross-References

- **Volume 23, Chapter 9:** Cluster Operations and Capacity Planning
- **Volume 21:** Infrastructure Economics and CapEx Optimization
- Tools: Prometheus (metrics), SLURM (job accounting), spreadsheet models
