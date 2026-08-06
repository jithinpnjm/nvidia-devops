---
title: Scheduling, Occupancy, and Instruction Dispatch
description: Understand how NVIDIA GPUs keep execution pipelines busy through warp scheduling, latency hiding, residency, and instruction issue.
sidebar_position: 6
tags:
  - gpu-architecture
  - occupancy
  - warp-scheduling
  - instruction-dispatch
---

# Scheduling, Occupancy, and Instruction Dispatch

## Introduction

A GPU contains many execution pipelines, but those pipelines do not remain busy automatically. Work must be organized into warps, warps must be resident on a Streaming Multiprocessor, operands must be ready, and the scheduler must find an instruction that can issue.

This is why occupancy and scheduling matter. The hardware hides latency by keeping multiple warps available. When one warp waits for memory or an instruction dependency, another warp may execute. The design is powerful, but it is often misunderstood. High occupancy does not guarantee high performance, and low occupancy is not always a defect.

This chapter explains how blocks become resident, how warps become eligible, how instructions are dispatched, and how architects should interpret occupancy in production workloads.

| Chapter field | Value |
|---|---|
| Volume | 02 - GPU Architecture |
| Difficulty | Intermediate |
| Estimated reading time | 45 minutes |
| Primary focus | Warp scheduling and latency hiding |
| Previous chapter | GPU Memory Hierarchy |
| Next chapter | GPU Architecture Performance Model |

## Story

Two kernels perform the same calculation. The first launches many small blocks and reaches high reported occupancy. The second uses fewer blocks because each block consumes more shared memory, yet it completes faster.

The team assumes the profiler is wrong. It is not. The second kernel reuses data efficiently and performs more useful work per memory transaction. The first keeps many warps resident, but those warps repeatedly compete for memory bandwidth.

Occupancy describes the amount of active warp state relative to a hardware limit. It does not directly measure instruction efficiency, cache behavior, Tensor Core use, or useful throughput.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain block, warp, and thread residency on an SM.
- Distinguish active, eligible, selected, stalled, and completed warps.
- Describe how warp schedulers hide latency.
- Explain how registers, shared memory, and block size limit occupancy.
- Interpret occupancy as one performance signal rather than a goal.
- Diagnose common scheduling and instruction-issue bottlenecks.

## Big Picture

A kernel launch creates a grid of thread blocks. The GPU assigns blocks to SMs when enough resources are available. Each resident block contributes one or more warps. Warp schedulers choose ready warps and issue instructions to execution pipelines.

```mermaid
flowchart TD
    Grid[Kernel Grid]
    Blocks[Thread Blocks]
    SM0[SM 0]
    SM1[SM 1]
    Warps0["Resident Warps<br/>evidence: profiler achieved<br/>occupancy metric"]
    Warps1[Resident Warps]
    Sched0[Warp Scheduler]
    Sched1[Warp Scheduler]
    Pipes0["Execution Pipelines<br/>evidence: dmon sm%"]
    Pipes1[Execution Pipelines]

    Grid --> Blocks
    Blocks --> SM0
    Blocks --> SM1
    SM0 --> Warps0 --> Sched0 --> Pipes0
    SM1 --> Warps1 --> Sched1 --> Pipes1
    Warps0 --> Q{"Achieved occupancy low —<br/>which resource capped it?"}
    Q -->|"nvcc -Xptxas=-v shows<br/>high registers/thread"| RegCap["Register-limited:<br/>fewer resident warps by design"]
    Q -->|"Kernel requests large<br/>shared-mem/block"| ShCap["Shared-memory-limited:<br/>fewer resident blocks"]
    Q -->|"Neither high, but occupancy<br/>still low"| GridCap["Grid too small — not enough<br/>blocks to fill available slots"]
```

**Figure 2.6.1 - From grid to instruction issue.** Blocks become resident on SMs, produce warps, and feed schedulers that issue instructions to execution pipelines. The branch converts "occupancy is low" from an observation into a specific, checkable cause: the compiler's own register report and the kernel's shared-memory request together identify which resource is actually the tightest constraint, rather than treating occupancy as an unexplained single number.

**Confirming residency limits directly from the compiler, before profiling.** The register ceiling this chapter keeps referencing is visible at compile time, not just in a profiler report:

```text
$ nvcc -O3 -Xptxas=-v kernel.cu -o kernel
ptxas info    : Compiling entry function '_Z6kernelPfS_m' for 'sm_90'
ptxas info    : Function properties for _Z6kernelPfS_m
    0 bytes stack frame, 0 bytes spill stores, 0 bytes spill loads
ptxas info    : Used 48 registers, 384 bytes cmem[0]
```

