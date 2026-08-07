---
title: Lab 02 — Benchmark Local NVMe and Shared Storage
description: Compare local and shared storage using controlled sequential, random, and metadata workloads.
sidebar_position: 21
tags: [lab, nvme, benchmarking]
---

# Lab 02 — Benchmark Local NVMe and Shared Storage

**Objective:** Measure I/O performance of local NVMe and shared storage under AI-realistic workloads (model load, batch streaming, checkpoint writes, metadata-heavy dataset access). Baseline these to predict training performance.

**Time:** 60 minutes

**Prerequisites:** Lab 01 baseline completed; 20 GB free space on each storage path; no active training jobs.

## Workload Profiles We'll Test

Each workload mimics a real training access pattern:

| Workload | Pattern | File size | Block size | Concurrency | Use case |
|---|---|---|---|---|---|
| **Model Load** | Sequential read, once per epoch | 100 GB | 1 MB | 1 | Loading model weights at epoch start |
| **Batch Stream** | Sequential read, random samples | 1 MB | 64 KB | 8 | Data loader fetching per-batch data |
| **Metadata Storm** | Many small files, stat+open+close | 100 KB each | 4 KB | 16 | Epoch start with millions of files |
| **Checkpoint Write** | Concurrent writes, burst | 500 MB per rank | 4 MB | 8 | All ranks writing simultaneously |

## Lab Steps

### Step 1: Local NVMe Baseline

```bash
#!/bin/bash
# Benchmark local NVMe (model load pattern)

NVME_PATH="/local-nvme"
OUTPUT_FILE="nvme-baseline-$(date +%Y%m%d-%H%M%S).txt"

echo "=== LOCAL NVME BASELINE ===" | tee $OUTPUT_FILE
echo "Path: $NVME_PATH" >> $OUTPUT_FILE
df -h $NVME_PATH >> $OUTPUT_FILE

# Workload 1: Large sequential read (model load pattern)
echo -e "\n=== WORKLOAD 1: Model Load (10 GB sequential read) ===" >> $OUTPUT_FILE
dd if=/dev/zero bs=1M count=10000 of=$NVME_PATH/model-test.bin oflag=direct 2>/dev/null
echo "Write time (cache warm):" >> $OUTPUT_FILE
time dd if=$NVME_PATH/model-test.bin bs=1M count=10000 of=/dev/null iflag=direct 2>> $OUTPUT_FILE

# Workload 2: Batch streaming (64 KB blocks, 8 parallel readers)
echo -e "\n=== WORKLOAD 2: Batch Streaming (64 KB blocks, 8 parallel) ===" >> $OUTPUT_FILE
fio --name=batch-stream --ioengine=libaio --rw=read --bs=64k --size=1G \
    --direct=1 --iodepth=16 --numjobs=8 \
    --filename=$NVME_PATH/batch-test.bin --output-format=normal >> $OUTPUT_FILE

# Workload 3: Random read (model weight access pattern)
echo -e "\n=== WORKLOAD 3: Random Read (4 MB blocks) ===" >> $OUTPUT_FILE
fio --name=random-read --ioengine=libaio --rw=randread --bs=4M --size=10G \
    --direct=1 --iodepth=32 --numjobs=1 \
    --filename=$NVME_PATH/random-test.bin >> $OUTPUT_FILE

# Workload 4: Write performance (checkpoint pattern)
echo -e "\n=== WORKLOAD 4: Checkpoint Burst (500 MB sequential write) ===" >> $OUTPUT_FILE
fio --name=checkpoint-write --ioengine=libaio --rw=write --bs=4M --size=500M \
    --direct=1 --iodepth=16 --numjobs=1 \
    --filename=$NVME_PATH/checkpoint-test.bin >> $OUTPUT_FILE

# Cleanup
rm -f $NVME_PATH/{model,batch,random,checkpoint}-test.bin

echo "✓ Local NVMe benchmark complete: $OUTPUT_FILE"
```

