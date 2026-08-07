---
title: Chapter 06 — Software Stack Integration
description: CUDA runtime, frameworks (PyTorch, JAX, TensorFlow), distributed training orchestration.
sidebar_position: 7
tags: [cuda, pytorch, distributed-training, deepspeed, orchestration]
---

# Chapter 06 — Software Stack Integration

## Chapter Metadata

| Key | Value |
|---|---|
| Volume | 21 — AI Factory: Building Large-Scale Production Systems |
| Difficulty | Architect |
| Estimated reading time | 35 minutes |
| Primary audience | Software engineers, platform leads, DevOps engineers |
| Core question | How do you configure CUDA, frameworks, and distributed training libraries so they actually use 64+ GPUs efficiently without configuration errors? |

---

## PART 1: CUDA RUNTIME CONFIGURATION

### 1.1 CUDA Version & Driver Alignment

```yaml
COMPATIBILITY MATRIX (August 2026)

GPU:              H100 SXM5
NVIDIA Driver:    560.x (latest production, released Jan 2026)
CUDA Toolkit:     12.5 (matches driver)
cuDNN:            9.2 (supports FP8, FP16 acceleration)
NCCL:             2.22.x (latest, optimized AllReduce)
PyTorch:          2.4.0+ (or with cu121 build)
JAX:              0.4.30+ (with jaxlib 0.4.30)

Version Alignment Rule:
  NVIDIA Driver ← limits CUDA Toolkit version
  CUDA Toolkit ← limits cuDNN/NCCL/PyTorch compatibility
  
  Mismatch example (DON'T DO THIS):
    Driver 550 (old) + CUDA 12.5 (new) = CUDA runtime errors
    CUDA 12.0 + cuDNN 8.0 (old) = low performance (missing FP8 ops)
```

### 1.2 CUDA Memory Management

```python
# Critical CUDA settings for multi-GPU training

import torch
import os

# 1. Enable CUDA graphs (reduces launch overhead, critical for many-GPU scenarios)
os.environ["CUDA_LAUNCH_BLOCKING"] = "0"  # Default is good
os.environ["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"  # Consistent ordering across nodes

# 2. GPU memory allocation strategy
torch.cuda.set_per_process_memory_fraction(0.95)  # Use 95% of GPU VRAM
torch.cuda.empty_cache()  # Pre-allocate GPU memory

# 3. Enable peer-to-peer GPU communication (within node, critical for NVLink)
for i in range(torch.cuda.device_count()):
    for j in range(torch.cuda.device_count()):
        if i != j:
            try:
                torch.cuda.can_device_access_peer(i, j)
                torch.cuda.enable_peer_access(i, j)
            except RuntimeError:
                pass  # P2P not available between GPUs

# 4. Memory pool configuration (reduces fragmentation)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:512"

# Verification: Check GPU memory state
def check_gpu_memory():
    for i in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(i)
        total_memory = props.total_memory / 1e9  # GB
        allocated = torch.cuda.memory_allocated(i) / 1e9
        reserved = torch.cuda.memory_reserved(i) / 1e9
        free = total_memory - allocated
        
        print(f"GPU {i}:")
        print(f"  Total: {total_memory:.1f} GB")
        print(f"  Allocated: {allocated:.1f} GB ({100*allocated/total_memory:.1f}%)")
        print(f"  Reserved: {reserved:.1f} GB")
        print(f"  Free: {free:.1f} GB")

check_gpu_memory()

# Expected output (H100 80GB):
# GPU 0:
#   Total: 80.0 GB
#   Allocated: 76.0 GB (95.0%)
#   Reserved: 79.0 GB
#   Free: 4.0 GB
```

---

## PART 2: PYTORCH DISTRIBUTED TRAINING SETUP

### 2.1 DDP (Distributed Data Parallel) Configuration

