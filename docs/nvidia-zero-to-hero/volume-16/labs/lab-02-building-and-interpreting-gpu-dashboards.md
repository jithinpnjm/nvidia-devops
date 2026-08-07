---
title: "Lab 02 — Building and Interpreting GPU Dashboards"
slug: lab-02-building-gpu-dashboards
sidebar_position: 2
description: "Hands-on: Create Grafana dashboards that turn raw metrics into decisions."
tags: [gpu, observability, grafana, dashboards, lab, hands-on]
---

# Lab 02 — Building and Interpreting GPU Dashboards

**Objective:** Create a Grafana dashboard showing GPU health, then interpret what it tells you under different load scenarios.

**Time:** 60 minutes | **Difficulty:** Intermediate | **Prerequisites:** Lab 01 (DCGM + Prometheus working)

## Step 1: Install Grafana

```bash
# Install Grafana
sudo apt-get install -y grafana-server

# Start service
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# Verify
curl -s http://localhost:3000/
```

**Expected output:** HTML response indicating Grafana is running.

## Step 2: Add Prometheus Data Source

```bash
# SSH into Grafana dashboard (or use browser)
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Prometheus",
    "type":"prometheus",
    "url":"http://localhost:9090",
    "access":"proxy",
    "isDefault":true
  }' \
  http://admin:admin@localhost:3000/api/datasources
```

**Expected output:**

```json
{"id":1,"name":"Prometheus","message":"Datasource added"}
```

## Step 3: Create Dashboard from Scratch

### Panel 1: GPU Utilization (Gauge)

Create a new dashboard and add panel:

**Query:**
```promql
avg(DCGM_FI_DEV_GPU_UTIL)
```

**Panel Settings:**
- Visualization: Gauge
- Min: 0, Max: 100
- Thresholds: Green (0-70), Yellow (70-85), Red (85-100)
- Unit: Percent (%)

**Interpretation:**
- Green (0-70%): GPU has available capacity
- Yellow (70-85%): GPU is well-utilized but has room
- Red (85%+): GPU is saturated or nearly saturated

### Panel 2: Temperature (Graph)

**Query:**
```promql
max(DCGM_FI_DEV_GPU_TEMP)
```

**Panel Settings:**
- Visualization: Time series graph
- Y-axis: 30-90 (°C)
- Add constant line at 82°C (alert threshold)
- Add constant line at 85°C (throttle threshold)

**Interpretation:**
- Below 75°C: Healthy with good thermal headroom
- 75-82°C: Monitor closely
- Above 82°C: Alert; thermal throttling may be imminent
- Above 85°C: Throttling is active; performance capped

### Panel 3: Memory Usage (Gauge)

**Query:**
```promql
DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_FREE * 100
```

**Panel Settings:**
- Visualization: Gauge
- Min: 0, Max: 100
- Thresholds: Green (0-75), Yellow (75-90), Red (90-100)
- Unit: Percent (%)

**Interpretation:**
- < 75%: Plenty of free memory
- 75-90%: Running out of headroom
- > 90%: OOM risk; next allocation may fail

### Panel 4: GPU Clock Rate (Graph)

**Query:**
```promql
DCGM_FI_DEV_SM_CLOCK
```

**Panel Settings:**
- Visualization: Time series
- Y-axis: 300-1500 (MHz)
- Add constant line at max clock for your GPU model (e.g., 1410 MHz)

**Interpretation:**
- Peak clocks (1400+ MHz): GPU is running at full speed
- Reduced clocks (800-1200 MHz): Thermal or power throttling
- Idle clocks (300-500 MHz): GPU has no work

## Step 4: Load Test and Observe

### Scenario A: Idle GPU

**Run:**
```bash
# Just let GPU sit
nvidia-smi dmon -s pucvmet -c 1
```

**Expected dashboard state:**
- Utilization: 0-5%
- Temperature: < 50°C
- Memory: < 5% used
- Clocks: 300 MHz (idle)

**Interpretation:** GPU is healthy but not being used.

### Scenario B: Light Compute Load

**Run:**
```bash
# Light matrix multiply
python3 << 'EOF'
import torch
x = torch.randn(1000, 1000, device='cuda')
for i in range(100):
    y = torch.matmul(x, x)
    print(f"Step {i}... ", end='', flush=True)
EOF
```

**Expected dashboard state:**
- Utilization: 40-60%
- Temperature: 55-65°C
- Memory: 5-10% used
- Clocks: 800-1200 MHz (moderate clocks)

**Interpretation:** Workload is moderate; GPU is handling it easily.

### Scenario C: Heavy Compute Load

**Run:**
```bash
# Heavy matrix multiply
python3 << 'EOF'
import torch
x = torch.randn(10000, 10000, device='cuda')
print("Running heavy load... (ctrl+c to stop)")
try:
    while True:
        y = torch.matmul(x, x)
except KeyboardInterrupt:
    pass
EOF
```

