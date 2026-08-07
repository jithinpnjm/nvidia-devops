---
title: Pinned Memory and Transfer Overlap
description: Understand pageable and page-locked host memory, DMA requirements, transfer staging, and the conditions required to overlap copies with computation.
sidebar_position: 9
tags:
  - cuda
  - pinned-memory
  - dma
  - data-movement
---

# Pinned Memory and Transfer Overlap

## Introduction

A GPU cannot execute useful work until data reaches device memory. For many applications, host-to-device and device-to-host movement is therefore part of the critical path.

Ordinary host allocations are pageable. The operating system may move their physical pages, while a DMA engine needs stable physical mappings for a transfer. CUDA resolves this mismatch by staging or pinning memory. Explicit page-locked, or pinned, host memory gives the runtime a stable source or destination and enables the most predictable asynchronous transfer behavior.

Pinned memory is not simply “faster RAM.” It is a limited operating-system resource with allocation cost, security implications, NUMA placement concerns, and failure modes. Production systems must use it deliberately.

| Chapter field | Value |
|---|---|
| Volume | 03 — CUDA Fundamentals |
| Difficulty | Intermediate |
| Estimated reading time | 50 minutes |
| Primary focus | Host memory type, DMA, transfer efficiency, and overlap |
| Previous | Streams, Events, and Asynchronous Execution |
| Next | Unified Memory and Demand Paging |

## Story

A preprocessing service allocates a fresh host buffer for every request and calls `cudaMemcpyAsync`. Engineers expect transfers to overlap with compute, but the profiler shows long CPU stalls and serialized copies.

The API is asynchronous in name, yet the source memory is pageable. The runtime must stage data through page-locked memory before the device copy can proceed. Frequent allocation also creates allocator pressure.

The team replaces per-request allocation with a bounded pool of pinned buffers, aligns each pool slot with a CUDA stream, and binds preprocessing threads near the GPU's NUMA node. Throughput becomes stable and tail latency improves.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain why DMA engines require stable host-memory mappings.
- Compare pageable, pinned, registered, mapped, and managed memory.
- Describe how pageable-memory staging affects asynchronous copies.
- Design a bounded pinned-memory pool.
- Explain how NUMA locality influences host-to-device transfers.
- Diagnose transfer bottlenecks using timeline and topology evidence.

## Big Picture

```mermaid
flowchart TD
    App["Application calls\ncudaMemcpyAsync(dst, src, bytes, ..., stream)"]
    Check{"Is src page-locked\n(cudaHostAlloc /\ncudaHostRegister)?"}

    subgraph Pageable["Pageable path"]
        direction TB
        StageCopy["Hidden CPU copy:\npageable -> internal pinned\nstaging buffer"]
        Wait["Host effectively blocks\nuntil staging completes —\neven though the API is 'Async'"]
        DMA1["DMA to device from\nstaging buffer"]
        StageCopy --> Wait --> DMA1
    end

    subgraph Pinned["Pinned path"]
        direction TB
        Direct["DMA engine reads directly\nfrom the pinned source —\nno staging hop"]
        Overlap["Host returns immediately;\nnext stream's work can\nproceed concurrently"]
        Direct --> Overlap
    end

    App --> Check
    Check -->|"no"| Pageable
    Check -->|"yes"| Pinned
    Pageable --> Device["Device Memory"]
    Pinned --> Device

    Evidence["Evidence to tell them apart:\nnsys timeline shows a CPU-side\nmemcpy segment before the H2D\ntransfer on the pageable path;\npinned path shows the H2D\ntransfer starting immediately"]
    DMA1 -.-> Evidence
    Overlap -.-> Evidence
```

**Figure 3.8.1 — Pageable versus pinned transfer path as one decision, not two separate diagrams.** The chapter's core claim — that `cudaMemcpyAsync` on pageable memory is asynchronous in name but frequently blocking in practice — is now a branch with a named evidence source (the profiler timeline segment before the real device transfer) rather than two static side-by-side pipelines the reader has to compare themselves.

## Pageable Host Memory

Most allocations returned by general-purpose host allocators are pageable. The operating system can reclaim or remap physical pages while preserving the process's virtual address space.

This flexibility is essential for general system memory management. It conflicts with long-running DMA operations that require stable mappings.

When a CUDA copy originates from pageable memory, the runtime may need to:

1. Obtain or reuse a page-locked staging region.
2. Copy data from the pageable allocation into that region.
3. Submit the DMA transfer from the staging region to the device.
4. Return or recycle the staging region.

The exact implementation is runtime-dependent, but the architectural consequence is stable: hidden host work may reduce overlap and increase variance.

## Pinned Host Memory

Pinned memory is locked into physical memory for the duration of the registration. The operating system cannot page it out in the normal way.

CUDA applications can obtain pinned memory through allocation APIs or register an existing host range where supported.

