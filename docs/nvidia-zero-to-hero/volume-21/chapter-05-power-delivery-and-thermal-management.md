---
title: Chapter 05 — Power Delivery and Thermal Management
description: Power budgeting, cooling design, efficiency optimization, cost allocation. Real power numbers (H100 350W, cooling overhead).
sidebar_position: 6
tags: [power, cooling, thermal, efficiency, pdu, facility]
---

# Chapter 05 — Power Delivery and Thermal Management

## Chapter Metadata

| Key | Value |
|---|---|
| Volume | 21 — AI Factory: Building Large-Scale Production Systems |
| Difficulty | Architect |
| Estimated reading time | 35 minutes |
| Primary audience | Infrastructure architects, facility engineers, cost optimization leads |
| Core question | How do you deliver power to and cool dense GPU clusters without exceeding data center capacity or facility budgets? |

---

## PART 1: POWER CONSUMPTION ANALYSIS

### 1.1 Component Power Budgets

```yaml
H100-BASED COMPUTE NODE POWER BREAKDOWN

GPU Power (per H100 SXM5):
  Idle: ~50W (GPU memory clocks running)
  Compute: 250–350W (depends on workload utilization, memory bandwidth)
  Thermal design power (TDP): 700W (theoretical maximum spike, rare)
  
CPU Power (2× EPYC Bergamo):
  Idle: ~100W per socket
  Full compute: 500–700W per socket (all 128 cores active)
  Training workload (moderate load): 200–300W total

Memory Power:
  HBM power (H100 80GB): Included in GPU power
  DDR5 (192GB host): ~20W

Storage Power:
  NVMe drives (4×7.68TB PCIe 5.0): 4W per drive = 16W total
  RAID controller: 10W

Network Interface Cards (NICs):
  1× ConnectX-7 NDR IB (400GbE): 25W
  
PDU & PSU Losses:
  Typical efficiency: 90% (power delivered / power drawn from wall)
  Example: 2.8 kW GPU + 0.3 kW CPU = 3.1 kW compute
           3.1 kW / 0.90 = 3.44 kW at wall (0.34 kW loss in conversion)

Total per-node power draw (full training):
  GPU:           8 × 350W = 2,800W
  CPU:           2 × 300W = 600W
  Memory/Storage: 46W
  NIC:           25W
  Subtotal:      3,471W
  
  With PDU inefficiency: 3.471 kW / 0.90 = 3.86 kW at the PDU
```

### 1.2 Cluster-Level Power Budget

```
64-GPU TRAINING CLUSTER (8 nodes × 8 GPU each)

Per-node power (training):        3.86 kW
Cluster compute power:            8 nodes × 3.86 kW = 30.88 kW

Facility overhead:
  Cooling: Δ 30–40% overhead
    Air cooling (standard): +40% (cooling efficiency COP ~3, requires extra energy)
    Liquid cooling (advanced): +20% (better efficiency, but capital cost)
  
  Power distribution (PDUs, cabling, UPS):
    Efficiency loss: ~10% (included above)
  
  Lighting, networking infrastructure: +5%

Total facility power (training):
  Air cooling: 30.88 kW × 1.4 = 43.2 kW (including cooling)
  Liquid cooling: 30.88 kW × 1.2 = 37.1 kW (including cooling)

Sustained utilization assumption:
  Idle (overnight, weekends): ~5 kW (cooling, power management)
  Training workload (8–16 hours/day): 37–43 kW
  Maintenance/testing (4–8 hours/day): 20 kW

Monthly power consumption (production schedule):
  Assume: 16 hours training/day, 4 hours idle/day, 4 hours maintenance/day
  Training: 16 hr × 30 days × 40 kW = 19,200 kWh/month
  Idle: 4 hr × 30 days × 5 kW = 600 kWh/month
  Maintenance: 4 hr × 30 days × 20 kW = 2,400 kWh/month
  Total: 22,200 kWh/month
  
  At $0.12/kWh (US industrial average):
    Monthly cost: 22,200 × $0.12 = $2,664/month = $31,968/year
    
  Plus HVAC/facility overhead:
    Typical facility allocation: +30% of compute power cost
    Additional cost: $31,968 × 0.30 = $9,590/year
    
  Total facility cost: $31,968 + $9,590 = $41,558/year for 64-GPU cluster
```

---

## PART 2: COOLING DESIGN

### 2.1 Cooling Technologies Comparison

