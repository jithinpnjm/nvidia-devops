---
title: Chapter 09 — Metadata, Small Files, and Data Loading
description: Diagnose metadata pressure, small-file amplification, preprocessing, and loader starvation.
sidebar_position: 10
tags: [metadata, data-loading, small-files]
---

# Metadata, Small Files, and Data Loading

This is the chapter most training teams ignore until they hit a wall. Datasets with millions of small files can consume >80% of training time on I/O overhead, even when storage link and GPU have plenty of headroom. The problem is *not* bandwidth; it's the cost of opening each file.

| Chapter metadata | Value |
|---|---|
| Volume | 15 — AI Storage, Checkpointing, and Data Pipelines |
| Difficulty | Intermediate |
| Estimated reading time | 45 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | Why does a training job stall even though storage and GPU both have idle capacity? |

## The Small-File Problem, Quantified

**Scenario: ImageNet training, 1.2 million small image files**

```
Loader needs to:
1. stat() file (MDS + NIC latency): 2 ms
2. open() file (RPC, server-side lookup): 1 ms
3. read() file (one syscall per file): 0.5 ms
4. close() file (RPC): 0.5 ms
5. decode image (CPU, PIL): 5 ms
6. augment (CPU, albumentations): 10 ms
Total per file: 19 ms

Batch size: 256 images per batch
Batches per epoch: 1,200,000 / 256 ≈ 4,688 batches

Time to load one batch:
- Serial (one worker): 256 files × 19 ms = 4,864 ms ← Terrible!
- 8 workers parallel: 4,864 ms / 8 ≈ 608 ms per batch ← Still 19 seconds per epoch just on I/O!
- Ideal (no overhead): 256 × 85 KB (avg image) / (2 GB/s link) = 11 ms per batch

Actual loss: 608 ms − 11 ms = 597 ms per batch overhead
Over 4,688 batches per epoch: 597 × 4,688 = 2.8 million ms = 2,800 seconds ≈ 47 minutes!

GPU sits idle for 47 minutes per epoch, even though network has headroom.
```

## Diagnosis: Where Is the Time Actually Going?

### Measure File-Open Rate

```bash
# During training, count how many file opens are happening per second
# Using strace (heavy overhead, only for diagnosis):
strace -e openat -c python train.py 2>&1 | head -20

# Output:
# % time     seconds  usecs/call     calls  errors  syscall
#  45.23       2.140        8       267500   1234  openat

# This means: 267,500 openat calls in 2.14 seconds ≈ 125K opens/sec
# That's > your storage MDS capacity (50K–100K ops/sec) — metadata is saturated!
```

**Real measurement on a system without strace:**
```python
import time
import os

# Instrument your data loader
open_count = 0
read_count = 0
start_time = time.time()

class InstrumentedDataset(torch.utils.data.Dataset):
    def __init__(self, image_dir):
        self.image_dir = image_dir
        self.images = sorted(os.listdir(image_dir))
    
    def __getitem__(self, idx):
        global open_count, read_count
        
        img_path = os.path.join(self.image_dir, self.images[idx])
        
        # Measure: open + read time
        t0 = time.time()
        with open(img_path, 'rb') as f:
            img_bytes = f.read()
        elapsed = time.time() - t0
        
        open_count += 1
        read_count += len(img_bytes)
        
        # Log every 1000 samples
        if idx % 1000 == 0:
            elapsed_wall = time.time() - start_time
            opens_per_sec = open_count / elapsed_wall
            throughput_mbs = (read_count / elapsed_wall) / 1e6
            print(f"Idx {idx}: {opens_per_sec:.0f} opens/sec, {throughput_mbs:.1f} MB/s")
        
        return img_bytes

# Run training with this dataset
loader = torch.utils.data.DataLoader(InstrumentedDataset(...), batch_size=256, num_workers=8)
```

**Real sample output:**
```text
Idx 0: 2350 opens/sec, 185.2 MB/s
Idx 1000: 2410 opens/sec, 189.1 MB/s
Idx 2000: 2320 opens/sec, 192.5 MB/s
Idx 10000: 1850 opens/sec, 154.3 MB/s ← Drops after cache warmth
Idx 50000: 820 opens/sec, 68.7 MB/s   ← Way down when cache is cold
```

