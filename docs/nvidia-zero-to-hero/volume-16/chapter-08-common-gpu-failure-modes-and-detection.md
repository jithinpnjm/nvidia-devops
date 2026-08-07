---
title: "Chapter 08 — Common GPU Failure Modes and Detection"
slug: chapter-08-common-gpu-failure-modes-and-detection
sidebar_position: 8
description: "Every GPU failure has a signature. Learn to read the telemetry and catch failures early."
tags: [gpu, observability, troubleshooting, operations, failure-modes]
---

# Chapter 08 — Common GPU Failure Modes and Detection

GPU failures are not random. Each failure mode has a distinctive signature in metrics, logs, and traces. The key to operational confidence is recognizing those signatures early, before user-facing impact.

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability and Operational Health |
| Difficulty | Advanced |
| Estimated reading time | 45 minutes |
| Primary audience | Operations, SRE, cluster operators |
| Core question | What does a failing GPU actually look like in the metrics? |

## Learning Objectives

You will be able to:
- Identify the metric signature of each common GPU failure
- Detect failures before they crash the job (leading indicators)
- Distinguish hardware failure from software bugs from misuse
- Set alerts that catch failures while still giving time to intervene
- Recover from transient failures without user impact

## Failure Mode 1: GPU Thermal Throttling (Overheating)

**Signature:** Temperature rises above thermal limit (85°C for most NVIDIA data-center GPUs); clock rate drops; throughput falls.

**Metrics Evidence:**

```text
Alert trigger:
  DCGM_FI_DEV_GPU_TEMP > 82°C for 5 min
  AND
  increase(DCGM_FI_DEV_THERMAL_SLOWDOWN[1h]) > 0

Real output (failing):
  Temperature: 85°C (at limit)
  Clock rate: 1200 MHz (reduced from 1410 MHz nominal)
  Utilization: Still 85% (GPU is working, but throttled)
  Throughput: 70% of baseline (clock reduction scales throughput)
```

**Root Causes:**
1. Cooling system failed (fans not spinning, airflow blocked)
2. Ambient temperature too high
3. Power supply delivering unstable voltage (affects voltage regulator efficiency)
4. GPU sitting in wrong slot (bad airflow)

**Detection Commands:**

```bash
# Check fan speed
nvidia-smi -q | grep "Fan Speed"
# Output: 100% is normal; 0% means fan failure

# Check thermal throttle history
nvidia-smi -q | grep -A2 "Thermal Slowdown"
# Output: Thermal Slowdown: Active (GPU is throttling RIGHT NOW)

# Check power efficiency (if power supply is bad)
nvidia-smi -q | grep -A2 "Power Draw"
# Output: Oscillating wildly = power supply instability
```

**Remediation:**

```bash
# Immediate: reduce load to give cooling system time
# (set job to lower batch size, or pause job)

# Investigation: 
# 1. Check system temperature sensors
cat /sys/class/thermal/*/temp

# 2. Check cooling system
# SSH into node and physically inspect
# - Fans spinning?
# - Heatsink fins clean?
# - Thermal paste intact?

# Long-term: Replace cooling, upgrade power supply, or move GPU
```

## Failure Mode 2: ECC Error Spike

**Signature:** Corrected ECC errors increasing over time (worn-out memory); or uncorrected ECC errors (data corruption risk).

**Metrics Evidence:**

```text
Alert trigger:
  increase(DCGM_FI_DEV_ECC_ERRORS_CORRECTED[1h]) > 100
  OR
  increase(DCGM_FI_DEV_ECC_ERRORS_UNCORRECTED[1h]) > 0

Real output (failing):
  Corrected ECC errors: 245 in last hour (normal: 0-5)
  Uncorrected ECC errors: 0 (still within tolerance, but trending up)
  Prediction: At this rate, uncorrected errors coming in 1-2 weeks
```

**Root Causes:**
1. GPU memory cells wearing out (radiation damage, voltage instability)
2. Overclocking (GPU clocks or memory clocks pushed above safe limits)
3. Temperature cycling (thermal stress on memory)

**Detection Commands:**