| Cooling Type | COP (Efficiency) | Capital Cost | Operational Cost | Noise | Maintenance | Best For |
|---|---|---|---|---|---|---|
| **Air Cooling (Standard)** | 2.5–3.0 | $50K–100K | High | Loud (80–90 dB) | Annual filter replacement | Research labs (tolerance for noise) |
| **Precision Air Cooling (CAC)** | 2.5–3.5 | $100K–200K | High | 70–80 dB | Filter changes, damper maintenance | Production (some noise tolerance) |
| **Liquid Cooling (Cold Plate)** | 4.0–5.0 | $200K–400K | Low | Quiet (60–70 dB) | Coolant monitoring, pump/seal maintenance | High-density production clusters |
| **Immersion Cooling (Oil/Fluorinert)** | 5.0–6.0 | $300K–600K | Low | None (sealed pods) | Minimal (sealed system) | Highest density, data center floor optimization |

### 2.2 Reference Cooling Design: 64-GPU Air-Cooled Rack

```
RACK THERMAL DESIGN

GPU Node Layout:
  Front of Rack (intake): 4×8-GPU nodes stacked vertically
  CPU heatsinks: Facing hot-aisle (rear)
  
Airflow:
  Hot-aisle: Rear of rack (warm air exhaust, 40–50°C)
  Cold-aisle: Front of rack (cool air intake, 15–25°C)
  
  In-rack circulation:
    GPU fans pull cold air from front, exhaust warm air to back
    Each GPU: 100–150 CFM (cubic feet per minute)
    Per-node: 8 GPU × 125 CFM = 1,000 CFM
    Cluster: 8 nodes × 1,000 CFM = 8,000 CFM
    
    Air temperature rise across rack: ΔT = Power / (CFM × Cp × ρ)
    ΔT = (30,880W / 1000) / (8000 CFM × 0.24 BTU/lb°F × 0.075 lb/ft³)
    ΔT ≈ 20°C (difference between cold-aisle and hot-aisle)

HVAC System:
  Data center CRACs (Computer Room Air Conditioning):
    Capacity: 60–80 kW cooling
    Intake: 15–20°C cold-aisle
    Exhaust: 25–30°C after absorbing 30 kW compute heat
    
  Efficiency (COP = cooling / power):
    30 kW compute / 10 kW HVAC = COP 3.0 (typical air cooling)
    
  Redundancy:
    2 CRACs of 40 kW each (N+1 redundancy)
    Total CRAC power: 20 kW (10 kW per unit at ~50% load)

Temperature Monitoring:
  GPU thermal target: 60–70°C (optimal for H100, max 80°C throttle)
  Node intake temperature: 20–25°C
  Node exhaust temperature: 35–45°C
  
  Alerts:
    GPU >75°C: Reduce workload (lower batch size)
    GPU >80°C: Thermal throttle (automatic, reduces clocks 5–10%)
    Exhaust >50°C: Check if hot-aisle contains cold-aisle air (containment breach)
```

### 2.3 Thermal Shutdown & Throttling

```python
# Monitoring GPU thermal state

import subprocess

def monitor_gpu_thermal():
    """Check GPU temperatures and alert if throttling"""
    result = subprocess.run(['nvidia-smi', '--query-gpu=index,temperature.gpu', '--format=csv,noheader'], 
                          capture_output=True, text=True)
    
    for line in result.stdout.strip().split('\n'):
        gpu_id, temp_c = line.split(',')
        temp = int(temp_c)
        
        if temp > 75:
            print(f"WARNING: GPU {gpu_id} at {temp}°C, approaching throttle threshold")
        
        if temp > 80:
            print(f"ALERT: GPU {gpu_id} at {temp}°C, THROTTLING ACTIVE (clock reduced)")
            # Mitigation: Reduce batch size or pause training
            
# Expected behavior during training:
#   Normal operation: 65–70°C
#   High ambient or poor cooling: 72–75°C (warning, consider reducing workload)
#   Sustained >80°C: Automatic clock throttle (-10% performance per 1°C above 80°C)
#   Emergency shutdown: >85°C (system-level thermal protection)
```

---

## PART 3: POWER DELIVERY ARCHITECTURE

### 3.1 Power Distribution Tiers

