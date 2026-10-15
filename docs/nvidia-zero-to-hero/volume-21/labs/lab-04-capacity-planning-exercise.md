---
title: Lab 04 — Capacity Planning Exercise
description: Forecast growth, plan hardware, optimize costs. 120 minutes hands-on.
sidebar_position: 4
tags: [lab, capacity-planning, forecasting, tco]
---

# Lab 04 — Capacity Planning Exercise (120 min)

> **Note:** Growth rates, prices, and budgets in this lab are illustrative planning assumptions. Unconstrained 15% to 20% monthly growth compounds to roughly 150x to 700x over 36 months, which is unrealistic; part of the exercise is to notice that and replace it with a saturating curve. GPU-count conversions use the Chapter 08 assumption of about 7.6 QPS per GPU (15.2 QPS per 2-GPU replica) and about 1.3 kW per GPU at the node level (an 8-GPU H100 node is rated at about 10.2 kW).

## Objective

Forecast GPU demand over 3 years; plan hardware refreshes; optimize TCO within budget constraints.

## Scenario

Your AI platform starts with:
- Year 1: 100 QPS (Llama inference), 50 monthly training jobs
- Growth: 15% month-over-month QPS growth (typical), 20% training job growth
- Budget: $5M year 1, $6M year 2, $7M year 3 (increasing budget)
- Hardware: H100 today ($30K), H200 in year 2 ($40K), and a next-generation GPU in year 3 (hypothetical, $45K)
- Constraints: Single data center (no multi-region), max 150 kW facility power for the cluster (about 117 GPUs at ~1.3 kW per GPU including the node)

Plan hardware refresh cycles and infrastructure growth to maximize utilization while meeting SLA.

## Exercise 1: Demand Forecasting (30 min)

**Task:** Forecast QPS and training demand for 36 months.

```python
import numpy as np
import pandas as pd
from scipy import optimize
import matplotlib.pyplot as plt

# Historical & forecast data
initial_qps = 100
inference_growth_rate = 0.15  # 15% month-over-month
training_job_initial = 50
training_growth_rate = 0.20

months = np.arange(0, 37)  # 3 years + 1 month
inference_qps = []
training_jobs = []

for month in months:
    qps = initial_qps * ((1 + inference_growth_rate) ** month)
    jobs = training_job_initial * ((1 + training_growth_rate) ** month)
    
    inference_qps.append(qps)
    training_jobs.append(jobs)

# Sanity check: What's the peak demand?
print(f"Inference QPS forecast:")
print(f"  Month 0: {inference_qps[0]:.0f} QPS")
print(f"  Month 12: {inference_qps[12]:.0f} QPS")
print(f"  Month 24: {inference_qps[24]:.0f} QPS")
print(f"  Month 36: {inference_qps[36]:.0f} QPS")

print(f"\nTraining jobs forecast:")
print(f"  Month 0: {training_jobs[0]:.0f} jobs/month")
print(f"  Month 12: {training_jobs[12]:.0f} jobs/month")
print(f"  Month 24: {training_jobs[24]:.0f} jobs/month")
print(f"  Month 36: {training_jobs[36]:.0f} jobs/month")

# Convert to GPU requirements (from Chapters 8, 7)
# Inference: ~7.6 QPS per GPU (Chapter 8: ~15.2 QPS per 2-GPU replica)
# Training: 8 GPU per job (Chapter 7)

inference_gpu = np.array(inference_qps) / 7.6
training_gpu = np.array(training_jobs) * 8 / 30  # Amortized (jobs spread across month)

total_gpu_needed = inference_gpu + training_gpu

# Plot
df = pd.DataFrame({
    'month': months,
    'inference_qps': inference_qps,
    'training_jobs': training_jobs,
    'inference_gpu': inference_gpu,
    'training_gpu': training_gpu,
    'total_gpu': total_gpu_needed,
})

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

ax1.plot(df['month'], df['inference_qps'], 'o-', label='Inference QPS')
ax1.set_xlabel('Month')
ax1.set_ylabel('QPS')
ax1.set_title('Inference QPS Forecast (15% growth/month)')
ax1.grid()
ax1.legend()

ax2.plot(df['month'], df['total_gpu'], 's-', label='Total GPU', linewidth=2)
ax2.axhline(y=117, color='r', linestyle='--', label='Facility power limit (150 kW @ ~1.3 kW/GPU)')
ax2.set_xlabel('Month')
ax2.set_ylabel('GPU Count')
ax2.set_title('GPU Capacity Forecast')
ax2.grid()
ax2.legend()

plt.tight_layout()
plt.savefig('capacity_forecast.png', dpi=100)
print("\nForecast plot saved: capacity_forecast.png")

# Key insights
print(f"\nKey insights:")
print(f"  Month 36 GPU needed: {total_gpu_needed[36]:.0f}")
print(f"  Facility power limit: ~117 GPU (at 150 kW max, ~1.3 kW/GPU)")
print(f"  => Facility limited! Cannot grow beyond ~117 GPU without new capacity")
```

