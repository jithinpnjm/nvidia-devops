---
title: Lab 03 — Validate a GPUDirect Storage Design
description: Verify compatibility, topology, direct-path behavior, fallback, and comparative performance.
sidebar_position: 22
tags: [lab, gpudirect-storage, gds]
---

# Lab 03 — Validate a GPUDirect Storage Design

**Objective:** Verify that GPUDirect Storage is actually working in your environment and delivers measurable benefit over CPU-bounce I/O.

**Time:** 90 minutes

**Prerequisites:** Lab 02 complete; GDS installed (nvidia-fs package); storage that supports GDS (NVMe-oF or Lustre); a test workload that is NOT production-critical.

**Expected outcome:** A decision: "Deploy GDS" or "Skip GDS, focus on other optimizations."

## What We're Validating

GDS is supposed to read directly from storage to GPU memory, avoiding CPU bounce. It only works if ALL of these are true:

1. GPU driver is new enough (`nvidia-fs --version` present)
2. Storage is GDS-compatible (NVMe-oF, specific Lustre OST versions)
3. GPU and storage are in same PCIe domain (not "PHB" in topology)
4. Buffers are aligned (4 KB for NVMe-oF, 8 KB for Lustre)
5. Request size is reasonable (>1 MB)
6. Application uses correct API (`cuFile`, not standard `open()/read()`)

## Lab Steps

### Step 1: Verify Prerequisites

```bash
#!/bin/bash
# Check GDS compatibility

echo "=== GDS PREREQUISITE CHECK ===" | tee gds-check.txt

# Check 1: GDS package installed
echo "Check 1: GDS installed?" >> gds-check.txt
nvidia-fs --version 2>/dev/null && echo "✓ PASS" >> gds-check.txt || echo "✗ FAIL: nvidia-fs not installed" >> gds-check.txt

# Check 2: GDS driver status
echo -e "\nCheck 2: GDS driver loaded?" >> gds-check.txt
if [ -f /proc/driver/nvidia-fs/status ]; then
    cat /proc/driver/nvidia-fs/status >> gds-check.txt
    echo "✓ PASS" >> gds-check.txt
else
    echo "✗ FAIL: /proc/driver/nvidia-fs/status not found" >> gds-check.txt
fi

# Check 3: GPU and storage topology
echo -e "\nCheck 3: GPU-Storage topology (need same PCIe domain, not all PHB)" >> gds-check.txt
nvidia-smi topo -m >> gds-check.txt

# Check 4: Storage compatibility
echo -e "\nCheck 4: Storage GDS support?" >> gds-check.txt
if [ -d "/sys/class/nvme" ]; then
    echo "NVMe present (potential GDS support)" >> gds-check.txt
    nvme list >> gds-check.txt
    echo "✓ PASS" >> gds-check.txt
elif command -v lfs &> /dev/null; then
    echo "Lustre detected; checking OST GDS capability..." >> gds-check.txt
    lctl list_param llite.*.gds_state 2>/dev/null >> gds-check.txt || echo "GDS not explicitly listed" >> gds-check.txt
else
    echo "✗ FAIL: No NVMe or Lustre detected" >> gds-check.txt
fi

# Check 5: Driver version
echo -e "\nCheck 5: Driver version (need 470+)" >> gds-check.txt
nvidia-smi | grep "Driver Version" >> gds-check.txt

cat gds-check.txt
```

**Interpretation:**
```
If all checks pass:
  ✓ Proceed to Step 2 (benchmark)

If any check fails:
  ✗ GDS is not available in this environment
  → Don't deploy GDS
  → Focus on network optimization, metadata fix, or local cache instead
```

### Step 2: Benchmark Without GDS (CPU Bounce)

