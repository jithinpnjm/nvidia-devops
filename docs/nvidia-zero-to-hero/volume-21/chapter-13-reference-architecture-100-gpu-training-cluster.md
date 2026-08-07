---
title: Chapter 13 — Reference Architecture: 100-GPU Training Cluster
description: Complete design from hardware selection through network topology to operational procedures. Real topology, cost breakdown, deployment checklist.
sidebar_position: 14
tags: [reference-architecture, training-cluster, topology, deployment]
---

# Chapter 13 — Reference Architecture: 100-GPU Training Cluster

## COMPLETE DESIGN: LLAMA-100B TRAINING

### Cluster Specification

```yaml
CONFIGURATION:

Compute:
  16 nodes × 8 GPU H100 SXM5 = 128 GPUs (overkill for 100B, allows elasticity)
  
  Per-node:
    CPU: 2× EPYC Bergamo 128 cores
    Memory: 192 GB DDR5
    GPU: 8× H100 80GB SXM5 (NVLink 5.0 within node)
    Storage: 4× 7.68TB NVMe (RAID-1, 15TB effective)
    NIC: 1× ConnectX-7 400GbE (NDR InfiniBand)

Interconnect:
  Switch: 1× NVIDIA Quantum2 NDR 400G
  Topology: Single-rack, 16 compute ports + 4 uplink ports
  Cables: Direct attach copper (DAC), 6ft

Storage:
  Cluster NAS: NetApp AFF A900 (500 TB, 10 GB/sec NFS)
  Archive: AWS S3 (training dataset versioning, checkpoints)

Cooling:
  Liquid cooling (cold plate on GPUs)
  Capacity: 50 kW (headroom 25%)

Power:
  Input: 2× 208V 3-phase circuits (72 kW total)
  PDUs: 2× 40-outlet monitored/switched
  UPS: 30 kW, 10 min backup power

Networking:
  Public: 1× 100GbE connection to production network
  Out-of-band management: 1 Gbps dedicated network

Observability:
  GPU monitoring: NVIDIA DCGM + Prometheus exporter
  Network: InfiniBand counters via Mellanox MLNX_OS
  Compute: Telegraf node exporter
  Visualization: Grafana dashboards (GPU, network, power)

TOPOLOGY DIAGRAM

                    Public Network (100GbE)
                           │
                      Gateway Router
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
      ToR 1          NVIDIA Quantum2        ToR 2
     (100GbE)        (400G NDR Switch)      (100GbE)
         │             │  │  │  │           │
         ├─────────────┼┼──────────┤
         │             │ 16 ports  │        │
    ┌────┴────┬────────┬────┬────────┐────┴─────┐
    │         │        │    │        │          │
  Node1    Node2   Node3   Node4  ...       Node16
 (8×H100)
```

### Hardware Cost Breakdown

```yaml
CAPEX ANALYSIS:

GPUs: 128 × H100 SXM5 @ $30K = $3.84M (54% of hardware)
CPUs + Memory: 16 × ($15K) = $240K
NVMe Storage: 16 × ($50K) = $800K
NDR Switch: 1 × $350K = $350K
NAS (shared infrastructure): $200K (allocated)
Cooling/Power/Rails: $400K
Installation & Testing: $200K
Subtotal Hardware: $6.03M

Software & Licensing:
  NVIDIA Collective Communications: $50K (commercial license)
  Operating system: $20K (RHEL licenses)
  Monitoring (Grafana, Prometheus): $10K
Subtotal Software: $80K

TOTAL CAPEX: $6.11M

Cost per GPU: $6.11M / 128 = $47.7K per GPU
Cost per TFLOP: $6.11M / (128 × 989 TFLOPS) ≈ $48 per TFLOP (consistent with Chapter 2's ~$30-48/TFLOP per-GPU range for H100)
```

### Deployment Procedure

