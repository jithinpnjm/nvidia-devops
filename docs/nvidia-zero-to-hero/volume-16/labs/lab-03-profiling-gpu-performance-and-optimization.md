---
title: "Lab 03 — Profiling GPU Performance and Optimization"
slug: lab-03-profiling-gpu-performance
sidebar_position: 3
description: "Hands-on: Use profiling tools to find GPU bottlenecks and verify optimizations work."
tags: [gpu, observability, profiling, optimization, lab, hands-on]
---

# Lab 03 — Profiling GPU Performance and Optimization

**Objective:** Profile a GPU kernel, identify its bottleneck, optimize it, and measure improvement.

**Time:** 60 minutes | **Difficulty:** Advanced | **Prerequisites:** CUDA-capable GPU, `nvidia-smi`, Python with PyTorch/CuPy

## Step 1: Write a Matrix Multiply Kernel

**File: `matmul.py`**

```python
import torch
import time

def measure_performance(matrix_size, iterations=100):
    """
    Measure throughput of matrix multiply.
    Args:
        matrix_size: int, dimensions of square matrices
        iterations: int, number of repeated multiplies
    """
    # Create large matrices
    A = torch.randn(matrix_size, matrix_size, device='cuda', dtype=torch.float32)
    B = torch.randn(matrix_size, matrix_size, device='cuda', dtype=torch.float32)
    
    # Warm up
    for _ in range(5):
        _ = torch.matmul(A, B)
    
    # Time the operation
    torch.cuda.synchronize()  # Wait for GPU to finish
    start = time.time()
    
    for i in range(iterations):
        C = torch.matmul(A, B)
    
    torch.cuda.synchronize()  # Wait for GPU to finish
    elapsed = time.time() - start
    
    # Calculate FLOPs and throughput
    # Matmul(NxK, KxM) = 2*N*K*M FLOPs
    flops_per_op = 2 * matrix_size * matrix_size * matrix_size
    total_flops = flops_per_op * iterations
    throughput_tflops = (total_flops / 1e12) / elapsed
    
    return throughput_tflops, elapsed

# Benchmark at different matrix sizes
print("Matrix Size, Throughput (TFLOP/s), Time (s)")
for size in [512, 1024, 2048, 4096]:
    tflops, elapsed = measure_performance(size, iterations=20)
    print(f"{size}x{size}, {tflops:.2f}, {elapsed:.3f}")
```

**Run:**

```bash
python matmul.py
```

**Expected output (A100):**

```
Matrix Size, Throughput (TFLOP/s), Time (s)
512x512, 285.23, 0.140
1024x1024, 312.45, 0.532
2048x2048, 325.18, 4.126
4096x4096, 330.12, 33.042
```

**Interpretation:** Throughput rises with matrix size, approaching A100's peak of ~312 TFLOP/s for FP32.

## Step 2: Profile with nvidia-smi

```bash
# Start monitoring in background
nvidia-smi dmon -s pucvmet > gpu_stats.txt 2>&1 &
dmon_pid=$!

# Run benchmark
python matmul.py

# Stop monitoring
kill $dmon_pid

# Check stats
tail -20 gpu_stats.txt
```

**Expected output:**

```
    gpu   pwr  gpu  mem   enc   dec  mclk  pclk   fb    bar1  sbecc dbecc  temp
      0  215W   92%  28%    0%    0%  1410  1410   28G    0M     0     0  78C
      0  218W   93%  29%    0%    0%  1410  1410   28G    0M     0     0  79C
      0  220W   94%  28%    0%    0%  1410  1410   28G    0M     0     0  80C
```

**Interpretation:** GPU at 92-94% utilization, 28-29% memory utilization (compute-bound, not memory-bound), clocks at peak, temperature steady at 80°C.

## Step 3: Deep Profile with Nsight Compute

**Install Nsight Compute:**

```bash
# Option A: From NVIDIA SDK
# Option B: Via package manager
sudo apt-get install nvidia-compute-sanitizer  # Older; alternative path
```

**Simple profiling with built-in Nsys (usually available with CUDA):**

```bash
# Create a simple CUDA kernel test
cat > simple_kernel.py << 'EOF'
import torch
import time

# Allocate matrices
A = torch.randn(4096, 4096, device='cuda', dtype=torch.float32)
B = torch.randn(4096, 4096, device='cuda', dtype=torch.float32)

# Warm up
for _ in range(5):
    _ = torch.matmul(A, B)

# Do matmul 50 times
for i in range(50):
    C = torch.matmul(A, B)

print("Done")
EOF

# Profile with Nsys (part of CUDA)
nsys profile -t cuda,cudnn --gpu-metrics-device all python simple_kernel.py

# Look at results
nsys export --type timeline --output export_result report1.nsys-rep
```

## Step 4: Measure Memory Bandwidth

