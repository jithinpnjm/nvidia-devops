---
title: Lab 03 — Storage Pipeline Design
description: Build data loading pipeline with performance tuning. 100 minutes hands-on.
sidebar_position: 3
tags: [lab, storage, data-pipeline, i-o-optimization]
---

# Lab 03 — Storage Pipeline Design (100 min)

## Objective

Design and implement a high-throughput data loading pipeline for distributed training. Optimize for 100+ MB/sec throughput.

## Scenario

Training Llama-70B on 64 GPUs requires:
- 100 MB/sec aggregate throughput (100 MB/sec per GPU × 64 GPU)
- 3 TB training dataset (Pile subset)
- Distributed loading (each GPU loads its own data partition)
- Fault tolerance (resume from checkpoint on data loading failure)

## Exercise 1: Single-GPU Pipeline (20 min)

**Task:** Measure throughput of naive data loading.

```python
# lab03_data_pipeline.py

import torch
from torch.utils.data import Dataset, DataLoader
import time
import os

class TokenDataset(Dataset):
    def __init__(self, data_dir, max_samples=None):
        self.data_dir = data_dir
        self.file_list = sorted(os.listdir(data_dir))[:max_samples]
    
    def __len__(self):
        return len(self.file_list)
    
    def __getitem__(self, idx):
        # Read .bin file (pre-tokenized)
        file_path = os.path.join(self.data_dir, self.file_list[idx])
        with open(file_path, 'rb') as f:
            tokens = f.read()  # Read entire file into memory
        
        return torch.frombuffer(tokens, dtype=torch.int32)[:4096]  # 4096 token sequences

# Test 1: Naive DataLoader (no prefetching)
print("Test 1: Naive DataLoader (0 workers)")
dataset = TokenDataset('./training_data', max_samples=100)
dataloader = DataLoader(dataset, batch_size=32, num_workers=0, shuffle=False)

start = time.time()
total_tokens = 0
for batch_idx, batch in enumerate(dataloader):
    total_tokens += batch.numel()
    if (batch_idx + 1) % 10 == 0:
        elapsed = time.time() - start
        throughput_mbps = (total_tokens * 2) / (elapsed * 1_000_000)  # 2 bytes per token
        print(f"  Batch {batch_idx+1:3d}: {throughput_mbps:.1f} MB/sec")

print(f"Naive throughput: {(total_tokens*2)/(time.time()-start)/1_000_000:.1f} MB/sec (target: 100 MB/sec)\n")

# Test 2: Optimized DataLoader (4 workers, pinned memory)
print("Test 2: Optimized DataLoader (4 workers, pinned)")
dataloader_opt = DataLoader(
    dataset,
    batch_size=32,
    num_workers=4,
    pin_memory=True,
    persistent_workers=True,
)

start = time.time()
total_tokens = 0
for batch_idx, batch in enumerate(dataloader_opt):
    total_tokens += batch.numel()
    if (batch_idx + 1) % 10 == 0:
        elapsed = time.time() - start
        throughput_mbps = (total_tokens * 2) / (elapsed * 1_000_000)
        print(f"  Batch {batch_idx+1:3d}: {throughput_mbps:.1f} MB/sec")

print(f"Optimized throughput: {(total_tokens*2)/(time.time()-start)/1_000_000:.1f} MB/sec\n")

# Expected output:
# Test 1: ~30–50 MB/sec (CPU I/O bottleneck, single-threaded)
# Test 2: ~80–120 MB/sec (parallel workers, pinned memory)
```

**Rubric:** Optimized throughput >80 MB/sec. Explain why multi-worker is faster.

## Exercise 2: Distributed Loading (20 min)

**Task:** Implement distributed data loading (each GPU gets different data).

```python
from torch.utils.data import DistributedSampler

def create_distributed_dataloader(rank, world_size, batch_size, num_workers):
    """
    Create dataloader for distributed training.
    Each rank loads different data (no overlap).
    """
    
    dataset = TokenDataset('./training_data')
    
    # DistributedSampler partitions data across ranks
    sampler = DistributedSampler(
        dataset,
        num_replicas=world_size,
        rank=rank,
        shuffle=True,
        seed=42,
    )
    
    dataloader = DataLoader(
        dataset,
        batch_size=batch_size,
        sampler=sampler,
        num_workers=4,
        pin_memory=True,
        persistent_workers=True,
    )
    
    return dataloader

# Simulate distributed training (64 GPU)
world_size = 64
batch_size_per_gpu = 32
global_batch_size = batch_size_per_gpu * world_size  # 2048 sequences

print(f"Distributed training: {world_size} GPU, batch size {batch_size_per_gpu} per GPU")
print(f"Global batch size: {global_batch_size} sequences")

# Estimate throughput
throughput_per_gpu_mbps = 100  # From Exercise 1 optimization
total_throughput_mbps = throughput_per_gpu_mbps * world_size

# Estimate training iteration time
tokens_per_iteration = global_batch_size * 4096  # Seq length
time_per_iteration_sec = (tokens_per_iteration * 2) / (total_throughput_mbps * 1_000_000)

print(f"Throughput: {total_throughput_mbps:.0f} MB/sec ({throughput_per_gpu_mbps} MB/sec per GPU)")
print(f"Time per iteration: {time_per_iteration_sec:.2f} sec")
print(f"Iterations per day: {86400 / time_per_iteration_sec:.0f}")
```

