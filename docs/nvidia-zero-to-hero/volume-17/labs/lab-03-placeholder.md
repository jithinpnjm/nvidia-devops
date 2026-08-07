---
title: "Lab 03 — Mixed Precision Training and Performance"
sidebar_position: 3
description: "Hands-on lab: train with FP32 vs BF16, measure speedup and validate accuracy."
---

# Lab 03 — Mixed Precision Training and Performance

## Overview

Mixed precision training (using BF16 or FP16 for compute while keeping FP32 for weights) is one of the easiest 2× speedups available. In this lab, you'll implement mixed precision training, profile the performance improvement, and verify accuracy doesn't regress.

## Setup

**Requirements:**
- PyTorch 2.0+ with CUDA support
- CIFAR-10 dataset (~170 MB download on first run)
- GPU with BF16 support (H100, A100; V100 requires FP16 instead)

## Exercises

### Exercise 1: FP32 Baseline (20 min)

Create `train_fp32.py`:

```python
import torch
import torch.nn as nn
from torchvision.datasets import CIFAR10
from torchvision.transforms import Compose, RandomCrop, RandomHorizontalFlip, ToTensor, Normalize
from torch.utils.data import DataLoader
import time

device = torch.device('cuda')

# Simple CNN model
model = nn.Sequential(
    nn.Conv2d(3, 32, 3, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(2),
    nn.Conv2d(32, 64, 3, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(2),
    nn.Flatten(),
    nn.Linear(64 * 8 * 8, 128),
    nn.ReLU(),
    nn.Linear(128, 10),
).to(device)

criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.1, momentum=0.9)

# Dataset
transform = Compose([
    RandomCrop(32, padding=4),
    RandomHorizontalFlip(),
    ToTensor(),
    Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))
])
trainset = CIFAR10(root='./data', train=True, download=True, transform=transform)
trainloader = DataLoader(trainset, batch_size=128, shuffle=True, num_workers=2)

# Train
print("Training with FP32...")
start_time = time.time()
total_samples = 0

for epoch in range(2):  # 2 epochs for quick demo
    for batch_idx, (inputs, targets) in enumerate(trainloader):
        inputs, targets = inputs.to(device), targets.to(device)
        
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()
        
        total_samples += inputs.size(0)
        
        if batch_idx % 100 == 0:
            print(f"Epoch {epoch}, Batch {batch_idx}, Loss: {loss.item():.4f}")

elapsed = time.time() - start_time
throughput_fp32 = total_samples / elapsed
print(f"\nFP32 Training:")
print(f"  Total time: {elapsed:.2f} seconds")
print(f"  Throughput: {throughput_fp32:.0f} samples/sec")
print(f"  Time per 1K samples: {1000/throughput_fp32:.2f} sec")

# Test accuracy
testset = CIFAR10(root='./data', train=False, download=True, transform=transform)
testloader = DataLoader(testset, batch_size=128, shuffle=False, num_workers=2)
correct, total = 0, 0
model.eval()
with torch.no_grad():
    for inputs, targets in testloader:
        inputs, targets = inputs.to(device), targets.to(device)
        outputs = model(inputs)
        _, predicted = torch.max(outputs.data, 1)
        total += targets.size(0)
        correct += (predicted == targets).sum().item()

accuracy_fp32 = correct / total
print(f"  Test accuracy: {accuracy_fp32:.4f}")
```

**Run:**
```bash
python train_fp32.py
# Expected output:
# FP32 Training:
#   Total time: 120.45 seconds
#   Throughput: 8630 samples/sec
#   Test accuracy: 0.6234
```

### Exercise 2: BF16 Training (20 min)

Create `train_bf16.py` (same as above but with mixed precision):

