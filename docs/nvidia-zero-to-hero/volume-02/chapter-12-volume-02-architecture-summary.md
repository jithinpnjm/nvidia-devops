---
title: Volume 02 Architecture Summary
description: Consolidate the GPU execution, memory, scheduling, topology, and performance concepts introduced throughout Volume 02.
sidebar_position: 13
tags:
  - gpu-architecture
  - summary
  - revision
  - foundations
---

# Volume 02 Architecture Summary

## Introduction

Volume 02 moved from the outside of the accelerator to its internal execution model. The goal was not to turn infrastructure engineers into kernel specialists. It was to build enough architectural understanding to explain why a GPU can be visible, healthy, and still inefficiently used.

The central idea is that GPU performance emerges from a balance between parallel work, execution resources, memory movement, scheduling, and topology. No single counter describes that balance.

| Chapter field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Intermediate |
| Estimated reading time | 35 minutes |
| Primary focus | Consolidation and architectural reasoning |
| Previous | Building a GPU Performance Model |
| Next volume | CUDA Fundamentals |

## Story Revisited

Imagine a production team reporting that an eight-GPU server delivers only half the expected throughput. A weak investigation checks whether all eight devices appear in `nvidia-smi` and then recommends larger GPUs.

An architecture-led investigation asks different questions:

- Does the workload expose enough blocks and warps?
- Are execution lanes active or diverging?
- Is data access coalesced?
- Are registers or shared memory reducing residency?
- Is HBM bandwidth the limit?
- Are the selected GPUs connected through strong peer paths?
- Is the CPU and NIC placement local?
- Is the application waiting on another pipeline stage?

Volume 02 provided the vocabulary needed to ask those questions in the correct order.

## The Complete Mental Model

```mermaid
flowchart TD
    App[Application and Framework]
    Kernel[Kernel Launch]
    Grid[Grid of Thread Blocks]
    SM[Streaming Multiprocessors]
    Warp[Warp Scheduling]
    Engines[CUDA and Tensor Execution Pipelines]
    FastMem[Registers and Shared Memory]
    Cache[L1 and L2 Cache]
    HBM[HBM or Device Memory]
    Peer[Peer Interconnect and PCIe]
    Host[CPU, NUMA, NIC, and Storage]

    App --> Kernel --> Grid --> SM --> Warp --> Engines
    SM <--> FastMem
    FastMem <--> Cache <--> HBM
    HBM <--> Peer <--> Host
```

**Figure 2.12.1 — GPU architecture as one execution and data-movement system.** Software hierarchy, execution pipelines, memory hierarchy, and physical topology must cooperate.

## Architectural Layers

### Work decomposition

Applications express parallel work as kernels. Kernels create grids. Grids contain blocks. Blocks contain threads. Hardware groups threads into warps and assigns blocks to Streaming Multiprocessors.

The workload must expose enough independent work to use the device. A larger GPU does not help when the grid is too small or execution remains serial.

### Execution resources

CUDA Cores, Tensor Cores, and other specialized pipelines execute different instruction classes. A workload benefits only when its operations, data types, and software path can use the relevant pipeline.

Peak specifications describe capability. Delivered throughput depends on instruction eligibility, issue rate, data supply, and pipeline balance.

### Scheduling and occupancy

Warp schedulers select ready warps. When one warp waits, another can execute. This latency-hiding model requires enough resident work.

Occupancy is therefore useful, but not absolute. High occupancy can coexist with poor memory behavior. Lower occupancy can perform well when each warp has strong reuse and instruction-level parallelism.

### On-chip storage

Registers hold private thread state. Shared memory enables block-level cooperation. Local memory is a per-thread address space that may be backed by device memory.

Resource usage influences both access cost and residency. Register spilling, oversized shared-memory allocations, or unnecessary barriers can reduce performance.

### Device-memory hierarchy

L1 and L2 caches reduce the need to access HBM. HBM provides large capacity and high aggregate bandwidth, but only efficient requests approach that bandwidth.

Coalescing, locality, reuse, and balanced partition access determine effective throughput.

### Topology

GPU indices do not describe physical relationships. PCIe hierarchy, direct GPU links, switch fabrics, CPU sockets, NUMA nodes, and NIC placement determine communication paths.

Topology-aware scheduling is essential for workloads that exchange large amounts of data.

## Symptom-to-Layer Map

| Production symptom | First architectural questions |
|---|---|
| Low utilization | Is enough work reaching the GPU? Are launches fragmented? |
| High utilization, low throughput | Which pipeline is active? Is work useful or stalled? |
| High memory throughput | Is the workload memory-bound? Is data reused? |
| High memory use | Is capacity the issue, or only allocation? |
| Poor multi-GPU scaling | What are the peer and NIC paths? How much time is communication? |
| Performance regression after build change | Did register use, spills, kernel count, or instruction eligibility change? |
| Oscillating utilization | Are CPU, storage, batching, or synchronization creating gaps? |
| One GPU pair slower than another | Does topology differ? |

The map is a starting point, not a diagnosis. Each hypothesis must be tested with evidence.

## Architecture Decision Framework

When evaluating a GPU workload, follow this sequence:

1. **Define the workload outcome.** Latency, throughput, step time, tokens per second, or another useful unit.
2. **Map the pipeline.** Identify CPU, storage, network, runtime, and GPU stages.
3. **Inspect parallelism.** Confirm that the workload exposes enough blocks, warps, and concurrency.
4. **Inspect execution.** Determine which pipelines perform the work.
5. **Inspect memory.** Separate capacity, bandwidth, latency, and access-pattern issues.
6. **Inspect topology.** Verify GPU, CPU, NIC, and peer placement.
7. **Compare with a baseline.** Use the same shapes, versions, and environment.
8. **Change one variable.** Validate the end-to-end result.