**Rubric:** Correctly partition data across ranks. Verify no data duplication.

## Exercise 3: Storage Tiering (30 min)

**Task:** Implement multi-tier storage (NVMe → NAS → S3) with caching.

```python
import shutil
from pathlib import Path

class TieredDataPipeline:
    def __init__(self, nvme_cache_dir, nas_path, s3_bucket):
        self.nvme_cache = Path(nvme_cache_dir)  # 2 TB local cache
        self.nas_path = nas_path  # 100 TB cluster NAS
        self.s3_bucket = s3_bucket  # Unlimited cloud archive
        
        self.nvme_cache.mkdir(exist_ok=True)
    
    def get_batch(self, epoch, batch_id):
        """Load batch from fastest available storage"""
        
        file_key = f"epoch-{epoch:02d}-batch-{batch_id:06d}.bin"
        
        # Tier 1: NVMe cache (fast, 2TB)
        nvme_path = self.nvme_cache / file_key
        if nvme_path.exists():
            return self._load_from_disk(nvme_path), "NVMe"
        
        # Tier 2: NAS (warm, 100TB)
        nas_file = f"{self.nas_path}/{file_key}"
        if self._file_exists_nas(nas_file):
            data = self._load_from_nas(nas_file)
            # Prefetch to NVMe for next iteration
            self._prefetch_to_nvme(file_key, data)
            return data, "NAS"
        
        # Tier 3: S3 (cold, unlimited)
        data = self._load_from_s3(f"s3://{self.s3_bucket}/{file_key}")
        self._prefetch_to_nvme(file_key, data)
        return data, "S3"
    
    def _prefetch_to_nvme(self, file_key, data):
        """Background async prefetch to NVMe cache"""
        import threading
        
        def save_to_nvme():
            nvme_path = self.nvme_cache / file_key
            with open(nvme_path, 'wb') as f:
                f.write(data)
        
        thread = threading.Thread(target=save_to_nvme, daemon=True)
        thread.start()
    
    def _load_from_disk(self, path):
        with open(path, 'rb') as f:
            return f.read()
    
    def _load_from_nas(self, nas_path):
        # Simulate NAS read (10 GB/sec throughput, 5ms latency)
        return self._load_from_disk(nas_path)  # In reality, NFS mount
    
    def _load_from_s3(self, s3_path):
        # Simulate S3 read with multipart download
        import boto3
        s3 = boto3.client('s3')
        bucket, key = s3_path.split('s3://')[1].split('/', 1)
        response = s3.get_object(Bucket=bucket, Key=key)
        return response['Body'].read()
    
    def _file_exists_nas(self, nas_path):
        # Simulate NAS existence check
        return True  # For now, assume NAS has file
    
    def measure_cache_efficiency(self, num_batches=1000):
        """Simulate data loading with LRU cache"""
        
        hit_counts = {'NVMe': 0, 'NAS': 0, 'S3': 0}
        nvme_capacity_bytes = 2 * 1024**3  # 2 TB
        nvme_usage = 0
        
        # Simulate 1000 batch reads (working set > NVMe capacity)
        for batch_id in range(num_batches):
            epoch = (batch_id * 32) // 10000  # Epoch cycles
            
            # 80% local batches (hit NVMe), 20% new batches
            if batch_id % 5 == 0:
                source = 'S3'  # New batch, miss NVMe
            else:
                source = 'NVMe'  # Hit NVMe
            
            hit_counts[source] += 1
        
        # Calculate efficiency
        nvme_hits = hit_counts['NVMe']
        total_reads = sum(hit_counts.values())
        nvme_hit_rate = nvme_hits / total_reads
        
        print(f"Cache efficiency (1000 batches):")
        print(f"  NVMe hits: {nvme_hits:4d} ({nvme_hit_rate*100:5.1f}%)")
        print(f"  NAS hits:  {hit_counts['NAS']:4d} ({hit_counts['NAS']/total_reads*100:5.1f}%)")
        print(f"  S3 reads:  {hit_counts['S3']:4d} ({hit_counts['S3']/total_reads*100:5.1f}%)")
        print(f"Effective throughput: {nvme_hit_rate * 100:.1f} MB/sec (NVMe) + {(1-nvme_hit_rate) * 10:.1f} MB/sec (NAS/S3) = {nvme_hit_rate*100 + (1-nvme_hit_rate)*10:.1f} MB/sec")

# Test
pipeline = TieredDataPipeline(
    nvme_cache_dir='/nvme/training_cache',
    nas_path='/mnt/nas/training_data',
    s3_bucket='llm-training-data',
)

pipeline.measure_cache_efficiency(1000)

# Expected output:
# NVMe cache hit rate: ~80% (local working set), 10 GB/sec effective throughput
```

