---
title: Chapter 11 — Production Troubleshooting
description: Diagnose low GPU feed rate, checkpoint stalls, metadata storms, client imbalance, and path failures.
sidebar_position: 12
tags: [troubleshooting, ai-storage, observability]
---

# Production Troubleshooting

When training stalls, the root cause is in one of eight layers. This chapter teaches you to isolate it systematically, using evidence instead of guessing. The order matters: start with the application and work backward to storage.

| Chapter metadata | Value |
|---|---|
| Volume | 15 — AI Storage, Checkpointing, and Data Pipelines |
| Difficulty | Advanced |
| Estimated reading time | 50 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | When training stalls unexpectedly, how do you isolate the cause in under 30 minutes instead of hours? |

## The Troubleshooting Decision Tree

```mermaid
flowchart TD
    Start["Training suddenly slow<br/>Job took 45 min, now takes 2 hours"]
    
    Q1{Check: Is GPU<br/>utilization <70%?}
    
    Q1 -->|No, GPU busy| Compute["GPU is compute-bound<br/>This is NOT a storage issue<br/>Profile the model, not the storage"]
    
    Q1 -->|Yes, GPU idle| Q2{Check: Is batch queue<br/>empty most of the time?<br/>Instrument: <br/>prefetch.queue.qsize()}
    
    Q2 -->|No, queue full| CPU["CPU preprocessing is slow<br/>Check: perf record, profile decode/augmentation<br/>Layer: Data Loader CPU"]
    
    Q2 -->|Yes, queue empty| Q3{Check: Is client<br/>I/O throughput <br/>50% of peak link speed?<br/>Baseline: iperf3 to storage}
    
    Q3 -->|No, throughput OK| Meta["Metadata rate is high<br/>Likely: millions of small opens<br/>Check: lctl get_param llite.*.stats<br/>Layer: Filesystem Metadata"]
    
    Q3 -->|Yes, throughput low| Q4{Check: Network<br/>retransmits <br/>and drops?<br/>ip -s link}
    
    Q4 -->|Yes| Network["Network congestion or errors<br/>Check: switch logs, NIC firmware<br/>Layer: Network Fabric"]
    
    Q4 -->|No| Q5{Check: Storage<br/>target fill level<br/>and health?<br/>lfs df -h, smartctl}
    
    Q5 -->|Imbalanced| StorageBalance["Target imbalance<br/>Some targets full, others empty<br/>Layer: Storage Targets"]
    
    Q5 -->|Healthy| Q6{Check: Local NVMe<br/>cache is full?<br/>df /local-nvme}
    
    Q6 -->|Yes| LocalFull["Local cache eviction<br/>Performance dropping as cache fills<br/>Layer: Local Cache"]
    
    Q6 -->|No| PCIe["PCIe or CPU memory bottleneck<br/>Check: GPU memory bandwidth<br/>Layer: PCIe/Memory"]
```

## Evidence Gathering: The 5-Minute Baseline

When a job starts, immediately capture baseline measurements:

```bash
#!/bin/bash
# Run this on a training node; save output to a file for later comparison

echo "=== BASELINE CAPTURE ===" > baseline.txt
date >> baseline.txt

echo "=== GPU Utilization ===" >> baseline.txt
nvidia-smi dmon -s puctem -c 5 >> baseline.txt  # 5 iterations

echo "=== Storage Network ===" >> baseline.txt
ethtool -S eth0 >> baseline.txt  # NIC stats before training
ethtool -c eth0 >> baseline.txt  # Ring buffer / queue settings

echo "=== Filesystem Health ===" >> baseline.txt
lfs df -h >> baseline.txt  # Lustre fill level
df -h | grep lustre >> baseline.txt  # Local view of mount

echo "=== Metadata Baseline ===" >> baseline.txt
lctl get_param llite.*.stats | grep -E 'open|close|getattr' >> baseline.txt

echo "=== Network Throughput ===" >> baseline.txt
iperf3 -c storage-server -t 10 >> baseline.txt  # Direct link speed

echo "=== CPU Cache ===" >> baseline.txt
cat /proc/meminfo | grep -E 'Cached|Buffers' >> baseline.txt

echo "Baseline captured at $(date)"
```

Run this every training run, before loading data. This becomes your "healthy" reference.

## Real Incident: Diagnosis in Practice

**Incident: Job that normally takes 2 hours now takes 8 hours**

### Step 1: Capture Current State

```bash
# Run the evidence script
./capture_baseline.sh > current.txt

# Compare to previous healthy run
diff healthy.txt current.txt | head -50
```

