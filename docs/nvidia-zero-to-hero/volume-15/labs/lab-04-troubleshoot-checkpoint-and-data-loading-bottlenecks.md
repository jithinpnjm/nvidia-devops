---
title: Lab 04 — Troubleshoot Checkpoint and Data-Loading Bottlenecks
description: Separate application serialization, metadata, client, network, target, and GPU symptoms.
sidebar_position: 23
tags: [lab, troubleshooting, checkpointing]
---

# Lab 04 — Troubleshoot Checkpoint and Data-Loading Bottlenecks

**Objective:** Given a slow training job, systematically isolate whether the bottleneck is data loading, checkpoint writing, or something else. Practice the decision tree from Chapter 11.

**Time:** 120 minutes

**Prerequisites:** Labs 01–03 complete; access to a training job (or a small test version); permission to add instrumentation and run diagnostics.

**Expected outcome:** A diagnosis with root cause and a bounded fix to test.

## Setup: Create a Test Workload

If you don't have a slow job to diagnose, create a synthetic one:

```bash
#!/bin/bash
# Create a small test dataset (10K small images = metadata-bound)

mkdir -p ~/test-dataset/images
for i in {1..10000}; do
    # Create random 100 KB "images"
    dd if=/dev/urandom bs=1K count=100 of=~/test-dataset/images/img-$i.bin 2>/dev/null
done

# Create a simple training loop that uses these
cat > ~/test-train.py << 'EOF'
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import os
import time

class SimpleDataset(Dataset):
    def __init__(self, image_dir):
        self.image_dir = image_dir
        self.images = sorted(os.listdir(image_dir))
    
    def __len__(self):
        return len(self.images)
    
    def __getitem__(self, idx):
        img_path = os.path.join(self.image_dir, self.images[idx])
        # Simulate image load + decode
        with open(img_path, 'rb') as f:
            data = f.read()
        return torch.randn(10)  # Dummy output

# Simple model
model = nn.Linear(10, 2).cuda()
optimizer = optim.SGD(model.parameters(), lr=0.01)
loss_fn = nn.MSELoss()

# Data loader
dataset = SimpleDataset('~/test-dataset/images')
loader = DataLoader(dataset, batch_size=256, num_workers=4)

# Training loop with instrumentation
prefetch_queue_sizes = []
for epoch in range(3):
    for batch_idx, batch in enumerate(loader):
        # Train
        output = model(batch.cuda())
        loss = loss_fn(output, torch.randn(256, 2).cuda())
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if batch_idx % 10 == 0:
            print(f"Epoch {epoch}, Batch {batch_idx}: loss={loss:.3f}")
    
    # Checkpoint
    print(f"Checkpointing epoch {epoch}...")
    torch.save(model.state_dict(), f'ckpt-{epoch}.pt')
    print(f"Checkpoint {epoch} saved")

print("Training complete")
EOF

echo "Test dataset and training script created"
```

## Lab Workflow

### Step 1: Instrument the Application

Add timing and queue monitoring to the training script:

```python
# Add to your training loop
import time
import threading
from queue import Queue

# Monitor prefetch queue depth
def log_queue_depth(loader, log_file):
    """Log the prefetch queue depth during training."""
    with open(log_file, 'w') as f:
        while True:
            if hasattr(loader, 'prefetch_queue'):
                depth = loader.prefetch_queue.qsize()
                f.write(f"{time.time():.2f}: queue_depth={depth}\n")
            time.sleep(0.1)

# Start queue monitoring in background
queue_log = open('queue_depth.log', 'w')
monitor_thread = threading.Thread(target=lambda: log_queue_depth(loader, queue_log), daemon=True)
monitor_thread.start()

# Measure batch assembly time
for epoch in range(num_epochs):
    for batch_idx, batch in enumerate(loader):
        batch_ready_time = time.time()
        
        if batch_idx > 0:
            wait_time = batch_ready_time - last_batch_time
            print(f"Batch {batch_idx}: wait={wait_time*1000:.0f}ms")
            
            # Check GPU utilization
            if wait_time > 0.5:  # More than 500ms wait
                print(f"  ⚠ GPU waiting for data: {wait_time*1000:.0f}ms!")
        
        # Train on batch
        gpu_start = time.time()
        # ... forward, backward, step ...
        gpu_time = time.time() - gpu_start
        
        last_batch_time = time.time()
        
        # Checkpoint
        if batch_idx % 100 == 0:
            ckpt_start = time.time()
            torch.save({...}, f'ckpt-{batch_idx}.pt')
            ckpt_time = time.time() - ckpt_start
            print(f"  Checkpoint took {ckpt_time:.1f}s (GPU idle: {ckpt_time > 1})")
```