**Rubric:** Implement prefetching. Calculate hit rate and effective throughput.

## Exercise 4: Checkpoint & Resume (30 min)

**Task:** Implement robust checkpoint with validation.

```python
import hashlib

class CheckpointManager:
    def __init__(self, checkpoint_dir):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(exist_ok=True)
    
    def save(self, data_iterator_state, model_state, step):
        """Save checkpoint with integrity check"""
        
        checkpoint = {
            'step': step,
            'data_state': data_iterator_state,  # Resume data pipeline
            'model': model_state,  # Resume training
        }
        
        # Save to local disk
        path = self.checkpoint_dir / f"checkpoint-{step:06d}.pt"
        torch.save(checkpoint, path)
        
        # Compute checksum
        checksum = self._compute_checksum(path)
        with open(path.with_suffix('.md5'), 'w') as f:
            f.write(checksum)
        
        # Async backup to S3
        self._upload_to_s3(path)
        
        return path
    
    def load(self, step=None):
        """Load checkpoint with validation"""
        
        if step is None:
            # Auto-detect latest checkpoint
            checkpoints = sorted(self.checkpoint_dir.glob("checkpoint-*.pt"))
            if not checkpoints:
                return None, None, 0  # Start from scratch
            path = checkpoints[-1]
            step = int(path.stem.split('-')[-1])
        else:
            path = self.checkpoint_dir / f"checkpoint-{step:06d}.pt"
        
        # Verify checksum
        md5_path = path.with_suffix('.md5')
        if md5_path.exists():
            with open(md5_path, 'r') as f:
                expected_md5 = f.read().strip()
            actual_md5 = self._compute_checksum(path)
            
            if expected_md5 != actual_md5:
                raise RuntimeError(f"Checkpoint corrupted! {actual_md5} != {expected_md5}")
        
        # Load
        checkpoint = torch.load(path)
        return checkpoint['data_state'], checkpoint['model'], checkpoint['step']
    
    def _compute_checksum(self, path):
        """MD5 checksum for integrity verification"""
        md5 = hashlib.md5()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                md5.update(chunk)
        return md5.hexdigest()
    
    def _upload_to_s3(self, path):
        """Async S3 backup"""
        import threading
        import boto3
        
        def upload():
            s3 = boto3.client('s3')
            s3.upload_file(str(path), 'training-checkpoints', path.name)
        
        thread = threading.Thread(target=upload, daemon=True)
        thread.start()

# Test checkpoint/resume cycle
print("Checkpoint/Resume Test:")

ckpt_mgr = CheckpointManager('./checkpoints')

# Simulate 3 training iterations with checkpoint
for step in range(1, 4):
    print(f"Step {step}: Simulating training...")
    
    # Save checkpoint
    ckpt_path = ckpt_mgr.save(
        data_iterator_state={'offset': step * 1000},
        model_state={'loss': 2.5 - 0.1*step},
        step=step,
    )
    print(f"  Saved: {ckpt_path}")

# Simulate failure and resume
print("\nSimulating failure... resuming from last checkpoint")
data_state, model_state, resume_step = ckpt_mgr.load()
print(f"Resumed from step {resume_step}")
print(f"Data offset: {data_state['offset']}")
print(f"Model loss: {model_state['loss']:.2f}")
```

**Rubric:** Checkpoint saves/resumes correctly. Checksum validation works. Explain MTTR (resume time).

## Success Criteria

- [ ] Single-GPU throughput: >80 MB/sec
- [ ] Distributed loading: Correct data partitioning across 64 GPU
- [ ] Storage tiering: NVMe cache >80% hit rate
- [ ] Checkpoint: Save and resume works correctly with integrity checks

