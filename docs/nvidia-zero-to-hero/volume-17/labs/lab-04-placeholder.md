---
title: "Lab 04 — Distributed Training Performance Measurement"
sidebar_position: 4
description: "Hands-on lab: measure multi-GPU training throughput and identify collective communication bottleneck."
---

# Lab 04 — Distributed Training Performance Measurement

## Overview

This lab measures training performance on multiple GPUs, profiles collective communication (allreduce), and identifies bottlenecks. By comparing single-GPU vs multi-GPU throughput, you'll see how collectives impact scaling efficiency.

## Setup

**Requirements:**
- Access to 2-4 GPUs on a single machine (NVLink preferred)
- PyTorch with distributed training support
- `torch.distributed` backend (nccl for best performance)

**Verify multi-GPU setup:**
```bash
python -c "import torch; print(f'GPU count: {torch.cuda.device_count()}'); print(torch.cuda.get_device_name(0))"
# Expected: 2-4 GPUs
```

## Exercises

### Exercise 1: Measure Single-GPU Baseline (15 min)

Create `train_single.py`:

```python
import torch
import torch.nn as nn
from torchvision.datasets import CIFAR10
from torchvision.transforms import Compose, RandomCrop, ToTensor, Normalize
from torch.utils.data import DataLoader
import time

device = torch.device('cuda:0')

# Model (same as Lab 03)
model = nn.Sequential(
    nn.Conv2d(3, 64, 3, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(2),
    nn.Conv2d(64, 128, 3, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(2),
    nn.Flatten(),
    nn.Linear(128 * 8 * 8, 256),
    nn.ReLU(),
    nn.Linear(256, 10),
).to(device)

criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.1)

# Data
transform = Compose([RandomCrop(32, padding=4), ToTensor(), 
                     Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))])
trainset = CIFAR10(root='./data', train=True, download=False, transform=transform)
trainloader = DataLoader(trainset, batch_size=256, shuffle=True, num_workers=2)

# Train
print("Single-GPU training...")
start = time.time()
samples = 0

for epoch in range(2):
    for batch in trainloader:
        x, y = batch
        x, y = x.to(device), y.to(device)
        
        y_hat = model(x)
        loss = criterion(y_hat, y)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        samples += x.size(0)

elapsed = time.time() - start
throughput = samples / elapsed
print(f"Single-GPU: {throughput:.0f} samples/sec, {elapsed:.1f} sec total")
```

**Run:**
```bash
python train_single.py
# Expected: ~12,000 samples/sec on H100
```

### Exercise 2: Multi-GPU Training (20 min)

Create `train_multi.py` (uses DistributedDataParallel):

```python
import torch
import torch.nn as nn
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler
from torchvision.datasets import CIFAR10
from torchvision.transforms import Compose, RandomCrop, ToTensor, Normalize
import os
import time

# Initialize distributed training
dist.init_process_group(backend='nccl')
rank = dist.get_rank()
world_size = dist.get_world_size()
device = torch.device(f'cuda:{rank}')

# Model
model = nn.Sequential(
    nn.Conv2d(3, 64, 3, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(2),
    nn.Conv2d(64, 128, 3, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(2),
    nn.Flatten(),
    nn.Linear(128 * 8 * 8, 256),
    nn.ReLU(),
    nn.Linear(256, 10),
).to(device)

# Wrap with DDP
model = DDP(model, device_ids=[rank])

criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.SGD(model.parameters(), lr=0.1 * world_size)  # Scale LR

# Data (use DistributedSampler to split data)
transform = Compose([RandomCrop(32, padding=4), ToTensor(), 
                     Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))])
trainset = CIFAR10(root='./data', train=True, download=False, transform=transform)
sampler = DistributedSampler(trainset, num_replicas=world_size, rank=rank, shuffle=True)
trainloader = DataLoader(trainset, batch_size=256, sampler=sampler, num_workers=2)

# Train
if rank == 0:
    print(f"Multi-GPU training on {world_size} GPUs...")
start = time.time()
samples = 0

for epoch in range(2):
    for batch in trainloader:
        x, y = batch
        x, y = x.to(device), y.to(device)
        
        y_hat = model(x)
        loss = criterion(y_hat, y)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        samples += x.size(0)

dist.barrier()  # Synchronize all processes
elapsed = time.time() - start
throughput = (samples * world_size) / elapsed  # Total samples across all GPUs

if rank == 0:
    print(f"Multi-GPU ({world_size} GPUs): {throughput:.0f} samples/sec, {elapsed:.1f} sec total")

dist.destroy_process_group()
```

**Run:**
```bash
# On 2-4 GPUs
torchrun --nproc_per_node=4 train_multi.py
# Expected: throughput = single-GPU × num_GPUs × efficiency (usually 0.8-0.9)
# E.g., single-GPU 12K samples/sec × 4 GPUs × 0.85 = ~41K samples/sec
```

### Exercise 3: Profile Collective Communication (20 min)

Create `profile_collective.py`:

