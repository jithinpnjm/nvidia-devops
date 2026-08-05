---
title: Kernel Launch Configuration and Indexing
description: Understand how CUDA launch dimensions map logical threads to data and how launch geometry affects correctness, scalability, and efficiency.
sidebar_position: 5
tags:
  - cuda
  - kernel-launch
  - indexing
  - thread-blocks
---

# Kernel Launch Configuration and Indexing

## Introduction

A CUDA kernel does not decide how many times it runs. The host application launches the kernel with an execution configuration that describes a grid of thread blocks. Every logical thread executes the same kernel function, but built-in coordinates allow each thread to select a different element, tile, row, column, or region of data.

This separation is one of CUDA's most important design choices. The algorithm describes what one logical worker does. The launch configuration describes how much parallel work exists. If the mapping is correct, the same kernel can process a small array on one GPU or a much larger array on a different GPU without binding application logic to a specific number of Streaming Multiprocessors.

Launch geometry is therefore not cosmetic syntax. It determines whether every element is processed exactly once, whether the GPU receives enough independent work, whether memory accesses are efficient, and whether resource limits reduce residency.

| Chapter field | Value |
|---|---|
| Volume | 03 — CUDA Fundamentals |
| Difficulty | Foundation |
| Estimated reading time | 45 minutes |
| Primary focus | Grid, block, and thread indexing |
| Previous | CUDA Programming and Execution Model |
| Next | CUDA Memory Management and Data Movement |

## Story

A team ports a CPU loop to CUDA. The program works for an array of one million elements but fails when the input size changes. Some outputs remain untouched. When the team increases the block size, the program begins writing beyond the end of the allocation.

The kernel contains a correct arithmetic expression, but the launch and indexing logic are incomplete. The application assumes that the number of threads always matches the number of elements. Production workloads rarely preserve that assumption.

The robust pattern is to launch enough threads, compute a global index, and guard accesses that fall outside the logical problem size.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain the relationship between a grid, block, and thread.
- Calculate one-dimensional and multidimensional global indices.
- Select a launch configuration that covers an arbitrary problem size.
- Explain why bounds checks are required.
- Recognize underfilled grids, oversized blocks, and indexing defects.
- Describe grid-stride loops and when they are useful.

## Big Picture

```mermaid
flowchart TD
    Host[Host Application]
    Config[Choose Grid and Block Dimensions]
    Launch[Launch Kernel]
    Grid[Grid]
    Blocks[Thread Blocks]
    Threads[Logical Threads]
    Index[Compute Global Index]
    Data[Process Assigned Data]

    Host --> Config --> Launch --> Grid --> Blocks --> Threads --> Index --> Data
```

**Figure 3.4.1 — Launch-to-data mapping.** The host defines the execution geometry. Each thread converts its coordinates into a logical data index before accessing memory.

## The Execution Configuration

A common launch uses the form:

```cpp
kernel<<<grid_dim, block_dim>>>(arguments);
```

The launch parameters describe dimensions, not physical processors.

- `block_dim` specifies the number and shape of threads in each block.
- `grid_dim` specifies the number and shape of blocks in the grid.
- An optional dynamic shared-memory size may be supplied.
- An optional stream identifies the execution queue.

The runtime schedules blocks onto available SMs. The application does not choose a particular SM for a block.

## One-Dimensional Indexing

For an array, each thread commonly computes:

```cpp
int index = blockIdx.x * blockDim.x + threadIdx.x;
```

The expression combines:

- the block's position in the grid,
- the number of threads per block,
- the thread's position in the block.

```mermaid
flowchart LR
    B0[Block 0]
    B1[Block 1]
    B2[Block 2]
    T0[Threads 0 to B-1]
    T1[Threads B to 2B-1]
    T2[Threads 2B to 3B-1]

    B0 --> T0
    B1 --> T1
    B2 --> T2
```

**Figure 3.4.2 — One-dimensional global indexing.** Each block owns a contiguous range of logical thread indices when the standard formula is used.

For a problem containing `N` elements, the number of blocks is commonly calculated with ceiling division:

```cpp
int blocks = (N + threads_per_block - 1) / threads_per_block;
```

This creates enough threads to cover the final partial block.