**Output:**
```
< GPU0    dmon -s puctem shows: sm=92%, mem=40%
> GPU0    dmon -s puctem shows: sm=15%, mem=5%     ← GPU idle!

< LFS df shows: OST 0–7 at 50% full
> LFS df shows: OST 5–7 at 98% full, OST 0–4 at 30%  ← Imbalanced!

< ethtool -S eth0: rx_errors=0, rx_dropped=0
> ethtool -S eth0: rx_errors=1240, rx_dropped=856  ← Network errors!
```

### Step 2: Start with GPU Utilization

GPU is at 15%, should be 92%. This is the starting point.

```bash
# Check: is the batch queue empty?
# (Insert instrumentation into training loop)
while training:
    queue_depth = prefetch_queue.qsize()
    print(f"Queue depth: {queue_depth}")
    if queue_depth == 0:
        print("LOADER STALLING GPU")
    
    # ... train batch ...
```

**Finding:** Queue is empty 80% of the time. GPU is waiting for data.

### Step 3: Is the Loader CPU-Bound?

```bash
# Profile the data loader during training
python -m cProfile -s cumtime train.py 2>&1 | head -30
```

**Output:**
```
   ncalls  tottime  cumtime  filename:lineno(function)
   120000   0.5     45.2    Image.open  ← Image decode
   120000   0.2     12.1    augmentation.apply
```

**Finding:** Decode + augmentation takes 57 seconds per 1000 images. That's slow.

But wait: decoder can't be the issue because GPU is completely idle (15% utilization), not just under-saturated. If decode was slow, queue would have some backlog; it doesn't. This means **the batch is not even being fetched yet**.

### Step 4: Check Network and Metadata

```bash
# Monitor opens per second during training start
lctl get_param llite.*.stats 2>/dev/null | grep "open:" &
# [ Sample from the lctl output: 950,000 opens, 45ms avg latency ]

# Check network errors
watch -n 1 'ethtool -S eth0 | grep -E "rx_errors|rx_dropped"'
```

**Finding:**
- Metadata: 950,000 opens in 1 minute = 15.8K opens/sec (over capacity of 50K, but not saturating)
- Network: 1240 retransmits and 856 dropped packets in 10 seconds

**Conclusion:** Network is dropping packets, causing RTO (retransmit timeouts) and metadata operations to stall.

### Step 5: Investigate the Network

```bash
# Check NIC ring buffer settings
ethtool -g eth0
# Output: RX ring size: 256

# Ring buffer is too small; packets are being dropped on burst
# Increase ring buffer
ethtool -G eth0 rx 4096 tx 4096

# Check switch counters
# (Connect to the switch, run: show counters)
# → Find the port connected to this node, check for oversubscription or errors

# Check for congestion
iperf3 -c storage -R -t 10  # Reverse: storage to client
# → If throughput drops, network or switch is congested
```

**Finding:** Ring buffer was 256; typical is 4096. Increasing it reduced drops from 856 to less than 5 per second. But network retransmits persist at 300/sec.

This suggests switch-level congestion or oversubscription.

### Step 6: Rebalance or Update Configuration

```bash
# Temporarily reduce the number of concurrent training jobs
# from 5 to 3 to reduce network load

# Re-run benchmark with 3 jobs instead of 5
# → Network retransmits drop to 0, metadata latency drops from 45ms to 2ms
# → GPU utilization jumps from 15% to 88%
```

**Root cause:** Switch was oversubscribed. With 5 training jobs × 128 GPUs each, the network congestion was severe. Reducing to 3 concurrent jobs resolved the issue.

## Troubleshooting Tables: Symptoms to Diagnosis

### Table 1: GPU Idle (Waiting for Data)

| Symptom | Check | Evidence | Diagnosis | Action |
|---|---|---|---|---|
| GPU util &lt; 30%, queue depth always 0 | Baseline loader throughput | `iperf3`: should be 80%+ of link speed. If 10%, network or storage is slow. | Network or storage bottleneck | Capture network stats. Check target fill, metadata rate, network errors. Isolate which layer. |
| GPU util &lt; 30%, queue depth 1–2 (not zero) | Batch assembly latency | `time dd if=/storage/file of=/dev/null` should complete in under 100ms. If 500ms, I/O is slow. | Storage or I/O bottleneck | Run fio benchmark. Compare to baseline. Identify which layer (metadata, network, storage). |
| Intermittent stalls (GPU idle for 5–10s, then busy for 20s) | Batch latency variance | `print(time.time() - batch_start)` for each batch. If p99 >> p50, I/O is inconsistent. | Bursty workload or straggler | Synchronize GPU and I/O clocks. Check for scheduler interference or other jobs. |

### Table 2: Slow Metadata

