---
title: "Masterclass 1: GPU Compute Architecture & Evolution"
description: "Expert-level deep dive into NVIDIA GPU execution logic, SMs, Warps, Tensor Cores, and compute evolution."
sidebar_position: 1
tags:
  - gpu-architecture
  - cuda-cores
  - tensor-cores
  - streaming-multiprocessors
---

# Masterclass 1: GPU Compute Architecture & Evolution

## Introduction

Modern NVIDIA GPUs are not merely arrays of execution units. They are complex throughput-oriented machines engineered to hide latency via massive concurrency. For Senior AI Infrastructure Architects, understanding the transition from fixed-function graphics to the Hopper/Blackwell architectures is paramount. You cannot debug a PyTorch bottleneck without understanding how the underlying SM (Streaming Multiprocessor) dispatches instructions, or why Tensor Cores require specific matrix dimensions to reach peak FLOPS.

This masterclass consolidates the architectural foundations, the internal composition of a modern GPU, the thread hierarchy (Threads, Warps, Thread Blocks, Grids), and the physical execution engines (CUDA Cores, Tensor Cores, RT Cores). 

| Chapter field | Value |
|---|---|
| Volume | 02 — GPU Architecture |
| Difficulty | Expert / Masterclass |
| Estimated reading time | 60 minutes |
| Primary focus | Core Compute Architecture, Execution Engines, SM Internals |
| Previous | Volume 01 Summary |
| Next | Masterclass 2: GPU Memory & Topology |

## 1. Architectural Evolution: Latency vs. Throughput

CPUs dedicate massive silicon real estate to branch prediction, out-of-order execution, and huge L1/L2 caches to minimize latency for a single thread. 
GPUs take the inverse approach: they dedicate silicon to ALUs (Arithmetic Logic Units) and registers, explicitly abandoning low-latency execution for a single instruction in favor of massive throughput. 

When a warp (a group of 32 threads) stalls on a memory fetch, the GPU does not wait; the warp scheduler instantly context-switches to another warp whose operands are ready. This zero-overhead context switching is the fundamental paradigm of GPU computing: **hiding latency with math**.

### The Evolution to AI
The transition from graphics to AI workloads was natural because both domains rely on dense linear algebra. The demand for massive matrix multiplication operations led to the creation of the **Tensor Core** in the Volta (V100) architecture, physically replacing scalar FP32 CUDA cores with dedicated MMA (Matrix Multiply-Accumulate) units. By Hopper (H100), Tensor Cores support FP8, FP16, BF16, TF32, and FP64, incorporating asynchronous execution and Hopper's specialized Transformer Engine.

## 2. Inside the Streaming Multiprocessor (SM)

The SM is the fundamental unit of GPU scaling. An H100 SXM5 GPU contains 132 SMs, while an A100 SXM4 contains 108. 

An SM is practically a self-contained processor containing:
- **L1 Instruction Cache:** Fetches instructions.
- **Warp Schedulers and Dispatch Units:** Issue instructions to execution units.
- **Register File:** A massive, intensely banked memory array (e.g., 256KB per SM on A100/H100).
- **Execution Units:** INT32, FP32, FP64, and Tensor Cores.
- **Load/Store Units (LD/ST):** Move data between registers and memory.
- **Special Function Units (SFUs):** Handle transcendentals (sine, cosine, square root).
- **L1 Data Cache / Shared Memory:** A unified pool of fast, on-chip memory configurable by the programmer.

```mermaid
graph TD
    SM[Streaming Multiprocessor] --> L1I[L1 Instruction Cache]
    SM --> L1D[L1 Data Cache / Shared Memory - 228KB on H100]
    
    subgraph Processing Blocks 0-3
        WS[Warp Scheduler] --> Dispatch[Dispatch Unit]
        Dispatch --> Reg[Register File - 64KB per Block]
        Reg --> Cores[Execution Units: FP32, INT32, Tensor Core]
        Reg --> LDST[Load/Store Units]
    end
    
    SM --> Processing Blocks 0-3
```

## 3. The Execution Hierarchy: Threads, Warps, and Blocks

Understanding execution hierarchy is non-negotiable for identifying pipeline stalls.