## Bounds Checks

When `N` is not divisible by the block size, the final block contains threads whose indices exceed the valid range. Those threads must not access the array.

```cpp
__global__ void scale(float* values, int n, float factor) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;

    if (i < n) {
        values[i] *= factor;
    }
}
```

The branch is not an optional defensive feature. It is part of the logical mapping between execution capacity and problem size.

:::caution
A kernel can complete without reporting an obvious error while still corrupting adjacent device memory. Correct launch coverage does not replace bounds validation.
:::

## Two-Dimensional Indexing

Images, matrices, and grids are naturally represented with two-dimensional blocks and grids.

```cpp
int column = blockIdx.x * blockDim.x + threadIdx.x;
int row = blockIdx.y * blockDim.y + threadIdx.y;
```

A row-major matrix element can then be addressed as:

```cpp
int offset = row * width + column;
```

Both dimensions require bounds checks:

```cpp
if (row < height && column < width) {
    output[row * width + column] = input[row * width + column];
}
```

```mermaid
flowchart TD
    Grid[Two-Dimensional Grid]
    Block00[Block 0,0]
    Block10[Block 1,0]
    Block01[Block 0,1]
    Tile00[Data Tile 0,0]
    Tile10[Data Tile 1,0]
    Tile01[Data Tile 0,1]

    Grid --> Block00 --> Tile00
    Grid --> Block10 --> Tile10
    Grid --> Block01 --> Tile01
```

**Figure 3.4.3 — Two-dimensional tiling.** Blocks map naturally to rectangular regions while threads map to positions inside each tile.

## Three-Dimensional Indexing

Three-dimensional launch dimensions are useful for volumes, simulation domains, batched tensors, and other structured data. The same principle applies: combine block and thread coordinates for each dimension, then convert the coordinates to the application's memory layout.

The GPU does not know whether `x`, `y`, and `z` represent width, height, depth, batches, channels, or another abstraction. The application defines that meaning.

## Selecting Threads Per Block

There is no universal block size. The choice must satisfy correctness and architectural constraints.

Common considerations include:

| Consideration | Why it matters |
|---|---|
| Warp size | Blocks are divided into warps; partially filled warps waste lanes |
| Registers per thread | High use can reduce resident blocks and warps |
| Shared memory per block | Large allocations reduce residency |
| Work shape | Two-dimensional tiles may match matrix or image access |
| Memory access | Adjacent lanes should ideally access adjacent data |
| Total block count | The grid must expose enough work for all SMs |

A multiple of the warp size is often a reasonable starting point for one-dimensional work, but measurement should decide the final configuration.

## Too Few Blocks

A large block does not compensate for a grid containing too few blocks. Blocks cannot be split across SMs. If a launch creates four blocks on a GPU with many more SMs, most of the device may remain idle.

```mermaid
flowchart LR
    Grid[Grid with 4 Blocks]
    SM0[SM 0 Busy]
    SM1[SM 1 Busy]
    SM2[SM 2 Busy]
    SM3[SM 3 Busy]
    Idle[Remaining SMs Idle]

    Grid --> SM0
    Grid --> SM1
    Grid --> SM2
    Grid --> SM3
    Grid -. no blocks available .-> Idle
```

**Figure 3.4.4 — Grid underfill.** The hardware cannot manufacture parallel work that the application did not launch.

## Oversized Blocks

A block must remain within architectural limits, including maximum threads per block and per-dimension limits. Even a legal block can perform poorly if its register or shared-memory demand permits too few resident blocks.

An oversized block may also reduce scheduling flexibility. If one long-running block monopolizes resources, the SM may have fewer independent warps available to hide latency.

## Grid-Stride Loops

A grid-stride loop lets one thread process multiple elements separated by the total number of threads in the grid.

```cpp
__global__ void scale(float* values, int n, float factor) {
    for (int i = blockIdx.x * blockDim.x + threadIdx.x;
         i < n;
         i += blockDim.x * gridDim.x) {
        values[i] *= factor;
    }
}
```

This pattern is useful when:

- the input may be much larger than a practical fixed grid,
- the application wants to control the number of blocks,
- each thread can safely process multiple independent elements,
- persistent or reusable worker patterns are beneficial.