```yaml
DEPLOYMENT CHECKLIST (8 weeks):

Weeks 1-2: Site Preparation
  - Install power distribution (PDUs, cables, circuit breakers)
  - Install cooling infrastructure (chiller, coolant lines)
  - Set up racks and cable trays
  - Verify utility power (208V 3-phase, 100A circuits available)
  - Test UPS failover

Weeks 3-4: Hardware Installation
  - Unpack, inventory, and burn-in test all GPUs (8 tests × 1 hour = full day per node)
  - Install nodes in rack (8 hours for 16 nodes)
  - Install network switch, connect nodes
  - Verify IB link status (ibstat on each node, all ports UP)

Weeks 5-6: Software & Configuration
  - Install OS (RHEL 8.x or Ubuntu 22.04)
  - Install NVIDIA drivers (Driver 560.x)
  - Install CUDA 12.5 + cuDNN 9.2
  - Install NCCL 2.22.x, Megatron-LM
  - Configure distributed training environment (torchrun, DeepSpeed)
  - Run NCCL tests on all node pairs (verify AllReduce latency <5ms)

Week 7: Baseline Performance Testing
  - Train small model (GPT-2, 1.5B params) for 100 steps
  - Measure throughput: Target 128 GPU × 6.5K TFLOPS = 832 TFLOPS (ideal)
  - Measure actual: Typically 90% = 750 TFLOPS (excellent scaling)
  - Verify AllReduce overhead <2%
  - Measure power draw: 16 nodes × 3.86 kW = 61.8 kW (expected)

Week 8: Production Readiness
  - Deploy Prometheus + Grafana for monitoring
  - Configure alerts (GPU temp >75°C, AllReduce >10ms, power >70 kW)
  - Set up checkpoint infrastructure (NAS NFS, S3 sync)
  - Configure job scheduler (Kubernetes or custom SLURM)
  - Run 1-week stability test (burn-in training, detect intermittent failures)

LAUNCH CHECKLIST:
  ✓ All 128 GPUs healthy (nvidia-smi output on each node)
  ✓ All AllReduce latencies <5ms (NCCL test output)
  ✓ Checkpoint save/load working (test on small model)
  ✓ Monitoring alerts configured and tested
  ✓ Runbook for common failures written
  ✓ On-call rotation established
```

### Operational Procedures

```yaml
DAILY OPERATIONS:

Pre-Training Checklist:
  1. Verify cluster health: `nvidia-smi` on all nodes shows all GPUs healthy
  2. Check network: `ibstat` shows all IB ports UP
  3. Verify storage: NAS mount point accessible, free space >50 TB
  4. Check power/cooling: PDU <80A, facility temp <25°C
  5. Review alerts: No GPU errors, no network errors in past 24 hours

Training Job Startup:
  1. Load training checkpoint (if resuming)
  2. Allocate 128 GPUs via job scheduler
  3. Launch training with torchrun (auto-sets RANK, WORLD_SIZE)
  4. Verify all ranks connected (check NCCL startup logs)
  5. Monitor first iteration: GPU utilization >90%, AllReduce <5ms

Monitoring During Training:
  - Throughput: Should be stable within ±2%
  - GPU utilization: >90%
  - GPU temperature: 60–70°C
  - AllReduce latency: 2–5 ms per iteration
  - Loss: Smooth convergence (no NaN or divergence)
  - Checkpoint: Save every 500 steps (~8 hours for Llama-70B)

Troubleshooting:
  - Low throughput (<80% of baseline): Check AllReduce latency, GPU clocks, network congestion
  - GPU thermal throttle: Reduce batch size, verify cooling
  - Failed checkpoint: Retry save to NAS, fallback to S3 if NAS down
  - Hanging job: NCCL timeout likely; kill job, investigate rank connectivity

Weekly:
  - Review GPU error logs, replace any with >10 error counts/week
  - Check data pipeline: Verify no I/O stalls, NAS performance >8 GB/sec
  - Validate backups: Confirm S3 checkpoint sync completed

MTTR Targets:
  GPU failure: 15 min to detect + kill job + restart
  Network link flap: 5 min to detect + reroute + retry AllReduce
  Checkpoint failure: 10 min to retry/failover to S3
  Power loss: <1 min (UPS covers brief outage)
```

---

## SUMMARY

A production 100-GPU training cluster requires:

1. **Hardware:** 128 H100s ($3.84M), NDR switch ($350K), liquid cooling, redundant power.
2. **Network:** Full-bisection interconnect (single-rack); AllReduce latency <5ms.
3. **Monitoring:** Real-time GPU/network metrics; alert if ANY metric deviates >10% from baseline.
4. **Deployment:** 8-week process from bare metal to training (weeks 1-4 hardware, 5-6 software, 7-8 testing).
5. **Operations:** Daily health checks, weekly trend analysis, MTTR <15 min for most failures.

**Cost:** $6.11M CAPEX + $0.6M OPEX/year = $8.91M over 3 years for a single-rack cluster.

**In Chapter 14:** Reference architecture for multi-region inference deployment.
