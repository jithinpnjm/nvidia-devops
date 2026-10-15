---
title: "Lab 01 — Symptom to Evidence Mapping"
slug: "lab-01-symptom-evidence-mapping"
sidebar_position: 1
description: "Given a symptom, construct the diagnostic queries and evidence collection workflow."
---


> **Note:** Output blocks and numbers in this lab are illustrative (not captured from a real system). Use them to practice the reasoning, not as reference values.

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
   # Lightweight: simple Python timing (lowest overhead)
   import time
   t0 = time.perf_counter()
   forward()
   t1 = time.perf_counter()
   print(f"Forward time: {(t1-t0)*1000:.1f} ms")
   
   # Medium weight: nvidia-smi polling (each call spawns a process)
   watch -n 0.5 'nvidia-smi --query-gpu=clocks.current.graphics,temperature.gpu,power.draw --format=csv,noheader'
   
   # Heavyweight: Nsight Systems (highest overhead of the three; measure it)
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

1. **GPU issue vs communication issue:**
   ```bash
   # Distinguish with NCCL_DEBUG (message text varies by NCCL version)
   NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=COLL python train.py 2>&1 | tee nccl.log
   
   # Compare per-rank collective op counts: a rank stuck at a lower count is the one
   # not reaching the collective (see Chapter 03)
   # If every rank is blocked at the same count and nothing progresses → fabric or deadlock
   # If counts advance but slowly → slow, not hung
   
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
   
   # Memory use is only a weak hint; compare SM activity and the per-rank op counts instead
   
   # Method 2: Check clock speed
   for i in {0..3}; do
     echo "GPU $i:"
     nvidia-smi -i $i --query-gpu=clocks.current.graphics --format=csv,noheader
   done
   
   # GPU at 1980 MHz = actively computing
   # GPU at 300 MHz = idle/stalled
   ```

3. **NCCL_DEBUG output to enable:**
   ```bash
   export NCCL_DEBUG=INFO
   export NCCL_DEBUG_SUBSYS=COLL,GRAPH
   python train.py 2>&1 | head -100
   
   # Healthy: every rank logs the same collective op counts in step
   # Stalled: one rank's op count stops advancing while the others wait on it
   # (the log line format differs between NCCL versions; look for the opCount field)
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
   
   # Watch the log: if op counts keep advancing, it is slow; if they stop for longer than
   # a full iteration, it is hung
   ```

### Exercise 3 Solution: Multiple Failure Modes

**Evidence priority (highest first):**

1. **Xid / ECC errors (data-integrity risk):** check `dmesg` for Xid 48/95/64 and `nvidia-smi -q -d ECC`. An uncorrectable error means the GPU should be drained and results from the affected window treated as suspect, whatever else is happening.
2. **Throttle reasons (performance cause):** `nvidia-smi -q -d PERFORMANCE` shows whether thermal slowdown, power cap, or power brake is active. Thermal throttling slows one rank, which is a plausible reason for collective delays, but it does not by itself cause a permanent hang.
3. **NCCL hangs (downstream symptom):** a hang usually means a rank is late or dead. Identify the lagging rank (Chapter 03), then ask why it lagged.

**Why this order:** integrity risks outrank performance, and symptoms in the communication layer are usually consequences of a problem on one rank.

```bash
# Step 1: integrity evidence
dmesg -T | grep -i xid
nvidia-smi -i 0 -q -d ECC,PAGE_RETIREMENT,ROW_REMAPPER
# Step 2: performance cause
nvidia-smi -i 0 -q -d TEMPERATURE,PERFORMANCE
# Step 3: which rank is late
NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=COLL python train.py 2>&1 | tee nccl.log
```

**Hypothesis proof:** change one variable at a time (for example drain and reset the GPU, then fix cooling) and show that the NCCL delay disappears only when the true cause is removed. If an uncorrectable ECC error is present, the GPU leaves the pool regardless of the thermal findings.

## Expected Outcomes

- You can translate any symptom into a concrete evidence collection plan
- You understand the hierarchy of evidence (weak → strong)
- You know which tool to use for each diagnostic question
- You can build hypothesis trees and test them systematically

## Verification Rubric

**Exercise 1:** Your evidence plan includes timing instrumentation AND profiler AND GPU metrics ✓
**Exercise 2:** Your NCCL_DEBUG analysis identifies the rank whose op count lags; you distinguish hanging (op counts frozen) vs slow (op counts advancing, high latency) ✓
**Exercise 3:** You rank integrity evidence (Xid/ECC) above performance causes (throttling) above downstream symptoms (NCCL), and your proof changes one variable at a time ✓