Grid-stride loops do not remove the need for efficient memory access. The first iteration should still map adjacent lanes to adjacent data where practical.

## Launches Are Asynchronous

A kernel launch normally queues work and returns control to the host before the GPU finishes. This behavior allows overlap, but it also means an error may not become visible at the launch statement.

The host must distinguish:

1. launch-configuration errors detected immediately,
2. execution errors reported when the stream or device is synchronized.

Later chapters cover streams and asynchronous execution in depth. For now, remember that a successful function return does not prove that the kernel completed correctly.

## Production Architecture

In production frameworks, launch geometry is usually generated by libraries or compiled kernels rather than written directly by platform engineers. Even so, launch behavior appears in operational evidence:

- many tiny kernels create launch overhead and synchronization pressure,
- grids with too few blocks underfill larger GPUs,
- large resource-heavy blocks reduce residency,
- incorrect shape assumptions cause memory faults,
- new input dimensions expose indexing defects,
- dynamic batching changes grid dimensions and execution efficiency.

Platform teams should preserve workload shape, software version, kernel trace, and profiler evidence when escalating a performance regression.

## Production Troubleshooting

### Problem: Some output elements are unchanged

**Symptoms**

- Correct values at the beginning of the array
- Missing values near the end
- Behavior changes with input size

**Likely cause**

The grid does not launch enough threads, or the indexing expression does not cover the full problem.

**Diagnosis**

Calculate:

```text
total threads = gridDim.x × blockDim.x
```

Compare the result with the logical element count and inspect the bounds condition.

### Problem: Illegal memory access after changing block size

**Likely cause**

The kernel lacks a correct bounds check, or multidimensional coordinates are converted to a linear offset incorrectly.

**Resolution**

Validate each dimension before accessing memory and test non-divisible input sizes.

### Problem: Larger GPU gives little improvement

Check:

- total blocks,
- blocks per SM,
- kernel duration,
- resource use per block,
- synchronization between launches,
- whether the workload is memory-bound.

## Customer Scenario

A customer migrates an image-processing service to a newer GPU. The kernels use a fixed grid sized for the previous maximum image resolution. Larger images silently leave rows unprocessed, while smaller images waste substantial work.

The architect recommends deriving grid dimensions from each request shape, validating both image dimensions, and adding correctness tests for odd widths and heights. Performance tuning begins only after the mapping is proven correct.

## Interview Preparation

### Conceptual Questions

1. What is the difference between grid dimensions and block dimensions?
2. Why is a bounds check necessary when using ceiling division?
3. Why can too few blocks underutilize a large GPU?

### Architecture Questions

1. Draw the mapping from a kernel launch to a one-dimensional array.
2. Explain how a two-dimensional block maps to a row-major matrix.
3. Describe the trade-offs involved in selecting block size.

### Scenario Questions

1. An application works only when `N` is divisible by 256. What is wrong?
2. A kernel launches one block per GPU. What utilization pattern do you expect?
3. A block size increase reduces runtime on one GPU but worsens it on another. Why?

## Summary

CUDA launch geometry describes logical parallel work using grids, blocks, and threads. Each thread derives a unique data coordinate from built-in indices. Correct code launches enough threads, validates boundaries, and maps coordinates to memory without overlap or omission.

Performance requires more than correctness. The grid must expose enough blocks, the block must respect resource limits, and adjacent lanes should access data efficiently. Launch configuration is therefore both a correctness contract and a performance decision.

## Key Takeaways

- A kernel launch creates a grid of thread blocks.
- Threads compute data indices from block and thread coordinates.
- Ceiling division requires bounds checks in the final partial block.
- Too few blocks can leave many SMs idle.
- Block size must balance work shape, memory access, and resource use.
- Grid-stride loops support scalable processing with controlled grid size.

## Cross References

- Previous: [CUDA Programming and Execution Model](./chapter-03-cuda-programming-and-execution-model)
- Next: [CUDA Memory Management and Data Movement](./chapter-05-cuda-memory-management-and-data-movement)
- Related lab: [Build and Validate a CUDA Vector Pipeline](./labs/lab-02-build-and-validate-a-cuda-vector-pipeline)