```bash
# Query ECC counters
nvidia-smi -q -d ECC | grep -E "Corrected|Uncorrected"

# Real output:
# ECC Errors (Corrected, per epoch)
#   Volatile (this session): 0
#   Aggregate (since boot): 145
# ECC Errors (Uncorrected)
#   Volatile: 0
#   Aggregate: 0

# Monitor ECC error rate over time
for i in {1..60}; do
  nvidia-smi -q -d ECC | grep -i "Uncorrected" | grep -v "0"
  sleep 60
done
```

**Remediation:**

```bash
# Immediate: if uncorrected errors appear, GPU must be drained and replaced
# (workloads on this GPU will produce corrupted results)

# Investigation:
# 1. Check GPU clocks (did someone overclock?)
nvidia-smi -q | grep "Max Clocks"

# 2. Check temperature history
# (was GPU unusually hot before errors appeared?)

# Long-term: Replace GPU if ECC errors don't stop
```

## Failure Mode 3: GPU Fell Off the Bus (Hardware Disconnection)

**Signature:** GPU disappears from `nvidia-smi` output or Xid error in kernel logs.

**Metrics Evidence:**

```text
Alert trigger:
  count(DCGM_FI_DEV_GPU_UTIL) drops below expected number
  OR
  dmesg shows: "Xid (PCI:xxxx:xx:xx.x): [error code]"

Real output (failing):
  $ nvidia-smi
  ERROR: Failed to initialize NVML: Driver/library version mismatch

  $ dmesg | tail -5
  NVRM: Xid (PCI:0000:17:00.0): 94, GPU has fallen off the bus.
  NVRM: GPU at PCI:0000:17:00.0 has fallen off the bus.
  NVRM: The GPU encountered an unrecoverable error. Please reboot.
```