```python
# ... (imports and setup same as Exercise 1) ...

# Add AMP (Automatic Mixed Precision)
scaler = torch.cuda.amp.GradScaler()

# Train with mixed precision
print("Training with BF16 (Automatic Mixed Precision)...")
start_time = time.time()
total_samples = 0

for epoch in range(2):
    for batch_idx, (inputs, targets) in enumerate(trainloader):
        inputs, targets = inputs.to(device), targets.to(device)
        
        optimizer.zero_grad()
        
        # Mixed precision: forward pass in lower precision
        with torch.cuda.amp.autocast(dtype=torch.bfloat16):
            outputs = model(inputs)
            loss = criterion(outputs, targets)
        
        # Backward in FP32 (gradient scaling)
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        
        total_samples += inputs.size(0)
        
        if batch_idx % 100 == 0:
            print(f"Epoch {epoch}, Batch {batch_idx}, Loss: {loss.item():.4f}")

elapsed = time.time() - start_time
throughput_bf16 = total_samples / elapsed
print(f"\nBF16 Training:")
print(f"  Total time: {elapsed:.2f} seconds")
print(f"  Throughput: {throughput_bf16:.0f} samples/sec")
print(f"  Time per 1K samples: {1000/throughput_bf16:.2f} sec")
print(f"  Speedup vs FP32: {throughput_bf16 / throughput_fp32:.2f}×")

# ... (test accuracy same as above) ...
accuracy_bf16 = correct / total
print(f"  Test accuracy: {accuracy_bf16:.4f}")
print(f"  Accuracy change: {accuracy_bf16 - accuracy_fp32:+.4f} (should be < 0.01)")
```

**Run:**
```bash
python train_bf16.py
# Expected output:
# BF16 Training:
#   Total time: 65.23 seconds (2× faster!)
#   Throughput: 15860 samples/sec
#   Speedup vs FP32: 1.84×
#   Test accuracy: 0.6210
#   Accuracy change: -0.0024 (acceptable)
```

### Exercise 3: Profiling Comparison (15 min)

Profile both to see where the speedup comes from:

```python
from torch.profiler import profile, ProfilerActivity

# Profile FP32
print("Profiling FP32...")
with profile(activities=[ProfilerActivity.CUDA]) as prof:
    for step in range(10):
        inputs, targets = next(iter(trainloader))
        inputs, targets = inputs.to(device), targets.to(device)
        outputs = model(inputs)
        loss = criterion(outputs, targets)
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

print("Top CUDA kernels (FP32):")
print(prof.key_averages().table(sort_by="self_cuda_time_total", row_limit=10))

# Profile BF16 (same but with autocast)
print("\nProfiling BF16...")
with profile(activities=[ProfilerActivity.CUDA]) as prof:
    for step in range(10):
        inputs, targets = next(iter(trainloader))
        inputs, targets = inputs.to(device), targets.to(device)
        
        with torch.cuda.amp.autocast(dtype=torch.bfloat16):
            outputs = model(inputs)
            loss = criterion(outputs, targets)
        
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()

print("Top CUDA kernels (BF16):")
print(prof.key_averages().table(sort_by="self_cuda_time_total", row_limit=10))
```

**Expected comparison:**
- FP32 GEMM (matrix multiply): 45 TFLOPS achieved
- BF16 GEMM: 95 TFLOPS achieved (2.1× speedup)
- Overall iteration: 120ms (FP32) → 65ms (BF16) = 1.85× speedup

## Verification

**Checklist:**
- [ ] FP32 training completes without errors; measure throughput
- [ ] BF16 training completes without errors; measure throughput
- [ ] BF16 is 1.5-2.5× faster than FP32
- [ ] Accuracy difference is < 0.01 (acceptable)
- [ ] Profiler shows GEMM kernels run 2× faster in BF16
- [ ] You can explain why (lower precision = wider SIMD ops, faster throughput)

**Expected results table:**

| Metric | FP32 | BF16 | Speedup |
|---|---|---|---|
| Throughput (samples/sec) | 8630 | 15860 | 1.84× |
| GEMM TFLOPS | 45 | 95 | 2.1× |
| Test accuracy | 0.6234 | 0.6210 | -0.002 ✓ |

## Troubleshooting

**"NotImplementedError: autocast does not support bfloat16"**
- Solution: Your GPU doesn't support BF16. Use FP16 instead: `torch.float16`

**"Accuracy dropped significantly (> 1%)"**
- Solution: Use gradient scaling (`torch.cuda.amp.GradScaler`) to prevent gradient underflow

**"No speedup observed"**
- Solution: Ensure CUDA kernels are actually running (check with `nvidia-smi dmon`); CPU-bound code won't benefit from lower precision

---

After this lab, you should understand the mixed precision speedup and feel confident deploying it in production. The accuracy/speed tradeoff is almost always worthwhile.
