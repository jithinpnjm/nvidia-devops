---
title: DGX Storage and Data Paths
description: Understand how operating-system storage, local data drives, network storage, and GPU data paths affect DGX performance and reliability.
sidebar_position: 6
tags:
  - dgx
  - storage
  - data-path
  - gpudirect-storage
---

# DGX Storage and Data Paths

A customer installs a DGX system and validates that all GPUs are healthy. Training performance is still inconsistent. Some jobs start quickly, others wait minutes for data, and checkpoint operations pause the entire workload. The GPUs are not the problem. The data path is.

DGX is an accelerated system, not an isolated collection of GPUs. Data must move from persistent storage through the host and software stack into GPU memory. The slowest stage determines how effectively the system can use its accelerators.

| Chapter field | Value |
|---|---|
| Difficulty | Advanced |
| Estimated reading time | 35–45 minutes |
| Prerequisites | Chapters 01–04 |
| Primary outcome | Design and troubleshoot DGX storage paths from workload evidence |

## Learning Objectives

After completing this chapter, you will be able to:

- separate boot, local scratch, shared dataset, and checkpoint storage roles;
- trace a data path from storage to GPU memory;
- identify CPU, PCIe, network, filesystem, and application bottlenecks;
- explain when local NVMe, shared filesystems, object storage, and GPUDirect Storage are appropriate;
- design observability and failure tests for DGX storage.

## Storage Has Multiple Roles

```mermaid
flowchart LR
    Boot[Boot and OS Storage]
    Local[Local NVMe Scratch]
    Shared[Shared Dataset Storage]
    Checkpoint[Checkpoint Repository]
    App[Training or Inference Process]
    GPU[GPU Memory]
    Idle{"nvidia-smi dmon shows<br/>periodic sm% drops to near-zero"}

    Boot -->|"proof: systemd-analyze shows normal<br/>boot time, no fsck/RAID degraded state"| App
    Local -->|"proof: fio steady-state IOPS/BW<br/>matches device baseline"| App
    Shared -->|"proof: read throughput and metadata<br/>ops/s hold under concurrent load"| App
    App -->|"proof: PCIe traffic counter tracks<br/>batch delivery, no stall gap"| GPU
    App -->|"proof: checkpoint write completes<br/>within budgeted interval"| Checkpoint

    App -.->|"symptom appears here first"| Idle
    Idle -->|"local scratch saturated<br/>→ fio queue depth/latency spikes"| Local
    Idle -->|"shared FS metadata-bound<br/>→ ops/s flat, throughput headroom unused"| Shared
    Idle -->|"checkpoint write blocking<br/>the training loop"| Checkpoint
```

**Figure 5.5.1 — A DGX system uses several storage classes.** Every edge names the counter that proves that class is keeping up; the decision diamond is this chapter's central symptom — a `dmon` trace with periodic idle gaps — routed to the three storage classes most likely to cause it. Combining every role into one filesystem does not just create contention, it also erases exactly the boundary this diagram uses to isolate which class is at fault.

| Storage role | Primary objective | Typical concern |
|---|---|---|
| Boot and OS | Reliable system startup and package state | Capacity, RAID health, recoverability |
| Local scratch | High-throughput temporary data and cache | Persistence, cleanup, node affinity |
| Shared dataset | Concurrent access by many nodes | Aggregate throughput, metadata scale, network path |
| Checkpoint repository | Durable recovery state | Write bursts, consistency, retention, restart time |
| Object storage | Durable datasets and artifacts | Request overhead, staging, caching, credentials |

## The Data Path

A simplified buffered path is:

```text
storage → filesystem → kernel page cache → user process → host memory → PCIe or fabric → GPU memory
```

Depending on the platform and software stack, optimized paths can reduce CPU involvement and avoid unnecessary copies. GPUDirect Storage is one example, but it is not a universal switch. Filesystem, driver, kernel, storage target, topology, and application support must all align.

## Local NVMe

Local NVMe is useful for dataset staging, preprocessing caches, temporary shards, and high-speed scratch. It reduces dependence on the shared network during steady-state execution. Its main architectural limitation is locality: data on one node is not automatically available after rescheduling or node failure.

Use local storage when data can be reconstructed, replicated, or staged automatically. Do not treat scratch storage as the only durable copy of a checkpoint.

## Shared Filesystems

Large training clusters often require a parallel or distributed filesystem capable of feeding many workers. The design must account for both bulk throughput and metadata operations. Millions of small files can overload metadata services even when aggregate bandwidth appears sufficient.

Mitigations include dataset sharding, archive formats, preprocessing pipelines, local caching, and coordinated read patterns.

