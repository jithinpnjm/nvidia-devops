---
title: "Lab 04 — Incident Response Simulation"
slug: lab-04-incident-response-simulation
sidebar_position: 4
description: "Hands-on: Simulate GPU failures and diagnose them using observability tools and runbooks."
tags: [gpu, observability, incident-response, troubleshooting, lab, hands-on]
---

# Lab 04 — Incident Response Simulation

**Objective:** Simulate realistic GPU failures and use observability data to diagnose root cause using the frameworks from Chapter 10.

**Time:** 90 minutes | **Difficulty:** Advanced | **Prerequisites:** Labs 01-02 (DCGM, Prometheus, Grafana running), understanding of troubleshooting frameworks

## Setup: Running Simulated Workloads

```bash
# Terminal 1: Start monitoring
watch -n 1 'nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,clocks.current.graphics,power.draw --format=csv'

# Terminal 2: Start Grafana dashboards (browser)
# Open: http://localhost:3000

# Terminal 3: Run workload simulation (see scenarios below)
```

## Scenario 1: Thermal Throttle Incident

**Simulated Problem:** Cooling fan is failing gradually. GPU temperature rises.

**Simulation Code:**

```bash
#!/bin/bash
# simulate_thermal_issue.sh
# Gradually heats GPU by increasing workload

echo "Phase 1: Starting normal load (80% utilization)..."
python3 << 'EOF' &
import torch
import time
x = torch.randn(4000, 4000, device='cuda')
while True:
    y = torch.matmul(x, x)
    time.sleep(0.01)  # Prevent runaway CPU
EOF
workload_pid=$!

# Let it run for 2 minutes at normal load
sleep 120

# Phase 2: Increase load (simulating fan degradation)
echo "Phase 2: Increasing load (simulating fan failure)..."
kill $workload_pid
sleep 5

# Run heavier load
python3 << 'EOF' &
import torch
x = torch.randn(5000, 5000, device='cuda')
y = torch.randn(5000, 5000, device='cuda')
while True:
    z = torch.matmul(x, y)
    w = torch.matmul(y, x)
EOF
workload_pid=$!

sleep 180  # Let temperature rise

echo "Simulation complete. Check GPU metrics for temperature rise and clock throttling."
kill $workload_pid
```

**Your Investigation (use runbook from Chapter 08):**

1. **Check metrics in Prometheus/Grafana:**
   ```promql
   # Query: Temperature over time
   max(DCGM_FI_DEV_GPU_TEMP)
   
   # Query: Clock rate over time
   DCGM_FI_DEV_SM_CLOCK
   ```

2. **Identify the problem:**
   - [ ] Temperature is rising steadily
   - [ ] Clocks are reducing as temperature rises
   - [ ] Utilization stays high despite clock reduction

3. **Diagnose root cause:**
   ```bash
   # Check fan speed
   nvidia-smi -q | grep "Fan Speed"
   # If 100%, fan is working; if low, may be degraded
   
   # Check thermal throttle events
   dcgmi diag -r 1 | grep -i "throttle"
   ```

4. **Mitigation:**
   - Stop workload to let GPU cool
   - File ticket with facilities team
   - Consider capacity reduction while waiting for repair

**Expected Evidence:**
```
Temperature: 45°C → 70°C → 82°C (rising)
Clock Rate: 1410 MHz → 1410 MHz → 1200 MHz (throttled at 82°C)
Thermal Throttle: 0 → 5 → 12 (count of throttle events)
```

## Scenario 2: GPU Memory OOM

**Simulated Problem:** Application has a memory leak or batch size is too large.

**Simulation Code:**

```python
#!/usr/bin/env python3
# simulate_oom.py

import torch
import time
import sys

print("Step 1: Allocating progressively larger tensors...")

try:
    tensors = []
    for i in range(20):
        size = int((i + 1) * 1e6)  # 1M, 2M, 3M, ... elements
        t = torch.randn(size, device='cuda')
        tensors.append(t)
        
        gpu_mem_used = torch.cuda.memory_allocated() / 1e9
        gpu_mem_reserved = torch.cuda.memory_reserved() / 1e9
        print(f"Iteration {i}: Allocated {gpu_mem_used:.2f}GB, Reserved {gpu_mem_reserved:.2f}GB")
        
        time.sleep(1)

except RuntimeError as e:
    print(f"\n*** OUT OF MEMORY ERROR ***")
    print(f"Error: {e}")
    print(f"GPU memory allocated: {torch.cuda.memory_allocated() / 1e9:.2f}GB")
    print(f"GPU memory reserved: {torch.cuda.memory_reserved() / 1e9:.2f}GB")
    sys.exit(1)
```