```python
import datetime
import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
import torch.multiprocessing as mp

def setup_distributed():
    """Initialize distributed training with NCCL backend"""
    
    # 1. Initialize process group
    # Each process gets RANK (0–63), LOCAL_RANK (0–7 per node), WORLD_SIZE (64)
    # Set by torch.distributed.launch or torchrun
    
    rank = int(os.environ.get("RANK", 0))
    world_size = int(os.environ.get("WORLD_SIZE", 1))
    local_rank = int(os.environ.get("LOCAL_RANK", 0))
    
    # Set device (each process runs on one GPU)
    torch.cuda.set_device(local_rank)
    device = torch.device("cuda", local_rank)
    
    # Initialize backend (NCCL is default for GPU training)
    dist.init_process_group(
        backend="nccl",  # GPU-optimized collective backend
        rank=rank,
        world_size=world_size,
        timeout=datetime.timedelta(minutes=30),  # Timeout for hung processes
    )
    
    return device, rank, world_size

def train_distributed():
    device, rank, world_size = setup_distributed()
    
    # Load model
    model = MyTransformer(...)
    model = model.to(device)
    
    # Wrap with DDP (handles AllReduce for gradients automatically)
    model = DDP(model, device_ids=[rank % 8], output_device=rank % 8)
    
    # Optimizer
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    
    # Training loop
    for epoch in range(num_epochs):
        for batch_idx, (x, y) in enumerate(dataloader):
            x, y = x.to(device), y.to(device)
            
            # Forward pass
            logits = model(x)
            loss = criterion(logits, y)
            
            # Backward (automatically calls AllReduce for gradients)
            optimizer.zero_grad()
            loss.backward()
            
            # AllReduce happens inside loss.backward() (DDP hooks)
            # No explicit dist.all_reduce() needed!
            
            optimizer.step()
            
            if rank == 0 and batch_idx % 100 == 0:
                print(f"Epoch {epoch}, Batch {batch_idx}, Loss {loss:.4f}")
    
    # Cleanup
    dist.destroy_process_group()

# Launch with torchrun (recommended):
# torchrun --nproc_per_node=8 --nnodes=8 --node_rank=0 --master_addr=node0 --master_port=29500 train_script.py

# Or torch.distributed.launch (older):
# python -m torch.distributed.launch --nproc_per_node=8 --nnodes=8 --node_rank=0 --master_addr=node0 train_script.py
```

### 2.2 DeepSpeed Integration (Production-Grade Training)

```python
# DeepSpeed: Production distributed training with ZeRO optimization

import deepspeed
import torch

def train_with_deepspeed():
    model = MyTransformer(...)
    
    # DeepSpeed config (ds_config.json)
    ds_config = {
        "train_batch_size": 256,  # per-GPU batch size (distributed across ranks)
        "gradient_accumulation_steps": 1,
        "optimizer": {
            "type": "AdamW",
            "params": {"lr": 1e-4, "betas": [0.9, 0.999], "eps": 1e-8, "weight_decay": 0.01}
        },
        "zero_optimization": {
            "stage": 3,  # Maximum memory savings: shard model params, optimizer, activations
            "offload_optimizer": {"device": "cpu", "pin_memory": True},  # CPU offload for even more memory
            "offload_param": {"device": "cpu", "pin_memory": True},
            "reduce_scatter": True,
            "contiguous_gradients": True,
        },
        "gradient_clipping": 1.0,
        "distributed_training": {
            "data_parallel_size": 64,
            "model_parallel_size": 1,
        }
    }
    
    # Initialize DeepSpeed engine
    model_engine, optimizer, _, _ = deepspeed.initialize(
        model=model,
        model_parameters=model.parameters(),
        config_dict=ds_config,
        dist_init_required=True,
    )
    
    # Training loop (simpler than manual DDP)
    for epoch in range(num_epochs):
        for batch in dataloader:
            x, y = batch
            
            logits = model_engine(x)
            loss = criterion(logits, y)
            
            model_engine.backward(loss)  # DeepSpeed handles AllReduce + ZeRO updates
            model_engine.step()
            
            if model_engine.global_rank == 0:
                print(f"Loss: {loss:.4f}, LR: {model_engine.get_lr()[0]:.2e}")
    
    # Save checkpoint (DeepSpeed format includes all ZeRO state)
    model_engine.save_checkpoint("./checkpoints", tag="final")

# Benefits over vanilla DDP:
#   ZeRO Stage 3: Reduces memory per GPU from ~70GB to ~20GB (3.5x savings)
#   Enables training 400B+ parameter models on same GPU count
#   Automatic activation checkpointing (recompute vs cache trade-off)
#   Gradient accumulation & offloading built-in
```

---

## PART 3: MULTI-FRAMEWORK ORCHESTRATION

### 3.1 PyTorch + JAX Interop