- **Thread:** The lowest logical unit. Executes a sequential instruction stream.
- **Warp:** The fundamental physical execution unit. A warp consists of 32 threads. The SM always schedules and executes instructions at the warp level. SIMT (Single Instruction, Multiple Threads) dictates that all 32 threads in a warp execute the same instruction simultaneously (with varying data).
- **Thread Block (Cooperative Thread Array - CTA):** A logical grouping of up to 1024 threads (32 warps). A Thread Block is strictly assigned to a **single SM** and never migrates. Threads within a block can synchronize via `__syncthreads()` and share data via Shared Memory.
- **Thread Block Cluster (Hopper Architecture):** Hopper introduced the Cluster, allowing multiple Thread Blocks across different SMs to synchronize and share memory (Distributed Shared Memory) without going through the L2 cache or Global Memory.
- **Grid:** The entire compute task, composed of multiple Thread Blocks.

### Production Bottleneck: The Tail Effect
If a grid launches 133 Thread Blocks on a 132-SM H100 GPU, 132 blocks execute concurrently in "Wave 1". The final 1 block forms "Wave 2". The entire grid cannot complete until Wave 2 finishes, leaving 131 SMs completely idle for the duration of the final block. This is the **Tail Effect**, and it wrecks throughput on poorly dimensioned PyTorch kernels.

## 4. CUDA Cores vs. Tensor Cores vs. RT Cores

### CUDA Cores (Scalar Execution)
"CUDA Core" is a marketing term for a single scalar FPU (Floating Point Unit) or ALU. A modern SM contains separate datapaths for FP32, INT32, and FP64. 
In Ampere and later, NVIDIA optimized the datapaths so that an SM can execute FP32 and INT32 simultaneously, doubling throughput for workloads that mix addressing logic with floating-point math.

### Tensor Cores (Matrix Multiply-Accumulate)
Tensor Cores perform $D = A \times B + C$ in a single hardware cycle per unit. 
While a CUDA core performs 1 FP32 operation per clock, a 4th-Gen Hopper Tensor Core performs incredibly dense block math (e.g., $8 \times 4 \times 8$ FP8 MMA). 
**Alignment Requirement:** To keep Tensor Cores fed, matrix dimensions *must* be multiples of 8 or 16. If your PyTorch Linear layer has an input dimension of 767 instead of 768, the compiler must pad the tensors or fall back to CUDA cores, decimating performance by 10x to 30x.

### RT Cores
Ray Tracing Cores perform Bounding Volume Hierarchy (BVH) traversal and ray-triangle intersection testing in hardware. While primarily for graphics, they are increasingly researched for scientific simulation (e.g., photon mapping, radar cross-section calculation) due to their specialized spatial search capabilities.

## Senior Interview Scenarios

**Scenario 1: The "Utilization vs. Throughput" Paradox**
*The Interviewer asks:* "Our PyTorch inference server shows 100% `gpu_util` in `nvidia-smi`, but our tokens/second is terrible, and the power draw is only 150W on an H100 (TDP 700W). What is happening?"
*Expert Answer:* `nvidia-smi` utilization only measures whether a kernel was active during the polling window, not what the SM was actually doing. Because power draw is 150W, the SMs are practically idle or stalled. We are likely completely bottlenecked on memory bandwidth (waiting on global memory) or bounded by PCIe transfer latency, leaving the execution units starved. The GPU is "100% utilized" just waiting on data. I would immediately run Nsight Compute (`ncu`) to check Warp State Statistics and identify the stall reason (likely `Stall Not Allocated` or `Wait for Memory`).

**Scenario 2: Tensor Core Starvation**
*The Interviewer asks:* "You migrated an LLM from A100 to H100, but performance didn't scale linearly with the TFLOPs specification. Why?"
*Expert Answer:* H100 demands drastically more data to keep its Hopper Tensor Cores fed than A100. If we didn't adjust our kernel tile sizes, or if we are not utilizing Hopper's TMA (Tensor Memory Accelerator) to prefetch data asynchronously directly into shared memory, the Tensor Cores will starve. We need to verify FP8 utilization, confirm we are leveraging the Transformer Engine, and check Nsight Systems to ensure we aren't suffering from CPU-side launch latency or PCIe bottlenecks now that the execution is completing faster.
