---
title: Registers, Shared Memory, and Local Memory
description: Understand the fastest storage resources inside an NVIDIA GPU, how they are allocated, and how they influence occupancy and performance.
sidebar_position: 8
tags:
  - gpu-architecture
  - registers
  - shared-memory
  - local-memory
---

# Registers, Shared Memory, and Local Memory

## Introduction

A GPU kernel may perform only a few arithmetic instructions, yet still run slowly because the data feeding those instructions is stored in the wrong place. The fastest values usually live in registers. Data shared by threads in the same block can often be staged in shared memory. Values that do not fit in registers may spill into local memory, which despite its name is backed by device memory and can be much slower.

These storage classes are not interchangeable. They differ in scope, lifetime, capacity, latency, allocation policy, and visibility. Together they determine how much state a Streaming Multiprocessor can hold and how many warps can remain resident.

| Chapter field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Intermediate |
| Estimated reading time | 45 minutes |
| Primary focus | On-chip thread and block storage |
| Previous | Scheduling, Occupancy, and Instruction Dispatch |
| Next | Global Memory, L1, L2, and HBM |

## Story

A team optimizes a kernel by unrolling loops and caching more intermediate values. Instruction count falls, but throughput becomes worse. Profiling shows that register use per thread increased enough to reduce resident warps. In another version, the compiler spills variables into local memory, creating extra device-memory traffic.

The optimization was locally reasonable but globally harmful. Fewer instructions did not compensate for lower latency-hiding capacity and additional memory operations.

This is a recurring GPU lesson: performance depends on resource balance, not on minimizing one metric in isolation.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain the purpose and scope of registers, shared memory, and local memory.
- Describe how per-thread and per-block resource use limits residency.
- Explain register spilling and why local memory is not physically local.
- Identify when shared-memory staging can improve data reuse.
- Diagnose resource-pressure symptoms without treating occupancy as a universal target.

## Big Picture

```mermaid
flowchart TD
    Thread[GPU Thread]
    Registers[Registers]
    Local[Local Memory]
    Block[Thread Block]
    Shared[Shared Memory]
    Cache[L1 and L2 Cache]
    HBM[Device Memory or HBM]

    Thread --> Registers
    Thread --> Local
    Block --> Shared
    Local --> Cache --> HBM
    Shared -. selected data staged from .-> HBM
```

**Figure 2.7.1 — Thread and block storage.** Registers are private to a thread, shared memory belongs to a block, and local memory is a per-thread address space commonly backed by device memory.

## Registers

Registers are the fastest general storage available to a thread. They hold frequently used variables, addresses, loop state, and intermediate values. Register access is normally much cheaper than accessing device memory because registers are physically located inside the Streaming Multiprocessor.

Registers are private to each thread. One thread cannot directly read another thread's registers. Their lifetime normally matches the execution of the thread.

The register file is finite. If a kernel uses many registers per thread, fewer threads and warps may fit on an SM at the same time.

| Register behavior | Architectural consequence |
|---|---|
| Low register use | More threads may reside concurrently |
| High register use | Residency may fall |
| Excess live values | Compiler may spill to local memory |
| Aggressive register limiting | May raise occupancy but increase spills |

The important quantity is not register use alone. It is register use multiplied by the number of resident threads, combined with the architecture's allocation granularity.

## Shared Memory

Shared memory is an on-chip memory region visible to threads in the same block. It supports fast cooperation, data reuse, tiling, reductions, and reorganization of memory access patterns.

A common pattern is to load data from global memory into shared memory, synchronize the block, reuse the data several times, and then write results back.

```mermaid
sequenceDiagram
    participant G as Global Memory
    participant T as Threads in Block
    participant S as Shared Memory

    T->>G: Load tile cooperatively
    G-->>T: Return values
    T->>S: Store tile
    Note over T,S: Block synchronization
    T->>S: Reuse tile repeatedly
    T->>G: Write final results
```

**Figure 2.7.2 — Shared-memory tiling.** Threads cooperate to stage data once and reuse it many times, reducing repeated global-memory traffic.

Shared memory is allocated per block. Large allocations can reduce the number of blocks that fit on an SM. Therefore, using more shared memory can improve data reuse while simultaneously reducing residency.

## Static and Dynamic Shared Memory

Shared memory can be declared with a size known at compile time or requested dynamically when the kernel launches. Dynamic allocation allows one kernel to support different tile sizes, but the launch configuration must account for the requested bytes per block.

Infrastructure engineers usually do not configure these values directly, yet they should understand them when interpreting profiler reports or application tuning decisions.

## Banked Access

Shared memory is divided into banks so multiple threads can access different locations concurrently. When multiple threads address locations that map to the same bank in an incompatible pattern, accesses may serialize.

The exact bank behavior is architecture-dependent, but the general principle is stable: shared memory is fast when thread access patterns align with its parallel organization.

:::note
Shared memory is not automatically fast. Poor access patterns, unnecessary synchronization, or excessive allocation can remove its advantage.
:::

## Local Memory

Local memory is a per-thread logical address space. The name describes visibility, not physical location. Local memory is commonly backed by device memory and served through the cache hierarchy.

Compilers may place data in local memory when:

- A thread uses more registers than can be allocated.
- An array has dynamic indexing that prevents efficient register placement.
- The compiler cannot prove that a value can remain in registers.
- The program contains large per-thread data structures.