```bash
#!/bin/bash
# Establish baseline: traditional CPU-bounce I/O

echo "=== BASELINE: CPU-BOUNCE I/O (No GDS) ===" | tee cpu-bounce.txt

# Disable GDS (or just use standard I/O APIs that fall back to CPU)
# Write a small benchmark that uses standard I/O

cat > benchmark-cpu.py << 'EOF'
import torch
import torch.cuda
import time
import numpy as np

# File to read (assumed to exist from Lab 02)
INPUT_FILE = "/lustre/model-test.bin"

# GPU to read into
gpu_id = 0
torch.cuda.set_device(gpu_id)

# Allocate GPU buffer (standard PyTorch allocation, non-pinned)
buffer_size = 100 * 1024**2  # 100 MB
gpu_buffer = torch.empty(buffer_size // 4, dtype=torch.float32, device=f'cuda:{gpu_id}')

# Warm up
with open(INPUT_FILE, 'rb') as f:
    _ = f.read(buffer_size)

# Benchmark: read file on CPU, copy to GPU
times = []
for trial in range(5):
    torch.cuda.reset_peak_memory_stats()
    torch.cuda.synchronize()
    
    t0 = time.time()
    
    # CPU read
    with open(INPUT_FILE, 'rb') as f:
        data = f.read(buffer_size)
    
    # Convert to tensor (CPU)
    cpu_tensor = torch.frombuffer(np.frombuffer(data, dtype=np.float32), dtype=torch.float32)
    
    # Copy to GPU (this is the expensive part)
    gpu_buffer[:] = cpu_tensor[:].cuda()
    torch.cuda.synchronize()
    
    elapsed = time.time() - t0
    times.append(elapsed)
    
    print(f"Trial {trial+1}: {elapsed:.3f}s, throughput: {buffer_size/1e6/elapsed:.0f} MB/s")

print(f"Average: {np.mean(times):.3f}s, Avg throughput: {buffer_size/1e6/np.mean(times):.0f} MB/s")
EOF

python benchmark-cpu.py | tee -a cpu-bounce.txt
rm benchmark-cpu.py
```

**Expected results:**
```
Trial 1: 0.265s, throughput: 378 MB/s
Trial 2: 0.250s, throughput: 400 MB/s
Trial 3: 0.248s, throughput: 403 MB/s
Trial 4: 0.247s, throughput: 404 MB/s
Trial 5: 0.246s, throughput: 407 MB/s
Average: 0.251s, Avg throughput: 398 MB/s
```

### Step 3: Benchmark With GDS (If Available)

```bash
#!/bin/bash
# Measure: GDS direct I/O

echo "=== WITH GDS: DIRECT I/O ===" | tee gds-benchmark.txt

cat > benchmark-gds.py << 'EOF'
import torch
import torch.cuda
import time

# Requires: RAPIDS kvikio (the real-world Python binding for cuFile/GDS)
try:
    from kvikio import CuFile
    HAS_GDS = True
except ImportError:
    print("Warning: kvikio not available, skipping GDS test")
    HAS_GDS = False

if HAS_GDS:
    INPUT_FILE = "/lustre/model-test.bin"
    gpu_id = 0
    torch.cuda.set_device(gpu_id)
    
    # GPU buffer (must be aligned for GDS)
    buffer_size = 100 * 1024**2  # 100 MB
    gpu_buffer = torch.empty(buffer_size // 4, dtype=torch.float32, device=f'cuda:{gpu_id}')
    
    # GDS read
    times = []
    with CuFile(INPUT_FILE, "rb") as f:
        for trial in range(5):
            torch.cuda.synchronize()
            t0 = time.time()

            # Direct read into GPU buffer (no CPU copy)
            bytes_read = f.read(gpu_buffer)
            torch.cuda.synchronize()

            elapsed = time.time() - t0
            times.append(elapsed)

            print(f"Trial {trial+1}: {elapsed:.3f}s, throughput: {buffer_size/1e6/elapsed:.0f} MB/s")
    
    print(f"Average: {sum(times)/len(times):.3f}s, Avg throughput: {buffer_size/1e6/(sum(times)/len(times)):.0f} MB/s")
EOF

if [ -f "/usr/local/cuda/include/cufile.h" ]; then
    python benchmark-gds.py | tee -a gds-benchmark.txt
else
    echo "CUDA GDS headers not found; skipping GDS benchmark" | tee -a gds-benchmark.txt
fi

rm -f benchmark-gds.py
```