`Used 48 registers` and `0 bytes spill stores/loads` together say two things at once: this kernel's occupancy ceiling is computable right now (register file size ÷ 48 = max resident threads on this architecture), and there is no local-memory traffic hiding behind those registers. If `spill stores`/`spill loads` were non-zero instead, that would mean the kernel is *already* paying for values that didn't fit in registers — a different, more expensive problem than merely "low occupancy."

The GPU schedules blocks independently. A block remains on an SM until it completes. Threads inside the block can synchronize and share data through shared memory, which is why blocks are the unit of residency and resource allocation.

## Residency

A block can become resident only when the SM has enough resources for it. The important constraints include:

- threads per block
- warps per block
- registers per thread
- shared memory per block
- architectural limits on resident blocks
- architectural limits on resident warps and threads

The tightest constraint determines how many blocks can reside simultaneously.

```mermaid
flowchart LR
    Block[Candidate Block]
    Threads[Thread Limit]
    Warps[Warp Limit]
    Regs[Register Capacity]
    Shared[Shared Memory Capacity]
    Slots[Block Slots]
    Admit[Admit Block to SM]

    Block --> Threads
    Block --> Warps
    Block --> Regs
    Block --> Shared
    Block --> Slots
    Threads --> Admit
    Warps --> Admit
    Regs --> Admit
    Shared --> Admit
    Slots --> Admit
```

**Figure 2.6.2 - Block residency constraints.** A block is admitted only when all required SM resources are available.

A kernel with high register usage may allow fewer resident blocks. A kernel with large shared-memory tiles may face the same limitation. Large blocks may consume thread or warp capacity even when registers and shared memory remain available.

## Occupancy

Occupancy is commonly expressed as:

```text
active warps per SM / maximum supported warps per SM
```

This ratio indicates how much warp state is resident relative to the architectural maximum. It is useful because resident warps provide the scheduler with alternatives when some warps stall.

**A worked occupancy calculation.** Take an SM that supports a maximum of 64 resident warps (2,048 threads / 32 threads per warp) and 65,536 registers. A kernel launched with 256-thread blocks (8 warps/block) using 40 registers/thread permits `65,536 / 40 = 1,638` resident threads, rounded down to whole blocks: `1,638 / 256 ≈ 6` blocks, or `6 x 8 = 48` resident warps. Occupancy is then `48 / 64 = 75%`. Now suppose an optimization pass adds a few cached intermediate values and register use rises to 56/thread: resident threads become `65,536 / 56 ≈ 1,170`, rounded down to `4` blocks (`1,170 / 256 ≈ 4.57`, and partial blocks cannot reside), giving `4 x 8 = 32` resident warps and occupancy of `32 / 64 = 50%`. A single register bump from 40 to 56 dropped occupancy from 75% to 50% — and whether that costs real performance depends entirely on whether the kernel had enough independent work at 50% occupancy to still hide its dominant latency, which is exactly why this chapter treats occupancy as diagnostic rather than a target to maximize.

Occupancy is not a measure of:

- GPU utilization across the entire device
- percentage of useful instructions
- memory-bandwidth efficiency
- Tensor Core utilization
- end-to-end application throughput

:::warning Common mistake
Do not optimize for 100 percent occupancy without evidence. A lower-occupancy kernel can be faster when it performs more work per instruction, improves locality, or reduces memory traffic.
:::

## Warp States

A resident warp moves through several practical states during execution.

| State | Meaning |
|---|---|
| Active | Resident on the SM and not completed |
| Eligible | Ready to issue its next instruction |
| Selected | Chosen by the scheduler for issue |
| Stalled | Waiting for data, dependency, synchronization, or resource availability |
| Completed | All required instructions have finished |

A scheduler needs eligible warps. Many active warps do not help if all are waiting on the same long-latency event.

## Latency Hiding

GPUs tolerate latency by switching among warps rather than relying primarily on large out-of-order execution structures. When one warp waits, the scheduler may issue from another ready warp.

```mermaid
sequenceDiagram
    participant W0 as Warp 0
    participant W1 as Warp 1
    participant W2 as Warp 2
    participant S as Scheduler
    participant M as Memory
    participant E as Execute

    W0->>S: Memory load ready to issue
    S->>M: Issue load for Warp 0
    Note over W0,M: Warp 0 waits
    W1->>S: Arithmetic ready
    S->>E: Issue Warp 1 instruction
    W2->>S: Tensor instruction ready
    S->>E: Issue Warp 2 instruction
    M-->>W0: Data returns
    W0->>S: Eligible again
```

