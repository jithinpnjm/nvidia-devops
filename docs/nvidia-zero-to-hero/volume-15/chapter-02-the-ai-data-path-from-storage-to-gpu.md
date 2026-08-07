---
title: Chapter 02 — The AI Data Path from Storage to GPU
description: Trace data through media, filesystem, network, client cache, CPU memory, and GPU memory.
sidebar_position: 3
tags: [data-path, storage, gpu-memory]
---

# The AI Data Path from Storage to GPU

Data may cross storage media, storage servers, switches, NICs, the kernel, page cache, CPU memory, PCIe, and GPU memory before a kernel can use it. Each crossing is a potential bottleneck and a place where copies, synchronization, or serialization can degrade throughput.

| Chapter metadata | Value |
|---|---|
| Volume | 15 — AI Storage, Checkpointing, and Data Pipelines |
| Difficulty | Intermediate |
| Estimated reading time | 45 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | Where in the data path does latency hide, and how do you measure each layer independently? |

## The Complete Data Path and Where Latency Hides

```mermaid
flowchart TD
    Media["1. Storage Media<br/>(SSD/HDD/NVMe)<br/>Latency: 10μs–10ms<br/>Capacity: measured in TB"]
    Server["2. Storage Server CPU<br/>and I/O Controller<br/>Latency: 100μs<br/>Capacity: controller queue depth"]
    Fabric["3. Storage Network<br/>(Ethernet, NVMe-oF, IB)<br/>Latency: 10–100μs per hop<br/>Capacity: link bandwidth"]
    ClientFS["4. Client Filesystem<br/>Driver/Cache<br/>Latency: 50–500μs (local), 500μs–5ms (remote)<br/>Capacity: client-side buffer cache"]
    PageCache["5. Page Cache<br/>(kernel buffer)<br/>Latency: 1–10μs (hit), 1–10ms (refill)<br/>Capacity: dynamically sized, reclaimable"]
    CPUMem["6. CPU Memory<br/>(DDR4/5 DRAM)<br/>Latency: 50–100ns<br/>Capacity: bounded by NUMA domain"]
    PCIe["7. PCIe Transfer<br/>(CPU → GPU)<br/>Latency: 1–10μs<br/>Capacity: PCIe gen4 × 16: 32 GB/s, gen5: 64 GB/s"]
    GPU["8. GPU Memory<br/>(HBM3)<br/>Latency: 1–10ns<br/>Capacity: 40–141 GB per GPU"]

    Media -->|"health check<br/>iostat"| Server
    Server -->|"queue depth check<br/>iotop"| Fabric
    Fabric -->|"link check<br/>ethtool, iperf"| ClientFS
    ClientFS -->|"cache hit rate<br/>vmstat"| PageCache
    PageCache -->|"copy overhead<br/>perf record"| CPUMem
    CPUMem -->|"PCIe saturation<br/>nvidia-smi clocks"| PCIe
    PCIe -->|"GPU memory pressure<br/>nvidia-smi"| GPU

    Media -.->|"If here is slow| Storage Bottleneck
    Server -.->|"If here backs up| Server Bottleneck
    Fabric -.->|"If here congested| Network Bottleneck
    ClientFS -.->|"If here stalls| FS Driver Bottleneck
    PageCache -.->|"If here thrashing| Cache Eviction Bottleneck
    CPUMem -.->|"If here pinned| NUMA/Affinity Bottleneck
    PCIe -.->|"If here saturated| PCIe Bottleneck
    GPU -.->|"If here full| GPU Mem Bottleneck
```

The key insight: **Each layer has both latency and capacity. Latency is per-operation; capacity is aggregate throughput. A layer can have low latency but low capacity, or vice versa.**

## Measuring Each Layer: Tools and Interpretation

### 1. Storage Media Health (nvme0n1, sda, etc.)