Conceptual examples:

```cpp
void* buffer = nullptr;
cudaHostAlloc(&buffer, bytes, cudaHostAllocDefault);
```

or:

```cpp
void* buffer = std::malloc(bytes);
cudaHostRegister(buffer, bytes, cudaHostRegisterDefault);
```

Every call must be checked, and every successful allocation or registration must have a defined cleanup path.

## Allocation Versus Registration

| Method | Characteristics | Typical use |
|---|---|---|
| CUDA pinned allocation | Runtime creates page-locked region | Dedicated transfer buffers |
| Host registration | Existing allocation is pinned | Integration with external allocators or frameworks |
| Pageable allocation | Managed by normal OS paging | General CPU data not on critical transfer path |

Registration can fail because of alignment, size, platform policy, container restrictions, or pinned-memory limits. Applications should fail clearly rather than silently assuming registration succeeded.

## Mapped Host Memory and Zero Copy

Some systems allow host memory to be mapped into the device address space. A kernel can access mapped host memory without an explicit copy.

This is sometimes called zero-copy access, but “zero copy” does not mean zero cost. Access may traverse PCIe or another host interconnect for each transaction. Latency and bandwidth are usually different from device-local memory.

Mapped memory can be appropriate when:

- The data set is small.
- Access is infrequent or streaming.
- Avoiding an explicit copy matters more than repeated access cost.
- The platform provides suitable coherency and addressability.

It is usually a poor choice for repeatedly accessed working sets that belong in device memory.

## NUMA Locality

Pinned memory is allocated from host NUMA memory. If the allocating CPU thread runs on a socket far from the GPU's PCIe root complex, the data path may cross an inter-socket link before reaching the GPU.

```mermaid
flowchart LR
    CPU1[CPU Socket 1]
    RAM1[NUMA Memory 1]
    Link[Inter-Socket Link]
    CPU0[CPU Socket 0]
    Root[PCIe Root Complex]
    GPU[GPU]

    CPU1 --> RAM1 --> Link --> CPU0 --> Root --> GPU
```

**Figure 3.8.3 — Remote NUMA transfer.** A pinned allocation can still be poorly placed if its physical pages are remote from the GPU's I/O path.

Production transfer pools should be created by threads with intentional CPU and memory affinity when topology matters.

## Transfer Granularity

Very small copies waste fixed submission overhead. Extremely large copies can monopolize a copy engine and increase latency for other work.

Applications commonly improve efficiency by:

- Batching adjacent values into larger contiguous transfers.
- Reusing buffers rather than allocating per request.
- Avoiding redundant host-device round trips.
- Keeping persistent data on the device.
- Partitioning large transfers into pipeline chunks when overlap is beneficial.

The optimal chunk size must be measured for the workload and platform.

## Copy Directions

CUDA systems commonly move data through several directions:

- Host to device
- Device to host
- Device to device
- Peer device to peer device
- Host memory mapped into device space

Each direction can use different engines and paths. Peer copies may traverse NVLink, PCIe, host bridges, or staged paths depending on topology and peer-access configuration.

## Overlapping Transfer and Compute

A transfer can overlap with compute only when the dependency graph and platform allow it.

```mermaid
sequenceDiagram
    participant S0 as Stream 0
    participant S1 as Stream 1
    participant C as Copy Engine
    participant G as Compute Engine

    S0->>C: H2D Batch A
    C-->>S0: Input ready
    S0->>G: Compute Batch A
    S1->>C: H2D Batch B
    Note over C,G: Transfer B may overlap compute A
```

**Figure 3.8.4 — Copy-compute overlap.** Independent buffers and streams permit the next transfer to proceed while an earlier batch computes.

Required conditions usually include:

- Pinned host memory
- Non-default streams with intended semantics
- Independent buffers
- Asynchronous copy APIs
- Sufficient work duration
- No hidden device-wide synchronization
- Hardware support for concurrent copy and execution

## Bounded Buffer Pools

Pinned memory should normally be pooled.

A production pool defines:

- Number of slots
- Bytes per slot
- NUMA placement
- Ownership state
- Associated stream and event
- Maximum wait time
- Metrics for pool exhaustion
- Cleanup during process shutdown

```mermaid
stateDiagram-v2
    [*] --> Free
    Free --> Filling
    Filling --> Submitted
    Submitted --> InFlight
    InFlight --> Complete
    Complete --> Free
```

**Figure 3.8.5 — Pinned-buffer lifecycle.** A slot must not return to the free pool until its device completion event confirms safe reuse.

Unbounded pinned allocation can reduce memory available to the operating system and destabilize the host.

## Architecture Trade-offs

### Pinned memory versus OS flexibility

Pinned memory improves transfer predictability but reduces the memory manager's ability to reclaim pages. A few reusable buffers are better than many transient allocations.