```python
import torch
import torch.distributed as dist
import time
import numpy as np

dist.init_process_group(backend='nccl')
rank = dist.get_rank()
device = torch.device(f'cuda:{rank}')

# Measure allreduce latency
tensor_sizes = [1e6, 1e7, 1e8, 4e8]  # 4MB, 40MB, 400MB, 1.6GB (gradient tensor sizes)

print(f"Rank {rank}: Measuring allreduce latency...")
for size in tensor_sizes:
    size_mb = size * 4 / (1024**2)  # Convert to MB (float32 = 4 bytes)
    tensor = torch.randn(int(size), device=device)
    
    # Warm up
    for _ in range(5):
        dist.all_reduce(tensor)
    
    torch.cuda.synchronize()
    
    # Time 100 iterations
    start = time.time()
    for _ in range(100):
        dist.all_reduce(tensor)
    torch.cuda.synchronize()
    
    elapsed = time.time() - start
    latency_ms = (elapsed / 100) * 1000
    bandwidth = size_mb / (latency_ms / 1000) / 1024  # GB/s
    
    if rank == 0:
        print(f"AllReduce {size_mb:.0f}MB: {latency_ms:.2f}ms, {bandwidth:.1f}GB/s")

dist.barrier()

# Measure impact on iteration time
print(f"\nRank {rank}: Simulating training iteration...")
model_size = 400  # 400MB gradients (typical for 7B model)
grad_tensor = torch.randn(int(model_size * 1e6), device=device)

iteration_times = []
for _ in range(50):
    start = time.time()
    
    # Simulate compute
    compute_time = 0.200  # 200ms of compute
    torch.cuda.synchronize()
    time_start = time.time()
    while time.time() - time_start < compute_time:
        pass
    
    # AllReduce
    dist.all_reduce(grad_tensor)
    torch.cuda.synchronize()
    
    elapsed = time.time() - start
    iteration_times.append(elapsed)

if rank == 0:
    avg_iter = np.mean(iteration_times)
    allreduce_ratio = (avg_iter - 0.2) / avg_iter * 100
    print(f"Average iteration: {avg_iter*1000:.1f}ms")
    print(f"AllReduce overhead: {allreduce_ratio:.1f}% of iteration time")
    print(f"Scaling efficiency (1 GPU baseline × N GPUs × overhead): "
          f"{dist.get_world_size()} GPUs × {(1-allreduce_ratio/100):.2f} = "
          f"{dist.get_world_size() * (1-allreduce_ratio/100):.2f}× speedup vs single GPU")

dist.destroy_process_group()
```

**Run:**
```bash
torchrun --nproc_per_node=4 profile_collective.py
# Expected output:
# AllReduce 400MB: 8.50ms, 47.1GB/s
# Iteration with 200ms compute + allreduce: 209ms (4.5% overhead)
# Scaling efficiency: 4 × 0.955 = 3.82× (vs single GPU)
```

### Exercise 4: Scaling Efficiency Analysis (15 min)

Analyze results:

```python
# Compile results from Exercises 1-3
single_gpu_throughput = 12000  # samples/sec (from Exercise 1)
multi_gpu_throughput = 41000  # samples/sec (from Exercise 2, 4 GPUs)
scaling_efficiency = multi_gpu_throughput / (single_gpu_throughput * 4)

print(f"Single-GPU: {single_gpu_throughput} samples/sec")
print(f"4-GPU: {multi_gpu_throughput} samples/sec")
print(f"Linear scaling target: {single_gpu_throughput * 4} samples/sec")
print(f"Actual scaling efficiency: {scaling_efficiency*100:.1f}%")
print(f"Overhead from collectives: {(1-scaling_efficiency)*100:.1f}%")

# Root cause: allreduce takes 8.5ms out of 209ms iteration = 4% overhead
# Target: <2% overhead requires reducing allreduce cost or increasing compute
```

## Verification

**Checklist:**
- [ ] Single-GPU baseline measured (Exercise 1)
- [ ] Multi-GPU training runs without errors (Exercise 2)
- [ ] Multi-GPU throughput is close to single-GPU × GPU count × 0.85 (85% efficiency typical)
- [ ] Collective profiling shows allreduce latency (Exercise 3)
- [ ] You calculate scaling efficiency and identify where loss comes from (Exercise 4)

**Expected results (4 GPUs):**
- Single-GPU: 12,000 samples/sec
- Multi-GPU: 41,000-45,000 samples/sec (85-95% efficiency)
- AllReduce overhead: 4-8% of iteration time
- Scaling factor: 3.4-3.8× (vs ideal 4×)

## Troubleshooting

**"RuntimeError: collective communication not initialized"**
- Solution: Use `torchrun` or manually init `dist.init_process_group()`

**"NCCL timeout on allreduce"**
- Solution: Increase timeout: `NCCL_TIMEOUT=300 torchrun ...`

**"Multi-GPU throughput barely above single-GPU"**
- Solution: Check for CPU bottleneck (dataloading). Increase `num_workers` in DataLoader.

---

After this lab, you should understand distributed training performance, be able to measure scaling efficiency, and identify collective communication as the likely bottleneck at multi-GPU scales.