**Root Causes:**
1. PCIe link error (electrical noise, bad cable, PCIe slot loose)
2. Power delivery failure (GPU isn't getting power)
3. GPU firmware crash

**Detection Commands:**

```bash
# Check PCIe link status
lspci -v | grep -E "Link|Status" | head -20

# Real output (healthy):
# LnkCap: Speed 16GT/s, Width x16
# LnkSta: Speed 16GT/s, Width x16

# Real output (degraded):
# LnkCap: Speed 16GT/s, Width x16
# LnkSta: Speed 5GT/s, Width x1  ← DEGRADED LINK (x1 instead of x16)

# Check for link down events
journalctl -k | grep -i "link down\|pcie"

# Check GPU power rails
dmidecode | grep -i power  # if available on your system
```

**Remediation:**

```bash
# Immediate: Remove GPU from service (will not recover without hardware intervention)

# Investigation:
# 1. Check PCIe slot connections
# 2. Check power connectors (are 6-pin or 8-pin power connectors seated firmly?)
# 3. Check for BIOS errors or firmware corruption

# Recovery:
# 1. Reseat GPU in slot
# 2. Reseat power connectors
# 3. Flash latest GPU firmware
# 4. If none of above work, GPU must be replaced
```

## Failure Mode 4: Memory Allocation Stall (Fragmentation or OOM)

**Signature:** Job request memory, allocation takes seconds or minutes; job appears hung.

**Metrics Evidence:**

```text
Alert trigger:
  DCGM_FI_DEV_FB_USED > 95% for sustained period
  AND
  allocation latency > 100ms (visible in application logs)

Real output (failing):
  $ python train.py
  ... training runs fine ...
  Step 1000: allocation_time=120ms (normal: 1ms)
  Step 1001: allocation_time=800ms
  Step 1002: allocation_time=2300ms (2.3 seconds!)
  Step 1003: [CUDA OUT OF MEMORY ERROR]
```

**Root Causes:**
1. Memory fragmentation (allocated but not freed chunks scattered across HBM)
2. Memory leak (application allocates and never frees)
3. Batch size too large for GPU capacity

**Detection Commands:**

```python
# In PyTorch, check fragmentation
import torch
print(f"GPU memory allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB")
print(f"GPU memory reserved: {torch.cuda.memory_reserved() / 1e9:.2f} GB")
print(f"Fragmentation: {(torch.cuda.memory_reserved() - torch.cuda.memory_allocated()) / 1e9:.2f} GB")

# Output (healthy):
# allocated: 28.4 GB, reserved: 30.2 GB, fragmentation: 1.8 GB

# Output (failing):
# allocated: 28.4 GB, reserved: 39.8 GB, fragmentation: 11.4 GB (GPU memory is fragmented!)
```

**Remediation:**

```bash
# Immediate: restart job (memory is freed on restart)

# Investigation:
# 1. Check application logs for repeated allocation patterns
# 2. Profile memory usage over time (is it rising steadily?)

# Long-term:
# 1. Clear caches between steps
# 2. Use gradient checkpointing to reduce intermediate tensor size
# 3. Reduce batch size if GPU cannot accommodate it
```

## Failure Mode 5: Straggler GPU (One GPU Much Slower Than Others)

**Signature:** One GPU consistently shows lower utilization or throughput than peer GPUs on the same node.

**Metrics Evidence:**

```text
Alert trigger:
  max(DCGM_FI_DEV_GPU_UTIL by gpu) - min(...) > 30%  # More than 30% variation between GPUs

Real output (failing):
  GPU 0: 85% utilization, 1410 MHz
  GPU 1: 85% utilization, 1410 MHz
  GPU 2: 48% utilization, 900 MHz  ← STRAGGLER (half utilization)
  GPU 3: 84% utilization, 1410 MHz

Cause investigation:
  - GPU 2 clocks are low: power throttling or thermal throttling?
  - Is GPU 2's load lower by design, or is it starved?
```

**Detection Commands:**

```bash
# Find straggler in multi-GPU training
nvidia-smi dmon -s pucvmet -c 60 | awk '{print $1, $3}' | sort | uniq -c

# Real output (healthy):
# GPU 0: utilization counts: 60 samples at ~85%
# GPU 1: utilization counts: 60 samples at ~85%
# GPU 2: utilization counts: 60 samples at ~85%
# GPU 3: utilization counts: 60 samples at ~85%

# Real output (straggler):
# GPU 0: utilization counts: 60 samples at ~85%
# GPU 1: utilization counts: 60 samples at ~85%
# GPU 2: utilization counts: 42 samples at 50%, 18 samples at 10% (oscillating!)
# GPU 3: utilization counts: 60 samples at ~85%
```

**Remediation:**

```bash
# Immediate: investigate GPU 2
# 1. Check temperature: is it hotter than others?
nvidia-smi -q | grep -A1 "Temperature"

# 2. Check clocks: is it throttled?
nvidia-smi -q | grep "Clock"

# 3. Check power: is it drawing less power?
nvidia-smi -q | grep "Power Draw"

# 4. If still unknown, move workload to different GPU and see if problem moves with it
# (problem is GPU-specific) or stays (problem is in the application/driver)
```

## Summary: Failure Signatures

| Failure | Primary Signal | Secondary Signal | TTL (time to lose data) |
|---|---|---|---|
| Thermal throttle | Temp > 82°C, clocks down | Power stable, memory OK | Days (performance degraded, not fatal) |
| ECC errors spike | Corrected ECC > 100/hr | Temp OK, power OK | Weeks (uncorrected errors coming) |
| GPU fell off bus | Xid error in logs | nvidia-smi fails | Immediate (GPU offline) |
| Memory fragmentation | Allocation latency spike | Memory used > 95% | Hours (OOM crash coming) |
| Straggler GPU | One GPU 30%+ slower than others | Clocks lower on straggler | Minutes (job starves, throughput drops) |

## Key Takeaways

1. **Every failure has a leading indicator** — don't wait for the crash; alert on the indicator (rising temp, increasing ECC, allocation latency spike).
2. **Distinguish hardware failure (Xid, fell off bus) from resource exhaustion (OOM, thermal throttle)** — hardware fails need node isolation; resource exhaustion needs job tuning.
3. **Monitor the monitors** — if DCGM daemon crashes, all GPU visibility is lost; alert on DCGM health too.
4. **One GPU slow affects the whole distributed job** — straggler detection is critical for cluster-wide observability.
5. **Temperature and power are coupled** — rising temp usually means problem in power delivery or cooling, not in the GPU itself.

## Cross-References

- Chapter 02: Signals, metrics, logs, traces
- Chapter 03: Core GPU metrics
- Chapter 04: DCGM and metrics collection
- **Next:** Chapter 09 covers health checks and SLOs