**Figure 2.6.3 - Latency hiding across warps.** While one warp waits for memory, other eligible warps can use execution pipelines.

Latency hiding works only when independent work exists. If all warps access the same slow dependency, wait at a barrier, or saturate the same resource, adding more resident warps may not improve progress.

## Instruction Dependencies

A warp cannot issue an instruction until required operands are ready. Consider:

```text
A = B + C
D = A × E
```

The second instruction depends on the result of the first. The scheduler may issue work from another warp while waiting for `A` to become available.

Dependencies may arise from:

- arithmetic results
- memory loads
- synchronization
- atomic operations
- communication
- execution-pipeline availability

The scoreboard tracks dependencies and prevents instructions from using unavailable operands.

## Instruction Dispatch

Warp schedulers select eligible warps, and dispatch logic routes instructions to compatible execution pipelines. The number and arrangement of schedulers and dispatch units vary by architecture, so performance should not be inferred from a generic scheduler count alone.

```mermaid
flowchart LR
    Active[Active Warps]
    Ready[Eligible Warps]
    Select[Scheduler Selection]
    Decode[Decode and Dispatch]
    FP[FP or Integer Pipeline]
    Tensor[Tensor Pipeline]
    Memory[Load and Store Pipeline]
    SFU[Special Function Pipeline]

    Active --> Ready --> Select --> Decode
    Decode --> FP
    Decode --> Tensor
    Decode --> Memory
    Decode --> SFU
```

**Figure 2.6.4 - Warp selection and dispatch.** Eligibility depends on operands and resources; instruction type determines the execution pipeline.

A warp can be ready while its required pipeline is busy. This creates a structural limitation. A workload dominated by one instruction class may leave other pipelines underused.

## Divergence and Scheduling

Threads in a warp share an instruction stream. When branches send threads down different paths, the warp may execute multiple paths with different active masks. Divergence reduces lane efficiency even though the warp remains scheduled.

```mermaid
flowchart TD
    Warp[Warp Reaches Branch]
    Test{Condition per Thread}
    PathA[Execute Path A with Mask A]
    PathB[Execute Path B with Mask B]
    Reconverge[Reconverge]

    Warp --> Test
    Test --> PathA
    Test --> PathB
    PathA --> Reconverge
    PathB --> Reconverge
```

**Figure 2.6.5 - Warp divergence.** Different branch outcomes can require serial execution of paths with different active lanes.

Not every branch is harmful. Uniform branches, where all threads take the same path, do not create lane divergence. The performance effect depends on branch frequency, path length, and active-lane distribution.

## Occupancy Limits in Practice

### Register pressure

The compiler assigns registers per thread. Multiplying that value by threads per block and resident blocks creates aggregate register demand. Small changes can cross allocation boundaries and reduce residency.

### Shared-memory pressure

Shared memory is allocated per block. Larger tiles may improve reuse while reducing resident blocks. This is a classic performance trade-off: lower occupancy may be acceptable when each block performs more efficient work.

### Block size

Block size determines the number of warps per block. Very small blocks may underuse block-level resources. Very large blocks may reduce scheduling flexibility or exceed resource limits.

### Kernel duration and grid size

Even a well-configured kernel cannot occupy the whole GPU when the grid contains too few blocks. Small workloads may not expose enough parallel work to fill all SMs.

## Architecture Considerations

### Occupancy is a means, not an objective

The purpose of occupancy is to provide enough independent work to hide relevant latency. Once that requirement is met, further occupancy may not improve throughput.

### Scheduling cannot repair every bottleneck

Warp switching can hide some latency but cannot create memory bandwidth, increase cache capacity, remove branch divergence, or overcome serial application stages.

### End-to-end systems need multiple schedulers

GPU warp scheduling is only one layer. Kubernetes schedules pods, inference runtimes schedule requests, distributed frameworks schedule collectives, and the GPU schedules warps. Poor decisions at a higher layer can starve the hardware regardless of SM efficiency.

## Production Deployment

A production performance review should distinguish four scheduling layers:

| Layer | Scheduling unit | Common failure |
|---|---|---|
| Cluster | Pod or job | Workload placed on unsuitable node or topology |
| Runtime | Request, batch, model | Small batches or queue imbalance |
| Kernel | Grid and blocks | Insufficient parallel work or poor block shape |
| SM | Warp and instruction | Stalls, divergence, dependency pressure |

Measure each layer before modifying kernel occupancy. A request queue may be empty because upstream preprocessing is slow. A kernel may be efficient but launched too infrequently to sustain GPU utilization.

## Production Troubleshooting

### Problem: High occupancy but low throughput