**Your Investigation:**

1. **Check metrics when OOM happens:**
   ```bash
   # Watch GPU memory
   nvidia-smi -l 1 | grep -E "GPU|Memory"
   ```

2. **Query Prometheus:**
   ```promql
   DCGM_FI_DEV_FB_USED  # Memory used
   DCGM_FI_DEV_FB_FREE  # Memory free
   ```

3. **Python memory check (if job still running):**
   ```python
   import torch
   print(f"Allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB")
   print(f"Reserved: {torch.cuda.memory_reserved() / 1e9:.2f} GB")
   print(f"Fragmentation: {(torch.cuda.memory_reserved() - torch.cuda.memory_allocated()) / 1e9:.2f} GB")
   ```

4. **Diagnosis:**
   - [ ] Memory reaches 95-99% and next allocation fails
   - [ ] Fragmentation may be high (reserved >> allocated)
   - [ ] Job crashes with "CUDA out of memory" error

5. **Mitigation:**
   - Reduce batch size
   - Enable gradient checkpointing
   - Use lower precision (FP16)

**Expected Evidence:**
```
Iteration 0: Allocated 0.00GB, Reserved 1.00GB
Iteration 1: Allocated 0.01GB, Reserved 1.00GB
...
Iteration 15: Allocated 15.50GB, Reserved 16.00GB
Iteration 16: Allocated 16.50GB, Reserved 17.00GB
Iteration 17: Allocated 17.50GB, Reserved 18.00GB
Iteration 18: Allocated 18.50GB, Reserved 19.00GB
Iteration 19: Allocated 19.50GB, Reserved 19.50GB
...
Iteration 38: Allocated 38.50GB, Reserved 39.80GB
*** OUT OF MEMORY ERROR ***
```

## Scenario 3: Data Pipeline Starvation (One GPU Slow)

**Simulated Problem:** Inefficient data loader causes GPU to starve for data.

**Simulation Code:**

```python
#!/usr/bin/env python3
# simulate_starvation.py

import torch
import torch.nn.functional as F
import time
from concurrent.futures import ThreadPoolExecutor

def slow_data_loader(batch_size=256, delay=0.5):
    """Simulates slow data loading (disk I/O bottleneck)."""
    while True:
        time.sleep(delay)  # Simulate slow disk read
        batch = torch.randn(batch_size, 3, 224, 224)  # Image batch
        yield batch

def fast_training_loop(data_loader, num_steps=20):
    """Training loop that processes data quickly."""
    model = torch.nn.Linear(150528, 1000).cuda()
    
    for step, batch in enumerate(data_loader):
        if step >= num_steps:
            break
        
        batch = batch.cuda().flatten(1)  # Flatten to 2D
        
        # Training step
        start = time.time()
        output = model(batch)
        loss = output.mean()
        loss.backward()
        gpu_time = time.time() - start
        
        # Get GPU utilization from nvidia-smi (external monitoring)
        print(f"Step {step}: GPU time {gpu_time*1000:.1f}ms (GPU is waiting for data)")
        
        time.sleep(0.2)  # Simulate stall between batches

# Run simulation
print("Simulating starvation: slow data loader (500ms) vs. fast GPU (10ms)")
data_loader = slow_data_loader(batch_size=256, delay=0.5)
fast_training_loop(data_loader, num_steps=10)
```

**Your Investigation:**

1. **Check GPU utilization pattern:**
   ```bash
   # Should show oscillating pattern
   for i in {1..30}; do
     nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader
     sleep 1
   done
   ```

2. **Expected pattern:**
   ```
   0
   5
   85 (GPU runs fast, processes batch in 10ms)
   5
   0 (GPU sits idle, waiting for next batch from loader)
   5
   85
   ...
   ```

3. **Query Prometheus for oscillating utilization:**
   ```promql
   # Should show spikes and valleys
   DCGM_FI_DEV_GPU_UTIL
   ```

4. **Diagnosis:**
   - [ ] Utilization oscillates between 5% and 85%
   - [ ] Pattern shows GPU doing work, then waiting
   - [ ] Clocks also oscillate (1410 MHz → 300 MHz → 1410 MHz)

