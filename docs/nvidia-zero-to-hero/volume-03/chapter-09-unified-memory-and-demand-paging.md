---
title: Unified Memory and Demand Paging
description: Understand managed memory, page migration, access locality, oversubscription, prefetching, and the production trade-offs of a unified address space.
sidebar_position: 10
tags:
  - cuda
  - unified-memory
  - managed-memory
  - demand-paging
---

# Unified Memory and Demand Paging

## Introduction

Explicit memory management forces an application to decide where data lives and when it moves. That control can produce excellent performance, but it also creates complexity: duplicate pointers, transfer scheduling, lifetime rules, and platform-specific placement logic.

CUDA Unified Memory introduces a managed allocation that can be accessed by CPUs and GPUs through a unified virtual address space. The system migrates or maps pages according to access, architecture, operating-system support, and runtime policy.

Unified Memory simplifies ownership. It does not eliminate data movement. In production, the key question is whether page placement and migration follow the workload's access pattern or fight it.

| Chapter field | Value |
|---|---|
| Volume | 03 — CUDA Fundamentals |
| Difficulty | Intermediate |
| Estimated reading time | 50 minutes |
| Primary focus | Managed allocation, page migration, and placement policy |
| Previous | Pinned Memory and Transfer Overlap |
| Next | CUDA Graphs and Repeated Execution |

## Story

A scientific application moves from one GPU to four GPUs. The code uses managed memory and runs correctly without major changes, but multi-GPU scaling is inconsistent. Profiling shows repeated page faults and migrations between processors.

The application treats Unified Memory as if it were a large shared cache. In reality, different phases repeatedly touch the same pages from different locations. The runtime is following the access pattern correctly, but the access pattern itself is hostile to locality.

Engineers add phase-aware prefetching, establish preferred locations, and remove CPU inspection from the hot path. Performance stabilizes without abandoning managed memory.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain the difference between unified virtual addressing and Unified Memory.
- Describe managed allocation and page migration.
- Identify page-fault and migration costs.
- Explain oversubscription and eviction behavior conceptually.
- Use prefetch and access advice as placement hints.
- Decide when explicit copies provide a better production model.

## Big Picture

```mermaid
flowchart LR
    CPU[CPU]
    Managed[Managed Virtual Allocation]
    GPU0[GPU 0]
    GPU1[GPU 1]
    HostRAM[Host Memory]
    VRAM0[GPU 0 Memory]
    VRAM1[GPU 1 Memory]

    CPU --> Managed
    GPU0 --> Managed
    GPU1 --> Managed
    Managed -. pages may reside .-> HostRAM
    Managed -. pages may reside .-> VRAM0
    Managed -. pages may reside .-> VRAM1
```

**Figure 3.9.1 — Unified virtual access, distributed physical residence.** One virtual allocation can be accessed from multiple processors even though its pages reside in specific physical memories at any moment.

## Unified Virtual Addressing Versus Unified Memory

These concepts are related but distinct.

| Concept | Meaning |
|---|---|
| Unified Virtual Addressing | Host and device pointers participate in a unified virtual-address model on supported systems |
| Unified Memory | Runtime-managed allocation accessible from CPUs and GPUs, with migration or mapping behavior |

Unified addressing helps identify memory locations consistently. Managed memory adds placement and movement policy.

## Managed Allocation

A managed allocation is created with a CUDA managed-memory API and freed through the normal CUDA deallocation path.

```cpp
float* data = nullptr;
cudaMallocManaged(&data, bytes);

// CPU and GPU may access data according to synchronization rules.

cudaFree(data);
```

The pointer is easier to share across code paths, but correctness still requires ordering. A CPU must not read values while a GPU is updating them unless the program establishes a valid synchronization boundary.

## Page Migration

Managed memory is commonly handled at page granularity. When a processor accesses a page that is not resident or accessible in the required location, the platform may fault, migrate, map, or duplicate that page according to capabilities and policy.

```mermaid
sequenceDiagram
    participant G as GPU
    participant F as Fault Handling
    participant H as Host Memory
    participant D as Device Memory

    G->>F: Access nonresident page
    F->>H: Locate current page data
    H-->>D: Migrate or map page
    D-->>G: Resume access
```

**Figure 3.9.2 — Simplified demand migration.** A first touch may trigger fault handling and movement before execution resumes.

A fault is not automatically an error. It can be expected behavior. Large numbers of faults in latency-sensitive phases are a performance signal.

## Access Locality

Unified Memory performs best when access has locality. A phase runs primarily on one processor, the working set fits, and pages remain near the active processor long enough to amortize migration cost.

Poor patterns include:

- CPU and GPU alternating writes to the same pages.
- Multiple GPUs repeatedly touching the same pages without a clear ownership model.
- Large first-touch bursts on a latency-critical request.
- Working sets that exceed available device memory and churn continuously.
- Host logging or validation that forces pages away from the GPU.

## Prefetching

Prefetching requests that a managed range move toward a processor before the next access phase.

Conceptually:

```cpp
cudaMemPrefetchAsync(data, bytes, device, stream);
```

Prefetching converts some demand-fault cost into an explicit, schedulable operation. It works best when the application knows the upcoming phase and can overlap movement with other work.

A prefetch is a policy request, not a permanent lock. Later accesses may change placement.

