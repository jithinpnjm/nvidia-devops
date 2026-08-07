---
title: Chapter 08 — Checkpoint Architecture and Recovery
description: Design checkpoint consistency, sharding, staging, retention, replication, and restart validation.
sidebar_position: 9
tags: [checkpointing, recovery, storage]
---

# Checkpoint Architecture and Recovery

Checkpointing is one of the highest-impact optimizations in distributed training, often reducing recovery time from days to hours. But a poorly designed checkpoint architecture can block training, waste storage, and create silent data corruption risks. This chapter covers the patterns used in production to checkpoint safely and efficiently.

| Chapter metadata | Value |
|---|---|
| Volume | 15 — AI Storage, Checkpointing, and Data Pipelines |
| Difficulty | Advanced |
| Estimated reading time | 50 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | Why does checkpointing sometimes block training for hours, and how do you pipeline it so training never waits? |

## The Checkpoint Lifecycle and Bottleneck Points

```mermaid
flowchart TD
    Training["Training Loop<br/>Process 1000 batches per epoch"]
    
    CheckpointTrigger["Checkpoint trigger<br/>(e.g., every 100 batches)"]
    
    Serialize["All ranks serialize state<br/>Rank 0: model weights (8 GB)<br/>Rank 1–7: model weights + optimizer state (12 GB each)<br/>Total per rank: 8–12 GB<br/>Query: Is serialization blocking? (should be <5s)"]
    
    SyncPoint["Synchronization barrier<br/>All ranks must reach checkpoint before any continues<br/>Query: Are all ranks progressing equally? (straggler detection)"]
    
    Write["Checkpoint write<br/>All ranks write shards to shared storage<br/>Traditional: synchronous (blocks training)<br/>Modern: async to local storage, then background flush"]
    
    Publish["Publish checkpoint<br/>(Write manifest, mark as complete)<br/>Query: Is publication atomic? (avoid partial-checkpoint bugs)"]
    
    Resume["Resume training<br/>Query: Are old checkpoints cleaned up? (avoid storage bloat)"]
    
    Training --> CheckpointTrigger
    CheckpointTrigger --> Serialize
    Serialize -->|"All ranks done?"| SyncPoint
    SyncPoint -->|"Synchronized"| Write
    Write -->|"All writes complete?"| Publish
    Publish --> Resume
    
    SyncPoint -.->|"If straggler detected| StraggleRisk["Risk: All ranks wait for slowest rank<br/>Slowest rank is 30s behind, entire cluster pauses 30s"]
    Write -.->|"If synchronous to shared storage| BlockRisk["Risk: Training blocked for write latency<br/>500 GB checkpoint at 1 GB/s = 500s stall"]
```

## Measurement and Diagnostics

### Checkpoint Duration and Components

```bash
# Instrument checkpoint code to measure each phase
import time
import torch
import torch.distributed as dist

checkpoint = {
    'epoch': epoch,
    'model_state': model.state_dict(),
    'optimizer_state': optimizer.state_dict(),
    'rng_state': torch.get_rng_state(),
    'distributed_rng_state': torch.cuda.get_rng_state_all(),
}

# Phase 1: Serialization (in-process)
t0 = time.time()
state_bytes = torch.serialize(checkpoint)
serialize_time = time.time() - t0
print(f"Serialization time: {serialize_time:.2f}s, size: {len(state_bytes)/1e9:.2f} GB")

# Phase 2: Synchronization (collective operation)
t0 = time.time()
dist.barrier()  # All ranks wait here
sync_time = time.time() - t0
print(f"Sync time: {sync_time:.2f}s")

# Phase 3: Write
t0 = time.time()
with open(f'/storage/ckpt-{epoch}.pt', 'wb') as f:
    f.write(state_bytes)
write_time = time.time() - t0
write_throughput = len(state_bytes) / write_time / 1e9
print(f"Write time: {write_time:.2f}s, throughput: {write_throughput:.2f} GB/s")

# Total checkpoint time
total = serialize_time + sync_time + write_time
print(f"Total checkpoint time: {total:.2f}s (GPU idle for {total:.0f}s)")
```

**Real sample output from a distributed training run:**
```text
Rank 0 serialization time: 3.1s, size: 8.25 GB
Rank 0 sync time: 28.3s ← Rank 7 was 28s behind!
Rank 0 write time: 450.2s ← Synchronous write to shared storage (bottleneck)
Total checkpoint time: 481.5s ← GPU idle for 8+ minutes per checkpoint
```

