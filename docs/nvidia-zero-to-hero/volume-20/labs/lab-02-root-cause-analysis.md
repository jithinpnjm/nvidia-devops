---
title: "Lab 02 — Root Cause Analysis"
slug: "lab-02-root-cause-analysis"
sidebar_position: 2
description: "Given raw metric data, trace the chain from symptom to root cause."
---


> **Note:** Output blocks and numbers in this lab are illustrative (not captured from a real system). Use them to practice the reasoning, not as reference values.

## Objective

Practice analyzing real metric data to narrow down root cause from multiple possible explanations. Learn when correlations mislead and how to distinguish root causes from symptoms.

## Duration

90 minutes

## Prerequisites

- Understanding of GPU metrics (utilization, memory, temperature, power)
- Familiarity with profiler output (Nsight Systems, PyTorch profiler)
- Knowledge of distributed training concepts

## Exercises

### Exercise 1: Thermal or Power?

You observe:
- GPU utilization: 95% (stable)
- GPU memory: 70% (stable)
- GPU temperature: 80°C (rising)
- GPU clock speed: 1833 MHz (down from 1980 MHz H100 boost)
- GPU power: 250W (down from 300W)
- Fan speed: 100%

Is this thermal throttling or power limiting? Construct your evidence chain.

### Exercise 2: Which GPU is the Straggler?

Four GPUs in AllReduce:
- GPU 0: 12ms AllReduce latency
- GPU 1: 12ms AllReduce latency
- GPU 2: 125ms AllReduce latency (stalled)
- GPU 3: 12ms AllReduce latency

Evidence available:
- NVLink topology matrix
- Per-GPU iteration timing
- NCCL_DEBUG trace (partial)

Determine: Is GPU 2 slow, or is GPU 2 waiting for something else? (Hint: in a synchronized collective, ranks wait for each other, so per-rank latency numbers like these usually come from timing before the collective or from isolated pairwise tests.)

### Exercise 3: The Intermittent Failure

Job sometimes slow, sometimes fast. No consistent pattern.

Given metrics:
- Utilization: always 85-95%
- Temperature: 65-70°C (healthy)
- Memory: stable
- Power: stable
- Performance: varies 50% (1000 samples/sec → 500 samples/sec)

What is your hypothesis? What evidence would you collect to distinguish between causes?

### Exercise 1 Solution: Thermal or Power?

**Analysis of the evidence chain:**

| Observation | Interpretation | Points to |
|-------------|----------------|-----------|
| Temp 80°C and rising | Approaching the slowdown threshold of many GPUs, but not conclusive | Thermal (weak) |
| Clock 1980 → 1833 MHz | Clocks were reduced by something | Either |
| Power 300 → 250 W | Draw fell, which happens with lower clocks or a power cap | Either |
| Fan 100% | Cooling is maxed (if this GPU has a fan; see Chapter 06 caveat) | Thermal (weak) |
| Utilization 95% stable | Utilization does not discriminate | Neither |

**Key point:** these numbers cannot distinguish thermal from power limiting by themselves. Lower clocks reduce power draw regardless of why the clocks dropped, so "power went down" is not evidence of a power cap. The discriminating evidence is the throttle reason bitmask.

**Proof:**
```bash
# Which reason is active right now?
nvidia-smi -i 0 -q -d PERFORMANCE
#   SW Power Cap, HW Slowdown, HW Thermal Slowdown, SW Thermal Slowdown, HW Power Brake Slowdown
# Is the configured power limit lower than the default?
nvidia-smi -i 0 --query-gpu=power.limit,power.default_limit --format=csv,noheader
# Chart temperature, power, and the throttle-reason field together over the incident window
#   (DCGM_FI_DEV_GPU_TEMP, DCGM_FI_DEV_POWER_USAGE, DCGM_FI_DEV_CLOCK_THROTTLE_REASONS)
```

**Reading the result:**
- Thermal slowdown active: fix cooling or airflow (Chapter 06, 08).
- SW Power Cap active with `power.limit` below default: someone or something set a lower limit; confirm intent (Chapter 09).
- HW Power Brake Slowdown or HW Slowdown active: platform-level power events; check BMC logs and PSU state (Chapter 09).

**Answer:** undetermined from the listed metrics; the throttle reason bitmask decides it.

### Exercise 2 Solution: Which GPU is the Straggler?

**Given data:**
```
GPU 0: 12ms AllReduce latency
GPU 1: 12ms AllReduce latency
GPU 2: 125ms AllReduce latency (10x slower)
GPU 3: 12ms AllReduce latency
```

**Analysis:**

The **asymmetry** is key: one GPU is 10x slower, others are identical.

**Hypothesis 1: GPU 2 is slow**
- Test: Check GPU 2 metrics (temp, power, clock, utilization)
- If GPU 2 is thermal throttled or power limited, it's slow
- AllReduce latency would increase because GPU 2 can't keep up

**Hypothesis 2: Communication path to/from GPU 2 is broken**
- Test: Measure NVLink status and P2P bandwidth
- NCCL AllReduce requires fast GPU-to-GPU communication
- If NVLink to GPU 2 is degraded (fewer active links or errors), AllReduce is slow