**Expected results (typical NVMe):**
```
Model Load (sequential read):       3.5 GB/s
Batch Stream (64 KB, 8 parallel):   2.8 GB/s
Random Read (4 MB):                 1.2 GB/s
Checkpoint Write (sequential):      2.1 GB/s
```

### Step 2: Shared Storage Baseline

```bash
#!/bin/bash
# Benchmark shared storage (Lustre, BeeGFS, NFS)

STORAGE_PATH="/lustre"  # Change to /beegfs or NFS mount as needed
OUTPUT_FILE="shared-storage-baseline-$(date +%Y%m%d-%H%M%S).txt"

echo "=== SHARED STORAGE BASELINE ===" | tee $OUTPUT_FILE
echo "Path: $STORAGE_PATH" >> $OUTPUT_FILE
df -h $STORAGE_PATH >> $OUTPUT_FILE

# Pre-test: warm up storage (fill some cache)
echo -e "\n=== WARMUP ===" >> $OUTPUT_FILE
dd if=/dev/zero bs=1M count=1000 of=$STORAGE_PATH/warmup.bin oflag=direct 2>/dev/null

# Workload 1: Model load (same as NVMe)
echo -e "\n=== WORKLOAD 1: Model Load (10 GB sequential read) ===" >> $OUTPUT_FILE
dd if=/dev/zero bs=1M count=10000 of=$STORAGE_PATH/model-test.bin oflag=direct 2>/dev/null
echo "Read time:" >> $OUTPUT_FILE
time dd if=$STORAGE_PATH/model-test.bin bs=1M count=10000 of=/dev/null iflag=direct 2>> $OUTPUT_FILE

# Workload 2: Concurrent readers (simulate multiple GPUs)
echo -e "\n=== WORKLOAD 2: Concurrent Reads (8 clients, 1 GB each) ===" >> $OUTPUT_FILE
# Create test files
for i in {1..8}; do
    dd if=/dev/zero bs=1M count=1000 of=$STORAGE_PATH/concurrent-$i.bin oflag=direct 2>/dev/null &
done
wait
echo "Reading concurrently:" >> $OUTPUT_FILE
for i in {1..8}; do
    time dd if=$STORAGE_PATH/concurrent-$i.bin bs=1M count=1000 of=/dev/null iflag=direct 2>&1 &
done
wait
# (Measure aggregated throughput from each process's time output)

# Workload 3: Metadata storm (millions of small opens)
echo -e "\n=== WORKLOAD 3: Metadata Rate (1M small files) ===" >> $OUTPUT_FILE
mkdir -p $STORAGE_PATH/metadata-test
echo "Creating 10,000 small files:" >> $OUTPUT_FILE
time for i in {1..10000}; do
    echo "test" > $STORAGE_PATH/metadata-test/file-$i.txt
done 2>> $OUTPUT_FILE

echo "Opening all files (metadata ops):" >> $OUTPUT_FILE
time for f in $STORAGE_PATH/metadata-test/file-*.txt; do
    stat $f > /dev/null
done 2>> $OUTPUT_FILE

# Cleanup
echo "Cleaning up test files..." >> $OUTPUT_FILE
rm -rf $STORAGE_PATH/{model,concurrent,warmup}*
rm -rf $STORAGE_PATH/metadata-test

echo "✓ Shared storage benchmark complete: $OUTPUT_FILE"
```

**Expected results (typical Lustre or BeeGFS):**
```
Model Load (sequential read):   1.5–3.0 GB/s (depends on OST count/link)
Concurrent Reads (8×):          aggregate 3–5 GB/s
Metadata Rate (creates/stat):   1K–5K ops/sec (depends on MDS load)
```

### Step 3: Compare and Interpret Results

