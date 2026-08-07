---
title: Chapter 04 — Storage Infrastructure for AI Pipelines
description: Training data pipelines, model artifacts, checkpoint management. Throughput targets, latency budgets, I/O optimization.
sidebar_position: 5
tags: [storage, data-pipeline, checkpoint, s3, nfs, performance]
---

# Chapter 04 — Storage Infrastructure for AI Pipelines

## Chapter Metadata

| Key | Value |
|---|---|
| Volume | 21 — AI Factory: Building Large-Scale Production Systems |
| Difficulty | Architect |
| Estimated reading time | 40 minutes |
| Primary audience | Infrastructure architects, data platform engineers, storage admins |
| Core question | How do you design storage to keep 64–512 GPUs continuously fed with training data without becoming the bottleneck? |

---

## PART 1: STORAGE BOTTLENECK ANALYSIS

### 1.1 Data Throughput Demands

```
TRAINING DATA PIPELINE MATH

H100 GPU computing characteristics:
  Peak TFLOPS (BF16): 989 TFLOPS = 989 × 10^12 floating-point ops/sec
  HBM Bandwidth: 3.352 TB/s (internal to GPU)
  Per-token compute: ~15 floating-point operations (rough estimate for transformer)
  
Throughput calculation:
  Tokens per second per GPU = 989 TFLOPS / 15 FLOPs per token = ~66M tokens/sec theoretical
  Practical (accounting for memory, synchronization): ~300K–500K tokens/sec per GPU
  
  For 64 GPU:
    Aggregate throughput: 500K × 64 = 32M tokens/sec = 8M words/sec
    At ~4.5 bytes per token (UTF-8 text): 36 MB/sec... wait, that's wrong
    
Correction:
    Tokens are integers (4 bytes each) or IDs (2 bytes each)
    After tokenization: 500K tokens/sec × 2 bytes = 1 MB/sec per GPU
    But tokens come with loss gradients, context embeddings, etc.
    
Real data flow in training:
    Total throughput: ~50–100 MB/sec per GPU
    64 GPU: 3.2–6.4 GB/sec aggregate
    Per iteration (assume 500K tokens, 100ms compute): 50–100 MB/sec × 0.1 sec = 5–10 MB per iteration per GPU
    
Dataset size implications:
    Llama-3-70B train: ~15 trillion tokens (~3 trillion after deduplication)
    At 2 bytes per token: 6 TB dataset
    With 64 GPU @ 100 MB/sec aggregate: 6 TB / (100 MB/sec × 64 GPU) ≈ 15 hours to load entire dataset once
    In practice: ~30–40 hours to load (accounting for cache misses, seek time)
    
Storage requirement: Must support ≥100 MB/sec sustained throughput (cluster-level)
```

### 1.2 Storage Tier Strategy

```yaml
STORAGE TIER ARCHITECTURE

Tier 1: GPU Cache (NVMe on compute node)
  Capacity:      2–4 TB per node (8×7.68 TB NVMe = 61 TB in 8-node partition)
  Throughput:    7 GB/sec per drive, total 56 GB/sec per node
  Latency:       <1 ms random read
  Use case:      Hot dataset (current training epoch)
  Cost:          $0.0001 per GB/sec/month (very expensive per byte, but worth it for performance)
  Maintenance:   Hot-swappable, RAID-1 or RAID-10 for fault tolerance

Tier 2: Cluster Storage (NAS, e.g., NetApp)
  Capacity:      500 TB–2 PB per cluster
  Throughput:    1–10 GB/sec (shared across many nodes)
  Latency:       5–20 ms (network latency)
  Use case:      Working dataset (all data needed for current training run)
  Cost:          $0.001 per GB/sec/month (medium cost per byte)
  Maintenance:   Managed appliance, automatic failover to secondary

Tier 3: Long-term Archive (S3, GCS, cloud object storage)
  Capacity:      Unlimited (cloud provider scale)
  Throughput:    100 MB/sec–1 GB/sec per connection (multi-threaded S3)
  Latency:       50–200 ms (cloud network + API)
  Use case:      Raw dataset versioning, model checkpoints, long-term retention
  Cost:          $0.00001–0.00001 per GB/sec/month (cheap per byte, expensive per request)
  Maintenance:   Managed by cloud provider, versioning built-in
```