## Object Storage

Object storage is well suited to durable datasets, model artifacts, and lifecycle management. It may not provide the request latency or access semantics expected by every training framework. Many platforms therefore stage objects into local or shared high-performance storage before execution.

## Checkpoints Are a Recovery System

Checkpoint frequency balances lost work against write overhead. A checkpoint that takes longer than the intended interval creates continuous I/O pressure. A checkpoint that cannot be restored is not a backup.

➕ **Worked example — why checkpoint size is not a rounding error:** a 70-billion-parameter model checkpointed at FP16 weights plus FP32 optimizer state (a common Adam-family setup: roughly 2 bytes/param for weights, and roughly 8 bytes/param for optimizer moments plus an FP32 master copy) works out to approximately 70B × (2 + 12) bytes ≈ 980GB per checkpoint — essentially 1TB, not the ~140GB a weights-only estimate would suggest. At a shared filesystem sustaining 4GB/s aggregate write bandwidth (illustrative figure), writing that single checkpoint takes on the order of 1000GB ÷ 4GB/s ≈ 250 seconds — over four minutes where every rank is typically blocked unless the framework overlaps checkpointing with compute. Checkpointing every 30 minutes at that cost is roughly a 14% write-I/O tax on wall-clock training time before accounting for verification or replication; checkpointing every 5 minutes at the same cost would make the job spend more wall-clock time writing checkpoints than training. This is the arithmetic behind "a checkpoint that takes longer than the intended interval creates continuous I/O pressure" — it is not a hypothetical, it is a direct function of model size, optimizer choice, and measured storage bandwidth.

Production validation must include:

- time to write;
- time to verify;
- time to restore;
- behavior when a node fails mid-write;
- retention and cleanup;
- consistency across distributed ranks.

## Topology Matters

Storage traffic shares PCIe, CPU, NIC, and memory resources with other traffic. A fast storage array can still underperform if the selected NIC is attached to a remote NUMA node or if GPU, NIC, and NVMe placement causes avoidable cross-socket movement.

```mermaid
flowchart TD
    GPU0[GPU]
    Root[PCIe Root Complex]
    CPU[CPU and Memory]
    NIC[Storage NIC]
    NVMe[Local NVMe]
    Remote[Remote Storage]

    GPU0 --> Root
    Root --> CPU
    Root --> NIC --> Remote
    Root --> NVMe
```

**Figure 5.5.2 — Storage performance is topology-dependent.** Device placement and NUMA affinity influence the path even when every component is individually fast.

## Production Design Patterns

### Pattern A — Local staging

A workflow copies a dataset subset to local NVMe before training. Jobs use node affinity, verify the cache, and clean up after completion. Durable data remains in shared or object storage.

### Pattern B — Shared high-performance training filesystem

All nodes read directly from a parallel filesystem. The platform team validates aggregate throughput, metadata behavior, NIC affinity, and failure recovery at the intended node count.

### Pattern C — Hybrid cache

Frequently used data is cached locally, while cold datasets and checkpoints remain remote. The cache is treated as disposable and is populated through automation.

## Observability

| Layer | Signals |
|---|---|
| Application | data-loader wait, samples per second, checkpoint duration |
| Filesystem | read/write throughput, latency, metadata operations, errors |
| Block device | queue depth, utilization, latency, device health |
| Network | throughput, drops, retransmissions, RDMA counters where applicable |
| Host | CPU wait, page cache, NUMA movement, memory pressure |
| GPU | utilization gaps, PCIe traffic, stalled kernels |

## Troubleshooting Scenario

### Problem — GPUs oscillate between busy and idle

**Symptoms**

- periodic drops in GPU utilization;
- data-loader queue becomes empty;
- storage latency spikes;
- CPU I/O wait increases.

**Diagnosis**

Correlate application step time with filesystem latency, local block metrics, network counters, and data-loader behavior. Compare warm-cache and cold-cache runs. Determine whether the bottleneck is bulk bandwidth, metadata, decompression, or request serialization.

➕ **Real paired evidence — GPU trace and storage trace on the same timeline, the correlation this section describes done concretely:**