Local-memory traffic can therefore appear even when source code does not explicitly request it.

## Register Spilling

Register spilling occurs when values that would ideally live in registers are stored in local memory. Spills add load and store instructions and may create pressure on caches and HBM.

```mermaid
flowchart LR
    Values[Many Live Values]
    Registers[Finite Register Allocation]
    Spill[Spill Selected Values]
    Local[Local Memory]
    Cache[Cache Hierarchy]
    HBM[HBM]

    Values --> Registers
    Registers --> Spill --> Local --> Cache --> HBM
```

**Figure 2.7.3 — Register spilling path.** Excess live state can move from registers into a per-thread memory space backed by the normal device-memory path.

Reducing spills may require smaller live ranges, less unrolling, different data structures, or a different algorithm. Simply forcing a lower register count can worsen spilling.

## Resource Interaction and Occupancy

Registers and shared memory are both residency constraints. The scheduler can place another block on an SM only if enough threads, warps, registers, shared memory, and block slots remain.

| Resource pressure | Typical effect |
|---|---|
| High registers per thread | Fewer active warps |
| High shared memory per block | Fewer resident blocks |
| Both high | Strong residency reduction |
| Lower use with poor access patterns | High occupancy but weak performance |

A kernel does not need maximum occupancy. It needs enough independent work to hide its dominant stalls while preserving useful instruction-level parallelism and data reuse.

## Architecture Trade-offs

### Registers versus occupancy

More registers can reduce memory traffic and preserve intermediate values. The trade-off is lower residency. The correct balance depends on whether the kernel is latency-bound, instruction-bound, or memory-bound.

### Shared memory versus cache

Shared memory gives software explicit control over data placement and reuse. Caches are easier to use but less predictable. Shared memory is most valuable when the access pattern and reuse are well understood.

### Shared memory versus synchronization

Cooperative use often requires barriers. If the work saved is small, synchronization overhead may exceed the benefit.

## Production Perspective

Resource pressure often appears as an application performance issue rather than a platform fault. Two containers can use the same GPU and driver yet show different performance because their kernels allocate resources differently.

Operational teams should preserve profiler evidence before changing cluster configuration. Useful questions include:

- Did register use change after a software update?
- Did compiler flags change?
- Did shared-memory demand increase?
- Did local-memory load/store activity rise?
- Did active warps per SM fall?
- Is the workload now limited by memory traffic?

## Production Troubleshooting

### Problem: Throughput drops after a kernel optimization

**Symptoms**

- Lower instruction count
- Lower occupancy
- Higher local-memory traffic
- Reduced active warps

**Diagnosis**

Compare register use, shared-memory allocation, spill loads and stores, and achieved occupancy between versions.

**Root cause**

The optimization increased per-thread live state, causing fewer resident warps or register spilling.

**Resolution**

Reduce live ranges, reconsider loop unrolling, split the kernel only when launch overhead and extra memory traffic are acceptable, or redesign the algorithm.

### Problem: Shared-memory kernel is not faster

Possible causes include low reuse, bank conflicts, excessive synchronization, large per-block allocation, or a global-memory path that was already cache-efficient.

### Prevention

Record kernel resource usage in performance baselines and compare it during release validation.

## Customer Scenario

A customer observes that a new model release consumes the same GPU memory but delivers lower throughput. Infrastructure checks show healthy temperature, power, clocks, and PCIe links. Profiling reveals increased register pressure in a custom kernel and lower active-warps-per-SM.

The customer initially asks for larger GPUs. The architect instead recommends software-level analysis because the bottleneck is per-kernel resource use, not cluster capacity.

## Interview Preparation

### Conceptual Questions

1. Why is local memory not necessarily physically local?
2. How can high register use reduce throughput?
3. When is shared memory preferable to relying on cache?

### Architecture Questions

1. Draw the path of a spilled register value.
2. Explain how registers and shared memory constrain block residency.
3. Compare the scope and lifetime of registers and shared memory.

### Scenario Questions

1. Occupancy increases after limiting registers, but runtime becomes worse. Why?
2. A kernel allocates large shared-memory tiles. What trade-off must be evaluated?
3. Local-memory traffic rises after a compiler upgrade. What do you inspect?

## Summary

Registers provide the fastest private storage for each thread. Shared memory provides fast, explicitly managed cooperation within a block. Local memory provides a private address space but is commonly backed by device memory and may indicate register pressure or dynamic per-thread storage.

These resources influence both data-access cost and how much work can remain resident. Efficient GPU execution depends on balancing reuse, latency, synchronization, and occupancy rather than maximizing any one resource metric.

## Key Takeaways

- Registers are private, fast, and finite.
- Shared memory enables block-level cooperation and explicit reuse.
- Local memory is per-thread in scope but usually not on-chip.
- Register spills can create hidden device-memory traffic.
- Resource use must be evaluated together with occupancy and bottleneck evidence.

## Cross References

- Previous: [Scheduling, Occupancy, and Instruction Dispatch](./chapter-06-scheduling-occupancy-and-instruction-dispatch)
- Next: [Global Memory, L1, L2, and HBM](./chapter-08-global-memory-l1-l2-and-hbm)
- Related lab: [Profile Memory and Warp Efficiency](./labs/lab-03-profile-memory-and-warp-efficiency)