**Expected output (computed from the code above):** total GPU demand is about 26 at month 0, 70 at month 6, 98 at month 8, 115 at month 9, and 136 at month 10, so the ~117 GPU facility limit is reached around month 9. By month 36 the pure-exponential model asks for over 11,000 GPUs, which is a signal that the growth assumption must be replaced. Recognize the constraint and the unrealistic tail.

## Exercise 2: Hardware Refresh Planning (30 min)

**Task:** Plan GPU refresh cycles to maximize cost efficiency within budget.

```python
def plan_hardware_refresh(monthly_gpu_needed, budgets_per_year, gpu_costs):
    """
    Plan hardware purchases to meet demand within budget.
    
    Args:
      monthly_gpu_needed: List of GPU count per month (36 months)
      budgets_per_year: [year1_budget, year2_budget, year3_budget]
      gpu_costs: {'H100': 30K, 'H200': 40K, 'NextGen': 45K}
    
    Returns:
      Hardware purchase plan and cost analysis
    """
    
    plan = {}
    cumulative_gpu = 0
    cumulative_cost = 0
    
    for year in range(1, 4):
        year_start_month = (year - 1) * 12
        year_end_month = year * 12
        
        # Peak demand in year
        peak_gpu_needed = max(monthly_gpu_needed[year_start_month:year_end_month])
        gpu_to_purchase = peak_gpu_needed - cumulative_gpu
        
        if gpu_to_purchase <= 0:
            plan[f'year_{year}'] = {'gpu': 0, 'cost': 0, 'gpu_type': 'none'}
            continue
        
        # Choose GPU type based on year
        if year == 1:
            gpu_type = 'H100'
            gpu_cost = gpu_costs['H100']
        elif year == 2:
            gpu_type = 'H200'  # Assume H200 available in year 2
            gpu_cost = gpu_costs['H200']
        else:
            gpu_type = 'NextGen'   # hypothetical next-generation GPU
            gpu_cost = gpu_costs.get('NextGen', gpu_costs['H200'])
        
        year_budget = budgets_per_year[year - 1]
        
        # Purchase as many GPUs as budget allows
        gpu_affordable = year_budget // (gpu_cost + 50000)  # 50K for nodes/networking per GPU
        gpu_to_buy = min(gpu_to_purchase, gpu_affordable)
        
        cost = gpu_to_buy * (gpu_cost + 50000)
        cumulative_gpu += gpu_to_buy
        cumulative_cost += cost
        
        plan[f'year_{year}'] = {
            'gpu_type': gpu_type,
            'gpu_count': gpu_to_buy,
            'cost': cost,
            'peak_demand': peak_gpu_needed,
            'cumulative_gpu': cumulative_gpu,
        }
    
    return plan

# Run plan
gpu_costs = {
    'H100': 30,  # K$
    'H200': 40,
    'NextGen': 45,   # hypothetical
}
budgets = [5, 6, 7]  # M$ per year
forecast_gpu = df['total_gpu'].values

plan = plan_hardware_refresh(forecast_gpu, budgets, gpu_costs)

# Print plan
print("\nHardware Refresh Plan:")
print(f"{'Year':<10s} {'GPU Type':<12s} {'# GPU':<8s} {'Cost':<12s} {'Cumulative':<12s} {'Peak Demand':<12s}")
print("-" * 70)

total_cost = 0
for year in range(1, 4):
    year_key = f'year_{year}'
    item = plan[year_key]
    print(f"{year:<10d} {item['gpu_type']:<12s} {item['gpu_count']:<8.0f} ${item['cost']/1000:>10.1f}M ${item['cumulative_gpu']*0.08:>10.1f}M {item['peak_demand']:>12.0f}")
    total_cost += item['cost'] / 1_000_000

print("-" * 70)
print(f"{'Total 3-year CAPEX:':<32s} ${total_cost:>10.1f}M")
print(f"Total budget available: ${sum(budgets):.1f}M")
print(f"Budget utilization: {100*total_cost/sum(budgets):.1f}%")
```