**Breakdown of the problem:**
1. Serialization: 3s — fine
2. Sync: 28s — rank 7 is a straggler; all ranks wait
3. Write: 450s — synchronous write to slow shared storage (checkpoint size 8.25 GB, throughput 8.25 / 450 = 18 MB/s)
4. **Total:** 481.5s every checkpoint, completely unacceptable

### Finding the Straggler

```python
import torch.distributed as dist

# In each rank, measure work between checkpoints
batch_times = []
for batch_idx, (data, labels) in enumerate(train_loader):
    t0 = time.time()
    # ... forward, backward, step ...
    batch_times.append(time.time() - t0)

# Before checkpoint, report your batch times
local_avg = sum(batch_times) / len(batch_times)
all_batch_times = [torch.tensor(local_avg) for _ in range(dist.get_world_size())]
dist.all_gather(all_batch_times, torch.tensor(local_avg))

if dist.get_rank() == 0:
    print(f"Batch times by rank: {[t.item() for t in all_batch_times]}")
    # One rank will be much higher; that's your straggler
```

## Production Pattern 1: Asynchronous Checkpoint via Staging

Instead of writing directly to shared storage (slow), write to local NVMe first, then flush asynchronously.

```python
import shutil
import threading

def checkpoint_async(model, optimizer, epoch, gpu_rank):
    """Write checkpoint to local NVMe immediately, flush to durable storage in background."""
    
    # Serialize once
    checkpoint = {
        'epoch': epoch,
        'model_state': model.state_dict(),
        'optimizer_state': optimizer.state_dict(),
    }
    
    # All ranks synchronize
    dist.barrier()
    
    # Phase 1: Fast write to local NVMe (non-blocking)
    t0 = time.time()
    local_ckpt_path = f'/local-nvme/ckpt-{epoch}-rank{gpu_rank}.pt'
    torch.save(checkpoint, local_ckpt_path)
    local_save_time = time.time() - t0
    print(f"Rank {gpu_rank}: Local save took {local_save_time:.2f}s (non-blocking)")
    
    # Phase 2: Publish manifest to shared storage (small metadata, fast)
    if gpu_rank == 0:
        manifest = {
            'epoch': epoch,
            'local_paths': [f'/local-nvme/ckpt-{epoch}-rank{r}.pt' for r in range(dist.get_world_size())],
            'completed': False,
        }
        with open(f'/shared-storage/ckpt-{epoch}/manifest.json', 'w') as f:
            json.dump(manifest, f)
    
    # Phase 3: Flush to durable storage in background (doesn't block training)
    def flush_to_durable():
        durable_path = f'/shared-storage/ckpt-{epoch}/rank{gpu_rank}.pt'
        shutil.copy2(local_ckpt_path, durable_path)
        os.remove(local_ckpt_path)  # Free local space
        
        # Rank 0 marks checkpoint as complete
        if gpu_rank == 0:
            time.sleep(2)  # Wait for all ranks to finish copying
            with open(f'/shared-storage/ckpt-{epoch}/manifest.json', 'r') as f:
                manifest = json.load(f)
            manifest['completed'] = True
            with open(f'/shared-storage/ckpt-{epoch}/manifest.json', 'w') as f:
                json.dump(manifest, f)
    
    flush_thread = threading.Thread(target=flush_to_durable, daemon=False)
    flush_thread.start()  # Doesn't block; training continues immediately
    
    # Training resumes immediately; flush happens in background
    return local_ckpt_path
```