```bash
# Check disk performance and errors
smartctl -a /dev/nvme0n1 | grep -E "Media_Errors|Unsafe_Shutdowns|Temperature"
# or for SATA/SAS:
smartctl -a /dev/sda | grep -E "5 Reallocated_Sector_Ct|199 UDMA_CRC_Error_Count"

# Real-time I/O trace to the storage device
iostat -x 1 /dev/nvme0n1 | head -10
```

**Real iostat output:**
```text
Device            r/s     w/s     rMB/s     wMB/s   rrqm/s   wrqm/s  %rrqm  %wrqm r_await w_await svctm  %util
nvme0n1       45230.00 12340.00   890.23   192.11    0.00    5.00   0.00  0.04    1.20    2.50  0.02  100.0
```

**Interpretation:**
- `r/s = 45230` reads per second
- `rMB/s = 890.23` = 890 MB/s read throughput
- `r_await = 1.20ms` = average read latency
- `%util = 100.0` = storage is fully saturated
- **Verdict:** Storage is at capacity. Adding more clients will not increase throughput; it will increase latency for all clients.

### 2. Storage Server Queue and Controller

```bash
# On the storage server, check RPC queue depth
lctl get_param -n osd-*.*.read_cache_hit_ratio
# or directly:
cat /proc/sys/sunrpc/tcp_max_slot_table_entries  # Maximum RPC queue depth

# During I/O, monitor server-side service time
iotop -P -o  # Per-process I/O
```

**Sample output with interpretation:**
```text
Cache hit ratio: 87.2%
Max RPC slots: 256
Current service time: 2.3ms per operation
```

**This means:** 87% of requests are served from the server's cache without touching disk, which is why latency is only 2.3ms. If cache hit ratio drops to 20% during a new workload, latency jumps to 8–10ms and throughput may drop 50% because cache misses require disk I/O.

### 3. Network Fabric and Link Health

```bash
# Check NIC link speed and errors
ethtool -S eth0 | grep -E "rx_packets|rx_bytes|rx_errors|rx_dropped|collisions"
# Modern NIC stats:
cat /proc/net/dev | grep eth0

# Measure end-to-end latency and bandwidth to storage server
iperf3 -c storage-server -t 10 -R  # Reverse: server sends to client
iperf3 -c storage-server -t 10 -u -b 100G -i 1  # UDP, 100 Gbps, 1-sec intervals
```

**Real iperf3 output:**
```text
[ ID] Interval           Transfer     Bandwidth       Retr  Cwnd
[  5]   0.00-1.00   sec  12.4 GBytes   106 Gbps        0   27.4 MBytes
[  5]   1.00-2.00   sec  12.3 GBytes   105 Gbps        1   27.2 MBytes
[  5]   2.00-3.00   sec  12.1 GBytes   104 Gbps        2   26.8 MBytes
...
- - - - - - - - - - - - - - - - - - - - - - - - - -
[ ID] Interval           Transfer     Bandwidth       Retr
[  5]   0.00-10.00  sec   124 GBytes   106 Gbps       12
```

**Interpretation:**
- Measured 106 Gbps on a 200 Gbps capable link (53% utilization) — good
- 12 retransmits in 10 seconds across a LAN is suspicious; investigate switch and NIC firmware
- If retransmits spike to 1000+, the network is congested; reduce concurrent clients or add load balancing

### 4. Client Filesystem and Kernel Page Cache

```bash
# Check filesystem cache hit rate and eviction
vmstat 1 | head -15
# Fields: 'ca' (page cache) column tracks filling/emptying

# For Lustre specifically:
lctl get_param llite.*.read_ahead_stats 2>/dev/null | head -5

# Memory pressure and page cache thrashing
cat /proc/pressure/memory
```

**Real vmstat output during high-concurrency loading:**
```text
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa
 4  2    0   1244M   234M  18342M   0    0  28430  4200 2300 5600 12  8  65 15
```