**Rubric:** Plan fits within budget. Hardware choices justify year-by-year (H100 → H200 → next generation), and the plan states what happens when demand exceeds the budget or the facility limit.

## Exercise 3: TCO & Utilization Analysis (30 min)

**Task:** Calculate 3-year TCO; identify over/under-provisioning.

```python
def calculate_tco(plan, monthly_gpu_demand, electricity_rate=0.12):
    """
    Calculate total cost of ownership and utilization.
    
    TCO = CAPEX (hardware) + OPEX (operations)
    OPEX includes: electricity, personnel, maintenance
    """
    
    tco_breakdown = {
        'capex': sum(item['cost'] / 1_000_000 for item in plan.values()),
        'opex': {
            'electricity': 0,
            'personnel': 0,
            'maintenance': 0,
        },
        'utilization': 0,
    }
    
    # Calculate OPEX for 36 months
    for month_idx, gpu_needed in enumerate(monthly_gpu_demand[:36]):
        year = (month_idx // 12) + 1
        
        # Peak GPU capacity (from plan)
        cumulative_gpu = plan[f'year_{year}']['cumulative_gpu']
        
        # Power draw & electricity cost
        power_kw = cumulative_gpu * 1.3  # ~1.3 kW per GPU at the node level (10.2 kW per 8-GPU H100 node)
        electricity_cost_month = power_kw * 24 * 30 * electricity_rate / 1000
        tco_breakdown['opex']['electricity'] += electricity_cost_month
        
        # Personnel (2 FTE at $150K/year = $12.5K/month per FTE)
        personnel_cost_month = 2 * 150 / 12
        tco_breakdown['opex']['personnel'] += personnel_cost_month
        
        # Maintenance (1% of CAPEX per year)
        maintenance_cost_month = (tco_breakdown['capex'] / 36) * 0.01
        tco_breakdown['opex']['maintenance'] += maintenance_cost_month
    
    # Calculate utilization
    peak_capacity = sum(item['cumulative_gpu'] for item in plan.values())
    avg_demand = np.mean(monthly_gpu_demand[:36])
    utilization = avg_demand / peak_capacity if peak_capacity > 0 else 0
    
    tco_breakdown['utilization'] = utilization
    tco_breakdown['opex_total'] = sum(tco_breakdown['opex'].values())
    tco_breakdown['tco_total'] = tco_breakdown['capex'] + tco_breakdown['opex_total']
    
    return tco_breakdown

# Calculate TCO
tco = calculate_tco(plan, df['total_gpu'].values)

print("\nTotal Cost of Ownership (3 years):")
print(f"CAPEX (Hardware): ${tco['capex']:.2f}M")
print(f"\nOPEX (Operations):")
print(f"  Electricity: ${tco['opex']['electricity']:.2f}M")
print(f"  Personnel: ${tco['opex']['personnel']:.2f}M")
print(f"  Maintenance: ${tco['opex']['maintenance']:.2f}M")
print(f"  OPEX Total: ${tco['opex_total']:.2f}M")
print(f"\n3-Year TCO: ${tco['tco_total']:.2f}M")
print(f"Average Utilization: {tco['utilization']*100:.1f}%")
print(f"Cost per GPU-year: ${tco['tco_total']*1e6 / (peak_capacity * 3) / 1000:.1f}K")

# Identify over-provisioning
if tco['utilization'] < 0.70:
    print("\nWARNING: Low utilization (<70%). Consider:")
    print("  - Deferring hardware purchases to later years")
    print("  - Adopting spot or reserved cloud capacity for interruption-tolerant training")
    print("  - Multi-tenancy to fill idle capacity")
```

**Rubric:** TCO calculation correct. Identify under-utilization if utilization &lt;70%.

## Exercise 4: Cost Optimization (30 min)

**Task:** Optimize plan to minimize cost while meeting SLA.