| Possible cause | Why occupancy does not solve it |
|---|---|
| HBM bandwidth saturated | More warps create more demand for the same bandwidth |
| Heavy divergence | Active warps contain few active lanes |
| Long dependency chains | Warps have limited independent instructions |
| Pipeline imbalance | One execution pipeline is saturated |
| Small grid over time | Occupancy is high only during short kernel bursts |

**Turning "HBM bandwidth saturated" into evidence, distinct from the occupancy number itself.** A profiler's achieved-occupancy metric and `dmon`'s memory percentage answer two different questions, and both are needed to diagnose this row:

```text
$ ncu --metrics sm__warps_active.avg.pct_of_peak_sustained_active,dram__throughput.avg.pct_of_peak_sustained_elapsed ./kernel
  sm__warps_active.avg.pct_of_peak_sustained_active     %    91.2
  dram__throughput.avg.pct_of_peak_sustained_elapsed    %    97.8
```

`sm__warps_active` (achieved occupancy) at 91.2% confirms the SM genuinely has plenty of resident warp state — occupancy is not the limiting factor here. `dram__throughput` at 97.8% shows HBM is nearly saturated regardless. Together these two numbers are the direct proof of the table's first row: high occupancy and a saturated memory system can coexist, and adding more resident warps on top of this would only increase demand on a resource that's already nearly full, not help.

### Problem: Low occupancy after a code change

Inspect register count, shared-memory allocation, block size, and compiler changes. Then compare actual runtime. The new kernel may still be faster due to reduced memory traffic or instruction count.

**Turning this into evidence.** Compare `nvcc -Xptxas=-v` output before and after the change — this is the fastest way to confirm the mechanism without a full profiler run:

```text
# Before
ptxas info: Used 40 registers, 0 bytes spill stores, 0 bytes spill loads

# After
ptxas info: Used 72 registers, 0 bytes spill stores, 0 bytes spill loads
```

Registers/thread rising from 40 to 72 with no spills is the direct, compile-time-visible cause of a residency drop — recompute the register-limited thread ceiling (register file size ÷ 72) and compare it against the SM's warp-count maximum to get the expected new occupancy. If measured runtime *improved* despite this drop, the change most likely reduced memory traffic or instruction count enough to outweigh the lower latency-hiding capacity — confirm with `dmon`'s `mem%` before and after, not just the occupancy number in isolation.

### Problem: GPU utilization oscillates

The cause may exist above the SM. Check CPU preprocessing, data loading, request batching, synchronization between kernels, host-device transfers, and distributed barriers.

### Problem: One kernel dominates request latency

Profile stall reasons and instruction mix. Determine whether the kernel waits on memory, dependencies, barriers, or a saturated pipeline. Occupancy tuning should follow this diagnosis.

## Customer Scenario

A customer reports only 45 percent occupancy and asks whether the cluster is misconfigured. The architect first asks whether throughput, latency, and scaling targets are being met. Profiling shows that the primary kernel uses large shared-memory tiles, achieves strong data reuse, and runs near the expected throughput baseline.

The correct recommendation is not to force higher occupancy. It is to preserve the efficient tiling and continue monitoring end-to-end performance. Architecture decisions must optimize outcomes rather than isolated metrics.

## Interview Preparation

### Conceptual Questions

1. What does GPU occupancy measure?
**Model answer:** "The ratio of active warps resident on an SM to the architectural maximum the SM supports — nothing more. I'd be explicit that it's a resource-accounting number: it tells you how much warp state the scheduler has to choose from when something stalls, not whether that warp state is doing useful, non-redundant work. I can compute it directly: register file size divided by registers/thread from `nvcc -Xptxas=-v` gives the resident-thread ceiling, divide by threads/warp and by the SM's max warps to get the percentage."

2. How do multiple resident warps hide latency?
**Model answer:** "When one warp issues a long-latency operation — typically a memory load — it can't proceed until the data returns. Instead of stalling the whole SM, the scheduler looks across the other resident warps for one that's eligible — operands ready, no dependency block — and issues its instruction instead. This works because all those warps' register state is already sitting on the SM; there's no expensive context switch. The catch is it only works if independent, eligible work actually exists among the resident warps."

3. Why can 100 percent occupancy be slower than lower occupancy?
**Model answer:** "Because occupancy says nothing about data reuse or memory traffic. I'd use the chapter's own example: a kernel that launches many small blocks can hit high occupancy while each warp repeatedly re-fetches data from HBM, competing for the same bandwidth. A kernel using large shared-memory tiles might run at 50% occupancy but reuse that data many times per fetch — fewer resident warps, but far less memory traffic per unit of useful work. Occupancy maximizes latency-hiding capacity; it doesn't maximize efficiency, and past 'enough,' more occupancy can just mean more warps competing for the same saturated resource."

