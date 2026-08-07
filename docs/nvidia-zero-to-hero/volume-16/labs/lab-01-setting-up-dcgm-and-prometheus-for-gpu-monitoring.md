---
title: "Lab 01 — Setting Up DCGM and Prometheus for GPU Monitoring"
slug: lab-01-setting-up-dcgm-and-prometheus
sidebar_position: 1
description: "Hands-on: Install DCGM, export metrics to Prometheus, verify your first dashboard works."
tags: [gpu, observability, dcgm, prometheus, lab, hands-on]
---

# Lab 01 — Setting Up DCGM and Prometheus for GPU Monitoring

**Objective:** Build a working GPU observability stack from scratch. By the end, you'll have DCGM → Prometheus → Grafana collecting metrics from your GPU.

**Time:** 45 minutes | **Difficulty:** Intermediate | **Prerequisites:** GPU node with NVIDIA drivers, `docker` or native package manager

## Step 1: Install DCGM

```bash
# On Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y datacenter-gpu-manager

# Verify installation
dcgmi -V
```

**Expected output:**

```text
DCGM Diagnostic
Build: 12.7.1
Copyright 2017-2024 NVIDIA Corporation
DCGM Version: 3.7.1
```

## Step 2: Start DCGM Daemon

```bash
# Enable and start
sudo systemctl enable nv-hostengine
sudo systemctl start nv-hostengine

# Verify it's running
sudo systemctl status nv-hostengine
ps aux | grep nv-hostengine
```

**Expected output:**

```text
● nv-hostengine.service - NVIDIA DCGM Engine
     Loaded: loaded
     Active: active (running)
```

## Step 3: Test DCGM Can See Your GPUs

```bash
# Run quick diagnostic
dcgmi diag -r 1
```

**Expected output (healthy):**

```text
Diagnostic Level 1 (Quick)
For GPU 0 [NVIDIA A100-PCIE-40GB]:
  Power: 185W / 250W ✓
  Temperature: 45°C / 85°C ✓
  Memory: 0GB / 40GB ✓
  Throttling: None ✓
  ECC: Enabled, 0 errors ✓
```

**If diagnostic fails:** Check that NVIDIA driver is loaded (`nvidia-smi` should work).

## Step 4: Run DCGM Prometheus Exporter

Option A: **Using Docker (recommended for isolation)**

```bash
# Pull DCGM exporter image
docker pull nvcr.io/nvidia/k8s/dcgm-exporter:3.1.7-3.1.7-ubuntu20.04

# Run exporter
docker run -d \
  --name dcgm-exporter \
  --gpus all \
  --privileged \
  --net=host \
  nvcr.io/nvidia/k8s/dcgm-exporter:3.1.7-3.1.7-ubuntu20.04

# Verify it's running
docker ps | grep dcgm-exporter
```

Option B: **Native Installation**

```bash
# Install dcgm-exporter package
sudo apt-get install -y dcgm-exporter

# Start service
sudo systemctl start dcgm-exporter
sudo systemctl status dcgm-exporter
```

## Step 5: Verify Metrics Are Exported

```bash
# Check that exporter is listening
curl -s http://localhost:9400/metrics | head -50
```

**Expected output (first 20 lines):**

```text
# HELP DCGM_FI_DEV_GPU_TEMP GPU temperature (in C).
# TYPE DCGM_FI_DEV_GPU_TEMP gauge
DCGM_FI_DEV_GPU_TEMP{gpu="0",uuid="GPU-<uuid>"} 45

# HELP DCGM_FI_DEV_FB_FREE Framebuffer memory free (in MB).
# TYPE DCGM_FI_DEV_FB_FREE gauge
DCGM_FI_DEV_FB_FREE{gpu="0",uuid="GPU-<uuid>"} 40960

# HELP DCGM_FI_DEV_GPU_UTIL GPU utilization (%).
# TYPE DCGM_FI_DEV_GPU_UTIL gauge
DCGM_FI_DEV_GPU_UTIL{gpu="0",uuid="GPU-<uuid>"} 0
```

## Step 6: Install and Configure Prometheus