### Step 4: Compare and Measure CPU Overhead

```bash
#!/bin/bash
# Compare CPU utilization

echo "=== CPU UTILIZATION COMPARISON ===" | tee cpu-overhead.txt

cat > monitor-cpu.py << 'EOF'
import psutil
import subprocess
import time
import threading

def monitor_cpu(workload_name):
    """Monitor CPU usage during I/O workload."""
    baseline_cpu = psutil.cpu_percent(interval=0.1)
    print(f"{workload_name}: baseline CPU: {baseline_cpu}%")
    
    cpu_samples = []
    def sampler():
        for _ in range(10):
            cpu_samples.append(psutil.cpu_percent(interval=0.1))
    
    sampler_thread = threading.Thread(target=sampler)
    sampler_thread.start()
    
    # Run benchmark
    result = subprocess.run(["python", "benchmark-cpu.py"], capture_output=True, text=True)
    
    sampler_thread.join()
    
    peak_cpu = max(cpu_samples) if cpu_samples else 0
    avg_cpu = sum(cpu_samples) / len(cpu_samples) if cpu_samples else 0
    
    print(f"{workload_name}: peak CPU: {peak_cpu:.1f}%, avg CPU: {avg_cpu:.1f}%")
    return peak_cpu, avg_cpu

monitor_cpu("CPU Bounce")
EOF

python monitor-cpu.py | tee -a cpu-overhead.txt
rm -f monitor-cpu.py benchmark-cpu.py
```

### Step 5: Decision Framework

```bash
#!/bin/bash
# Summarize findings and recommend

echo "=== GDS DECISION FRAMEWORK ===" | tee gds-decision.txt

echo "Measured Performance:" >> gds-decision.txt

# Extract throughput from benchmarks
CPU_THROUGHPUT=$(grep "Avg throughput" cpu-bounce.txt | awk '{print $NF}' | sed 's/ MB\/s//')
GDS_THROUGHPUT=$(grep "Avg throughput" gds-benchmark.txt | awk '{print $NF}' | sed 's/ MB\/s//')

echo "  CPU Bounce:    $CPU_THROUGHPUT MB/s" >> gds-decision.txt
echo "  GDS Direct:    $GDS_THROUGHPUT MB/s" >> gds-decision.txt

if [ -n "$GDS_THROUGHPUT" ]; then
    IMPROVEMENT=$(echo "scale=1; ($GDS_THROUGHPUT - $CPU_THROUGHPUT) * 100 / $CPU_THROUGHPUT" | bc)
    echo "  Improvement:   $IMPROVEMENT%" >> gds-decision.txt
    
    echo -e "\n=== RECOMMENDATION ===" >> gds-decision.txt
    if [ $(echo "$IMPROVEMENT > 20" | bc) -eq 1 ]; then
        echo "✓ DEPLOY GDS" >> gds-decision.txt
        echo "  GDS improves throughput by >20%. Benefits justify operational complexity." >> gds-decision.txt
    else
        echo "✗ SKIP GDS" >> gds-decision.txt
        echo "  GDS improves throughput by <20%. Focus on other optimizations (network, metadata, cache)." >> gds-decision.txt
    fi
else
    echo "✗ GDS NOT AVAILABLE" >> gds-decision.txt
    echo "  GDS not supported in this environment." >> gds-decision.txt
fi

cat gds-decision.txt
```

## Deliverables

After this lab, you should have:

1. **GDS compatibility check:** Confirmed prerequisites are met (or not)
2. **Baseline throughput:** CPU-bounce I/O performance
3. **GDS throughput:** Direct I/O performance (if available)
4. **Comparison:** Throughput improvement from GDS
5. **Decision:** Deploy GDS or focus on other optimizations

## Cleanup

```bash
rm -f /lustre/model-test.bin /lustre/batch-test.bin
rm -f *.py
```