**Expected dashboard state (after 30 seconds):**
- Utilization: 85-95%
- Temperature: 70-80°C
- Memory: 20-30% used
- Clocks: 1410 MHz (peak clocks)
- Power: > 200W

**Interpretation:** GPU is maxed out; utilization, clocks, and power are all high.

### Scenario D: Memory Pressure

**Run:**
```bash
# Allocate large tensors
python3 << 'EOF'
import torch
print("Allocating GPU memory...")
tensors = []
for i in range(8):
    t = torch.randn(5000, 5000, device='cuda')
    tensors.append(t)
    print(f"Allocated {i+1} tensors ({(i+1)*25//1024}% of 40GB GPU)")
print("Holding memory... (ctrl+c to stop)")
try:
    while True:
        pass
except KeyboardInterrupt:
    pass
EOF
```

**Expected dashboard state:**
- Memory: 80-95% used
- Utilization: 0-5% (no compute happening)
- Temperature: < 50°C (no heat from computation)
- Clocks: 300 MHz (idle)

**Interpretation:** Memory is heavily used but GPU is not computing. This is normal during large batch allocations.

## Step 5: Create Alert Rules

**In Prometheus (`prometheus.yml`), add alert rules:**

```yaml
rule_files:
  - "gpu-alerts.yml"
```

**Create `gpu-alerts.yml`:**

```yaml
groups:
  - name: gpu_health
    interval: 30s
    rules:
      - alert: GPUTemperatureHigh
        expr: max(DCGM_FI_DEV_GPU_TEMP) > 82
        for: 5m
        annotations:
          summary: "GPU temperature > 82°C"
      
      - alert: GPUMemoryPressure
        expr: (DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE)) > 0.9
        for: 10m
        annotations:
          summary: "GPU memory > 90% full"
      
      - alert: GPUUtilizationLow
        expr: avg(DCGM_FI_DEV_GPU_UTIL) < 10
        for: 30m
        annotations:
          summary: "GPU utilization < 10% for 30 min"
```

## Dashboard Interpretation Scenarios

### Scenario 1: Healthy Training Job

**Dashboard shows:**
- Utilization: 80-85% (steady)
- Temperature: 70-75°C (stable)
- Memory: 85-90% used (stable)
- Clocks: 1410 MHz (peak, steady)
- Power: 200-210W (steady)

**Interpretation:** ✓ All healthy. Job is well-optimized.

### Scenario 2: Thermal Throttle Imminent

**Dashboard shows:**
- Temperature: Rising from 75°C to 82°C over 5 minutes
- Clocks: Dropping from 1410 to 1200 MHz
- Utilization: Steady at 85% (GPU still working)
- Power: Rising as clocks reduced (less efficient at lower clocks)

**Interpretation:** ⚠ Thermal incident starting. Alert on-call; reduce load or check cooling.

### Scenario 3: Data Pipeline Starvation

**Dashboard shows:**
- Utilization: Oscillating 90% → 5% → 90% every 10 seconds
- Temperature: Oscillating 80°C → 55°C → 80°C
- Memory: Steady
- Clocks: Oscillating 1410 → 300 → 1410 MHz

**Interpretation:** ⚠ GPU runs out of work, idles while waiting for next batch. Data loader is the bottleneck.

### Scenario 4: One GPU in Multi-GPU Job Slower

**Dashboard (multi-GPU):**
- GPU 0: Utilization 85%, Clocks 1410 MHz, Temp 75°C
- GPU 1: Utilization 85%, Clocks 1410 MHz, Temp 75°C
- GPU 2: Utilization 40%, Clocks 800 MHz, Temp 60°C  ← **STRAGGLER**
- GPU 3: Utilization 85%, Clocks 1410 MHz, Temp 75°C

**Interpretation:** ✗ GPU 2 is being starved or throttled. Check:
1. Is GPU 2 being scheduled less work?
2. Is GPU 2 overheating (check cooling)?
3. Is NVLink to GPU 2 saturated?

## Verification Checklist

- [ ] Dashboard loads in Grafana (http://localhost:3000)
- [ ] All four panels show live data
- [ ] Panels update when GPU load changes
- [ ] Utilization gauge changes when you run matrix multiply
- [ ] Temperature graph shows trend over time
- [ ] Thresholds (82°C line) are visible on temperature graph
- [ ] Alerts are defined in Prometheus

## Key Takeaways

1. **Dashboards should show correlation** — temperature, clocks, utilization, memory together tell the story
2. **Trends matter more than snapshots** — a 1-second graph is noise; a 1-hour graph shows patterns
3. **Thresholds must be meaningful** — alerting on temperature is less useful than alerting on thermal throttle events
4. **Multi-panel dashboards catch cascading failures** — if temp and clocks both change, you know throttling is happening

## Cleanup

```bash
# Stop heavy workload
pkill -f "python.*cuda"
```

---

**Time spent:** ___ minutes | **Difficulty actual:** ___ / 10
