---
title: Chapter 10 — Monitoring and Operations
description: Cluster health, SLO tracking, capacity monitoring, cost attribution, alerting strategies.
sidebar_position: 11
tags: [monitoring, observability, slo, alerting, prometheus]
---

# Chapter 10 — Monitoring and Operations

## PART 1: OBSERVABILITY STACK

### 1.1 Key Metrics for Production Clusters

```yaml
GPU/NODE METRICS

GPU Metrics (per GPU, via nvidia-smi, DCGM):
  Utilization: Target >85% during training (indicates efficiency)
  Memory: Target >85% allocated (indicates full use)
  Temperature: Alert if >75°C (throttle at 80°C)
  Power: Target ~350W under load (detect thermal throttle if <300W)
  Clock speed: Should be max (if reduced = throttle)
  
  Example alert: GPU temp >75°C for >5 min → page on-call

CLUSTER METRICS

Throughput:
  Training: Tokens/sec (target 32M tokens/sec for 64-GPU cluster)
  Inference: QPS (target 500 QPS per region)
  Alert: If throughput <90% of baseline for 15 min → investigate

AllReduce Latency:
  Target: 2–5 ms for 64-GPU cluster (ring AllReduce)
  Alert: If >10 ms for 3 consecutive iterations → network issue

Network:
  IB port error rate: Should be 0 (any errors indicate link issues)
  Bandwidth utilization: Peak ~80% during AllReduce (not sustained)
  Congestion: Monitor switch buffer occupancy

Memory/Storage:
  Checkpoint write latency: Target <30 sec to NVMe (alerts if >60 sec)
  S3 upload rate: Target 100 MB/sec (alerts if <50 MB/sec)

Power:
  Cluster power draw: Should track GPU utilization (high correlation)
  PDU inlet amps: Alert if >80A (near circuit breaker)
  Facility temperature: Alert if >30°C (impacts cooling efficiency)

Cost Attribution:
  Per-job GPU-hours: Track for chargeback/forecasting
  Per-region costs: Compare cost/TFLOP across regions
  Compute efficiency: Cost per inference QPS or training step
```

### 1.2 Prometheus Scrape Configuration

```yaml
# prometheus.yml for AI factory monitoring

global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'gpu-nodes'
    scrape_interval: 30s
    static_configs:
      - targets:
        - 'node1:9100'  # Node exporter
        - 'node2:9100'
        - 'node3:9100'
        # ... all 16 nodes
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'nvidia_smi_.*|DCGM_FI_.*'
        action: keep
  
  - job_name: 'nvidia-dcgm'
    scrape_interval: 10s
    static_configs:
      - targets:
        - 'dcgm-exporter:9400'  # NVIDIA DCGM exporter
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'DCGM_FI_DEV_GPU_UTIL|DCGM_FI_DEV_GPU_TEMP|DCGM_FI_DEV_POWER_USAGE|DCGM_FI_DEV_SM_CLOCK|DCGM_FI_DEV_XID_ERRORS'
        action: keep
  
  - job_name: 'infiniband'
    scrape_interval: 60s
    static_configs:
      - targets: ['ib-exporter:9600']
  
  - job_name: 'training-app'
    scrape_interval: 10s
    static_configs:
      - targets: ['training-app:8000']
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'training_throughput_tokens_per_sec|training_loss|training_.*_latency'
        action: keep
```

---

## PART 2: ALERTING RULES

### 2.1 SLO-Driven Alerts

```yaml
# AlertingRules: Detect SLA breaches before they impact users

groups:
  - name: ai_factory_slos
    interval: 30s
    rules:
      
      # Training throughput SLO
      - alert: TrainingThroughputLow
        expr: training_throughput_tokens_per_sec < 0.9 * 32_000_000  # 90% of target
        for: 5m
        annotations:
          summary: "Training throughput below SLO ({{ $value }})"
          runbook: "Check GPU utilization, AllReduce latency, network congestion"
      
      # GPU temperature SLO (prevent throttling)
      - alert: GPUTemperatureHigh
        expr: DCGM_FI_DEV_GPU_TEMP > 75
        for: 1m
        annotations:
          summary: "GPU {{ $labels.gpu }} above 75°C"
          runbook: "Reduce batch size, check cooling"
      
      # Inference latency SLO
      - alert: InferenceLatencyP99High
        expr: inference_latency_p99_ms > 500
        for: 3m
        annotations:
          summary: "Inference p99 TTFT > 500ms (SLA breach)"
          runbook: "Check region load, scale up inference replicas"
      
      # Cluster availability SLO (infer from failed nodes)
      - alert: GPUFailureDetected
        expr: increase(gpu_failure_count[10m]) > 0
        annotations:
          summary: "{{ $value }} GPU failures in last 10 min"
          runbook: "Investigate failed GPU, assess cluster SLA impact"
      
      # Cost anomaly (detect runaway jobs)
      - alert: CostAnomalyDetected
        expr: (cluster_power_kw - cluster_power_kw_avg_7d) / cluster_power_kw_avg_7d > 0.3
        for: 10m
        annotations:
          summary: "Cluster power 30% above 7-day average"
          runbook: "Identify high-power jobs, check for resource leaks"
```

---

## PART 3: OPERATIONAL PROCEDURES

### 3.1 Incident Response Playbook

```yaml
INCIDENT: GPU FAILURE DETECTED

Detection:
  - DCGM detects GPU hang (no heartbeat for 30s)
  - Alert fires: "GPUFailureDetected"
  - On-call gets paged immediately

Initial Response (5 min):
  1. Confirm GPU is actually down (test via nvidia-smi)
  2. Check if it's training or inference job affected
  3. Kill affected job (training can resume from checkpoint)
  4. Estimate blast radius (1 GPU affects 64-GPU job = 1/64 throughput loss)

Mitigation (15 min):
  - Restart failed node (firmware reset, OS reboot)
  - If restart succeeds: Resume job from last checkpoint (loss ≈ 30 min work if checkpoints every 10 min)
  - If restart fails: Reallocate job to different node

Recovery (30–60 min):
  - Hardware RMA if persistent failure
  - Post-incident: Update monitoring to detect this failure faster
  - Cost: ~2 GPU-hours of lost training (recovery time) + 1 replacement GPU (~$30K)

SLA Impact:
  - Training job: Restarted, loss ≈ 1–2 hours work
  - Inference job: Failover to replica (no user impact if >N+1 redundancy)
```

---

## SUMMARY

Observability requires:
1. **Real-time metrics:** GPU utilization, temperature, power, network bandwidth, AllReduce latency.
2. **SLO-driven alerts:** Fire before SLA breach (e.g., alert if throughput 10% below target).
3. **Incident response:** Clear playbooks for GPU failure, network issues, out-of-memory conditions.
4. **Cost tracking:** Attribution per-job, per-region, per-user for chargeback.

**In Chapter 11:** Capacity planning and forecasting.