```text
$ nvidia-smi dmon -s u -c 6
# gpu   sm   mem
    0   94    71
    0   96    73
    0    3     1   ← GPU nearly idle
    0    4     1   ← still idle
    0   95    72   ← recovered
    0   96    74

$ iostat -x 1 6 /dev/nvme1n1 | awk '{print $1,$4,$5,$NF}'
Device  r/s    w/s   %util
nvme1n1 210.0  4.0   96.0
nvme1n1 205.0  3.0   94.0
nvme1n1 2100.0 0.0   99.8   ← queue saturated, tiny reads (metadata-shaped, not bulk)
nvme1n1 1980.0 0.0   99.5
nvme1n1 240.0  2.0   40.0   ← recovered
nvme1n1 230.0  3.0   38.0
```
The GPU idle window lines up exactly with a spike to ~2,000 reads/sec at 99%+ device utilization but roughly flat *bandwidth* — a large jump in request count with `%util` pinned but no corresponding bandwidth jump is the signature of a metadata- or small-file-bound storage stage, not a bulk-throughput shortfall. If this were a bandwidth problem, `%util` would climb alongside MB/s, not alongside IOPS on tiny requests. This distinguishes "buy faster storage" (wrong fix here) from "shard the dataset to reduce small-file/metadata pressure" (the fix this evidence actually supports) — the two look identical from the GPU side (`sm%` drops to near zero either way) and only the storage-side trace tells them apart.

**Root cause**

The input pipeline cannot sustain the GPU consumption rate.

**Resolution**

Stage data locally, increase loader parallelism carefully, change the dataset format, improve metadata capacity, correct NUMA placement, or scale the storage path based on measured demand.

**Prevention**

Include full dataset-path tests in cluster acceptance. Synthetic GPU tests alone do not validate an AI system.

## Customer Scenario

A customer purchases eight DGX systems and connects them to an existing enterprise NAS. The NAS is reliable but was sized for office and analytics workloads. The architect should benchmark the expected aggregate training pattern, including metadata and checkpoint bursts. The likely answer may be a dedicated high-performance tier, local caching, or a parallel filesystem—not simply more NAS capacity.

## Interview Preparation

### Architecture question

**Why can a DGX system with healthy GPUs still deliver poor training performance?**

"Because 'healthy GPUs' only proves the last stage of a long pipeline is working — it says nothing about whether that stage is being fed. I'd trace the whole path out loud: storage device, filesystem, metadata service if it's a shared filesystem, CPU preprocessing and tokenization, NUMA placement of the data-loader process, host-to-device transfer, and only then the GPU. In my experience the most common surprise isn't raw bandwidth, it's metadata — a filesystem that benchmarks fine on large sequential reads can still fall over on a dataset with millions of small files, and that shows up as the exact same 'GPU idle gaps in `dmon`' signature as a bandwidth problem, so you have to actually look at IOPS versus MB/s to tell them apart."

### Scenario question

**When should local NVMe be used for training data?**

"When the data on that node is disposable or reconstructible — staged from a source of truth, cached, shardable and re-fetchable — and the job's scheduling respects that locality, meaning it either pins to the same node or accepts a re-stage cost on reschedule. What I'd push back on is treating local NVMe as the durable copy of anything, especially a checkpoint — if a node fails and that scratch disk was the only copy of four hours of training progress, that's not a storage tier decision, that's a missing backup, and I've seen that exact mistake cost a team a day of compute."

### Troubleshooting question

**What evidence distinguishes a storage bottleneck from a compute bottleneck?**

"I'd put `nvidia-smi dmon` and the storage-side counters — `iostat -x` for local devices, filesystem client stats for a shared mount — on the same timeline and look for correlation, not just correlation in isolation. If GPU utilization drops in a periodic pattern that lines up with spikes in I/O wait or filesystem latency, that's the data pipeline starving the GPU. If GPU utilization stays high but throughput per GPU-second is still low, that's more likely a compute-shape problem — small batches, inefficient kernels — not storage at all. The single most useful discriminator I've found is IOPS versus bandwidth during the stall: a bandwidth-bound stage shows `%util` and MB/s rising together, while a metadata-bound stage shows `%util` pinned with IOPS spiking on tiny reads and bandwidth barely moving — those need completely different fixes."

## Key Takeaways

- DGX storage must be designed by role, not as one undifferentiated capacity pool.
- Local NVMe improves locality but does not replace durable shared storage.
- Shared storage must be validated for aggregate throughput and metadata behavior.
- Checkpoints are part of the recovery architecture.
- Topology and observability are essential to explaining GPU starvation.

## Cross References

- [Inside a DGX System](./chapter-02-inside-a-dgx-system)
- [Power, Cooling, and Rack Readiness](./chapter-04-power-cooling-and-rack-readiness)
- [DGX Networking and Fabric Integration](./chapter-06-dgx-networking-and-fabric-integration)
- [Lab 02 — Validate DGX Data and Network Paths](./labs/lab-02-validate-dgx-data-and-network-paths)
