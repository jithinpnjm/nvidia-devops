---
title: "Lab 01 — Symptom to Evidence Mapping"
slug: "lab-01-symptom-evidence-mapping"
sidebar_position: 1
description: "Given a symptom, construct the diagnostic queries and evidence collection workflow."
---

## Objective

Practice translating user-reported symptoms into concrete diagnostic evidence collection procedures. Learn the evidence hierarchy and when to use different tools.

## Duration

60 minutes

## Prerequisites

- Understanding of nvidia-smi, dcgmi, dmesg
- Basic knowledge of CUDA and GPU concepts
- Access to a GPU or simulator

## Exercises

### Exercise 1: GPU Slow — Map the Evidence

**Scenario:** User reports "my GPU job is slow but nvidia-smi shows good utilization."

Construct the evidence collection plan:
1. What metrics would you check first?
2. What profiling tool would you use?
3. What would cause "high utilization but low throughput"?
4. What is your hypothesis after each evidence step?

### Exercise 2: Distributed Training Stalls

**Scenario:** Four-GPU training stalls after 30 minutes.

Construct the evidence workflow:
1. Is this a GPU issue or communication issue? How do you distinguish?
2. Which GPU is stalled?
3. What NCCL_DEBUG output would you enable?
4. How do you differentiate hanging from slow?

### Exercise 3: Multiple Failure Modes

**Scenario:** GPU exhibits: thermal throttling, ECC errors, and NCCL hangs simultaneously.

Determine the evidence priority:
1. Which metric do you trust most in this scenario?
2. Which failure is the root cause?
3. How do you prove your hypothesis?

### Exercise 1 Solution: GPU Slow

**Expected Answer Structure:**

1. **Metrics to check first (evidence hierarchy):**
   - nvidia-smi utilization (weak indicator — includes idle time)
   - Per-layer timing instrumentation (strong indicator — shows real work)
   - Profiler trace: Nsight Systems kernel timeline (direct observation)

2. **Profiling tool recommendation:**
   ```bash
   # Lightweight: simple Python timing (< 1% overhead)
   import time
   t0 = time.perf_counter()
   forward()
   t1 = time.perf_counter()
   print(f"Forward time: {(t1-t0)*1000:.1f} ms")
   
   # Medium weight: nvidia-smi monitoring (5-10% overhead)
   watch -n 0.5 'nvidia-smi --query-gpu=clocks.current.graphics,temperature.gpu,power.draw --format=csv,noheader'
   
   # Heavyweight: Nsight Systems (30-50% overhead)
   nsys profile -o trace -d 60 python train.py
   ```

3. **Root cause: High utilization but low throughput**
   - GPU reports 95% SM utilization
   - But throughput is only 100 samples/sec (should be 500+)
   - Likely: CPU kernel launch latency (GPU idle waiting for work)
   - Confirm with: measure kernel launch rate, CPU profiling

4. **Hypothesis evolution:**
   - **After nvidia-smi:** Utilization high but throughput low → GPU is busy but not making progress
   - **After layer timing:** Data loading takes 70% of iteration time → CPU bottleneck confirmed
   - **After profiler:** GPU timeline shows gaps between kernels → confirms CPU launch latency

### Exercise 2 Solution: Distributed Training Stalls

**Expected Answer Structure:**

1. **GPU issue vs communication issue:**
   ```bash
   # Distinguish with NCCL_DEBUG
   NCCL_DEBUG=TRACE python train.py 2>&1 | grep "ncclAllReduce\|STALLED"
   
   # If output shows: "ncclAllReduce hanging at GPU 2" → GPU issue
   # If output shows: "ncclAllReduce slow, 5 sec, expected 50 ms" → Network issue
   # If no output for 30 seconds → Program truly stalled
   
   # Also try: timeout and check which GPU is waiting
   timeout 10 python train.py 2>&1 | tail -20
   # If ctrl-C shows backtrace in AllReduce code → communication stall
   # If backtrace in GPU memory operation → GPU issue
   ```