```mermaid
flowchart TD
    Goal[Define Workload Goal]
    Pipeline[Map Full Pipeline]
    Parallel[Check Parallelism]
    Execute[Check Execution Pipelines]
    Memory[Check Memory Behavior]
    Topology[Check Topology]
    Baseline[Compare Baseline]
    Change[Apply Controlled Change]

    Goal --> Pipeline --> Parallel --> Execute --> Memory --> Topology --> Baseline --> Change
```

**Figure 2.12.2 — GPU architecture investigation order.** The sequence reduces the risk of optimizing a secondary symptom.

## Production Anti-Patterns

### Choosing hardware from peak numbers

Peak compute, bandwidth, or memory capacity does not describe application fit. Hardware selection must follow measured workload demand.

### Treating every GPU as interchangeable

Communication-heavy workloads depend on topology. Resource count without locality can produce fragmented and inefficient placement.

### Maximizing occupancy blindly

Higher occupancy can introduce register spills or reduce data reuse. The objective is enough latency hiding, not a perfect percentage.

### Using utilization as the only health signal

Utilization indicates activity, not efficiency, quality of service, or bottleneck location.

### Optimizing the GPU before the pipeline

A fast kernel cannot compensate for slow tokenization, storage, network handling, or request scheduling.

## Customer Architecture Conversation

A customer asks, “Which GPU should we buy?” The architect reframes the question:

- What workload will run?
- What model and precision?
- What batch sizes and concurrency?
- What latency and throughput targets?
- How much memory capacity is required?
- Is the workload compute-bound, memory-bound, or communication-bound?
- Does it need one GPU, several GPUs, or several nodes?
- What operational and cost constraints apply?

The answer may be a larger GPU, a different topology, a smaller partition, better batching, a faster input pipeline, or a software optimization. Architecture prevents product selection from replacing problem definition.

## Knowledge Questions

1. Why are blocks, rather than individual threads, assigned to SMs?
2. What role do warps play in latency hiding?
3. How can register use affect occupancy?
4. Why can local memory be slower than its name suggests?
5. What is the difference between memory capacity and bandwidth?
6. Why does coalescing matter?
7. How can branch divergence waste execution capacity?
8. Why is topology important inside one server?
9. What does arithmetic intensity help explain?
10. Why is utilization not a performance objective?

## Architecture Questions

1. Draw the path from a kernel launch to execution on an SM.
2. Draw the memory path from a register spill to HBM.
3. Design a topology-aware four-GPU allocation policy.
4. Explain how to distinguish a memory-bound workload from a compute-bound workload.
5. Build a performance validation plan for a new model release.

## Scenario Questions

1. A new GPU has twice the compute capability but delivers only ten percent more performance. What do you investigate?
2. Limiting registers increases occupancy but slows the kernel. Why?
3. Two identical jobs run at different speeds on the same server. What topology evidence do you compare?
4. GPU utilization is low while CPU usage is high. Where is the likely bottleneck?
5. Single-GPU throughput is strong, but scaling efficiency collapses at four GPUs. Which layers matter?

## Quick Revision Sheet

| Concept | One-sentence revision |
|---|---|
| Thread | Logical instance of a kernel |
| Block | Cooperative thread group and SM placement unit |
| Warp | Hardware-managed instruction-issue group |
| SM | Scheduling and execution unit that holds resident warps |
| Register | Fast private thread storage |
| Shared memory | Fast block-scoped cooperative storage |
| Local memory | Private address space commonly backed by device memory |
| L1/L2 | Caches that reduce repeated lower-level accesses |
| HBM | High-capacity, high-bandwidth device memory |
| Occupancy | Resident warps relative to architectural capacity |
| Divergence | Different control paths within a warp |
| Coalescing | Combining nearby thread memory requests efficiently |
| Peer access | One GPU addressing another GPU's memory through a supported path |
| NUMA locality | Physical relationship among CPUs, memory, and I/O devices |
| Arithmetic intensity | Useful computation performed per byte moved |

## Lab Checklist

Before leaving Volume 02, the reader should be able to:

- inventory GPUs and stable identifiers
- interpret a topology matrix
- map GPUs to NUMA nodes
- explain active versus idle execution
- describe register and shared-memory constraints
- distinguish capacity, bandwidth, and latency
- identify coalesced and scattered access patterns
- form a compute, memory, communication, or pipeline hypothesis
- build a topology-aware placement recommendation

## Summary

GPU architecture is a system of execution hierarchy, specialized pipelines, schedulers, storage resources, memory hierarchy, and physical data paths. Performance depends on how well software maps onto that system.

The durable skill is not memorizing one GPU generation. It is learning to translate a production symptom into architectural questions and then test those questions with evidence.

## Key Takeaways

- GPU performance requires enough parallel work and efficient data movement.
- Execution, memory, scheduling, and topology must be analyzed together.
- Occupancy and utilization are diagnostic dimensions, not goals.
- Physical locality influences multi-GPU and host-device performance.
- Evidence-driven performance models are more valuable than peak specifications.

## Cross References

- Previous: [Building a GPU Performance Model](./chapter-11-building-a-gpu-performance-model)
- Related lab: [Build a Topology-Aware GPU Placement Plan](./labs/lab-04-build-a-topology-aware-gpu-placement-plan)
- Continue with Volume 03: CUDA Fundamentals