### Step 2: Capture Baseline Evidence

Run the test job and capture metrics:

```bash
#!/bin/bash
# Collect evidence during training

echo "=== BASELINE TRAINING RUN ===" | tee training-baseline.txt

# Start monitoring in background
{
    while true; do
        echo "=== $(date +%H:%M:%S) ===" >> system-metrics.log
        top -bn1 | head -20 >> system-metrics.log
        nvidia-smi dmon -s puctem -c 1 >> gpu-metrics.log
        if command -v lctl &> /dev/null; then
            lctl get_param llite.*.stats | grep "^  open:" >> metadata-metrics.log
        fi
        sleep 2
    done
} &
MONITOR_PID=$!

# Run training
python ~/test-train.py 2>&1 | tee training.log

# Stop monitoring
kill $MONITOR_PID 2>/dev/null

# Summarize
echo "Training complete. Analyzing..."
```

### Step 3: Diagnose the Bottleneck

```bash
#!/bin/bash
# Analyze collected metrics

echo "=== BOTTLENECK DIAGNOSIS ===" | tee diagnosis.txt

# Check 1: GPU idle time
echo "Check 1: GPU Utilization" >> diagnosis.txt
grep "wait=" training.log | awk -F'wait=' '{sum+=$2; count++} END {print "Avg wait per batch: " sum/count "ms"}' >> diagnosis.txt

# Check 2: Metadata rate
if [ -f metadata-metrics.log ]; then
    echo -e "\nCheck 2: Metadata Operations" >> diagnosis.txt
    tail -1 metadata-metrics.log >> diagnosis.txt
fi

# Check 3: CPU decode overhead
echo -e "\nCheck 3: CPU Decode Time" >> diagnosis.txt
grep "CPU" system-metrics.log | tail -5 >> diagnosis.txt

# Check 4: Checkpoint duration
echo -e "\nCheck 4: Checkpoint Duration" >> diagnosis.txt
grep -i "checkpoint" training.log | grep "took" >> diagnosis.txt

# Decision tree
echo -e "\n=== DECISION ===" >> diagnosis.txt
if grep "wait.*>500" diagnosis.txt > /dev/null; then
    echo "Bottleneck: DATA LOADING" >> diagnosis.txt
    echo "Next: Check metadata rate, file count, CPU decode" >> diagnosis.txt
fi

if grep "Checkpoint took" training.log | awk '{print $NF}' | awk '$1 > 10 {print "YES"}' | grep -q YES; then
    echo "Bottleneck: CHECKPOINT WRITE" >> diagnosis.txt
    echo "Next: Check striping, use async staging" >> diagnosis.txt
fi

cat diagnosis.txt
```

### Step 4: Root-Cause Test

Create a hypothesis and test it:

```bash
#!/bin/bash
# Test hypothesis: metadata is the bottleneck

echo "=== HYPOTHESIS TEST: METADATA ===" | tee hypothesis-test.txt

# Measure open rate during data loading
echo "Current open rate:" >> hypothesis-test.txt
strace -e openat -c python test-train.py 2>&1 | grep openat >> hypothesis-test.txt

# Expected: if >50K opens/sec, metadata is the bottleneck

# Test fix: repackage dataset into tar files
echo -e "\n=== FIX TEST: Repackage into TAR ===" >> hypothesis-test.txt

# Create tar shards (100 images per tar)
cd ~/test-dataset
for shard in {0..99}; do
    tar cf images-$shard.tar $(seq $((shard*100+1)) $((shard*100+100)) | xargs -I{} echo images/img-{}.bin)
done

# Measure new open rate
echo "Open rate after repackaging:" >> hypothesis-test.txt
# (Measure again with instrumented training using tar loader)

cat hypothesis-test.txt
```

### Step 5: Measure the Fix

Run the training again with the fix applied:

```bash
#!/bin/bash
# Re-run training with the fix

echo "=== FIXED TRAINING RUN ===" | tee training-fixed.txt

# (Same monitoring as Step 2, but with the fix applied)
python ~/test-train-fixed.py 2>&1 | tee training-fixed.log

# Compare before and after
echo -e "\n=== BEFORE vs AFTER ===" | tee comparison.txt

BEFORE_AVG=$(grep "wait=" training.log | awk -F'wait=' '{sum+=$2; count++} END {print sum/count}')
AFTER_AVG=$(grep "wait=" training-fixed.log | awk -F'wait=' '{sum+=$2; count++} END {print sum/count}')

echo "Average batch wait time:" >> comparison.txt
echo "  Before: $BEFORE_AVG ms" >> comparison.txt
echo "  After:  $AFTER_AVG ms" >> comparison.txt

IMPROVEMENT=$(echo "scale=1; ($BEFORE_AVG - $AFTER_AVG) * 100 / $BEFORE_AVG" | bc)
echo "  Improvement: $IMPROVEMENT%" >> comparison.txt

cat comparison.txt
```

## Resolution Checklist

After diagnosis, choose ONE fix from this list:

### If Data Loading is the Bottleneck:

- [ ] **Repackage dataset** (tar, WebDataset, HDF5) — reduces opens from 1M to 1K
- [ ] **Increase loader concurrency** (num_workers) — but only if CPU has headroom
- [ ] **Pin loader to NUMA node** — ensures memory affinity
- [ ] **Move augmentation offline** — precompute once, not per-epoch
- [ ] **Add local NVMe cache** — pre-populate with frequent-access data

### If Checkpoint is the Bottleneck:

- [ ] **Increase checkpoint stripe width** (lfs setstripe -c 16) — parallel writes
- [ ] **Use async staging** (write to NVMe, then background flush) — unblock training
- [ ] **Reduce checkpoint frequency** — fewer checkpoints per epoch
- [ ] **Checkpoint only model weights, not optimizer state** — smaller file

### If Network is the Bottleneck:

- [ ] **Increase NIC ring buffer** (ethtool -G eth0 rx 4096) — prevent packet drops
- [ ] **Reduce concurrent jobs** — less network contention
- [ ] **Use multiple storage paths** — load balance across NICs

### If Metadata is the Bottleneck:

- [ ] **Repackage files** (mandatory)
- [ ] **Increase MDS thread count** (if you control storage)
- [ ] **Use deterministic manifests** — avoid directory listing

## Deliverables

After this lab, you should have:

1. **Root-cause diagnosis** (data loading, checkpoint, metadata, network)
2. **Before/after metrics** (queue depth, GPU idle time, checkpoint duration)
3. **One successful fix** tested and measured
4. **Runbook** for diagnosing similar issues in production

## Cleanup

```bash
# Remove test data
rm -rf ~/test-dataset/
rm -f ~/test-train.py ~/test-train-fixed.py
rm -f *.log *.txt ckpt-*.pt training.log

# If using shared storage, also clean there
rm -f /lustre/test-*.bin /lustre/test-*.tar
```
