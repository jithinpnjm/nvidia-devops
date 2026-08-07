---
title: "Lab 02 — Roofline Analysis with Nsight Compute"
sidebar_position: 2
description: "Hands-on lab: measure kernel metrics with Nsight Compute and plot on roofline model."
---

# Lab 02 — Roofline Analysis with Nsight Compute

## Overview

In this lab, you will profile a compute-bound kernel and a memory-bound kernel using Nsight Compute, calculate their compute intensity, and plot them on the roofline model to verify predictions.

## Setup

**Requirements:**
- NVIDIA GPU with compute capability 7.0+
- Nsight Compute (comes with CUDA toolkit)
- CUDA toolkit (for `nvcc` compiler)
- Python with matplotlib

**Verify setup:**
```bash
ncu --version  # Should print version
nvcc --version  # Should print CUDA compiler version
```

## Exercises

### Exercise 1: Write Kernels to Profile (20 min)

Create `kernels.cu` with two kernels:

```cuda
#include <stdio.h>

// Compute-bound: Matrix multiply (high FLOPS/byte)
__global__ void matmul_kernel(float *A, float *B, float *C, int N) {
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;
    
    if (row < N && col < N) {
        float sum = 0.0f;
        for (int k = 0; k < N; k++) {
            sum += A[row * N + k] * B[k * N + col];
        }
        C[row * N + col] = sum;
    }
}

// Memory-bound: Elementwise operation (low FLOPS/byte)
__global__ void elementwise_add_kernel(float *A, float *B, float *C, int N) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < N) {
        C[idx] = A[idx] + B[idx];
    }
}
```

Compile:
```bash
nvcc -O3 -arch=sm_90 -o kernels kernels.cu
```

### Exercise 2: Profile with Nsight Compute (30 min)

Create a driver program `profile_kernels.py`:

```python
import os
import subprocess

# Compile the CUDA kernels
os.system("nvcc -O3 -arch=sm_90 -o kernels kernels.cu")

# Profile matmul_kernel
print("Profiling matmul_kernel...")
os.system("ncu --set=full -o matmul_profile python -c "
          "'import ctypes; so=ctypes.CDLL(\"./kernels.so\"); so.matmul_kernel()' 2>&1 | tee matmul.txt")

# Profile elementwise_add_kernel
print("Profiling elementwise_add_kernel...")
os.system("ncu --set=full -o elementwise_profile python -c "
          "'import ctypes; so=ctypes.CDLL(\"./kernels.so\"); so.elementwise_add_kernel()' 2>&1 | tee elementwise.txt")

# Parse output for key metrics
print("\n" + "="*80)
print("ROOFLINE ANALYSIS")
print("="*80)

# Read Nsight Compute JSON output
import json
for profile in ["matmul_profile", "elementwise_profile"]:
    with open(f"{profile}.json") as f:
        data = json.load(f)
        # Extract metrics
        achieved_tflops = data.get("metrics", {}).get("sm__throughput.avg", {}).get("value", 0)
        memory_bw = data.get("metrics", {}).get("dram__throughput.avg", {}).get("value", 0)
        compute_intensity = data.get("metrics", {}).get("sm__flops_sp.sum", {}).get("value", 0) / memory_bw if memory_bw > 0 else 0
        occupancy = data.get("metrics", {}).get("sm__warps_active.avg", {}).get("value", 0)
        
        print(f"{profile}:")
        print(f"  Achieved TFLOPS: {achieved_tflops:.1f}")
        print(f"  Memory BW (GB/s): {memory_bw:.1f}")
        print(f"  Compute Intensity: {compute_intensity:.1f} FLOPS/byte")
        print(f"  Occupancy: {occupancy:.1f}%")
        print()
```

**Simpler approach (manual):**
```bash
# Profile matmul (N=512 on single GPU)
ncu --set=full -o matmul_profile --launch-count=1 \
  python -c "import torch; a=torch.randn(512,512).cuda(); b=torch.randn(512,512).cuda(); torch.mm(a,b)"

# Extract key metrics from output
# Look for:
# - Throughput (TFLOPS)
# - Memory bandwidth (GB/s)
# - Occupancy (%)
# - Compute Intensity (if available)
```

### Exercise 3: Calculate Roofline (20 min)

For your GPU (look up specs or use `nvidia-smi`):

**H100 SXM5 specs:**
- Peak FP32 (CUDA core, dense) TFLOPS: 67
- Peak HBM3 BW: 3350 GB/s (3.35 TB/s)
- Crossover point: convert to matching units before dividing — 67 × 10¹² FLOPS/s ÷ (3350 × 10⁹ bytes/s) = **20.0 FLOPS/byte** (a common mistake is dividing TFLOPS by GB/s directly without converting the 10¹² vs 10⁹ scale factors, which silently drops a factor of 1000 — e.g. `141 / 2000 = 0.0705` instead of the correctly-converted `70.5`. Always convert both sides to the same base unit — e.g. FLOPS/s and bytes/s — first.)

**Your measurements** (from Exercise 2):