### Architecture Questions

1. Draw the path from a kernel grid to instruction dispatch.
**Model answer:** "Grid, made of thread blocks, each block admitted to an SM only if enough registers, shared memory, and warp/thread slots are free — that admission check is a real gate, not automatic. Once resident, a block's threads split into warps of 32. The SM's warp scheduler evaluates which resident warps are eligible — operands ready, dependencies cleared, required pipeline free — and selects one to issue an instruction to a matching execution pipeline. The thing I'd emphasize while drawing it: 'active' and 'eligible' are different warp states, and a scheduler with many active-but-stalled warps and no eligible ones is still stuck, occupancy number notwithstanding."

2. Explain how registers and shared memory limit block residency.
**Model answer:** "Both are per-SM finite pools that get divided among resident blocks. Registers/thread from the compiler times threads/block times number of resident blocks can't exceed the SM's total register file; shared-memory/block times resident blocks can't exceed the SM's shared-memory capacity. Whichever constraint is tightest caps residency — I'd compute both explicitly from compiler output and the kernel's shared-memory request rather than guessing which one binds."

3. Describe scheduling at cluster, runtime, kernel, and SM layers.
**Model answer:** "Four independent schedulers, each with its own failure mode. Cluster-level, Kubernetes places pods on nodes — a bad placement decision starves a GPU before any kernel runs. Runtime-level, the inference server batches and schedules requests — small batches underfill kernels regardless of SM efficiency. Kernel-level, grid and block geometry determines how much parallel work exists to distribute — too few blocks leaves SMs idle. SM-level, the warp scheduler issues instructions from resident, eligible warps. I'd stress that a problem at any layer can look identical to a problem at another — 'low GPU utilization' could be any of the four — which is why you measure top-down rather than jumping straight to kernel tuning."

### Scenario Questions

1. A kernel has high occupancy and low throughput. What do you investigate?
**Model answer:** "I'd pull `dmon`'s `sm%`/`mem%` pair first. High occupancy with `mem%` saturated and `sm%` comparatively low points at HBM bandwidth as the real ceiling — more resident warps just means more requests queued against the same saturated memory system. If both are moderate but throughput is still poor, I'd check active-lane efficiency for divergence, since a warp can be 'active' while running with most of its 32 lanes masked off doing no useful work."

2. A shared-memory optimization lowers occupancy but improves speed. Why?
**Model answer:** "Because the optimization traded resident-block count for data reuse — larger shared-memory tiles per block mean fewer blocks fit on the SM, but each block now avoids re-fetching data from HBM that it used to load repeatedly. If the kernel had enough occupancy left to still hide its remaining latency, the reduction in actual memory traffic wins outright. I'd confirm with `dmon`'s `mem%` before and after — it should drop measurably — rather than treating the occupancy decrease alone as a red flag."

3. GPU utilization oscillates between zero and full. Which layers do you inspect?
**Model answer:** "Starting from the outside in: CPU-side, is preprocessing or tokenization creating gaps between requests — `top`/`pidstat` during the oscillation would show this. Runtime-side, is batching too small or the queue draining faster than it fills. Kernel-side, are launches fragmented with heavy synchronization between them, visible as gaps in an Nsight Systems timeline. I wouldn't start at the SM warp-scheduler level for this symptom — an oscillation between zero and full utilization is almost always something above the SM creating the gaps, not the SM itself."

## Summary

GPU scheduling keeps execution pipelines busy by maintaining multiple resident warps and issuing instructions from warps whose operands and resources are ready. Blocks are the unit of SM residency. Registers, shared memory, threads, warps, and architectural limits determine how many blocks can reside.

Occupancy measures resident warp capacity, not useful performance. The correct goal is enough independent work to hide latency while preserving efficient memory access, instruction execution, and data reuse.

## Key Takeaways

- Blocks consume SM resources and remain resident until completion.
- Warp schedulers select eligible warps, not merely active warps.
- Latency hiding requires independent ready work.
- Register and shared-memory use can reduce occupancy.
- Higher occupancy is not automatically faster.
- Divergence reduces active-lane efficiency.
- Scheduling must be analyzed across cluster, runtime, kernel, and SM layers.

## Cross References

- Previous: [GPU Memory Hierarchy](./chapter-05-gpu-memory-hierarchy)
- Next: GPU Architecture Performance Model
- Related lab: [Inspect GPU Engine and Memory Behavior](./labs/lab-02-inspect-gpu-engine-and-memory-behavior)