## Memory Advice

CUDA exposes advice mechanisms that can describe expected use, such as:

- Preferred location
- Read-mostly behavior
- Expected access by a processor

Advice helps the runtime choose placement and mapping strategies. It does not repair a fundamentally conflicting access pattern.

## Oversubscription

Managed memory can make allocations larger than device memory usable by allowing pages to reside in host memory and move as required. This is oversubscription.

Oversubscription increases capacity flexibility but does not turn host memory into HBM. If the active working set repeatedly exceeds device capacity, page migration can dominate runtime.

```mermaid
flowchart TD
    WorkingSet[Application Working Set]
    DeviceCapacity[Device Memory Capacity]
    Fits{Working set fits?}
    Stable[Stable device residency]
    Evict[Eviction and migration]
    Thrash[Possible page thrashing]

    WorkingSet --> Fits
    DeviceCapacity --> Fits
    Fits -->|Yes| Stable
    Fits -->|No| Evict --> Thrash
```

**Figure 3.9.3 — Oversubscription risk.** Capacity can exceed device memory, but performance depends on whether the active subset remains local.

## Multi-GPU Considerations

Managed memory in a multi-GPU process introduces placement questions:

- Which GPU owns or primarily accesses each range?
- Is peer access available between the devices?
- Are pages migrating between GPU memories?
- Is data read-mostly or frequently written?
- Does the application partition work cleanly?

A shared pointer does not imply uniform access cost from every GPU.

## Correctness and Synchronization

Managed memory reduces pointer-management complexity, not synchronization requirements.

Incorrect pattern:

1. Launch a kernel that writes managed memory.
2. Immediately read the same data on the CPU.
3. Assume the pointer's accessibility guarantees completion.

Correctness requires an event, stream synchronization, device synchronization, or another valid dependency before the CPU consumes results.

## Architecture Trade-offs

### Productivity versus placement control

Managed memory simplifies programming and enables incremental ports. Explicit copies make movement visible and often easier to budget for strict latency targets.

### Capacity versus predictability

Oversubscription enables larger data sets but introduces migration and eviction. Dedicated device allocations provide firmer capacity boundaries.

### Portability versus platform tuning

Unified Memory can reduce platform-specific code, but behavior still depends on GPU architecture, driver, operating system, topology, and access pattern.

## Production Observability

Track:

- Managed-memory page faults
- Bytes migrated by direction
- Prefetch duration
- Device-memory pressure
- Eviction activity
- CPU touches during GPU phases
- Per-GPU access ownership
- Request latency around first touch
- Working-set size versus device capacity

A timeline should correlate migrations with application phases.

## Production Troubleshooting

### Problem: First iteration is much slower

The first iteration may fault and migrate pages. Compare warm and cold runs, then test prefetching before the measured phase.

### Problem: Performance collapses when data grows

Check whether the active working set exceeds device memory. Repeated eviction and refaulting can create thrashing.

### Problem: Multi-GPU scaling is erratic

Inspect which GPU first touches each range, whether pages migrate between GPUs, and whether work partitioning matches data ownership.

### Problem: CPU inspection causes large stalls

A CPU read can force synchronization and page movement. Move validation outside the hot path, copy a small summary, or separate CPU-owned metadata from GPU-owned data.

## Customer Scenario

A customer uses managed memory to accelerate a large analytics application. The approach works well on one GPU but misses latency objectives after the data set grows beyond device capacity.

The architect separates cold and hot data, explicitly prefetches the hot working set, leaves archival pages in host memory, and establishes a capacity alert before migration thrashing begins. The recommendation keeps Unified Memory for programmability while making locality explicit.

## Interview Preparation

### Conceptual Questions

1. Does Unified Memory eliminate data movement?
2. What is the difference between unified virtual addressing and managed memory?
3. Why can first-touch latency be high?

### Architecture Questions

1. Draw a managed page moving from host memory to GPU memory.
2. Explain how prefetching changes the execution timeline.
3. Compare managed memory with explicit host-device copies.

### Scenario Questions

1. A managed-memory application slows dramatically beyond a data-size threshold. Why?
2. Two GPUs repeatedly access the same writable pages. What behavior might occur?
3. CPU logging unexpectedly hurts GPU throughput. How could managed memory be involved?

## Summary

Unified Memory provides a managed allocation accessible by CPUs and GPUs through a unified virtual address model. Physical pages still reside somewhere, and access can trigger migration, mapping, duplication, eviction, or fault handling.

It is most effective when application phases have clear locality. Prefetching and memory advice can improve placement, but explicit copies may remain preferable when latency, bandwidth, and ownership must be tightly controlled.

## Key Takeaways

- Unified Memory simplifies access, not physics.
- Page migration follows access and placement policy.
- First touch and oversubscription can create large latency costs.
- Prefetching can make movement explicit and schedulable.
- Multi-GPU managed memory requires a data-ownership model.
- Synchronization remains mandatory for correctness.

## Cross References

- Previous: [Pinned Memory and Transfer Overlap](./chapter-08-pinned-memory-and-transfer-overlap)
- Next: [CUDA Graphs and Repeated Execution](./chapter-10-cuda-graphs-and-repeated-execution)
- Related lab: [Profile and Diagnose a CUDA Application](./labs/lab-04-profile-and-diagnose-a-cuda-application)