5. **Mitigation:**
   - Increase data loader workers
   - Prefetch batches in parallel
   - Reduce GPU batch processing time

**Expected Evidence:**
```
nvidia-smi output (multiple readings):
Utilization: 0, 5, 85, 5, 0, 5, 85, 5, 0, ...
Clocks: 300, 300, 1410, 300, 300, 300, 1410, 300, 300, ...
```

## Scenario 4: Multi-GPU Load Imbalance

**Simulated Problem:** Uneven distribution of work causes one GPU to lag.

**Simulation Code:**

```python
#!/usr/bin/env python3
# simulate_imbalance.py

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
import time

def run_unbalanced_job(rank, world_size):
    """Simulates uneven load on different ranks."""
    dist.init_process_group("gloo", rank=rank, world_size=world_size)
    
    # Create tensors of different sizes on different ranks
    if rank == 0:
        size = 5000  # Rank 0 has large tensor
    else:
        size = 1000  # Rank 1 has small tensor
    
    x = torch.randn(size, size, device='cpu')
    
    for step in range(20):
        # Do compute (more work on rank 0)
        start = time.time()
        for _ in range(10 if rank == 0 else 2):  # Rank 0 does 5x more work
            y = torch.matmul(x, x)
        compute_time = time.time() - start
        
        print(f"Rank {rank}: Step {step} compute_time {compute_time*1000:.1f}ms")
        
        # All-reduce (collective communication)
        all_reduce_start = time.time()
        dist.all_reduce(y)  # This will block until slowest rank finishes
        all_reduce_time = time.time() - all_reduce_start
        
        if rank == 0:
            print(f"  All-reduce: {all_reduce_time*1000:.1f}ms (rank 0 waited for rank 1)")

# Run with 2 processes
if __name__ == '__main__':
    mp.set_start_method('spawn', force=True)
    world_size = 2
    mp.spawn(run_unbalanced_job, args=(world_size,), nprocs=world_size)
```

**Your Investigation:**

1. **Monitor both GPUs simultaneously:**
   ```bash
   # Terminal 1: Watch GPU 0
   watch -n 0.5 'nvidia-smi -i 0 --query-gpu=utilization.gpu --format=csv,noheader'
   
   # Terminal 2: Watch GPU 1
   watch -n 0.5 'nvidia-smi -i 1 --query-gpu=utilization.gpu --format=csv,noheader'
   ```

2. **Expected pattern:**
   ```
   GPU 0: 85, 85, 85, 5 (waiting on all-reduce)
   GPU 1: 50, 50, 50, 50 (does less work, finishes faster)
   ```

3. **Diagnosis:**
   - [ ] GPU 0 has higher utilization but then drops to waiting
   - [ ] GPU 1 has consistently lower utilization
   - [ ] All-reduce causes synchronization stall

4. **Mitigation:**
   - Balance work distribution (give rank 1 more work)
   - Use gradient accumulation to reduce communication frequency

## Verification Checklist

- [ ] Scenario 1: Identify thermal throttle signature
- [ ] Scenario 2: Detect OOM and identify memory pressure
- [ ] Scenario 3: Recognize data starvation pattern
- [ ] Scenario 4: Spot load imbalance in multi-GPU setup

## Self-Assessment: Incident Response Competency

After completing all scenarios, rate yourself:

| Skill | Comfortable? | Evidence |
|---|---|---|
| **Diagnostic Speed** | ✓/✗ | Can I diagnose within 5 min? |
| **Using Runbooks** | ✓/✗ | Can I follow a decision tree correctly? |
| **Metric Interpretation** | ✓/✗ | Can I read GPU dashboards accurately? |
| **Evidence Collection** | ✓/✗ | Can I gather diagnostic data efficiently? |
| **Root Cause Analysis** | ✓/✗ | Can I distinguish GPU vs. data vs. network issues? |

## Key Takeaways

1. **Real incidents have multiple telltale signs** — look for correlated changes across metrics
2. **Runbooks prevent panic** — follow them systematically rather than guessing
3. **Evidence beats intuition** — measure before assuming
4. **Speed matters** — faster diagnosis = faster recovery

---

**Scenarios completed:** ___ / 4 | **Diagnostic confidence:** ___ / 10 | **Time spent:** ___ minutes
