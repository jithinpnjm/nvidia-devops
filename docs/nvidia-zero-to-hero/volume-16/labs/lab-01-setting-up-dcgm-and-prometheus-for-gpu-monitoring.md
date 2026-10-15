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

## Step 1: Install DCGM 4

DCGM 4 packages are named for the CUDA major version your driver supports. Find it first:

```bash
nvidia-smi -q | grep -E 'Driver Version|CUDA Version'
CUDA_VERSION=12      # the major version printed above

# Ubuntu / Debian (NVIDIA CUDA repository configured)
sudo apt-get update
sudo apt-get install --yes --install-recommends datacenter-gpu-manager-4-cuda${CUDA_VERSION}

# RHEL / Rocky / Fedora
# sudo dnf install --assumeyes datacenter-gpu-manager-4-cuda${CUDA_VERSION}

# Verify the client
dcgmi -v
```

- If a package named `datacenter-gpu-manager` (DCGM 3.x) is installed, remove it first, along with `datacenter-gpu-manager-config`.
- `dcgmi -v` prints the DCGM version and build information for your release. **Record it:** it is also the first thing to attach to any problem report.

## Step 2: Start the DCGM host engine

```bash
sudo systemctl enable --now nvidia-dcgm
systemctl status nvidia-dcgm --no-pager
dcgmi discovery --list
```

- The packaged service is `nvidia-dcgm` (it runs `nv-hostengine`).
- **Success looks like:** `dcgmi discovery --list` prints a line for every GPU you expect. `systemctl status` alone is not proof, because a process can be running before it is usable.
- **If a GPU is missing:** `dcgmi discovery --list --all` includes inactive GPUs and shows a non-OK `Status:` for them. Then check `nvidia-smi -L` and the kernel log for `NVRM: Xid`.

## Step 3: Run a quick diagnostic

```bash
dcgmi diag --run 1        # alias: -r short
```

- Level 1 runs quick deployment checks that normally take seconds. Levels 2 to 4 are longer and more invasive, so do not run them on a node that is serving production work.
- **Success looks like:** a result table with a `Pass` for each test in the Software category. A failed test shows `Fail`, the affected entity (for example `GPU0`), and a warning with the condition.
- **If it fails:** confirm the NVIDIA driver is loaded (`nvidia-smi` works), then re-run with `--debugLogFile /tmp/nvvs.log -d DEBUG` and keep the log.

## Step 4: Run the DCGM Prometheus exporter

Option A: **Package (recommended on a bare-metal host)**

```bash
sudo apt-get install --yes datacenter-gpu-manager-exporter     # or: sudo dnf install datacenter-gpu-manager-exporter
sudo systemctl enable --now nvidia-dcgm nvidia-dcgm-exporter
systemctl status nvidia-dcgm-exporter --no-pager
```

- The package installs `/usr/bin/dcgm-exporter`, the default collector file `/etc/dcgm-exporter/default-counters.csv`, and the unit `nvidia-dcgm-exporter.service`.
- By default the exporter embeds its own host engine. It does not need `nvidia-dcgm` running, but starting both is harmless on a single host. Do not point two exporters at the same host.

Option B: **Container**

```bash
export DCGM_EXPORTER_TAG=latest       # or pin a version tag from the exporter container catalog
docker run -d --rm \
  --name dcgm-exporter \
  --gpus all \
  --cap-add SYS_ADMIN \
  -p 9400:9400 \
  nvcr.io/nvidia/k8s/dcgm-exporter:${DCGM_EXPORTER_TAG}

docker ps | grep dcgm-exporter
```

- `--gpus all` exposes every GPU to the container (requires the NVIDIA Container Toolkit).
- `--cap-add SYS_ADMIN` allows DCGM profiling fields such as `DCGM_FI_PROF_*`. Review it before using this command in production.
- `-p 9400:9400` publishes the default exporter port. Pin `DCGM_EXPORTER_TAG` in production; `latest` follows new releases.

## Step 5: Verify Metrics Are Exported

```bash
# Check that exporter is listening
curl -s http://localhost:9400/metrics | head -50
```

**Illustrative output (shape only, not captured from a live system):**

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

curl -s http://localhost:9090/api/v1/targets | grep dcgm
```

**Illustrative output (not captured):**

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

**Illustrative output (not captured):**

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

**Illustrative output (not captured) (should increase):**

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

- [ ] DCGM daemon is running (`systemctl status nvidia-dcgm`)
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