### Larger pools versus memory pressure

More slots can increase concurrency and absorb bursts. They also consume locked memory and may increase queueing. Size the pool from measured concurrency, not maximum theoretical demand.

### Explicit copy versus mapped access

Explicit copies add a transfer step but move data into device-local memory. Mapped access avoids the copy but may pay remote access cost repeatedly.

## Production Observability

Track:

- Bytes transferred by direction
- Transfer count and average size
- P50, P95, and P99 transfer duration
- Pinned-pool occupancy
- Pool wait time
- Registration failures
- Host memory pressure
- NUMA placement
- Copy-engine utilization
- End-to-end request latency

A bandwidth number without transfer-size distribution can be misleading.

## Production Troubleshooting

### Problem: `cudaMemcpyAsync` blocks the host

**Diagnosis**

- Confirm the source or destination is pinned.
- Check whether the copy direction and API support the intended behavior.
- Inspect for allocation or registration in the hot path.
- Profile the CPU and GPU timelines together.

**Root cause pattern**

The runtime stages pageable memory or performs synchronization required by the operation.

**Evidence — measuring pageable versus pinned side by side:**

```text
$ ./transfer_bench --mode=pageable --bytes=268435456
pageable H2D: 268435456 bytes in 74.318 ms  (3.61 GB/s effective)

$ ./transfer_bench --mode=pinned --bytes=268435456
pinned   H2D: 268435456 bytes in 16.902 ms  (15.88 GB/s effective)
```

A 256 MiB transfer at 3.61 GB/s versus 15.88 GB/s — roughly 4.4x — is the size of gap that pageable staging typically produces relative to a PCIe Gen4 x16 link's practical ceiling (in the 20-25 GB/s range). If a measured "pinned" run still shows numbers close to the pageable row, the most likely explanation is that the allocation didn't actually register as pinned (check the return status of `cudaHostAlloc`/`cudaHostRegister`, not just that the call was made) or the transfer is small enough that fixed per-call overhead dominates either way.

### Problem: Transfer throughput varies by process placement

Inspect CPU affinity, memory policy, GPU NUMA node, and PCIe topology. The same pinned allocation strategy can behave differently when pages are placed on a remote socket.

**Evidence — same pinned strategy, two NUMA placements:**

```text
$ numactl --hardware | head -4
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7
node 1 cpus: 8 9 10 11 12 13 14 15

$ nvidia-smi topo -m | grep GPU0
GPU0	 X 	NODE1	0-7,16-23	0

$ numactl --cpunodebind=1 --membind=1 ./transfer_bench --mode=pinned --bytes=268435456
pinned   H2D: 268435456 bytes in 16.9 ms   (15.9 GB/s)

$ numactl --cpunodebind=0 --membind=0 ./transfer_bench --mode=pinned --bytes=268435456
pinned   H2D: 268435456 bytes in 29.4 ms   (9.1 GB/s)
```

`nvidia-smi topo -m` reports GPU0 as local to NUMA node 1. Binding the allocating thread and its memory to node 0 instead forces the transfer across the inter-socket link before it ever reaches the PCIe root complex — a ~1.75x throughput penalty using the *identical* pinned-memory strategy. This is the mechanism behind this chapter's Customer Scenario: correct pinned memory is not sufficient if the pages themselves are remote from the GPU's I/O path.

### Problem: Host becomes unstable under load

Check total locked memory and whether buffers are leaked. Replace unbounded allocation with a fixed pool and enforce request backpressure.

### Problem: Pinned memory shows no improvement

Possible causes include transfers that are too small, a saturated interconnect, dominant kernel time, poor NUMA placement, or measurement that includes unrelated work.

## Customer Scenario

A customer deploys a real-time inference service on dual-socket servers. Identical GPUs show different input transfer latency depending on which CPU workers serve them. The application uses pinned memory correctly, but all workers allocate buffers from one NUMA node.

The architecture fix pairs worker pools with GPUs, applies CPU and memory affinity, creates one bounded pinned pool per locality domain, and verifies the result using transfer percentiles and topology-aware profiling.

## Interview Preparation

### Conceptual Questions

1. **Why can pageable memory interfere with asynchronous copies?**
   "Because a DMA engine needs a physically stable address range to read from or write to for the duration of the transfer, and the OS is free to move pageable memory's physical pages at any time. So when the source is pageable, the runtime has to first copy the data into an internal pinned staging buffer it controls — and that staging copy is synchronous CPU work that happens before the real device transfer even starts. The API still looks asynchronous from the caller's perspective, but there's blocking work hidden right behind it."

2. **What does page locking change from the DMA engine's perspective?**
   "It gives the DMA engine a guarantee that the physical address behind that virtual range won't move for as long as the pin is held — so it can issue the transfer directly against that memory with no intermediary copy. Without that guarantee, the DMA engine literally cannot safely target the memory, because the physical backing could be relocated mid-transfer. Pinning is what makes the address stable enough for hardware to trust it."