**Hypothesis 3: GPU 2 is waiting for something upstream**
- Test: Check NCCL_DEBUG trace for which GPU initiates
- If GPU 0 is the AllReduce root, GPU 2 must send to GPU 0
- If GPU 2 can't send fast (NVLink down), it times out or stalls

**To distinguish, collect:**

```bash
# Metrics on GPU 2
nvidia-smi -i 2 -q | grep -E "Temperature|Power|Clock|Throttle"
# If metrics are healthy, GPU 2 isn't the computational bottleneck

# NVLink topology
nvidia-smi nvlink --status
# Output example:
# GPU 2: Link 0 (to GPU 0): 25 GB/sec ✓  (NVLink3/A100 healthy per-link)
# GPU 2: Link 1 (to GPU 3): 3 GB/sec ✗  <- This link is slow!

# NCCL trace (who is slow to send vs receive?)
NCCL_DEBUG=TRACE python train.py 2>&1 | grep -A 2 "AllReduce.*GPU_2"
# Look for the rank whose collective op count lags the others (see Chapter 03)
```

**Most likely diagnosis: NVLink degraded to/from GPU 2**
- GPU 2's computational power is fine (metrics healthy)
- But AllReduce communication is 10x slower
- NVLink to GPU 2 is operating at reduced speed (fewer links up, or high error counts)

**Proof and fix:**
```bash
# Check NVLink first
nvidia-smi nvlink --status -i 2
dcgmi nvlink -e -g 2
# Then check the PCIe link, since PCIe training problems can also slow the GPU
lspci -s <GPU2_PCI> -vvv | grep "LnkSta"
# If the link trained down (reduced speed or width), reseat or service the GPU
# Rescan PCIe bus
echo 1 > /sys/bus/pci/devices/<gpu2_path>/remove
sleep 2
echo 1 > /sys/bus/pci/rescan

# Re-run AllReduce test
/opt/nccl-tests/build/all_reduce_perf -b 1G -e 1G -f 2 -g 4
# Expect: All GPU latencies now equal (~12ms)
```

### Exercise 3 Solution: The Intermittent Failure

**Given evidence that's all healthy:**
- Utilization 85-95% (not idle, working)
- Temperature 65-70°C (well within range)
- Memory stable
- Power stable
- **But performance oscillates 50%** (1000 → 500 → 1000 samples/sec)

**Classical cause: Software load imbalance or CPU bottleneck**

Since all GPU metrics look good, the GPU is doing work, but something is limiting it intermittently.

**Hypothesis 1: CPU data loading time varies**
- Sometimes data loader is fast, sometimes slow
- GPU completes computation, waits for next batch
- Causes iteration time to oscillate between "compute-bound" and "data-bound"

**Hypothesis 2: DVFS is oscillating (see Chapter 10)**
- Temperature is healthy, but GPU is cycling through power states
- Performance varies as frequency changes
- Metrics show "healthy" average, but not showing the oscillation details

**Hypothesis 3: Memory bandwidth contention**
- Multiple jobs on same node interfering
- When interference happens, throughput drops
- Metric samples miss the contention (sampling rate too low)

**To distinguish, collect:**

```bash
# Method 1: Layer-by-layer timing (Chapter 12)
import time
for iter in range(100):
    t0 = time.perf_counter()
    batch = next(train_loader)  # Data load
    data_time = time.perf_counter() - t0
    
    t0 = time.perf_counter()
    forward_backward()  # GPU compute
    compute_time = time.perf_counter() - t0
    
    print(f"Iter {iter}: data={data_time*1000:.1f}ms, compute={compute_time*1000:.1f}ms")

# If data_time varies 10-50ms while compute_time is stable → data loading is culprit
# If compute_time also varies → DVFS or contention

# Method 2: Check clock frequency over time
watch -n 0.5 'nvidia-smi -i 0 --query-gpu=clocks.current.graphics --format=csv,noheader'
# If frequency oscillates, DVFS is active

# Method 3: Monitor memory bandwidth
nvidia-smi --query-gpu=memory.used --format=csv,noheader
# If memory used jumps around, another process is interfering
```

**Most likely diagnosis: Data loading time varies**
- Evidence: CPU metrics not tracked, only GPU
- Data loader sometimes has high OS scheduler latency
- When data loader stalls, GPU sits idle, throughput drops

**Fix:**
```bash
# Increase prefetch buffer
from torch.utils.data import DataLoader
loader = DataLoader(
    dataset,
    num_workers=8,  # More workers to prefetch
    prefetch_factor=4,  # More cached batches
    pin_memory=True
)

# Re-measure: performance should be consistently high
python train.py | grep "throughput:"
# Expected: stable 900-1000 samples/sec
```

## Expected Outcomes

- You can analyze metric data and eliminate false hypotheses
- You understand the causal chain from root cause to symptom
- You know when correlation ≠ causation
- You can distinguish between GPU issues, data pipeline issues, and communication issues

## Verification Rubric

**Exercise 1:** You recognize that the listed metrics cannot separate thermal from power limiting and you use the throttle reason bitmask to decide ✓
**Exercise 2:** Your answer identifies NVLink degradation as likely cause, with plan to check lspci and rescan ✓
**Exercise 3:** Your answer suspects data loading (CPU), with timing instrumentation to prove it ✓