Matmul kernel:
```
Achieved TFLOPS: 57 (from nsys output)
Compute Intensity: ~500 FLOPS/byte (N=512 matrix multiply, high reuse)
Roofline prediction: 500 FLOPS/byte × 3350 GB/s = 1,675,000 GFLOPS/s = 1675 TFLOPS if purely
  memory-bound — but that's far above the compute roof, so the kernel is capped by compute:
  min(1675, 67) = 67 TFLOPS compute-bound ceiling
Expected: Near-peak performance (57/67 = 85% of peak) ✓
```

Elementwise add:
```
Achieved TFLOPS: 0.30 (from nsys output)
Compute Intensity: ~0.25 FLOPS/byte (1 add per read + write)
Roofline prediction: 0.25 FLOPS/byte × 3350 GB/s = 837.5 GFLOPS/s = 0.84 TFLOPS max
  (memory-bound ceiling — NOT 500 TFLOPS; dividing/multiplying TFLOPS and GB/s without
  converting both to the same power-of-ten first is exactly the 1000x unit-conversion
  mistake to avoid)
Achieved (0.30 TFLOPS) is well below even this small 0.84 TFLOPS ceiling. Why?
Reason: The kernel is small (1M elements = 4MB), so memory latency dominates, not bandwidth —
  the roofline ceiling assumes the memory pipe is fully saturated, which a kernel this small
  never achieves.
```

### Exercise 4: Plot on Roofline (15 min)

```python
import matplotlib.pyplot as plt
import numpy as np

# Hardware params (H100 SXM5)
peak_tflops = 67       # FP32 CUDA-core dense peak
peak_bw = 3350          # GB/s (3.35 TB/s HBM3)
crossover = peak_tflops * 1000 / peak_bw  # FLOPS/byte (GB/s -> convert TFLOPS to GFLOPS first)

# Roofline curve
ci = np.logspace(-2, 4, 100)  # Compute intensity from 0.01 to 10000 FLOPS/byte
tflops_roofline = np.minimum(peak_tflops, ci * peak_bw / 1000)  # ci (FLOPS/byte) * GB/s / 1000 = TFLOPS

# Your kernels (from profiler)
matmul_ci = 500  # FLOPS/byte
matmul_tflops = 57

elementwise_ci = 0.25
elementwise_tflops = 0.30

# Plot
fig, ax = plt.subplots(figsize=(10, 8))
ax.loglog(ci, tflops_roofline, 'k-', linewidth=2, label='Roofline (H100)')
ax.axvline(crossover, color='gray', linestyle='--', alpha=0.5, label=f'Crossover: {crossover:.2f} FLOPS/B')

# Plot kernels
ax.scatter(matmul_ci, matmul_tflops, s=100, marker='o', color='green', label=f'MatMul (CI={matmul_ci}, {matmul_tflops} TFLOPS)')
ax.scatter(elementwise_ci, elementwise_tflops, s=100, marker='s', color='red', label=f'Elementwise (CI={elementwise_ci}, {elementwise_tflops} TFLOPS)')

ax.set_xlabel('Compute Intensity (FLOPS/byte)', fontsize=12)
ax.set_ylabel('Achieved Throughput (TFLOPS)', fontsize=12)
ax.set_title('Roofline Model: Your Kernels vs Hardware Ceiling', fontsize=14)
ax.legend()
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('roofline.png', dpi=150)
print("Roofline plot saved to roofline.png")
```

## Verification

**Checklist:**
- [ ] Both kernels profile successfully with Nsight Compute
- [ ] You extract throughput (TFLOPS) and memory bandwidth for both
- [ ] MatMul kernel is compute-bound (operates near the roofline ceiling)
- [ ] Elementwise kernel is memory-bound (operates below crossover point)
- [ ] Roofline plot shows both kernels relative to hardware ceiling
- [ ] You can explain why each kernel plots where it does

**Expected observations:**
- MatMul: 80-90% of peak TFLOPS (if compute-bound prediction is correct) — i.e. roughly 54-60 TFLOPS on H100 SXM5's 67 TFLOPS FP32 peak
- Elementwise: a small fraction of a TFLOP (heavily memory-latency limited, not bandwidth limited — well below even the small ~0.84 TFLOPS memory-bound ceiling this CI implies)
- MatMul CI >> crossover (20.0 FLOPS/byte) → compute-bound
- Elementwise CI << crossover → memory-bound

## Troubleshooting

**"No metrics available in Nsight Compute output"**
- Solution: Ensure kernel runs long enough (>1ms). Small kernels may not have enough samples.

**"Roofline plot doesn't show expected behavior"**
- Solution: Verify CI calculation. For matmul: CI = (2×N³) / (3×N²) = 2N/3. For N=512: CI ≈ 341, not 500.

**"Nsight Compute returns "no samples collected"**
- Solution: Add warm-up iterations before profiling; check GPU is properly initialized.

---

After this lab, you should understand roofline analysis and how to classify kernels as compute- or memory-bound. Proceed to Lab 03 for bottleneck identification.
