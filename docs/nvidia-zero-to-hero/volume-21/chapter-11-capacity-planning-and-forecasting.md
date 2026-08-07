---
title: Chapter 11 — Capacity Planning and Forecasting
description: Growth strategy, demand forecasting, hardware refresh cycles, TCO optimization.
sidebar_position: 12
tags: [capacity-planning, forecasting, growth, tco]
---

# Chapter 11 — Capacity Planning and Forecasting

## PART 1: DEMAND FORECASTING

### 1.1 Forecasting Model

```python
# Predict GPU demand for next 12–36 months

import numpy as np
from scipy import optimize

def forecast_gpu_demand(historical_qps: list, growth_rate: float = 0.1, seasonality: float = 0.2):
    """
    Args:
      historical_qps: List of monthly average QPS from past 24 months
      growth_rate: Monthly growth rate (e.g., 0.1 = 10% month-over-month)
      seasonality: Amplitude of seasonal variation (0 = none, 1 = 100% variation)
    
    Returns:
      Forecast for next 12 months
    """
    
    # Base growth model: QPS[t] = QPS[t-1] * (1 + growth_rate) * (1 + seasonality_factor)
    months = np.arange(len(historical_qps) + 12)
    forecast = []
    
    for t in range(len(historical_qps), len(months)):
        # Growth component
        qps_base = historical_qps[-1] * ((1 + growth_rate) ** (t - len(historical_qps)))
        
        # Seasonal component (e.g., holiday peaks in Dec)
        seasonal_factor = seasonality * np.sin(2 * np.pi * (t % 12) / 12)
        
        forecast.append(qps_base * (1 + seasonal_factor))
    
    return forecast

# Example: Llama API starts with 100 QPS, grows 10%/month
historical = [100, 110, 121, 133, 146, 161, 177, 195, 214, 236, 260, 286]  # 12 months
forecast = forecast_gpu_demand(historical, growth_rate=0.1, seasonality=0.15)

print("Demand forecast (QPS):")
for month, qps in enumerate(forecast):
    print(f"  Month +{month}: {qps:.0f} QPS")

# forecast has 12 entries (months +0 through +11 past the 12 months of history) — verified
# by actually running the code above:
# Month +0: 286 QPS
# Month +6: 507 QPS  (77% growth over 6 months)
# Month +11: 755 QPS (164% growth over 12 months — there is no forecast[12]; the function
#            only returns 12 months out, so "Month +12" is out of range and would raise
#            IndexError if referenced)

# GPU requirement (from Chapter 8: 15.2 QPS per GPU)
gpu_needed = np.array(forecast) / 15.2
print("\nGPU requirement (for p99 latency <500ms):")
for month, gpus in enumerate(gpu_needed):
    print(f"  Month +{month}: {gpus:.0f} GPUs")

# Month +0: 19 GPUs
# Month +6: 33 GPUs
# Month +11: 50 GPUs
```

### 1.2 Hardware Refresh Cycles

```yaml
REFRESH STRATEGY (Minimize cost, maintain performance)

Current fleet (Year 1):
  Inference: 50 nodes × 8 GPU = 400 H100 GPUs
  Training: 8 nodes × 8 GPU = 64 H100 GPUs
  Total: 464 GPUs, cost $13.9M (464 × $30K)

Year 2 forecast: 60 GPUs added (800 total)
  Option A: Buy new H200 (141GB, better for larger models)
    Cost: 60 × H200 × $40K = $2.4M (additional)
    Benefit: Enables larger models without retraining
    ROI: High (unlock new revenue streams)
  
  Option B: Buy more H100 (stay with current GPU)
    Cost: 60 × H100 × $30K = $1.8M (additional)
    Benefit: Lower cost, consistent with existing fleet
    Risk: May not support future larger models

Year 3: Add inference region (new continent)
  100 additional GPUs
  If H100 cost dropped to $25K (volume discounts): $2.5M
  If H200 now dominant: 100 × $35K = $3.5M (prices drop over time)

TCO calculation (3-year):
  Year 1 CAPEX: $13.9M
  Year 2 CAPEX: $2.4M (H200s)
  Year 3 CAPEX: $3.5M
  Total CAPEX: $19.8M
  
  OPEX (electricity + personnel) per year: $3M
  Total OPEX (3 years): $9M
  
  3-year TCO: $28.8M
  Amortized cost per GPU-year: $28.8M / (464 + 60 + 100 GPU-years) = $24.8K per GPU per year
```

---

## PART 2: CAPACITY PLANNING DECISIONS

### 2.1 Capacity vs. Cost Trade-off

```python
# Example: Plan for 1000 QPS by year end

current_demand = 400 QPS (current fleet ≈ 27 GPUs at 15.2 QPS/GPU, sized to just cover demand)
target_capacity = 1000 QPS = 66 GPUs needed (total fleet size required to hit the year-end target)

Option A: Buy all hardware upfront (overprovisioning)
  Cost: 66 × $30K = $1.98M (immediate)
  Utilization year 1: 400 QPS / 1000 QPS capacity = 40% (wasteful)
  Utilization year 2: 700 QPS / 1000 QPS = 70% (better)
  Pros: No scaling delay, no upgrade cost later
  Cons: $1M+ idle capacity cost

Option B: Buy incrementally (match demand)
  Q1: 10 GPUs for 200 QPS (cost $300K, utilization 100%)
  Q2: 10 GPUs for 200 QPS (cost $300K, utilization 100%)
  Q3: 20 GPUs for 300+ QPS (cost $600K, utilization 95%)
  Q4: 30 GPUs for 450+ QPS (cost $900K, utilization 92%)
  Total year 1: 70 GPUs = $2.1M
  
  Pros: Lower idle cost (90% utilization vs 40%)
  Cons: $120K extra due to incremental hardware costs, operational overhead of multiple upgrades

Hybrid approach (recommended):
  Add 40 GPUs immediately (year 1, month 1): $1.2M → capacity 640 QPS
  Forecast: Monthly QPS growth 10% for first 6 months, then 5%
  Utilization: 40–90% throughout year 1 (acceptable balance)
  Plan upgrade for Q3 if growth accelerates
```

---

## SUMMARY

Capacity planning requires:
1. **Demand forecasting:** Analyze historical growth, seasonality, market trends.
2. **Hardware refresh:** Balance H100 (cost) vs H200 (capability) for future models.
3. **Utilization optimization:** Target 70–85% utilization; too low = wasted cost, too high = no headroom for traffic spikes.
4. **TCO analysis:** 3-year amortization reveals true cost; short-term views miss amortized costs.

**In Chapter 12:** Cost optimization strategies.
