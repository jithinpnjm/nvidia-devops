---
title: "Lab 01 — Profiling Fundamentals (PyTorch)"
sidebar_position: 1
description: "Hands-on lab: profile a PyTorch training loop with Nsight Systems and PyTorch profiler."
---

# Lab 01 — Profiling Fundamentals (PyTorch)

## Overview

In this lab, you will profile a small PyTorch training loop using both PyTorch's native profiler and NVIDIA Nsight Systems. You'll identify which operations consume time, interpret profiler output, and practice the evidence-based diagnostic approach from Chapter 02.

## Setup

**Requirements:**
- NVIDIA GPU with CUDA compute capability 7.0+ (T4, V100, A100, H100, etc.)
- PyTorch 2.0+ with CUDA support
- NVIDIA Nsight Systems (installed with CUDA toolkit)
- ~5 GB disk space for profiler traces

**Installation:**
```bash
# Install PyTorch with CUDA (if not already done)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Verify GPU access
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0)}')"

# Check Nsight Systems
which nsys  # Should print path to nsys binary
```

## Exercises

### Exercise 1: Profile PyTorch Training Loop (30 min)

Create a file `train_profile.py`:

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.profiler import profile, record_function, ProfilerActivity
from torchvision.datasets import CIFAR10
from torchvision.transforms import ToTensor
from torch.utils.data import DataLoader

# Define a simple CNN
class SimpleCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.fc1 = nn.Linear(64 * 8 * 8, 128)
        self.fc2 = nn.Linear(128, 10)
    
    def forward(self, x):
        x = nn.functional.relu(self.conv1(x))
        x = nn.functional.max_pool2d(x, 2)
        x = nn.functional.relu(self.conv2(x))
        x = nn.functional.max_pool2d(x, 2)
        x = x.view(x.size(0), -1)
        x = nn.functional.relu(self.fc1(x))
        x = self.fc2(x)
        return x

# Setup
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = SimpleCNN().to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# Dummy data (to avoid dataset download)
batch_size = 32
num_batches = 10
X = torch.randn(batch_size * num_batches, 3, 32, 32, device=device)
y = torch.randint(0, 10, (batch_size * num_batches,), device=device)

# Profile training loop
print("Starting profiling...")
with profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    record_shapes=True,
    profile_memory=True,
    on_trace_ready=None  # Don't print, we'll analyze manually
) as prof:
    for step in range(num_batches):
        batch_start = step * batch_size
        batch_end = (step + 1) * batch_size
        
        with record_function(f"step_{step}"):
            # Forward pass
            with record_function("forward"):
                outputs = model(X[batch_start:batch_end])
            
            # Loss computation
            with record_function("loss"):
                loss = criterion(outputs, y[batch_start:batch_end])
            
            # Backward pass
            with record_function("backward"):
                optimizer.zero_grad()
                loss.backward()
            
            # Optimizer step
            with record_function("optimizer_step"):
                optimizer.step()

# Print results
print("="*80)
print("PROFILER OUTPUT:")
print("="*80)
print(prof.key_averages().table(sort_by="self_cuda_time_total", row_limit=20))

# Export for viewing
prof.export_chrome_trace("trace.json")
print("\nTrace saved to trace.json (viewable in Chrome at chrome://tracing)")
```

**Run the profiler:**
```bash
python train_profile.py
```

**Expected output:**
```
PROFILER OUTPUT:
============================================================================
Name                          Self CPU   Self CUDA    # Calls
═════════════════════════════════════════════════════════════════════════
aten::convolution            4.123ms  1250.456ms       20
aten::mm                      1.234ms   800.123ms       10
aten::_softmax                0.543ms   120.234ms       10
aten::nll_loss_forward        0.123ms    45.234ms       10
aten::nll_loss_backward       0.234ms    89.456ms       10
...
```

### Exercise 2: Interpret Profiler Output (20 min)

Answer these questions based on your output:

1. **Identify the bottleneck:** Which operation consumes the most CUDA time?
   - Expected: Convolution or matrix multiply
   
2. **Compute percentages:** Total CUDA time for all profiler lines is ~2.5 seconds (10 steps × 250ms per step).
   - Convolution: 1250ms / 2500ms = 50%
   - GEMM (mm): 800ms / 2500ms = 32%
   - Other: 18%

3. **Thread analysis:** How much time is spent on CPU vs GPU?
   - Most CPU time: overhead (kernel launches, memory allocation)
   - Most GPU time: actual kernels
   - Expected CPU/GPU ratio: 1:10 (GPU does most real work)

### Exercise 3: Profile with Nsight Systems (20 min)

```bash
# Capture Nsight Systems trace (requires sudo for some metrics)
nsys profile -t cuda,nvtx,osrt -o trace python train_profile.py

# Generate report
nsys stats trace.nsys-rep

# Expected output shows:
# - CUDA API call counts and durations
# - Kernel execution timeline
# - Memory transfer sizes
```

**Interpret the output:**
- Count how many times each kernel executes (e.g., "conv2d_kernel: 20 calls")
- Measure total time per kernel type (e.g., "conv2d_kernel: 1200ms total")
- Identify synchronization points (cudaStreamSynchronize calls)

### Exercise 4: Compare Profilers (15 min)

Create a comparison table:

| Metric | PyTorch Profiler | Nsight Systems |
|---|---|---|
| Total profiling overhead | <5% (doesn't slow code much) | ~10-15% (more detailed tracking) |
| Granularity | Kernel-level + ops | Kernel-level + system calls |
| Best for | Quick app-level analysis | Detailed timeline + system correlation |
| Output format | Table (console) | Interactive GUI or JSON |

## Verification

**Checklist:**
- [ ] `train_profile.py` runs without errors on your GPU
- [ ] PyTorch profiler output shows convolution and GEMM as top consumers (>50% of time)
- [ ] Nsight Systems trace is captured and stats generated
- [ ] You can identify CPU vs GPU time breakdown
- [ ] You can explain why a kernel takes 100ms (e.g., "1024×1024 GEMM on H100 is memory-bound, expected 50ms, got 100ms → register pressure")

## Troubleshooting

**"ImportError: cannot import name 'profile' from torch.profiler"**
- Solution: Upgrade PyTorch (`pip install --upgrade torch`)

**"nsys: command not found"**
- Solution: Install CUDA toolkit; nsys is in `cuda/bin/`

**"cuda:0 out of memory"**
- Solution: Reduce batch size to 16 in train_profile.py

**"Trace file too large"**
- Solution: Reduce `num_batches` to 5; profiler traces grow quickly

---

After this lab, you should be comfortable reading profiler output and knowing which tool to use for different questions. Proceed to Lab 02 for roofline model analysis.
