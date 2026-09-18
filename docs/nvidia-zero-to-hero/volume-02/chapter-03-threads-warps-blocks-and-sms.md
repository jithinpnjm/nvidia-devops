---
title: Threads, Warps, Blocks, and Streaming Multiprocessors
description: Understand how GPU software work is grouped, scheduled, and executed across Streaming Multiprocessors.
sidebar_position: 4
tags:
  - gpu-architecture
  - warps
  - thread-blocks
  - streaming-multiprocessor
---

# Threads, Warps, Blocks, and Streaming Multiprocessors

## Introduction

GPU software describes a large amount of parallel work using a hierarchy: threads are grouped into blocks, blocks form a grid, and the hardware executes groups of threads called warps on Streaming Multiprocessors.

These terms are easy to memorize and easy to misunderstand. A thread is not permanently assigned to a physical core. A block is not the same as an operating-system process. A warp is not usually created explicitly by application code. The hierarchy is a contract between software and hardware that allows the GPU to scale the same program across different device sizes.

This chapter explains that contract from both the programming and infrastructure perspectives.

| Chapter field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Foundation |
| Estimated reading time | 45 minutes |
| Primary focus | GPU execution hierarchy and scheduling |
| Previous | Inside a Modern NVIDIA GPU |
| Next | CUDA Cores and Tensor Cores |

## Story

A team runs the same kernel on two GPUs. The newer GPU has more Streaming Multiprocessors, but performance improves only slightly. The team expected the workload to scale automatically.

Profiling shows that the grid contains only a small number of blocks. Once those blocks are assigned, many SMs have no work. The kernel is correct, but its launch geometry cannot expose enough parallelism for the larger device.

The lesson is fundamental: hardware scale is useful only when software presents enough independent work to occupy it.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain the relationship between grids, blocks, warps, and threads.
- Describe how blocks are assigned to Streaming Multiprocessors.
- Explain why warps are the practical execution unit.
- Identify branch divergence and insufficient parallelism.
- Reason about occupancy without treating it as a universal performance target.

## Big Picture

```mermaid
flowchart TD
    Kernel["Kernel Launch<br/>evidence: nvidia-smi --query-compute-apps<br/>shows the process"]
    Grid["Grid: N blocks<br/>evidence: launch config in app/profiler log"]
    BlockA[Thread Block A]
    BlockB[Thread Block B]
    BlockN[Additional Blocks]
    SMA["SM 0<br/>evidence: dmon sm%"]
    SMB["SM 1<br/>evidence: dmon sm%"]
    WarpsA[Resident Warps]
    WarpsB[Resident Warps]
    Threads[Logical Threads]

    Kernel --> Grid
    Grid --> BlockA
    Grid --> BlockB
    Grid --> BlockN
    BlockA --> SMA
    BlockB --> SMB
    BlockN --> SMA
    SMA --> WarpsA --> Threads
    SMB --> WarpsB --> Threads
    Grid --> Check{"blocks in grid vs.<br/>SM count on this GPU?"}
    Check -->|"blocks << SM count"| Under["Grid underfills the device —<br/>most SMs get zero blocks,<br/>regardless of GPU size"]
    Check -->|"blocks >> SM count,<br/>but dmon sm% still low"| Diverge["Not a launch-geometry problem —<br/>check divergence/occupancy instead"]
    Check -->|"blocks >> SM count,<br/>dmon sm% high"| Healthy["Grid geometry is healthy;<br/>look elsewhere for the bottleneck"]
```

**Figure 2.3.1 — Execution hierarchy.** A kernel launch creates a grid of blocks. Blocks are assigned to SMs, where their threads are organized into warps for instruction issue. The right-hand branch turns this from a components diagram into the first check for the chapter's own opening story: a grid with too few blocks starves a large GPU no matter how many SMs it has, and that specific failure mode is verifiable by comparing the launch's block count against `nvidia-smi --query-gpu=name --format=csv` (device identity) and the architecture's known SM count.

**Reading the story's failure directly.** The team in the Story above can confirm "too few blocks" without a profiler, just from the launch configuration and device identity:

```text
$ nvidia-smi --query-gpu=name --format=csv,noheader
NVIDIA H100 80GB HBM3
```

An H100 has 132 SMs. A kernel launched with a grid of, say, 40 blocks — one thread block per output tile in a small matrix — can place at most 40 blocks total across 132 SMs; even with perfect scheduling, roughly 92 SMs receive no work at all for that kernel's entire duration. This is checkable from the launch configuration alone (`&lt;&lt;&lt;blocks, threads&gt;>>` in the source, or the equivalent framework log) cross-referenced against the device's SM count — no profiler required to catch the most common version of this bug.