```
PDU (Power Distribution Unit) Architecture

Tier 1: Utility Power (Wall)
  Input: 208V 3-phase, 100A circuit = 36 kW capacity
  Incoming service: Typical data center provides 2 circuits per rack (72 kW total)

Tier 2: Rack PDU (Switched/Monitored)
  Input: 208V 3-phase from wall circuit
  Outlets: 20×20A circuits (rated for 4.8 kW per outlet, 16A continuous)
  Total capacity: ~60 kW per PDU
  
  Smart features:
    Power metering per outlet (measure consumption)
    Inlet monitoring (current draw, temperature)
    Outlet control (remote on/off, useful for power cycling stuck GPUs)
    SNMP monitoring (feed metrics to Prometheus/Grafana)

Tier 3: Node PSU (Power Supply Unit)
  Input: 208V 3-phase or 120V single-phase from PDU outlet
  Output: 3.86 kW sustained, 4.5 kW peak
  Efficiency: 90% (typical 80+ Gold rating)
  Redundancy: Single PSU per node (N+0); high-end systems use dual PSU with 50% load per unit

POWER TOPOLOGY FOR 8-NODE CLUSTER:

Wall ─────────┬─────────────────────┬─────────────────────┐
             PDU-A (30 kW)         PDU-B (30 kW)      spare
              │                      │
        ┌─────┴─────┬───────┐   ┌──┬─┴────┬───────┐
    Node1-4        spares   Node5-8     spares
   (4×4kW)        (4×4kW)  (4×4kW)     (4×4kW)
```

### 3.2 Power Consumption Forecasting

```yaml
CLUSTER UTILIZATION & POWER PLANNING

Scenario: Production training cluster ramping from 2 to 5 concurrent training jobs

Month 1: 1 training job (8 nodes, 64 GPU)
  Active nodes: 8/8
  Power: 30.88 kW compute × 1.4 cooling = 43.2 kW sustained
  Hourly cost: 43.2 kW × $0.12/kWh = $5.18/hour
  Monthly (assuming 16hr/day training): $5.18 × 16 × 30 = $2,486

Month 2: 2 concurrent jobs (16 nodes, 128 GPU)
  Active nodes: 16/16 (need to add more capacity or stagger jobs)
  Power: 61.76 kW compute × 1.4 = 86.4 kW
  Monthly cost: $86.4 × 0.12 × 16 × 30 = $4,976

Month 3–6: Upgrade facility power budget
  Install 2nd PDU pair (additional 72 kW circuit from utility)
  Cost: $5K installation + $500/month dedicated circuit charge
  New capacity: 144 kW (supports 4–5 concurrent 64-GPU jobs)

Electricity cost forecasting:
  Year 1 (1–2 jobs avg): ~$40K
  Year 2 (2–3 jobs avg): ~$70K
  Year 3 (3–4 jobs avg): ~$100K
  
  Amortized over 3-year cluster life: $210K electricity + $30K facility overhead = $240K
  Per-GPU: $240K / 64 GPU = $3,750/GPU over 3 years
```

---

## PART 4: TROUBLESHOOTING TABLE

| Symptom | Diagnostic | Root Cause | Resolution | Prevention |
|---|---|---|---|---|
| **GPUs throttling (clock reduction)** | `nvidia-smi` shows clocks at 1.2 GHz instead of 2.5 GHz | Thermal throttle due to high temperature (>80°C) | Reduce batch size, check cooling intake temp, verify fan operation | Monitor GPU temp trends, alert at >75°C |
| **Power loss (GPUs offline)** | Node powers off completely; BIOS not accessible | PSU overload or circuit breaker trip | Check PDU power draw; reduce node load (2 instead of 4 training jobs concurrently) | Monitor PDU inlet amps; alert at >80A |
| **Intermittent node reboots** | Node restarts unprompted every 1–2 hours | Unstable power supply or thermal shutdown | Swap PSU with known-good unit; check inlet air temperature | Trend PSU output voltage; replace if unstable |
| **Hot-aisle temperature > 45°C (setpoint 30°C)** | CRAC intake 25°C but exhaust 50°C | Hot-aisle/cold-aisle mixture (containment breach) | Seal gaps in raised floor, verify CRAC intake is pulling cold air | Implement blanking panels, monitor containment quarterly |
| **Cooling COP degradation (1 year ago: COP 3.5, now: COP 2.8)** | Power draw same, but more CRAC activity | Evaporator coil fouled with dust; reduced cooling efficiency | Replace CRAC filters, clean fins | Change filters every 3 months, trend CRAC power/cooling curve |

---

## SUMMARY

Power and thermal design determines cluster reliability and operating cost:

1. **Power budget:** 40–45 kW per 64-GPU cluster (sustained training), peaks to 50 kW during load.
2. **Cooling:** Air cooling (COP 3.0) costs $40K + high energy bill; liquid cooling (COP 5.0) costs $300K but saves $200K/year in electricity.
3. **Monitoring:** Track GPU temp, PDU watts, inlet air temp; alert when any exceed thresholds.
4. **Forecasting:** Plan facility power upgrades 12 months ahead; growth from 1 to 5 concurrent jobs doubles power requirements.

**In Chapter 6:** Software stack integration. How do you orchestrate CUDA, PyTorch, JAX, and distributed training frameworks to actually use all 64 GPUs efficiently?