```bash
# Download Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xzf prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64

# Create config file
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'dcgm'
    static_configs:
      - targets: ['localhost:9400']
EOF

# Start Prometheus
./prometheus --config.file=prometheus.yml &

# Verify it's running
curl -s http://localhost:9090/api/v1/targets | grep dcgm
```

**Expected output:**

```json
{
  "status": "success",
  "data": {
    "activeTargets": [
      {
        "labels": {
          "job": "dcgm"
        },
        "scrapeUrl": "http://localhost:9400/metrics"
      }
    ]
  }
}
```

## Step 7: Query Your First Metric

```bash
# Query Prometheus for GPU temperature
curl -s 'http://localhost:9090/api/v1/query?query=DCGM_FI_DEV_GPU_TEMP' | jq '.data.result'
```

**Expected output:**

```json
[
  {
    "metric": {
      "__name__": "DCGM_FI_DEV_GPU_TEMP",
      "gpu": "0",
      "uuid": "GPU-<uuid>"
    },
    "value": [
      1693412345,
      "45"
    ]
  }
]
```

## Step 8: Generate Some GPU Load (to see metrics change)

```bash
# Run a GPU workload in the background
python3 << 'EOF'
import torch
import time

print("Loading GPU...")
x = torch.randn(10000, 10000, device='cuda')
print("Running matrix multiply loop (ctrl+c to stop)...")
try:
    while True:
        y = torch.matmul(x, x)
except KeyboardInterrupt:
    print("\nDone")
EOF
```

**In another terminal, monitor metrics:**

```bash
# Query GPU utilization
for i in {1..10}; do
  curl -s 'http://localhost:9090/api/v1/query?query=DCGM_FI_DEV_GPU_UTIL' | jq '.data.result[0].value[1]'
  sleep 2
done
```

**Expected output (should increase):**

```text
"0"
"5"
"15"
"65"
"85"
"88"
"87"
"89"
"85"
"80"
```

## Verification Checklist

- [ ] DCGM daemon is running (`systemctl status nv-hostengine`)
- [ ] DCGM exporter is accessible (`curl http://localhost:9400/metrics`)
- [ ] Prometheus is scraping DCGM (`http://localhost:9090/targets` shows `dcgm` as Up)
- [ ] GPU metrics are appearing in Prometheus (`curl` query returns non-null values)
- [ ] Metrics change when GPU is under load (utilization increases)

## Troubleshooting

| Problem | Solution |
|---|---|
| `curl: command not found` | Install curl: `sudo apt-get install curl` |
| DCGM exporter 404 on `/metrics` | Check `docker ps` (if using Docker) or `systemctl status dcgm-exporter` (native) |
| Prometheus shows `dcgm` target as Down | Check that port 9400 is open: `netstat -tlnp \| grep 9400` |
| GPU util stays at 0 even under load | Run benchmark script in background: `nvidia-smi dmon -s pucvmet &` for reference |
| Port 9400 already in use | Change exporter port: `docker run ... -p 9401:9400` and update Prometheus config |

## Self-Assessment

**You successfully completed this lab if:**
1. ✓ DCGM daemon is running and passing health checks
2. ✓ Prometheus is scraping metrics from DCGM exporter
3. ✓ You can see GPU metrics (temperature, memory, utilization) in Prometheus
4. ✓ Metrics change when you run GPU workload

**Next lab:** Lab 02 builds Grafana dashboards to visualize these metrics.

## Key Concepts Reinforced

- DCGM is the bridge between hardware and observability
- Prometheus scrapes metrics on a regular interval and stores them as time-series
- Metrics must flow through the entire stack (hardware → DCGM → exporter → Prometheus)
- Testing each layer independently (with curl) helps isolate problems

## Cleanup

```bash
# Stop the workload
pkill -f "python.*cuda"

# Stop Prometheus
pkill -f "prometheus"

# Stop DCGM exporter (if using Docker)
docker stop dcgm-exporter
```

---

**Time spent:** ___ minutes | **Difficulty actual:** ___ / 10 | **Notes:** ___