```python
def optimize_plan(monthly_gpu_demand, budgets, facility_power_limit_kw=150):
    """
    Optimize hardware plan for cost efficiency.
    Strategies:
      1. Defer purchases to later years (leverage Moore's law price drops)
      2. Use spot instances for training (discount is an assumption; check current pricing)
      3. Max out facility power before expanding
    """
    
    optimized_plan = {}
    cumulative_gpu = 0
    cumulative_cost_capex = 0
    cumulative_cost_opex = 0
    
    strategies = []
    
    for year in range(1, 4):
        year_start_month = (year - 1) * 12
        year_end_month = year * 12
        peak_demand = max(monthly_gpu_demand[year_start_month:year_end_month])
        
        # Strategy 1: Respect facility power limit
        max_gpu_by_power = facility_power_limit_kw / 1.3  # ~1.3 kW per GPU at the node level
        
        # Strategy 2: Defer non-critical GPU (use spot for training)
        # Assume 50% of demand is inference (critical), 50% training (can use spot)
        critical_gpu = peak_demand * 0.5
        training_gpu = peak_demand * 0.5
        
        # Strategy 3: Only buy GPU if within budget AND power limit
        gpu_to_buy = min(peak_demand - cumulative_gpu, max_gpu_by_power - cumulative_gpu)
        
        if gpu_to_buy > 0 and budgets[year-1] > 0:
            # Assume a modest 10% price decline per year (assumption; GPU prices do not follow Moore's law)
            gpu_cost = 30 * (0.9 ** (year - 1))  # H100: $30K → $27K → $24K
            cost = gpu_to_buy * (gpu_cost + 50)  # Include nodes/network
            
            if cost <= budgets[year-1]:
                cumulative_gpu += gpu_to_buy
                cumulative_cost_capex += cost
                strategies.append(f"Year {year}: Buy {gpu_to_buy:.0f} GPU (price: ${gpu_cost:.1f}K each)")
            else:
                strategies.append(f"Year {year}: Budget insufficient for {gpu_to_buy:.0f} GPU")
        
        # Use spot instances for remaining training demand
        spot_gpu = training_gpu - (peak_demand - cumulative_gpu) * 0.5
        if spot_gpu > 0:
            spot_cost_hourly = spot_gpu * 2.50  # assumed $2.50/GPU/hour spot price (check current pricing)
            spot_cost_annual = spot_cost_hourly * 24 * 365
            cumulative_cost_opex += spot_cost_annual / 1_000_000
            strategies.append(f"Year {year}: Use {spot_gpu:.0f} spot GPU for training (${spot_cost_annual/1e6:.2f}M/year)")
        
        optimized_plan[f'year_{year}'] = {
            'gpu_purchased': gpu_to_buy,
            'cumulative_gpu': cumulative_gpu,
            'capex': cost if gpu_to_buy > 0 else 0,
            'spot_gpu': spot_gpu if spot_gpu > 0 else 0,
        }
    
    return optimized_plan, strategies

# Optimize
opt_plan, strats = optimize_plan(df['total_gpu'].values, budgets)

print("\nOptimized Plan:")
for strat in strats:
    print(f"  {strat}")

print(f"\nOptimized Cost Breakdown:")
opt_capex = sum(item['capex'] for item in opt_plan.values()) / 1_000_000
print(f"CAPEX (GPU purchase): ${opt_capex:.2f}M")
opt_opex = sum(item.get('spot_gpu', 0) for item in opt_plan.values()) * 2.50 * 24 * 365 / 1e9
print(f"OPEX (spot instance): ${opt_opex:.2f}M/year")
print(f"Total 3-year cost: ${opt_capex + opt_opex*3:.2f}M")
print(f"Savings vs. original plan: ${tco['tco_total'] - (opt_capex + opt_opex*3):.2f}M")
```

**Rubric:** Optimization lowers TCO versus the baseline plan under stated assumptions. Explain the spot-instance trade-off (interruptions, checkpoint cost) and the sensitivity of your result to the price assumptions.

## Deliverables

1. **Demand forecast** (plot): 36-month GPU requirement projection
2. **Hardware plan** (table): GPU purchases per year, GPU type, cost
3. **TCO analysis** (summary):
   - CAPEX / OPEX / Total
   - Utilization percentage
   - Cost per GPU-year
4. **Optimization** (narrative):
   - Strategies applied (defer, spot, power limit)
   - Cost savings vs. baseline

## Success Criteria

- [ ] Forecast covers 36 months with monthly granularity
- [ ] Hardware plan fits within budget constraints
- [ ] TCO calculation accurate (CAPEX + OPEX for 3 years)
- [ ] Utilization >70% (avoid over-provisioning)
- [ ] Optimization identifies >$2M savings