## Threads

A GPU thread is a logical execution instance of a kernel. Each thread receives an index and usually operates on a different element or region of data.

For example, a vector-addition kernel may assign one output element to each thread. All threads run the same kernel code, but their indices lead them to different data.

Threads have private state such as registers and local variables. They can cooperate with threads in the same block through shared memory and block-level synchronization.

## Thread Blocks

A thread block is a group of threads that can cooperate efficiently. The block is the unit of placement on an SM.

Important properties include:

- All threads in a block execute on the same SM during the block's lifetime.
- Threads in a block can share on-chip shared memory.
- Threads in a block can synchronize at block-level barriers.
- Blocks should be independent so they can run in any order.

Block independence is what makes the programming model scalable. A grid can execute on a small GPU with fewer SMs or a larger GPU with more SMs without changing the algorithm.

## Grids

A grid is the complete collection of thread blocks created by one kernel launch. The grid describes the total amount of parallel work.

A grid with too few blocks may underfill the GPU. A grid with many blocks gives the scheduler more freedom to distribute work and recover from differences in block execution time.

```mermaid
flowchart LR
    Grid[Grid: 12 Blocks]
    SM0[SM 0]
    SM1[SM 1]
    SM2[SM 2]
    SM3[SM 3]

    Grid --> SM0
    Grid --> SM1
    Grid --> SM2
    Grid --> SM3
```

**Figure 2.3.2 — Blocks distributed across SMs.** The hardware assigns blocks to available SMs. As blocks finish, additional blocks can be scheduled.

## Warps

A warp is a hardware-managed group of threads that execute instructions together. NVIDIA GPUs traditionally use warps of 32 threads.

Application code usually defines threads and blocks. The hardware partitions each block into warps. A block of 256 threads contains eight warps.

The warp matters because instruction issue occurs at warp granularity. Threads in the warp share an instruction stream, although predicates can disable individual lanes for particular instructions.

## Branch Divergence

When threads in the same warp take different control-flow paths, the warp may need to execute each path separately while disabling threads that do not belong to that path.

```mermaid
flowchart TD
    Warp[One Warp]
    Branch{Condition}
    PathA[Execute Path A for Some Lanes]
    PathB[Execute Path B for Remaining Lanes]
    Join[Reconverge]

    Warp --> Branch
    Branch --> PathA --> Join
    Branch --> PathB --> Join
```

**Figure 2.3.3 — Simplified divergence.** Different paths inside one warp reduce the number of active lanes during each path.

Divergence is most harmful when it is frequent, long-lived, and evenly splits threads across complex paths. Not every branch is expensive. Uniform branches, where all threads choose the same path, do not create the same penalty.

## Block Residency

An SM can hold multiple blocks at once if resources permit. Residency depends on limits such as:

- Threads per SM
- Blocks per SM
- Warps per SM
- Registers per SM
- Shared memory per SM
- Architectural scheduling limits

A block that uses large amounts of shared memory or many registers per thread may reduce the number of blocks that can reside concurrently.

| Kernel characteristic | Possible effect |
|---|---|
| Many registers per thread | Fewer resident warps |
| Large shared-memory allocation | Fewer resident blocks |
| Very small blocks | May not use execution resources efficiently |
| Very large blocks | Can reduce scheduling flexibility |
| Few total blocks | Some SMs may remain idle |

## Occupancy

Occupancy is commonly defined as the ratio of active warps on an SM to the maximum number of warps the architecture supports.

Higher occupancy can improve latency hiding because more warps are available while others wait. However, maximum occupancy is not automatically maximum performance.

A kernel with lower occupancy may still perform well if it has:

- High instruction-level parallelism
- Efficient memory access
- Strong data reuse
- Few long-latency stalls

A kernel with high occupancy may still perform poorly if it is bandwidth-bound, divergent, or dominated by synchronization.

:::important
Treat occupancy as a diagnostic dimension, not a score. The correct question is whether the kernel has enough active work to hide its dominant latencies.
:::

## Scheduling Inside an SM

An SM maintains state for resident warps. Warp schedulers select ready warps and issue instructions to execution pipelines.

```mermaid
sequenceDiagram
    participant A as Warp A
    participant B as Warp B
    participant S as Warp Scheduler
    participant E as Execution Pipeline
    participant M as Memory

    S->>A: Issue load
    A->>M: Request data
    S->>B: Issue arithmetic
    B->>E: Execute
    M-->>A: Data ready
    S->>A: Issue dependent arithmetic
```

**Figure 2.3.4 — Warp scheduling hides latency.** The scheduler issues another ready warp while Warp A waits for memory.

