---
title: Chapter 07 — Multi-Node Distributed Training
description: AllReduce optimization, gradient compression, pipeline parallelism, fault tolerance mechanisms.
sidebar_position: 8
tags: [distributed-training, allreduce, parallelism, fault-tolerance, checkpointing]
---

# Chapter 07 — Multi-Node Distributed Training

## PART 1: SCALING STRATEGIES

### 1.1 Data Parallelism (Batch Size Scaling)

```python
# Standard approach: Increase batch size with GPU count
# Gradient = sum of per-GPU losses, then AllReduce

batch_size_per_gpu = 128
num_gpus = 64
global_batch_size = batch_size_per_gpu * num_gpus  # 8192 sequences

# Training convergence:
#   Larger batch = noisier gradient estimate = need higher learning rate
#   Heuristic: LR scales with sqrt(batch_size)
#   base_lr = 1e-4 (for 32-token batch)
#   scaled_lr = base_lr * sqrt(8192 / 32) = base_lr * 16 = 1.6e-3

# Effective training:
#   Per-GPU throughput: 500K tokens/sec (constant)
#   Cluster throughput: 64 × 500K = 32M tokens/sec
#   Scaling efficiency: ~90% (linear scaling due to optimized AllReduce)
```

### 1.2 Pipeline Parallelism (Stage Splitting)

```python
# Reduce per-stage GPU memory by splitting model layers

# Naive: 8 GPU, 8 layers per GPU (sequential)
# Time: Layer 0 forward → Layer 1 forward → ... → Layer 7 forward → backward
#       = 8 stages × 10ms per stage = 80ms forward, 80ms backward = 160ms/iter

# With pipelining:
# GPU 0: Layer 0 (8×8B params)
# GPU 1: Layer 1 (8×8B params)
# ...
# GPU 7: Layer 7 (8×8B params)
#
# Timeline (with 4 micro-batches):
# Batch 1: GPU0→1→2→3→4→5→6→7 (160ms forward)
# Batch 2: (while Batch 1 backward): GPU0→1→2→3→4→5→6→7 (overlap!)
# Throughput: 4 batches in ~280ms (vs 640ms sequentially) = 2.3x faster!
#
# Cost: Inter-GPU communication, activation checkpointing, more complex code

from torch.distributed.pipelining import schedule_1f1b

# GPipe-style pipeline
model = PipelineParallel(model, devices=[0,1,2,3,4,5,6,7])
```

### 1.3 Tensor Parallelism (Intra-Layer Sharding)

```python
# Split single layer weights across GPUs (requires AllReduce per forward pass)

# Naive: Dense layer [70B → 70B], model parallel across 4 GPU
# GPU 0: Weight[17.5B, 70B]
# GPU 1: Weight[17.5B, 70B]
# GPU 2: Weight[17.5B, 70B]
# GPU 3: Weight[17.5B, 70B]
#
# Forward:
#   Input [batch, 70B] → split by output features → GPU0 [batch, 17.5B]
#   GPU 0 computes output fragment [batch, 17.5B]
#   AllReduce to aggregate → Full output [batch, 70B]
#   Cost: O(1) AllReduce per matrix multiply
#   Benefit: Each GPU only stores 17.5B params (reduced memory)

from megatron.core import parallel_state
from megatron.core.transformer.transformer_config import TransformerConfig

config = TransformerConfig(
    tensor_model_parallel_size=4,  # Shard across 4 GPUs
    pipeline_model_parallel_size=2,  # 2 pipeline stages
)

# Megatron-LM: Production library for tensor parallelism
```

---

## PART 2: FAULT TOLERANCE & CHECKPOINTING

### 2.1 Checkpoint Resume Strategy