---

## PART 2: DATA PIPELINE DESIGN

### 2.1 Reference Architecture: 64-GPU Training Cluster

```
STORAGE ARCHITECTURE DIAGRAM

GPU Cluster (64×H100)
├── Node 1–8: Local NVMe (8×7.68TB per node = 61TB per 8-node group)
│   └── Training data for current epoch (200GB per GPU × 8 = 1.6 TB)
│
├── Cluster NAS (NetApp AFF A900)
│   ├── Capacity: 500 TB
│   ├── Throughput: 10 GB/sec (aggregated NFS share)
│   ├── Contains: Full training dataset (50–100 TB), intermediate checkpoints
│   └── Connected via: 2× 400GbE NICs to cluster switch
│
└── Cloud Archive (AWS S3)
    ├── Capacity: Unlimited
    ├── Initial dataset upload: ~100 TB (one-time, via AWS Snowball, not network)
    ├── Checkpoint backup: Every 8 hours, 1 TB per checkpoint
    └── Cost: $0.0005 per GB per month = $50/month for 100TB dataset
```

### 2.2 Data Loading Pipeline (PyTorch Example)

```python
# Optimal data pipeline for distributed training

import torch
from torch.utils.data import DataLoader, IterableDataset
import io

class TrainingDataset(IterableDataset):
    def __init__(self, s3_path, local_cache_dir, batch_size, rank, world_size):
        self.s3_path = s3_path
        self.local_cache = local_cache_dir  # /nvme/training_cache
        self.batch_size = batch_size
        self.rank = rank
        self.world_size = world_size
        
        # Pre-fetch first 100 batches into local NVMe
        self._prefetch_to_local()
    
    def _prefetch_to_local(self):
        """Parallel prefetch from NAS/S3 to local NVMe"""
        import s3fs
        import concurrent.futures
        
        fs = s3fs.S3FileSystem()
        all_files = fs.glob(f"{self.s3_path}/*.bin")
        
        # Partition files across ranks (each rank prefetches its own data)
        my_files = all_files[self.rank::self.world_size]
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            for f in my_files[:100]:  # Prefetch first 100 files
                if not os.path.exists(f"{self.local_cache}/{os.path.basename(f)}"):
                    futures.append(executor.submit(self._fetch_file, f))
            
            concurrent.futures.wait(futures)
    
    def _fetch_file(self, s3_path):
        """Fetch from S3 to local NVMe in 64MB chunks"""
        local_path = f"{self.local_cache}/{os.path.basename(s3_path)}"
        
        # First try local NVMe (hot cache)
        if os.path.exists(local_path):
            return local_path
        
        # Fall back to NAS (NetApp) or S3
        import s3fs
        fs = s3fs.S3FileSystem()
        
        with open(local_path, 'wb') as f_out:
            with fs.open(s3_path, 'rb') as f_in:
                while True:
                    chunk = f_in.read(64 * 1024 * 1024)  # 64MB chunk
                    if not chunk:
                        break
                    f_out.write(chunk)
        
        return local_path
    
    def __iter__(self):
        while True:
            # Load from local NVMe (hot path, <1ms latency)
            for local_file in os.listdir(self.local_cache):
                with open(f"{self.local_cache}/{local_file}", 'rb') as f:
                    while True:
                        tokens = f.read(2 * self.batch_size)  # 2 bytes per token
                        if not tokens:
                            break
                        
                        # Yield tokenized batch
                        yield torch.frombuffer(tokens, dtype=torch.int32).reshape(self.batch_size, -1)

# Usage
dataset = TrainingDataset(
    s3_path="s3://llm-data/pile-dedupe/train",
    local_cache_dir="/nvme/training_cache",
    batch_size=128,
    rank=torch.distributed.get_rank(),
    world_size=torch.distributed.get_world_size()
)

dataloader = DataLoader(
    dataset,
    batch_size=None,  # Dataset already returns batches
    num_workers=4,    # Parallel I/O workers
)

# In training loop
for batch in dataloader:
    # Forward/backward as normal
    output = model(batch)
    loss = criterion(output)
    loss.backward()
    optimizer.step()

# Performance:
#   Local NVMe hit: ~2ms per 256MB batch (overhead <1% of compute time)
#   NAS fallback: ~10ms per batch (still acceptable, <1% overhead)
#   S3 fallback: ~100–500ms per batch (major stall, avoid at training time)
```