| Symptom | Check | Evidence | Diagnosis | Action |
|---|---|---|---|---|
| Epoch start takes 2 min, epoch 2 takes 30 sec | Measure metadata ops | `lctl get_param llite.*.stats \| grep open`: should be under 50K ops/sec. If >100K, MDS is saturated. | Metadata server overloaded | Repackage dataset into larger files (tar, HDF5, WebDataset). Reduce opens 100x. |
| Open latency is 50ms (baseline was 2ms) | Check MDS CPU and thread count | `top -H` on MDS: if all threads at 100%, MDS needs more threads. | MDS thread starvation | Increase MDS thread count: `lctl set_param -P mdt.*.service_watchdog=0` and `mdt.*.num_service_threads=...`. |
| Files are split across many targets (stripe_count too high) | `lfs getstripe &lt;file&gt;`: check stripe_count | If stripe_count=32 for small files, metadata overhead is high. | Excessive striping | Reduce stripe_count for small files. Use default (1–4). High stripe only for large checkpoints. |

### Table 3: Slow Storage

| Symptom | Check | Evidence | Diagnosis | Action |
|---|---|---|---|---|
| All targets busy, throughput still low | Check target fill level | `lfs df -h`: OST 0 at 95%, others at 40%. Files landing on full OST are slow. | Target imbalance | Rebalance: migrate files from full OST to empty ones. Or use new files on empty OSTs going forward. |
| Network link shows high util (90%+) but throughput is only 50% of link speed | Check NIC ring buffer | `ethtool -g eth0`: RX ring 256, TX ring 256. Typical is 4096. | Ring buffer too small, packets dropped | Increase: `ethtool -G eth0 rx 4096 tx 4096`. Check network switch for oversubscription. |
| One client is slow (500 MB/s), others fast (1.5 GB/s) | Compare network paths | Run `iperf3` from slow client to storage. If 500 MB/s, client's network is slow. | Client network issue | Check: is client on different subnet? Is NIC configured for jumbo frames (MTU 9000)? Verify switch port speed. |

### Table 4: High CPU Load During I/O

| Symptom | Check | Evidence | Diagnosis | Action |
|---|---|---|---|---|
| CPU 100%, GPU 30%, decoder/augmentation in perf stack | Measure CPU samples in augmentation | `perf record -g python train.py 2>&1 \| perf report`: if augmentation >30%, CPU decode is bottleneck. | Image decode or augmentation is slow | Move decode offline: convert images to better format (e.g., JPEG → PNG → H5). Or use fast codecs (libjpeg-turbo). Or reduce augmentation intensity. |
| memcpy in CPU stack (high CPU, low GPU util) | Run `perf record`, look for `__memcpy_avx2` | If memcpy is >20% of samples, CPU is copying data to GPU. | CPU-to-GPU copy overhead (no GDS, or fallback active) | Check: is GDS working? If not, reduce batch size or use pinned memory. Instrument `torch.cuda.Event()` to measure copy time. |

## Interview-Ready Answers

**Q: Your training suddenly slows from 2 hours to 8 hours. You have 5 minutes to diagnose. What do you check first?**

A: "First: GPU utilization. `nvidia-smi dmon`. If GPU is under 70% busy, it's I/O-bound; if >90% busy, it's compute-bound. For I/O-bound, I check batch queue depth: is the prefetch queue empty? If yes, the loader can't keep up. If no, but GPU is idle, the batch is not reaching the GPU fast enough (maybe GPU memory pressure or PCIe saturation). Next, I check network health: `ethtool -S eth0 | grep errors`. If error rate is non-zero, the network is dropping packets. That's my root cause. Fix: increase NIC ring buffer or reduce concurrent jobs to unload the network. Takes 2 minutes to diagnose, fixes the issue."

**Q: Metadata latency jumped from 2ms to 45ms between runs. Everything else looks the same. What changed?**

A: "Two likely causes: (1) the dataset changed (more or different files), or (2) the MDS is busier (more concurrent jobs). I'd run: `lctl get_param llite.*.stats | grep open` on both runs and compare open/sec. If open rate is the same but latency is higher, the MDS is busier with other work. If open rate is higher, the dataset changed — more files, more opens per batch. If open rate is much higher (100K+ ops/sec), I'd recommend repackaging into larger files (tar, WebDataset) to reduce metadata pressure. The fix: instrument your training loop to log opens per second and per epoch, then set up alerts if it exceeds baseline."

---

## Practice

1. **Create a healthy baseline:** Run your training job when you know it's performing well. Capture the evidence script output. Store it as your reference.

2. **Simulate a failure:** Intentionally fill one storage target to 95%. Re-run training. Measure the slowdown. Compare to baseline. This trains you to recognize fill-level issues.

3. **Diagnose a real incident:** Pick a slow training run from your logs. Walk through the decision tree (GPU util → queue depth → metadata → network → storage) and identify the root cause. Document it.