```python
# Hybrid training: PyTorch dataloader + JAX compute (rare but sometimes useful)

import jax
import jax.numpy as jnp
from jax import grad, jit
import torch
from torch.utils.data import DataLoader

def train_pytorch_dataloader_jax_compute():
    """Load data via PyTorch, compute in JAX (example: tensor shaping differences)"""
    
    # PyTorch dataloader (handles batching, prefetching)
    dataloader = DataLoader(dataset, batch_size=128, num_workers=4)
    
    # JAX model
    def loss_fn(params, x, y):
        logits = jax.nn.Dense(params, x)
        return jnp.mean((logits - y) ** 2)
    
    grad_fn = jit(grad(loss_fn))  # Compile to GPU code
    
    # Training loop
    for epoch in range(num_epochs):
        for batch_idx, (x, y) in enumerate(dataloader):
            # Convert PyTorch tensors to JAX arrays
            x_jax = jnp.array(x.numpy())
            y_jax = jnp.array(y.numpy())
            
            # Compute gradients in JAX
            grads = grad_fn(params, x_jax, y_jax)
            
            # Update params
            params = jax.tree_map(lambda p, g: p - 0.01*g, params, grads)
```

### 3.2 Kubernetes Orchestration for Distributed Training

```yaml
# Kubernetes manifest: Launch distributed training job on GPU cluster

apiVersion: batch/v1
kind: Job
metadata:
  name: llama-70b-training
spec:
  parallelism: 8  # 8 nodes × 8 GPU = 64 GPUs
  completions: 8
  backoffLimit: 3  # Retry up to 3 times if pod fails
  
  template:
    spec:
      restartPolicy: Never
      
      # GPU resource requests
      containers:
      - name: training
        image: nvidia/pytorch:24.06-py3
        
        # Resource requests (guaranteed)
        resources:
          limits:
            nvidia.com/gpu: 8  # Request 8 GPUs per pod
            memory: "400Gi"
            cpu: "64"
          requests:
            nvidia.com/gpu: 8
            memory: "400Gi"
            cpu: "64"
        
        # Environment for distributed training
        env:
        - name: MASTER_ADDR
          value: "training-pod-0"  # Pod 0 is master
        - name: MASTER_PORT
          value: "29500"
        - name: WORLD_SIZE
          value: "8"
        - name: RANK
          valueFrom:
            fieldRef:
              fieldPath: metadata.annotations['rank']  # Set by controller
        
        # Training command
        command:
          - python
          - /workspace/train.py
          - --model=llama-70b
          - --batch-size=128
          - --num-epochs=3
        
        # Volume for checkpoints (NFS mount)
        volumeMounts:
        - name: checkpoints
          mountPath: /workspace/checkpoints
      
      volumes:
      - name: checkpoints
        persistentVolumeClaim:
          claimName: training-checkpoints-pvc
      
      # Node affinity (ensure GPUs on same node)
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: training-job
                operator: In
                values: ["llama-70b"]
            topologyKey: kubernetes.io/hostname

# Usage:
# kubectl apply -f training-job.yaml
# kubectl logs -f job/llama-70b-training --all-containers=true
```

---

## PART 4: TROUBLESHOOTING TABLE

| Issue | Symptom | Root Cause | Resolution |
|---|---|---|---|
| **NCCL initialization timeout** | `RuntimeError: NCCL operation timed out` at startup | Master address unreachable or rank mismatch | Check MASTER_ADDR DNS, verify RANK env var matches pod index, increase timeout to 300s |
| **GPU peer access failure** | `RuntimeError: invalid device ordinal` or P2P disabled | GPU drivers not matching or insufficient permissions | Verify nvidia-smi output consistent on all nodes, check /proc/driver/nvidia/gpus permissions |
| **Out-of-memory during training** | `torch.cuda.OutOfMemoryError: CUDA out of memory` | Model too large or batch size too high | Reduce batch size, enable gradient checkpointing, use ZeRO Stage 3 offloading |
| **Slow gradient transfer (AllReduce)** | 100ms AllReduce on 64 GPU (should be 2–5ms) | IB disabled, using TCP fallback, or network congestion | Set `NCCL_DEBUG=INFO`, verify IB link status, reduce concurrent jobs |

---

## SUMMARY

Software stack integration requires:

1. **CUDA/Driver alignment:** Match versions; use latest stable driver + CUDA Toolkit.
2. **DDP or DeepSpeed:** For 64+ GPU training, use DeepSpeed ZeRO for memory efficiency.
3. **Distributed initialization:** Use torchrun or torch.distributed.launch; verify RANK/WORLD_SIZE.
4. **Monitoring:** Log GPU memory, AllReduce latency, throughput every iteration.

**In Chapter 7:** Multi-node distributed training deep dive.