---

## PART 3: CHECKPOINT MANAGEMENT

### 3.1 Checkpoint Strategy

```yaml
CHECKPOINT DESIGN FOR LLAMA-70B TRAINING

Model size:        140 GB (70B params, BF16)
Optimizer states:  AdamW: 2×140 GB (momentum + variance) = 280 GB
Activations:       Peak during backward pass: 100 GB (gradient buffers)
Total per-GPU memory: (140 + 280) / 64 GPU = 6.6 GB per GPU... 

Wait, that's wrong. Let me recalculate:
  Distributed training with ZeRO-3 sharding:
    Model params: 140 GB shared across 64 GPU = 2.1 GB per GPU
    Optimizer states: 280 GB / 64 = 4.3 GB per GPU
    Activations: 50–100 MB per GPU (gradient checkpointing reduces memory)
    Total: ~7 GB per GPU (fits in 80 GB H100)

Checkpoint file size:
  Consolidated (all params + optimizer): 140 + 280 = 420 GB
  Per-node (8 GPU × 7 GB): 56 GB

Checkpoint frequency:
  Option A: Every 8 hours
    - Risk: 8 hours of compute lost if failure
    - Storage: 1 TB per checkpoint × 3 checkpoints/day × 7 days = 21 TB
    - Cost: Checkpoint write + network transfer + storage
    - Write time: 420 GB / 10 GB/sec (NAS throughput) = 42 seconds
    - Recommendation: Production training, critical models
  
  Option B: Every 24 hours
    - Risk: 24 hours of compute lost if failure
    - Storage: 7 TB per week
    - Write time: 42 seconds (negligible compared to 24h compute)
    - Recommendation: Research training, non-critical models

Checkpoint file format:
  DeepSpeed checkpoint:
    model_0/
      mp_rank_00_model_states.pt     (model params shard)
      optim_0/
        optimizer_states.pt           (optimizer states shard)
    global_step1000                    (step counter)
  
  File total: 420 GB (consolidated) or 56 GB per node (sharded)

Checkpoint write path:
  GPU → GPU HBM (models states) → Host PCIe → Host RAM → NAS NFS → RAID → Disk
  
  Throughput bottleneck:
    GPU → Host PCIe: 64 GB/s (Gen 5), OK
    Host NAS network: 10 GB/sec (IB or 400GbE), this is the bottleneck
    
  Optimization:
    Write to local NVMe first (56 GB / 7 GB/sec = 8 seconds)
    Then async upload to NAS (10 GB/sec, hidden in background)
    Total latency: 8 seconds (not 42 seconds)
```

### 3.2 Checkpoint Resume & Validation