3. **Why is mapped host memory not automatically faster than copying?**
   "Because 'zero copy' describes the absence of an explicit copy step, not the absence of cost — every access to mapped host memory from a kernel still has to cross PCIe or whatever host interconnect is in play, transaction by transaction, and that per-access latency and limited bandwidth is usually worse than device-local memory. It's a reasonable choice for small or infrequently-accessed data where avoiding the copy outweighs the per-access cost, and a poor choice for a large working set the kernel touches repeatedly — that data belongs in device memory."

### Architecture Questions

1. **Design a bounded pinned-memory pool for four CUDA streams.**
   "Four slots minimum, one naturally aligned per stream, each with its own pinned host buffer, device buffer, and completion event — sized from measured concurrency, not worst-case theoretical demand. I'd track slot state explicitly — free, filling, submitted, in-flight, complete — and require an event-confirmed completion before a slot returns to free. I'd also put a hard ceiling on total pinned bytes across the pool and monitor pool-exhaustion and wait-time metrics, because unbounded pinned growth degrades host stability independent of the GPU work being correct."

2. **Explain how NUMA locality affects host-to-device transfer.**
   "The GPU's PCIe root complex is physically attached to one CPU socket. If the pinned buffer's physical pages were allocated on the other socket's memory, the transfer has to cross the inter-socket link before it even reaches the PCIe path to the GPU — adding latency and consuming shared cross-socket bandwidth. The fix is making the thread that allocates the pinned pool run with CPU and memory affinity pinned to the GPU's local NUMA node, which I'd confirm ahead of time with `nvidia-smi topo -m`."

3. **Compare pinned allocation and host registration.**
   "`cudaHostAlloc` has the runtime create a fresh page-locked region for you — it's the straightforward choice for a buffer you're building specifically as a transfer target. `cudaHostRegister` pins an existing allocation in place, which matters when you're integrating with an external allocator or a framework's own buffers that you don't want to duplicate. Registration can fail on alignment, size, or platform/container policy grounds that allocation typically doesn't hit, so I always check its return status explicitly rather than assuming it succeeded."

### Scenario Questions

1. **A service leaks pinned buffers. What host-level symptoms might appear?**
   "Locked memory doesn't get reclaimed by normal OS paging, so I'd expect the host's available memory to shrink over the service's uptime even though the GPU-side workload looks unchanged, eventually leading to allocation failures, swap pressure, or general host instability under load — all while `nvidia-smi` device memory looks completely normal, because this is a host-memory problem, not a device-memory one. That mismatch — degrading host health with a healthy-looking GPU — is the tell."

2. **Transfers are fast on one CPU socket and slow on another. What do you inspect?**
   "NUMA topology first — specifically, which socket the GPU's PCIe root complex is attached to, and whether the worker process pinned to the slow socket is also allocating and touching its buffers on that socket's local memory. I'd confirm with `nvidia-smi topo -m` for GPU-to-NUMA-node mapping and `numactl --hardware` for the CPU topology, then reproduce the difference directly with `numactl --cpunodebind`/`--membind` to prove it's placement rather than something else entirely."

3. **`cudaMemcpyAsync` does not overlap with compute. List the required checks.**
   "Is the source or destination actually pinned — not just requested as pinned, but confirmed via the allocation call's return status. Are the copy and the kernel in different, independent streams. Is there a hidden device-wide synchronization or legacy default-stream interaction serializing them. Is the transfer large enough that overlap benefit exceeds fixed overhead. And finally, does the profiler timeline actually show the copy engine and compute engine busy at overlapping timestamps — that last one is the only check that proves overlap rather than merely permitting it."

## Summary

Pinned host memory provides stable physical mappings for DMA and enables predictable asynchronous transfer behavior. It removes hidden staging from the application path, but it consumes a constrained host resource and must be pooled, bounded, and placed with NUMA awareness.

Transfer optimization is a pipeline problem. Memory type, buffer ownership, stream dependencies, operation size, topology, and hardware capability all determine whether useful overlap occurs.

## Key Takeaways

- Pageable memory may require staging before a device transfer.
- Pinned memory supports stable DMA mappings and asynchronous copies.
- Pinned memory is limited and should be pooled.
- NUMA locality affects transfer performance.
- Mapped host memory avoids explicit copies but not remote access cost.
- Overlap must be verified using timeline evidence.

## Cross References

- Previous: [Streams, Events, and Asynchronous Execution](./chapter-07-streams-events-and-asynchronous-execution)
- Next: [Unified Memory and Demand Paging](./chapter-09-unified-memory-and-demand-paging)
- Related lab: [Build an Overlapped CUDA Pipeline](./labs/lab-03-build-an-overlapped-cuda-pipeline)