```python
# File: measure_bw.py
import torch
import time

def measure_memory_bandwidth():
    """Measure GPU memory bandwidth using vector operations."""
    
    # Large vector (pushes lots of data)
    N = 100 * 1024 * 1024  # 100M elements
    x = torch.randn(N, device='cuda', dtype=torch.float32)
    y = torch.randn(N, device='cuda', dtype=torch.float32)
    
    torch.cuda.synchronize()
    start = time.time()
    
    # Do 100 operations (each reads 2x memory, writes 1x)
    for _ in range(100):
        z = x + y  # Read 2x, write 1x = 3x N elements
    
    torch.cuda.synchronize()
    elapsed = time.time() - start
    
    # Calculate bandwidth
    # 100 ops × 3N × 4 bytes per float32
    total_bytes = 100 * 3 * N * 4
    bandwidth_gbs = (total_bytes / 1e9) / elapsed
    
    print(f"Measured bandwidth: {bandwidth_gbs:.1f} GB/s")
    print(f"A100 peak: 1555 GB/s (for reference)")
    print(f"Efficiency: {bandwidth_gbs / 1555 * 100:.1f}%")

measure_memory_bandwidth()
```

**Run:**

```bash
python measure_bw.py
```

**Expected output:**

```
Measured bandwidth: 1200.5 GB/s
A100 peak: 1555 GB/s (for reference)
Efficiency: 77.2%
```

**Interpretation:** Memory operations are achieving ~77% of peak bandwidth, which is good (realistic for simple operations).

## Step 5: Compare Compute-Bound vs. Memory-Bound

```python
# File: bound_comparison.py
import torch
import time

def compute_bound_kernel(N):
    """High arithmetic intensity (compute-bound)."""
    x = torch.randn(N, N, device='cuda', dtype=torch.float32)
    y = torch.randn(N, N, device='cuda', dtype=torch.float32)
    
    torch.cuda.synchronize()
    start = time.time()
    
    # Matrix multiply: reads 2*N*N elements, does 2*N^3 operations
    # Arithmetic intensity: 2*N^3 / (2*N*N) = N operations per element
    for _ in range(10):
        z = torch.matmul(x, y)
    
    torch.cuda.synchronize()
    elapsed = time.time() - start
    
    flops = 10 * 2 * N * N * N  # 2*N^3 FLOPs per matmul
    tflops = (flops / 1e12) / elapsed
    print(f"Compute-bound (N={N}): {tflops:.2f} TFLOP/s")

def memory_bound_kernel(N):
    """Low arithmetic intensity (memory-bound)."""
    x = torch.randn(N, N, device='cuda', dtype=torch.float32)
    
    torch.cuda.synchronize()
    start = time.time()
    
    # Element-wise operations: reads N*N elements, does N*N operations
    # Arithmetic intensity: 1 operation per element (low)
    for _ in range(10):
        y = torch.sin(x) + torch.cos(x)
    
    torch.cuda.synchronize()
    elapsed = time.time() - start
    
    flops = 10 * 2 * N * N  # 2 FLOPs per element
    tflops = (flops / 1e12) / elapsed
    print(f"Memory-bound (N={N}): {tflops:.2f} TFLOP/s")

N = 4096
compute_bound_kernel(N)
memory_bound_kernel(N)
```

**Run:**

```bash
python bound_comparison.py
```

**Expected output:**

```
Compute-bound (N=4096): 310.45 TFLOP/s
Memory-bound (N=4096): 45.12 TFLOP/s
```

**Interpretation:** Compute-bound kernel achieves 310 TFLOP/s (near peak); memory-bound kernel achieves only 45 TFLOP/s. This shows that memory is a distinct bottleneck.

## Step 6: Measure Impact of Optimization

**Before Optimization:**

```python
def slow_kernel():
    # Large allocation, poor data locality
    x = torch.randn(8000, 8000, device='cuda', dtype=torch.float32)
    y = torch.randn(8000, 8000, device='cuda', dtype=torch.float32)
    
    torch.cuda.synchronize()
    start = time.time()
    
    for _ in range(5):
        z = torch.matmul(x, y)
    
    torch.cuda.synchronize()
    return time.time() - start

time_before = slow_kernel()
print(f"Before optimization: {time_before:.3f}s")
```

**After Optimization (use lower precision):**

```python
def fast_kernel():
    # Use TF32 (tensor float 32) for faster matmul
    x = torch.randn(8000, 8000, device='cuda', dtype=torch.float32)
    y = torch.randn(8000, 8000, device='cuda', dtype=torch.float32)
    
    # Enable TF32 for tensor operations (trades 3x speedup for minimal accuracy loss)
    torch.backends.cuda.matmul.allow_tf32 = True
    
    torch.cuda.synchronize()
    start = time.time()
    
    for _ in range(5):
        z = torch.matmul(x, y)
    
    torch.cuda.synchronize()
    return time.time() - start

time_after = fast_kernel()
print(f"After optimization (TF32): {time_after:.3f}s")
print(f"Speedup: {time_before / time_after:.2f}x")
```

**Expected output:**

```
Before optimization: 42.105s
After optimization (TF32): 14.032s
Speedup: 3.00x
```

## Verification Checklist

- [ ] Matrix multiply baseline measured
- [ ] nvidia-smi dmon shows GPU at 90%+ utilization during compute
- [ ] Memory bandwidth measured and compared to peak
- [ ] Compute-bound vs. memory-bound difference is clear
- [ ] Optimization improves performance and is measurable

## Key Takeaways

1. **Profile before optimizing** — measure baseline to know what you're improving
2. **Understand bottleneck type** — compute-bound and memory-bound need different fixes
3. **Precision tradeoffs are steep** — TF32 can give 3x speedup with < 1% accuracy loss
4. **Verify improvements** — don't assume optimizations work; measure them

---

**Time spent:** ___ minutes | **Speedup achieved:** ___ x