**Interpretation:**
- `cache = 18342M` = 18 GB page cache (good, file data is being cached)
- `bi = 28430` = 28,430 blocks/sec read from storage (880 MB/s @ 32KB blocks)
- `bo = 4200` = 4,200 blocks/sec written to storage (low, training doesn't write much)
- `wa = 15` = 15% CPU time waiting for I/O (this is the stall; GPU is waiting here)
- **Verdict:** Page cache is warm, but I/O stalls remain. Bottleneck is not cache misses but concurrency or network.

### 5. CPU Memory and NUMA Locality

```bash
# Check NUMA topology and CPU-to-GPU distance
numactl --hardware
# or:
nvidia-smi topo -m  # Shows GPU distance matrix

# Check data-loader thread affinity
ps -eLo pid,lwp,psr,comm | grep -i loader  # psr = processor (NUMA node)

# Pin a workload to a NUMA node:
numactl -N 0 -m 0 python train.py  # Force node 0 memory and node 0 CPU
```

**Real `numactl --hardware` output:**
```text
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7
node 0 size: 256000 MB
node 0 free: 198340 MB
node 1 cpus: 8 9 10 11 12 13 14 15
node 1 size: 256000 MB
node 1 free: 187650 MB
```

**Real `nvidia-smi topo -m` output:**
```text
        GPU0    GPU1    CPU Affinity    NUMA Affinity
GPU0     X      NV2     0-7             N/A
GPU1    NV2      X      8-15            N/A
CPU Affinity:
    GPU0: 0-7      ← GPU0 should use CPU cores 0-7 and NUMA node 0
    GPU1: 8-15     ← GPU1 should use CPU cores 8-15 and NUMA node 1
```

**What this means:** If your data loader runs on CPU cores 8-15 but reads data from NUMA node 0's memory, every memory access is remote (50 ns → 100+ ns per access). Affinity matters: `numactl -N 0 python loader.py` vs. `numactl -N 1 python loader.py` can yield 20–30% throughput difference.

### 6. PCIe and GPU Fabric

```bash
# Check PCIe generation and link width
lspci -vvv | grep -A 5 "NVIDIA\|Tesla"
# Look for "LnkSta: Speed.*Link Width"

# Real-time GPU memory bandwidth and clock
nvidia-smi dmon  # Monitor mode, updates every second
nvidia-smi -i 0 -pm 1  # Persistent mode (prevents power clocks)

# Detailed PCIe utilization
nvidia-smi pcie -q  # One-time snapshot
# or repeated:
watch -n 1 'nvidia-smi pcie -q'
```

**Real `nvidia-smi dmon` output:**
```text
#   gpu  mem   sm  mem  dec  enc  jpg  ofa  mclk  pclk    fb  bar1
    0    40   94   31   0    0    0    0   5001  1410  39000   128
    0    41   94   32   0    0    0    0   5001  1410  39000   128
    0    40   95   31   0    0    0    0   5001  1410  39000   128
```

**Fields:**
- `mem = 40–41` = 40–41% memory copy bandwidth in use
- `sm = 94–95` = 94–95% streaming multiprocessor (core) utilization
- `mclk = 5001` = 5.001 GHz memory clock
- `pclk = 1410` = 1.410 GHz processor clock

**What it means:** GPU memory is barely being used (40%) while cores run at 94%. This suggests the kernel is compute-bound, not memory-bound, which is good — data is available when needed.

### 7. GPU Memory Pressure and Fragmentation

```bash
# Query GPU memory
nvidia-smi -i 0 --query-gpu=memory.used,memory.total,memory.free --format=csv,nounits
# or verbose:
nvidia-smi -i 0 -q | grep -E "Used|Total|Free|GPU Memory"

# Framework-level (PyTorch):
torch.cuda.memory_allocated() / 1e9  # GB
torch.cuda.max_memory_allocated() / 1e9  # Peak GB
torch.cuda.reset_peak_memory_stats()
```

**Real sample:**
```text
$ nvidia-smi -i 0 -q | grep -E "Used|Total|Free|GPU Memory"
GPU Memory Usage
    Used                          : 38450 MiB
    Total                         : 40960 MiB
    Free                          : 2510 MiB
```

**Interpretation:**
- 38450 / 40960 = 93.9% utilized
- Only 2.5 GB free
- Next allocation attempt may fail if it needs contiguous memory
- **Signal:** GPU memory is tight. Check whether model weights + activations + KV cache are sized correctly.

---

## Production Design: Optimizing the Path

### The Critical Question for Each Layer

| Layer | Question to Ask | If Yes, Optimize This |
|---|---|---|
| Storage Media | Is `iostat %util` consistently 100%? | Parallel filesystem striping, hot-data tiering, or upgrade media |
| Storage Server | Is queue depth maxed out (`netstat` shows full TCP windows)? | Server-side write combining, caching, or more OSTs |
| Network Fabric | Does `iperf3` show under 80% of rated link speed? | Check switch buffers, reduce packet loss, upgrade NIC/switch firmware |
| Client Filesystem | Is page cache eviction rate high (`vmstat ca`)? | Cache more aggressively, reduce working set, or add NVMe staging |
| CPU Memory | Are data-loader threads on the wrong NUMA node? | Pin threads and memory to same node using `numactl -N` and affinity |
| PCIe | Is GPU memory copy bandwidth under 50% utilized? | Larger batches, coalesced transfers, or compressed format |
| GPU Memory | Is less than 10% of memory free after loading a batch? | Reduce batch size, model precision (FP8 vs FP32), or split model |

### Real Scenario: Finding and Fixing a Hidden Copy Bottleneck

**Situation:** Training throughput is 45 GB/s, but the model should use 60 GB/s. Logs show GPU at 78% utilization, waiting 22% of the time.

1. **Measure data-loader wait time:**
   ```python
   import time
   start = time.time()
   batch = next(iter(train_loader))
   loader_time = time.time() - start
   print(f"Loader + copy time: {loader_time*1000:.1f}ms per batch")
   ```
   Result: **120ms per batch.** With 30 batches/epoch, that's 3.6 seconds of pure overhead per epoch.

2. **Check GPU memory copy bandwidth:**
   ```bash
   nvidia-smi pcie -q
   # Shows memory copy is running but at 60% utilization instead of 90%
   ```
   This suggests data is arriving in small pieces, not large transfers.

3. **Instrument the data loader:**
   ```python
   # Pseudo-code showing the issue
   for i, batch in enumerate(train_loader):
       if i == 0:
           print(f"First batch tensor shape: {batch[0].shape}")
           print(f"First batch tensor is_pinned: {batch[0].is_pinned()}")
   ```
   **Finding:** Batch is not pinned to GPU-accessible memory. Each `.to('cuda')` call is doing a fresh copy from pageable CPU memory.

4. **Fix:** Use pinned memory in the data loader:
   ```python
   from torch.utils.data import DataLoader, default_collate
   
   def pin_collate(batch):
       batch_dict = default_collate(batch)
       return {k: v.pin_memory() for k, v in batch_dict.items()}
   
   train_loader = DataLoader(..., collate_fn=pin_collate)
   ```
   **Result:** Loader time drops to 30ms, GPU utilization: 94%, throughput: 58 GB/s.

---

## Practice

1. **Baseline your path:** Use Lab 01 to collect iostat, vmstat, and iperf3 snapshots. Store them as a reference.

2. **Identify the slowest layer:** For a small test (1–5 GB file), measure latency at each layer using the commands above. Report which layer has the highest latency (not highest throughput — throughput is influenced by all layers above).

3. **Replicate the scenario:** If training is slow, instrument the data loader to measure wall-clock time per batch. Compare to GPU's ability to consume data. If GPU can consume 200 MB/s but loader delivers 150 MB/s, the loader is the bottleneck, not the GPU or storage.