```bash
#!/bin/bash
# Compare NVMe vs shared storage

echo "=== COMPARISON: NVMe vs Shared Storage ===" | tee comparison.txt

# Extract throughput from each test
NVME_MODEL=$(grep -A 2 "Model Load" nvme-baseline-*.txt | grep "copied" | awk '{print $8}')
STORAGE_MODEL=$(grep -A 2 "Model Load" shared-storage-baseline-*.txt | grep "copied" | awk '{print $8}')

echo "Model Load Performance:" >> comparison.txt
echo "  NVMe:   $NVME_MODEL" >> comparison.txt
echo "  Shared: $STORAGE_MODEL" >> comparison.txt
echo "  Ratio (NVMe/Shared): $(echo "scale=1; $NVME_MODEL / $STORAGE_MODEL" | bc)x" >> comparison.txt

# Interpretation
echo -e "\n=== INTERPRETATION ===" >> comparison.txt

if [ $(echo "$NVME_MODEL > $STORAGE_MODEL * 2" | bc) -eq 1 ]; then
    echo "NVMe is >2x faster. Consider using NVMe for caching." >> comparison.txt
else
    echo "NVMe and shared storage have similar performance. Caching may not help much." >> comparison.txt
fi

echo -e "\nIf NVMe throughput is high (>2 GB/s):  Use for model cache and checkpoint staging" >> comparison.txt
echo "If NVMe throughput is low (<500 MB/s): Check NUMA affinity, driver config" >> comparison.txt
echo "If shared storage throughput is low:    Check metadata rate, striping, network" >> comparison.txt

cat comparison.txt
```

### Step 4: Validate Under Realistic Load

```bash
#!/bin/bash
# Simulate actual training I/O pattern

echo "=== SIMULATED TRAINING WORKLOAD ===" | tee training-sim.txt

# Simulate: load 100 MB model, then fetch 1000 batches of 1 MB each
STORAGE_PATH="/lustre"  # or your storage path

echo "Simulating: epoch with model load + batch streaming" >> training-sim.txt
echo "- Model load: 100 MB" >> training-sim.txt
echo "- Batches: 1000 × 1 MB each = 1 GB" >> training-sim.txt
echo "- Total I/O: 1.1 GB" >> training-sim.txt

time {
    # Load model
    dd if=$STORAGE_PATH/model-test.bin bs=100M count=1 of=/dev/null iflag=direct 2>/dev/null
    
    # Fetch batches (simulate with random reads)
    fio --name=batch-fetch --ioengine=libaio --rw=read --bs=1M --size=1G \
        --direct=1 --iodepth=4 --numjobs=1 \
        --filename=$STORAGE_PATH/batch-test.bin --output-format=terse 2>/dev/null
} 2>> training-sim.txt

echo "✓ Training simulation complete: training-sim.txt"
```

## Deliverables

After completing this lab, you should have:

1. **NVMe performance baseline:** Sequential read, batch stream, checkpoint write speeds
2. **Shared storage performance baseline:** Model load, concurrent read, metadata rate
3. **Comparison:** NVMe vs shared storage performance ratio
4. **Recommendations:** Which operations should use NVMe vs shared storage

## Interpretation Guide

```
If NVMe is 10x faster than shared storage:
→ Checkpoint staging to NVMe saves (checkpoint_time × 9/10)
→ Model caching saves model_load_time × 0.9

If metadata rate is <10K ops/sec:
→ Dataset repackaging from 1M files to 10K shards is essential
→ Without repackaging, training stalls on metadata

If concurrent throughput doesn't scale with client count:
→ Network is the bottleneck
→ Add more bandwidth or use local cache to avoid network saturation
```

## Cleanup

```bash
# Remove all test files
rm -f /lustre/model-test.bin /lustre/batch-test.bin /lustre/random-test.bin
rm -f /lustre/checkpoint-test.bin /lustre/warmup.bin /lustre/concurrent-*.bin
rm -rf /lustre/metadata-test/

rm -f /local-nvme/model-test.bin /local-nvme/batch-test.bin /local-nvme/random-test.bin
rm -f /local-nvme/checkpoint-test.bin

# Verify cleanup
df -h /lustre /local-nvme

# Archive results
mkdir -p ~/storage-benchmarks
mv *-baseline-*.txt ~/storage-benchmarks/
mv comparison.txt training-sim.txt ~/storage-benchmarks/
```