```python
# Resilience: Resume training from last checkpoint if GPU fails

import os
import pickle
from pathlib import Path

class ResilientTrainer:
    def __init__(self, checkpoint_dir="./checkpoints"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(exist_ok=True)
    
    def save_checkpoint(self, model, optimizer, global_step, rank=0):
        """Save to fast local storage, async upload to S3"""
        if rank != 0:
            return
        
        checkpoint = {
            'model': model.state_dict(),
            'optimizer': optimizer.state_dict(),
            'step': global_step,
            'timestamp': time.time(),
        }
        
        ckpt_path = self.checkpoint_dir / f"step-{global_step:06d}.pt"
        torch.save(checkpoint, ckpt_path)
        
        # Keep only last 3 checkpoints (save disk space)
        checkpoints = sorted(self.checkpoint_dir.glob("step-*.pt"))
        for old_ckpt in checkpoints[:-3]:
            old_ckpt.unlink()
        
        # Async S3 backup
        import threading
        threading.Thread(
            target=self._upload_to_s3,
            args=(ckpt_path, global_step),
            daemon=True
        ).start()
    
    def load_checkpoint(self, model, optimizer):
        """Resume from latest checkpoint"""
        checkpoints = sorted(self.checkpoint_dir.glob("step-*.pt"))
        if not checkpoints:
            return 0
        
        latest = checkpoints[-1]
        ckpt = torch.load(latest)
        
        model.load_state_dict(ckpt['model'])
        optimizer.load_state_dict(ckpt['optimizer'])
        
        return ckpt['step']
    
    def _upload_to_s3(self, local_path, step):
        """Background S3 sync"""
        import boto3
        s3 = boto3.client('s3')
        s3.upload_file(str(local_path), 'training-checkpoints', f"step-{step:06d}.pt")

# Usage
trainer = ResilientTrainer()
model = MyModel()
optimizer = torch.optim.AdamW(model.parameters())

start_step = trainer.load_checkpoint(model, optimizer)

for step in range(start_step, num_steps):
    # Training
    loss.backward()
    optimizer.step()
    
    if step % 500 == 0:
        trainer.save_checkpoint(model, optimizer, step)

# If cluster fails at step 5243:
#   - Restart training
#   - load_checkpoint() restores from step-5000
#   - Resume from step 5001
#   - Only 243 steps of work lost
```

### 2.2 Detecting & Recovering from Failures

```python
# Monitored training with automatic recovery

def train_with_fault_recovery():
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            model, optimizer = setup_training()
            global_step = trainer.load_checkpoint(model, optimizer)
            
            for step in range(global_step, num_steps):
                # Training iteration
                loss.backward()
                optimizer.step()
                
                if step % 500 == 0:
                    trainer.save_checkpoint(model, optimizer, step)
                
                # Health check: detect GPU failures
                if step % 10 == 0:
                    dist.barrier()  # Sync all ranks
                    if rank == 0:
                        print(f"Step {step}, Loss {loss:.4f}")
            
            print("Training complete!")
            break
        
        except (RuntimeError, DistributedError) as e:
            if attempt < max_retries - 1:
                print(f"Error at step {global_step}: {e}")
                print(f"Retrying from last checkpoint (attempt {attempt+1}/{max_retries})")
                time.sleep(60)  # Wait before retry
            else:
                raise

# Expected behavior:
#   GPU failure detected → RuntimeError in allreduce or backward
#   Catch error → reload from checkpoint
#   Retry training → converge despite transient failures
#   Recovery time: ~60 seconds (reload + sync)
```

---

## PART 3: TROUBLESHOOTING PERFORMANCE DEGRADATION

| Issue | Symptom | Diagnostic | Resolution |
|---|---|---|---|
| **Training slow (8hrs instead of 6hrs for 1 epoch)** | Throughput 30% below expected (20M tokens/sec vs 32M) | Check GPU utilization (nvidia-smi), AllReduce time (NCCL_DEBUG=TRACE), I/O latency | Increase batch size, reduce checkpointing frequency, verify no noisy neighbors |
| **Stragglers (1 GPU much slower than others)** | One rank consistently slow in AllReduce, training hangs | NCCL_DEBUG shows one rank taking 10ms AllReduce vs 2ms others | Replace slow GPU, check thermal throttling (nvidia-smi dmon), verify network link |
| **Deadlock in AllReduce (hangs indefinitely)** | Training freezes during backward pass, no output for 30+ seconds | NCCL_DEBUG shows AllReduce step taking >1 minute, IB port errors | Increase NCCL timeout to 300s, check IB link status (ibstat), restart NCCL |
| **Model divergence (loss NaN)** | Loss becomes NaN after 1000 steps (was stable initially) | Check gradient magnitudes (print param.grad.abs().max()), learning rate | Reduce LR by 2x, enable gradient clipping (clip_grad_norm=1.0), check data pipeline |

---

## SUMMARY

Distributed training at 64+ GPUs requires:

1. **Scaling strategy:** Data parallelism (batch size) scales to 128+ GPU; pipeline/tensor parallelism needed for larger models.
2. **AllReduce optimization:** Ring AllReduce on high-speed interconnect (IB NDR) keeps overhead &lt;2% at 64 GPU.
3. **Fault tolerance:** Checkpoint every 500 steps; resume from last checkpoint on failure.
4. **Monitoring:** Track throughput, AllReduce latency, gradient norm, loss trends.

**In Chapter 8:** Inference serving (different from training; optimizes latency instead of throughput).