This scheduling is inexpensive because the state of many threads already resides on the SM. The GPU does not perform a heavyweight operating-system context switch between these warps.

## Mapping Work to Data

A well-designed kernel maps thread indices to data in a way that supports efficient access and balanced work.

Common mapping problems include:

- Threads in one warp accessing scattered memory locations
- Some blocks receiving far more work than others
- Dimensions that create partially filled warps
- More synchronization than the algorithm requires
- Too little work per kernel launch

These problems originate in application design but appear as infrastructure symptoms such as low utilization, long runtimes, or poor scaling.

## Architecture Trade-offs

### Smaller blocks

Advantages:

- More placement flexibility
- Lower per-block resource demand
- Useful for irregular workloads

Risks:

- Too few warps per block
- Poor execution-resource utilization
- More block-management overhead relative to work

### Larger blocks

Advantages:

- More threads available for cooperation
- Potentially efficient shared-memory tiling
- More warps per resident block

Risks:

- Higher register and shared-memory pressure
- Fewer resident blocks
- Reduced scheduling flexibility

The correct size depends on resource usage and workload structure.

## Production Troubleshooting

### Problem: Newer GPU provides little speedup

Check:

1. Total number of blocks
2. Blocks per SM
3. Kernel duration
4. Register and shared-memory limits
5. Memory bandwidth and transfer time
6. Whether the application serializes launches

### Problem: Utilization oscillates

Possible causes:

- Bursty kernel launches
- CPU preprocessing gaps
- Small grids
- Frequent synchronization
- Request batching that is too small

### Problem: High occupancy but poor performance

Possible causes:

- Uncoalesced memory access
- Branch divergence
- Bandwidth saturation
- Excess synchronization
- Low arithmetic intensity

**Turning "newer GPU provides little speedup" into evidence.** Compare block count against SM count on both devices directly, rather than assuming the newer, larger GPU should automatically scale:

```text
$ nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader
NVIDIA A100 80GB PCIe, 8.0
```
```text
$ nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader
NVIDIA H100 80GB HBM3, 9.0
```

An A100 has 108 SMs; an H100 has 132. A grid launched with a fixed 100 blocks — a common result of sizing the grid to one older GPU's SM count during initial development — places roughly one block per SM on the A100 (near-full occupancy) but leaves the H100 with 100 of its 132 SMs used and 32 idle. This is the concrete mechanism behind "little speedup": the newer device isn't underperforming, the launch geometry was never updated to use its extra capacity. Fix: size grids from the workload's total independent work, not from an assumption about SM count baked in at development time.

**Turning "utilization oscillates" into evidence.** A `dmon` trace sampled across several request cycles shows the actual shape of the oscillation, which then points at a layer:

```text
$ nvidia-smi dmon -s u -c 6
# gpu    sm   mem
# Idx      %     %
    0     91    88
    0      2     1
    0      2     1
    0     89    85
    0      2     1
    0      2     1
```

A clean two-idle-samples-per-one-busy-sample pattern, repeating regularly rather than randomly, points at a request/batching cadence problem upstream of the kernel itself (e.g., a batching window releasing work every ~3 seconds) rather than at a within-kernel inefficiency — which is the distinction between "small grids" and "request batching that is too small" in the list above, and it is visible directly in the *shape* of the trace, not just its average.

## Customer Scenario

A customer sizes a cluster using only GPU count. Their inference service processes one request at a time with small batches. Each request launches kernels that expose little parallel work. Adding GPUs reduces queueing only slightly because individual requests still underfill each device.

The architectural options include batching, request concurrency, smaller GPU partitions, or a GPU class better matched to the workload. Purchasing larger GPUs without changing execution geometry may increase idle capacity.

## Interview Preparation

### Conceptual Questions

1. What is the difference between a thread block and a warp?
**Model answer:** "A block is a software-defined cooperative group — up to 1,024 threads that the programmer says should be able to share memory and synchronize, and that the hardware guarantees will run on the same SM. A warp is the hardware's own execution granularity underneath that — 32 threads the scheduler actually issues instructions to as a unit. A block of 256 threads is, under the hood, 8 warps; the programmer thinks in blocks, the scheduler operates in warps."

2. Why must all threads in a block execute on the same SM?
**Model answer:** "Because block-level cooperation — shared memory and `__syncthreads()` barriers — only works if every thread in the block has physical access to the same on-chip shared memory and can actually be resumed and synchronized together. If the runtime could split a block across two SMs, there'd be no fast local memory both halves could reach, which is the entire reason blocks exist as a grouping in the first place."