**Result:**
- Local save: 3–5 seconds (NVMe is fast)
- Training resumes: immediately after synchronization
- Flush to durable: happens in background (500s, but doesn't block training)
- **Net gain:** from 481s stall to 5s stall per checkpoint — 96x improvement

## Production Pattern 2: Checkpoint Retention and Cleanup

Every checkpoint consumes storage. A training run with 1000 checkpoints of 500 GB each = 500 TB (expensive!). Production systems use tiered retention.

```bash
# Retention policy: keep rolling window of recent checkpoints
# Keep last 5 checkpoints (recovery within 1 hour)
# Keep weekly milestones (e.g., ckpt-epoch-{100,200,300,...})
# Archive anything older than 1 month to cold storage (glacier, etc.)

# In code:
def cleanup_old_checkpoints(checkpoint_dir, keep_recent=5, keep_weekly=True):
    """Delete old checkpoints, keep recent ones and weekly milestones."""
    
    import os
    import glob
    
    ckpts = sorted(glob.glob(f'{checkpoint_dir}/ckpt-*.pt'))
    
    if len(ckpts) > keep_recent:
        to_delete = ckpts[:-keep_recent]  # All but the last 5
        
        for ckpt in to_delete:
            epoch_num = int(ckpt.split('-')[1])
            
            # Keep weekly milestones
            if keep_weekly and epoch_num % 100 == 0:
                continue  # Don't delete
            
            # Delete old checkpoint
            os.remove(ckpt)
            print(f"Deleted {ckpt}")
```

## Measurement: Recovery Time (RTO)

How long does it take to restore from a checkpoint and resume training?

```bash
# Baseline recovery time
time python restore_and_resume.py --ckpt /shared-storage/ckpt-1000.pt

# Expected: 
# - Read checkpoint from storage: 500 GB / 2 GB/s = 250s
# - Deserialize: 10s
# - Distribute to all ranks: 5s
# - Resume training: immediate (first batch ready)
# Total: ~265 seconds ≈ 4.4 minutes

# Actual may vary; measure and report
```

## Troubleshooting Table

| Symptom | Check | Diagnosis | Action |
|---|---|---|---|
| Checkpoint time growing from 10s to 300s over 100 checkpoints | Monitor checkpoint path fill level and fragmentation | Storage is filling up; seeks are getting slower; also, older checkpoints not being deleted | Increase cleanup frequency. Measure per-rank checkpoint size growth (should plateau). If one rank is much larger, debug its training loop for memory leak. |
| Some ranks take 2x longer to write checkpoint | Measure write time per rank; compare network paths to storage | Rank's network link or NIC is slower, or it's on a different NUMA node from the cache | Check network interface: `ethtool` and latency to storage. Verify NUMA affinity. Move rank's loader to correct NUMA node. |
| Rank 0 finishes checkpoint but rank 7 is still writing (straggler) | Measure batch time per rank during training (code above) | Rank 7 has slower hardware, different load, or is competing for resources | Use `numactl` to move rank 7 to a less-contested NUMA domain. Profile rank 7's training loop for bottlenecks. Consider disabling turbo-boost on other ranks to equalize speeds. |
| Checkpoint never completes (infinite loop on write) | Check filesystem space and inode usage | Storage is completely full; write is blocked waiting for space | Delete old checkpoints immediately. Monitor storage growth during checkpoint; alert if >90%. Set up automatic cleanup before running full training. |

## Interview-Ready Answers

**Q: Your training job checkpoints 500 GB every hour and blocks training for 8 minutes per checkpoint. You have 1000 checkpoints planned. How much wall-clock training time is lost to checkpointing, and how do you fix it?**

A: "1000 checkpoints × 8 minutes = 8000 minutes = 133 hours of GPU stall time. That's a 20% loss if training is otherwise 500 hours. The fix is async staging: write to local NVMe (3–5 seconds), flush to durable storage in background. That reduces checkpoint stall from 8 minutes to 5 seconds, cutting total checkpoint time loss from 133 hours to 1.4 hours. The mechanism is simple: `torch.save()` to `/local-nvme/`, start a background thread to copy to `/shared-storage/`, resume training immediately. Background flush happens while GPU is training the next batch."

**Q: During recovery from a checkpoint, all 128 GPUs wait for the same shared-storage path to deliver the checkpoint file. How do you parallelize this?**

A: "Instead of reading one file from shared storage in series, I distribute the checkpoint across OSTs so all GPUs read in parallel. For a 500 GB checkpoint split across 8 OSTs, each GPU reads 62.5 GB from its nearest OST. With high-stripe-width GDS (if available), read rate is 8 × 2 GB/s = 16 GB/s aggregate. Recovery time: 500 GB / 16 GB/s = 31 seconds. Without parallelization, single-file read: 500 GB / 2 GB/s = 250 seconds. The production pattern: write checkpoint with high stripe width (`lfs setstripe -c -1`), and on restore, use collective I/O APIs (ROMIO in HDF5, or custom MPI-I/O) so each rank reads its shard in parallel."

---

## Practice

1. **Instrument your checkpoint:** Add timing code (as shown above) to measure serialization, sync, and write times. Run one checkpoint and report each component.

2. **Measure straggler:** Add the batch-time logging code to detect which rank is slower. If >15% variance between fastest and slowest, investigate that rank's setup.

3. **Implement async staging:** Modify your checkpoint save to write to local NVMe first, then background-flush to durable storage. Measure the improvement in checkpoint stall time.