2. **Identify which GPU:**
   ```bash
   # Method 1: Check GPU memory
   for i in {0..3}; do
     echo "GPU $i:"
     nvidia-smi -i $i --query-gpu=memory.used --format=csv,noheader
   done
   
   # GPU with much higher memory = the one processing data
   # GPU with idle memory = stalled waiting
   
   # Method 2: Check clock speed
   for i in {0..3}; do
     echo "GPU $i:"
     nvidia-smi -i $i --query-gpu=clocks.current.graphics --format=csv,noheader
   done
   
   # GPU at 2500 MHz = actively computing
   # GPU at 300 MHz = idle/stalled
   ```

3. **NCCL_DEBUG output to enable:**
   ```bash
   export NCCL_DEBUG=TRACE
   export NCCL_DEBUG_SUBSYS=COLL,GRAPH
   python train.py 2>&1 | head -100
   
   # Expected output (healthy):
   # ncclAllReduce: rank=0, nBytes=4MB, time=50us
   # ncclAllReduce: rank=1, nBytes=4MB, time=52us
   # ncclAllReduce: rank=2, nBytes=4MB, time=49us
   # ncclAllReduce: rank=3, nBytes=4MB, time=51us
   
   # Expected output (stalled):
   # ncclAllReduce: rank=0, nBytes=4MB, time=50us
   # ncclAllReduce: rank=1, nBytes=4MB, time=48us
   # ncclAllReduce: rank=2, nBytes=4MB, hanging...  <- Stalled here
   # (no output from rank 3)
   ```

4. **Differentiate hanging from slow:**
   ```bash
   # Slow (but making progress):
   # Same NCCL_DEBUG output, but times are 5000us instead of 50us
   # Each iteration completes, just slowly
   
   # Hanging (no progress):
   # NCCL_DEBUG output starts, then freezes mid-collective
   # No new output for > 60 seconds
   # Timeout hits and program kills
   
   # Test: run with 10-second timeout
   timeout 10 python train.py 2>&1
   # If timeout hits while NCCL is hanging → deadlock
   # If completes 10 iterations before timeout → slow, not hanging
   ```

### Exercise 3 Solution: Multiple Failure Modes

**Evidence Priority (strongest to weakest):**

1. **Thermal throttling (causes immediate performance loss)** ← Investigate FIRST
2. **ECC errors (indicate data corruption risk)**
3. **NCCL hangs (symptom, not root cause)**

**Why this order:**
- Thermal throttling will cause ALL other failures to seem worse
- If you fix thermal, NCCL latency improves automatically
- If you ignore thermal and only investigate NCCL, you'll chase a phantom problem

**Root cause analysis:**

```bash
# Step 1: Check temperature
nvidia-smi -i 0 -q | grep -A 2 "Temperature"
# Output: 85°C → confirms thermal throttling

# Step 2: Check for thermal throttle events
dcgmi diag -r 3 | grep "Thermal slowdown"
# Output: "Thermal slowdown events: 500 in last hour" → confirmed

# Step 3: Check power/clock correlation
watch -n 1 'nvidia-smi -i 0 --query-gpu=temperature.gpu,clocks.current.graphics --format=csv,noheader'
# Output shows: Temp 85°C, Clock 1200 MHz (dropped from 2500) → throttling

# Step 4: Check if NCCL hang is caused by thermal throttle
# Reduce temperature: improve airflow, reduce power limit
sudo nvidia-smi -i 0 -pl 200  # Reduce power
sleep 30

# Re-run training
python train.py

# Check NCCL performance
NCCL_DEBUG=TRACE timeout 30 python train.py 2>&1 | grep ncclAllReduce
# If AllReduce latency decreased by 10x → thermal was the root cause
```

**Hypothesis proof:**
- Before fix: thermal throttle + NCCL slow + ECC errors
- After reducing temp below 80°C: NCCL latency returns to 50us
- Conclusion: Thermal throttling was primary, caused cascading failures

## Expected Outcomes

- You can translate any symptom into a concrete evidence collection plan
- You understand the hierarchy of evidence (weak → strong)
- You know which tool to use for each diagnostic question
- You can build hypothesis trees and test them systematically

## Verification Rubric

**Exercise 1:** Your evidence plan includes timing instrumentation AND profiler AND GPU metrics ✓
**Exercise 2:** Your NCCL_DEBUG analysis correctly identifies GPU 2 stalled; you distinguish hanging (frozen output) vs slow (continues, high latency) ✓
**Exercise 3:** Your root cause is "thermal → NCCL degradation" and your fix proof shows NCCL improves after cooling ✓