3. Why is maximum occupancy not always the goal?
**Model answer:** "Because occupancy only measures how much warp state is resident — it says nothing about whether that state is doing useful, non-redundant work. I'd cite the chapter's own example: a kernel using large shared-memory tiles can have lower occupancy than a naive version but run faster because it reuses data instead of re-fetching it from HBM repeatedly. Occupancy is a means to hide latency, not a score to maximize independently of what's actually limiting the kernel."

### Architecture Questions

1. Draw the path from kernel launch to warp execution.
**Model answer:** "Kernel launch creates a grid; the grid is a fixed number of thread blocks. The GPU's work distributor hands blocks to SMs that have enough free registers, shared memory, and warp slots to admit them — that admission check is itself a bottleneck if I've sized the kernel wrong. Once a block is resident, the hardware splits its threads into warps of 32, and each SM's warp scheduler picks eligible warps and issues their next instruction to an execution pipeline. The thing I'd point at while drawing it: the block-to-SM assignment is where 'grid too small for this GPU' actually bites — if blocks &lt; SM count, some SMs never get a block, permanently, for this kernel's whole runtime."

2. Explain which resources limit block residency.
**Model answer:** "Five things, and the tightest one wins: threads per SM, warps per SM, registers per SM divided by the kernel's registers/thread, shared memory per SM divided by the kernel's shared-memory/block, and the architectural cap on resident block count itself. I'd check `nvcc -Xptxas=-v` for registers/thread and the kernel's shared-memory request, then divide each against the SM's known limits — whichever gives the smallest number of resident blocks is the actual constraint, and tuning any other resource won't move it."

3. Describe how warp scheduling hides latency.
**Model answer:** "The scheduler keeps multiple warps resident and switches between them on stalls instead of blocking. If Warp A issues a load and has to wait hundreds of cycles for HBM, the scheduler doesn't idle — it looks at other resident warps, finds one that's eligible (operands ready, no dependency stall), and issues its instruction instead. This is cheap because all those warps' register state already lives on the SM — there's no save/restore like an OS context switch. It only works, though, if there's actually another eligible warp to switch to, which is why grid size and occupancy matter."

### Scenario Questions

1. A grid contains fewer blocks than the GPU has SMs. What happens?
**Model answer:** "Some SMs get one block, and the rest get zero blocks for that kernel's entire execution — there's no partial-block sharing or automatic re-splitting to spread work more evenly. If I ran `nvidia-smi dmon -s u` during that kernel, I'd expect to see `sm%` well under 100% the whole time, not because any SM is inefficient but because a fraction of them are doing literally nothing. The fix is grid size, not GPU size."

2. A kernel has high register use and low occupancy. Is that necessarily bad?
**Model answer:** "Not necessarily — I'd want to know why the registers are being used before assuming it's a problem. If those registers are holding genuinely reused values that would otherwise be re-fetched from memory repeatedly, low occupancy with high per-thread efficiency can beat high occupancy with more memory traffic. I'd check `nvcc -Xptxas=-v` for spill loads/stores — if there are none, and runtime is good, I'd leave it alone rather than 'fixing' the occupancy number for its own sake."

3. Threads in a warp follow different long code paths. What performance effect do you expect?
**Model answer:** "Divergence: the warp executes each path serially, once per distinct branch outcome present among its 32 lanes, with the non-matching lanes masked off and doing no useful work during that pass. If it's a clean two-way split with long, expensive paths, I'd expect roughly double the instruction-issue time for that warp compared to a uniform branch, and I'd check active-lane efficiency in a profiler to confirm rather than guessing from utilization alone, since utilization would still look 'busy' even though a large fraction of lanes are idle on any given pass."

## Summary

The GPU execution hierarchy separates logical parallel work from physical hardware. Applications launch grids of thread blocks. Blocks are assigned to SMs. The hardware divides their threads into warps and schedules ready warps onto execution pipelines.

Performance depends on exposing enough independent work while respecting finite register, shared-memory, and scheduling resources. Occupancy, divergence, and launch geometry are tools for reasoning about that balance.

## Key Takeaways

- Threads are logical kernel instances.
- Blocks are cooperative groups and the unit of SM placement.
- Warps are the practical instruction-issue groups.
- SMs keep multiple warps resident to hide latency.
- Occupancy is useful only in the context of the workload's bottleneck.

## Cross References

- Previous: [Inside a Modern NVIDIA GPU](./chapter-02-inside-a-modern-nvidia-gpu)
- Volume introduction: [GPU Architecture](./index)
- Related lab: [Inspect GPU Architecture and Topology](./labs/lab-01-inspect-gpu-architecture-and-topology)