**Interpretation:**
- 2350 opens/sec is above metadata server capacity (should be under 50K total, but here's just one client)
- Throughput correlates with open rate (lower opens = lower throughput because waiting on metadata)
- **Verdict:** The loader is bottlenecked on file opens, not on data throughput

### Measure Batch Assembly Time

```python
# Instrument at the batch level
import time

for epoch in range(num_epochs):
    for batch_idx, (images, labels) in enumerate(train_loader):
        # Time when batch was ready
        batch_ready_time = time.time()
        
        # Measure wait time from last batch
        if batch_idx > 0:
            wait_time = batch_ready_time - last_batch_time
            print(f"Batch {batch_idx}: wait_time={wait_time*1000:.0f}ms")
        
        # Train on this batch
        gpu_start = time.time()
        # ... forward, backward, step ...
        gpu_time = time.time() - gpu_start
        
        if wait_time > gpu_time:
            print(f"LOADER STALLS GPU: wait {wait_time*1000:.0f}ms, GPU work {gpu_time*1000:.0f}ms")
        
        last_batch_time = time.time()
```

**Real sample output:**
```text
Batch 0: wait_time=580ms
Batch 1: wait_time=620ms
Batch 2: wait_time=590ms ← Each batch takes 600ms, GPU processes in 100ms
LOADER STALLS GPU: wait 600ms, GPU work 100ms
Batch 3: wait_time=620ms
LOADER STALLS GPU: wait 620ms, GPU work 100ms
```

**Interpretation:** Loader is 6x slower than GPU can consume. GPU is idle 86% of the time waiting for data.

## Solutions: The Repackaging Approach

### Solution 1: Tar Archives (Simplest)

```bash
# Repackage 10,000 small images into a single tar file
cd /dataset/imagenet
find . -name "*.jpg" | head -10000 | tar -cf shard-0.tar -T -

# Result: 1,200,000 files → 120 tar files (10K images per tar)
# Metadata operations: 1.2M opens → 120 opens
# Reduction: 10,000x!

# New loader:
class TarDataset(torch.utils.data.Dataset):
    def __init__(self, tar_path):
        import tarfile
        self.tar = tarfile.open(tar_path, 'r')
        self.members = self.tar.getmembers()
    
    def __getitem__(self, idx):
        member = self.members[idx]
        f = self.tar.extractfile(member)
        img = Image.open(f).convert('RGB')
        return transforms(img)
```

**Result:** Opens drop from 1.2M to 120, latency per batch drops from 600ms to 50ms.

### Solution 2: WebDataset (Production-Grade)

WebDataset packages data into indexed tar files with metadata, perfect for AI.

```bash
# Install webdataset
pip install webdataset

# Create webdataset shards (1000 images per shard)
python -c "
import webdataset as wds
import glob

dataset = wds.ShardWriter('dataset-%06d.tar', maxcount=1000)
for idx, img_path in enumerate(sorted(glob.glob('/dataset/images/*.jpg'))):
    with open(img_path, 'rb') as f:
        img_data = f.read()
    dataset.write({'__key__': f'{idx:08d}', 'jpg': img_data})
dataset.close()
"

# Result: 1,200 shards of 1000 images each
```

**Training code:**
```python
import webdataset as wds

def get_loader(shard_pattern, batch_size=256, num_workers=8):
    dataset = wds.WebDataset(shard_pattern, resampled=True)
    dataset = dataset.decode('pil').map(transforms)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, num_workers=num_workers)
    return loader

loader = get_loader('dataset-*.tar')
```

**Benefits:**
- Single tar file per shard = one open operation instead of 1000
- Streaming reads from tar = no random seeking
- Built-in shuffling and resampling for training
- Proven at scale (Facebook, etc.)

### Solution 3: HDF5 (For Structured Data)

For datasets with mixed data types (images, metadata, labels), HDF5 is efficient:

```python
import h5py

# Create HDF5 file at dataset-build time
h5_file = h5py.File('dataset.h5', 'w')
images_dset = h5_file.create_dataset('images', shape=(1200000, 224, 224, 3), dtype='uint8', chunks=(64, 224, 224, 3))
labels_dset = h5_file.create_dataset('labels', shape=(1200000,), dtype='int32', chunks=(64,))

# Populate
for idx, (img_path, label) in enumerate(data_list):
    img = np.array(Image.open(img_path))
    images_dset[idx] = img
    labels_dset[idx] = label

# Training loader
class HDF5Dataset(torch.utils.data.Dataset):
    def __init__(self, h5_path):
        self.h5_file = h5py.File(h5_path, 'r')
        self.images = self.h5_file['images']
        self.labels = self.h5_file['labels']
    
    def __getitem__(self, idx):
        return transforms(self.images[idx]), self.labels[idx]
    
    def __len__(self):
        return len(self.labels)
```

**Trade-offs:**
- Single file (one open) for entire dataset
- Random access within file (good for shuffling)
- Memory-mapped, can be faster than seeking tar files
- Downside: file locking during writes; careful with concurrent access

## Production Checklist

Before deploying a dataset, answer these questions:

| Question | Answer | Action if "No" |
|---|---|---|
| Is the dataset repackaged (tar, HDF5, or WebDataset)? | Yes / No | Repackage immediately; small files are non-negotiable blocker |
| Have you measured file-open rate per second? | Yes: _____ opens/sec | Run `strace -e openat -c python train.py` to measure. Should be under 50K total. |
| Does batch assembly latency &lt; 2 × GPU compute time? | Yes / No | If loader latency > GPU time, GPU is idle. Add more workers or prefetch. |
| Is prefetch queue depth monitored? | Yes: _____ items | Should be 5–20 batches ahead. If 0, loader is starved. If >50, memory overhead. |
| Have you tested with cold cache? | Yes: _____ ms / batch | Warm cache is 2–3x faster. Epoch 1 should use warmed cache from epoch 0. |

## Troubleshooting Table

| Symptom | Measurement | Diagnosis | Action |
|---|---|---|---|
| Throughput is 150 MB/s (expected 2 GB/s) | Measure opens/sec: 80K/sec (over capacity) | Metadata server saturated by millions of small opens | Repackage dataset into larger shards (tar, WebDataset, HDF5). Reduce opens from 1.2M to under 1K. |
| GPU utilization is 40% (expected 90%) | Measure batch latency: 500ms vs GPU time: 100ms | Loader cannot keep GPU fed | Add more prefetch workers; increase batch size; move decode offline. |
| Dataset works on small 100-file test, but stalls on full 1M-file dataset | Profiling shows CPU decode saturated on full dataset | CPU preprocessing is the bottleneck, not I/O | Move decoding/augmentation to offline step. Or increase worker count and use fast codecs (JPEG turbo). |
| Some GPUs get batches fast (10ms), others slow (500ms) | Network latency from different clients | Network or storage locality differs between GPUs | Pin data loader to GPU's NUMA node. Verify NIC affinity. Use storage access patterns that favor local reads. |

---

## Interview-Ready Answers

**Q: Your ImageNet training stalls for 30 seconds per batch on a 256-GPU cluster, but storage has 40% unused bandwidth and GPUs average 30% utilization. Where is the bottleneck?**

A: "It's metadata operations on small files. ImageNet is 1.2 million 100 KB images. At 256 GPUs opening files in parallel, you're hitting the metadata server with 100K+ opens per second — far above its 50K capacity. The fix is non-negotiable: repackage the dataset. Convert 1.2M images into 1200 tar files of 1000 images each. Now opens drop from 1.2M to 1200, and per-batch latency drops from 30 seconds to 20 milliseconds. GPU utilization jumps to 85%+. This is a 1000x gain, all from dataset repackaging."

**Q: You're training on HDF5 and seeing 80% GPU utilization. Would switching to WebDataset improve throughput?**

A: "Probably not significantly. HDF5 with random access and memory-mapping is fine if achieving 80% GPU utilization. WebDataset is better for distributed training (easier sharding across workers) and for very large datasets (streaming from remote storage). But if HDF5 is already feeding the GPU at 80%, the bottleneck is elsewhere — maybe compute-bound, not I/O-bound. I'd measure: is GPU waiting for data, or is data arriving and GPU is just not compute-intensive enough? If GPU is waiting (batch-queue depth often 0), then WebDataset might help. If GPU is compute-bound (queue depth always >5), it won't."

---

## Practice

1. **Measure your loader:** Instrument `num_workers`, batch size, and prefetch queue depth. Run for 10 batches and report: min/max/avg batch latency, GPU utilization, prefetch queue stats.

2. **Create a tar version:** Package 1000 samples from your dataset into a tar file and create a tar-based loader. Compare batch latency to your original small-file loader.

3. **Calculate the metadata cost:** Measure file-open rate per second. Multiply by 19 ms/file (typical open latency). That's your overhead. If it's >100 ms per batch, repackaging is worth it.