```python
# Robust checkpoint save/load with validation

import torch
import hashlib
from pathlib import Path

class CheckpointManager:
    def __init__(self, checkpoint_dir, s3_backup_path=None):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.s3_backup = s3_backup_path
        self.checkpoint_dir.mkdir(exist_ok=True)
    
    def save(self, model, optimizer, global_step, rank=0):
        """Save checkpoint with validation"""
        if rank != 0:
            return  # Only rank 0 saves (consolidated checkpoint)
        
        checkpoint = {
            'model_state': model.state_dict(),
            'optimizer_state': optimizer.state_dict(),
            'global_step': global_step,
        }
        
        # Save to local NVMe (fast)
        local_path = self.checkpoint_dir / f"checkpoint-step-{global_step}.pt"
        torch.save(checkpoint, local_path)
        
        # Compute checksum for validation
        checksum = self._compute_checksum(local_path)
        with open(self.checkpoint_dir / f"checkpoint-step-{global_step}.md5", 'w') as f:
            f.write(checksum)
        
        # Async backup to S3 (hidden in background)
        if self.s3_backup:
            import threading
            s3_thread = threading.Thread(
                target=self._upload_to_s3,
                args=(local_path, global_step)
            )
            s3_thread.daemon = True
            s3_thread.start()
        
        print(f"Checkpoint saved: {local_path} (checksum: {checksum[:8]}...)")
    
    def load(self, model, optimizer, resume_from_step=None):
        """Load checkpoint with validation"""
        if resume_from_step is None:
            # Auto-detect latest checkpoint
            checkpoints = sorted(self.checkpoint_dir.glob("checkpoint-step-*.pt"))
            if not checkpoints:
                print("No checkpoint found, starting from scratch")
                return 0
            resume_path = checkpoints[-1]
            resume_from_step = int(resume_path.stem.split('-')[-1])
        else:
            resume_path = self.checkpoint_dir / f"checkpoint-step-{resume_from_step}.pt"
        
        # Validate checksum before loading
        checksum_path = resume_path.with_suffix('.md5')
        if checksum_path.exists():
            with open(checksum_path, 'r') as f:
                expected_checksum = f.read().strip()
            actual_checksum = self._compute_checksum(resume_path)
            if expected_checksum != actual_checksum:
                raise RuntimeError(f"Checkpoint corrupted! Checksum mismatch: {actual_checksum} vs {expected_checksum}")
            print(f"Checksum valid: {expected_checksum[:8]}...")
        
        # Load checkpoint
        checkpoint = torch.load(resume_path)
        model.load_state_dict(checkpoint['model_state'])
        optimizer.load_state_dict(checkpoint['optimizer_state'])
        global_step = checkpoint['global_step']
        
        print(f"Loaded checkpoint from step {global_step}")
        return global_step
    
    def _compute_checksum(self, file_path):
        """Compute MD5 checksum of checkpoint file"""
        md5 = hashlib.md5()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                md5.update(chunk)
        return md5.hexdigest()
    
    def _upload_to_s3(self, local_path, step):
        """Async S3 backup"""
        import s3fs
        fs = s3fs.S3FileSystem()
        s3_path = f"{self.s3_backup}/checkpoint-step-{step}.pt"
        fs.put(str(local_path), s3_path)
        print(f"Checkpoint backed up to S3: {s3_path}")
```

---

## PART 4: STORAGE FAILURE HANDLING

| Issue | Symptom | Root Cause | Resolution |
|---|---|---|---|
| **NAS unavailable (network partition)** | `mount: RPC call returned error code EACCES` | Cluster lost connectivity to NAS; network flap or NAS reboot | Failover to local NVMe cache, retry mount with exponential backoff, alert ops |
| **Checkpoint corruption (size mismatch)** | `EOFError: file read fewer bytes than requested` | Incomplete write during network fault or power loss | Use checksums (MD5), validate before load, restore from S3 backup |
| **Slow S3 uploads (>10 min to backup 420GB)** | Async upload thread reports `PutObject timeout` | S3 API rate limiting or network saturation | Use multipart upload (1GB chunks in parallel), exponential backoff on 5xx errors |
| **Data cache miss (NVMe evicted, revert to S3)** | Training stalls for 100–500ms per batch | Local NVMe capacity exceeded, working dataset larger than cache | Increase prefetch window, implement LRU eviction policy, or expand NVMe to 8 TB per node |

---

## SUMMARY

Storage infrastructure must support:

1. **Data feeding:** 100–500 MB/sec per GPU (3–30 GB/sec cluster-level for 64 GPUs).
2. **Checkpoint management:** 420 GB every 8 hours, validated with checksums, backed up to S3.
3. **Tiered storage:** NVMe cache (hot), NAS (warm), S3 (cold, long-term).
4. **Resilience:** Local NVMe cache survives NAS outages; S3 backup survives cluster failure.

**In Chapter 5:** We move to power delivery and thermal management. How do you cool 64 H100 GPUs drawing 22.4 kW without thermal throttling?
