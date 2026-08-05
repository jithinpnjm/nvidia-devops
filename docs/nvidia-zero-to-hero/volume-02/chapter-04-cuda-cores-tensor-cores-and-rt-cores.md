---
title: CUDA Cores, Tensor Cores, and RT Cores
description: Understand why modern NVIDIA GPUs contain different execution engines and how each engine maps to specific workload patterns.
sidebar_position: 4
tags:
  - gpu-architecture
  - cuda-cores
  - tensor-cores
  - rt-cores
  - foundations
---

# CUDA Cores, Tensor Cores, and RT Cores

## Introduction

A modern GPU is not built from one repeated arithmetic unit. It contains several execution engines, each optimized for a different class of work. This is easy to misunderstand because product specifications often reduce the architecture to counts: CUDA Cores, Tensor Cores, RT Cores, clock rates, and theoretical throughput.

Those numbers are useful only after the reader understands what each engine is designed to execute. A CUDA Core is not simply a slower Tensor Core. A Tensor Core is not a replacement for general-purpose arithmetic. An RT Core is not an AI accelerator. Each exists because different workloads place different demands on the hardware.

This chapter explains why NVIDIA introduced specialized execution engines, how work reaches them, and why software determines whether the hardware is used effectively.

| Chapter field | Value |
|---|---|
| Volume | 02 - GPU Architecture |
| Difficulty | Foundation |
| Estimated reading time | 40 minutes |
| Primary focus | GPU execution engines |
| Previous chapter | Threads, Warps, Blocks, and Streaming Multiprocessors |
| Next chapter | GPU Memory Hierarchy |

## Story

A platform team compares two inference workloads on the same GPU. The first workload performs traditional preprocessing and custom CUDA kernels. The second performs large matrix multiplications using an optimized deep learning framework. Both workloads report high GPU utilization, but the second finishes much faster.

The team initially assumes the difference comes from better code. That is only part of the answer. The framework is dispatching matrix operations to Tensor Cores, while the custom kernels are using general arithmetic pipelines. The same physical GPU is behaving like two different machines because different execution engines are active.

The lesson is architectural: utilization percentages do not explain which part of the GPU is doing useful work.

## Learning Objectives

After completing this chapter, you will be able to:

- Explain why GPUs use specialized execution engines.
- Distinguish CUDA Cores, Tensor Cores, and RT Cores by workload type.
- Describe how warps issue instructions to different execution pipelines.
- Explain why software libraries determine access to specialized hardware.
- Diagnose cases where a workload fails to use the expected engine.

## Big Picture

Inside a Streaming Multiprocessor, multiple execution pipelines coexist. The warp scheduler selects ready warps and issues instructions to the pipeline that can execute the required operation.

```mermaid
flowchart LR
    Warp[Ready Warp]
    Decode[Instruction Decode]
    FP[General Arithmetic Pipeline]
    Tensor[Tensor Pipeline]
    RT[Ray-Tracing Pipeline]
    LSU[Load and Store Units]
    SFU[Special Function Units]

    Warp --> Decode
    Decode --> FP
    Decode --> Tensor
    Decode --> RT
    Decode --> LSU
    Decode --> SFU
```

**Figure 2.4.1 - Specialized execution inside an SM.** A warp does not choose a core directly. Its instructions are decoded and routed to the appropriate pipeline.

The exact arrangement varies by GPU generation, but the principle remains stable: general arithmetic, matrix acceleration, memory operations, special functions, and ray-tracing work are handled by different resources.

## Why Specialization Exists

General-purpose hardware is flexible, but flexibility consumes transistors, power, and time. When an operation appears frequently enough, implementing a dedicated datapath can produce more useful work per clock and per watt.

AI workloads repeatedly execute dense matrix operations. Graphics workloads repeatedly evaluate ray and geometry intersections. General compute workloads still require scalar arithmetic, comparisons, address calculations, and control logic. A single universal pipeline would either waste resources or perform specialized work inefficiently.

| Workload pattern | Best-suited engine | Reason |
|---|---|---|
| Scalar and vector arithmetic | CUDA Core pipelines | Flexible execution of general instructions |
| Matrix multiply-accumulate | Tensor Cores | High-throughput fused matrix operations |
| Ray traversal and intersection | RT Cores | Dedicated acceleration for ray-tracing algorithms |
| Memory movement | Load/store units | Address generation and memory transactions |
| Transcendental math | Special function units | Hardware support for selected complex functions |

Specialization improves efficiency, but it also creates a software responsibility. Applications must express work in a form that libraries and compilers can map to the correct engine.

## CUDA Cores

The term **CUDA Core** is commonly used for arithmetic execution lanes that process general-purpose floating-point and integer instructions. They are the most flexible compute resources in the GPU.

CUDA Cores participate in operations such as:

- floating-point addition and multiplication
- integer arithmetic
- logical operations
- address calculations
- comparisons
- portions of custom CUDA kernels

A warp instruction operates across active threads. The scheduler issues that instruction to an eligible execution pipeline. The hardware then processes the instruction over one or more cycles depending on pipeline width, instruction type, dependencies, and active lanes.

:::note
A CUDA Core count is not directly comparable across GPU generations. Pipeline organization, clock rate, instruction support, scheduling, data type, and memory behavior all influence real performance.
:::

### When CUDA Cores dominate

CUDA Core pipelines are heavily used when workloads contain custom element-wise operations, control-heavy kernels, reductions, indexing, preprocessing, post-processing, or arithmetic that cannot be represented as large tensor operations.

They are also essential around Tensor Core operations. A neural network does not consist only of matrix multiplication. Data preparation, activation functions, normalization, memory movement, indexing, and control still require general execution resources.

## Tensor Cores

Tensor Cores were introduced to accelerate matrix multiply-accumulate operations. Conceptually, they evaluate a pattern similar to:

```text
D = A × B + C
```

where `A`, `B`, `C`, and `D` are matrix fragments. The hardware performs many multiply-accumulate operations as a coordinated unit rather than issuing each multiplication and addition separately through general arithmetic lanes.

```mermaid
flowchart LR
    A[Matrix A Tile]
    B[Matrix B Tile]
    C[Accumulator Tile]
    TC[Tensor Core Operation]
    D[Result Tile]

    A --> TC
    B --> TC
    C --> TC
    TC --> D
```

**Figure 2.4.2 - Tensor Core operation.** Tensor Cores accelerate structured matrix operations using tiles and supported data types.

Tensor Cores are useful because training and inference workloads spend substantial time in matrix multiplication, convolution, attention, and related linear algebra. Frameworks and libraries such as cuBLAS, cuDNN, TensorRT, and deep learning frameworks can transform higher-level operations into Tensor Core instructions.

### Data types matter

Tensor Core behavior depends on the GPU generation and supported numerical formats. Lower-precision formats can increase throughput and reduce memory traffic, but they may affect numerical behavior. Software often combines lower-precision inputs with higher-precision accumulation to balance speed and accuracy.

Architects should avoid treating “Tensor Core enabled” as a binary property. Real use depends on:

- tensor dimensions and alignment
- selected data type
- framework and library versions
- kernel implementation
- model structure
- precision policy
- memory layout

### Why Tensor Cores may remain idle

A workload can run on a GPU without using Tensor Cores. Common causes include unsupported dimensions, unsupported precision, unoptimized kernels, small operations, framework configuration, or graph transformations that prevent efficient fusion.

High overall GPU utilization therefore does not prove effective Tensor Core usage.

## RT Cores

RT Cores accelerate ray-tracing operations used in graphics, rendering, simulation, visualization, and some spatial workloads. They are designed to reduce the cost of traversing acceleration structures and testing ray intersections.

```mermaid
flowchart LR
    Ray[Ray]
    BVH[Spatial Acceleration Structure]
    Traverse[Traversal]
    Test[Intersection Test]
    Hit[Hit or Miss]

    Ray --> Traverse
    BVH --> Traverse
    Traverse --> Test --> Hit
```

**Figure 2.4.3 - Simplified RT Core workflow.** Dedicated hardware accelerates traversal and intersection operations that would otherwise consume general compute resources.

RT Cores are important in visualization and digital-twin workflows, but they should not be confused with Tensor Cores. Their purpose is geometric acceleration, not general AI matrix execution.

## Internal Working

A kernel is compiled into instructions. At runtime, warps become eligible when their operands are ready and required resources are available. The scheduler selects a warp and issues its next instruction.

```mermaid
sequenceDiagram
    participant W as Warp
    participant S as Warp Scheduler
    participant D as Decoder
    participant G as General Pipeline
    participant T as Tensor Pipeline
    participant M as Memory Pipeline

    W->>S: Ready for issue
    S->>D: Select next instruction
    alt General arithmetic
        D->>G: Issue arithmetic instruction
        G-->>W: Complete result
    else Matrix operation
        D->>T: Issue tensor instruction
        T-->>W: Complete matrix fragment
    else Memory operation
        D->>M: Issue load or store
        M-->>W: Return data or completion
    end
```

**Figure 2.4.4 - Instruction routing.** The scheduler chooses a warp, while the instruction type determines which pipeline executes the work.

Execution engines can become imbalanced. A workload may saturate Tensor Cores while waiting on memory. Another may leave Tensor Cores idle while general pipelines perform indexing and element-wise operations. Performance engineering requires identifying the active bottleneck rather than assuming every engine should be fully utilized.

## Architecture Considerations

### Throughput is pipeline-specific

Theoretical GPU throughput is usually quoted for a specific data type and operation class. FP32 arithmetic throughput, low-precision Tensor Core throughput, and ray-tracing performance measure different capabilities. They should not be combined into a single generic performance number.

### Memory can dominate compute

Specialized engines are useful only when data arrives fast enough. Tensor Cores can complete matrix operations rapidly, but they still depend on registers, shared memory, caches, and HBM. Poor tiling or low data reuse can make a Tensor Core kernel memory-bound.

### Workload diversity matters

An inference service may contain tokenization on CPU, embeddings, attention, normalization, sampling, and network response handling. Only part of the request uses Tensor Cores. End-to-end performance therefore depends on the whole pipeline.

## Production Deployment

In production, engine utilization is influenced by software choice. Teams should validate representative models using the exact framework, precision mode, batch profile, sequence length, and runtime configuration planned for deployment.

A useful validation sequence is:

1. Confirm the workload executes correctly.
2. Measure end-to-end latency and throughput.
3. Profile kernel categories.
4. Confirm expected data types.
5. Check whether matrix operations use optimized libraries.
6. Inspect memory behavior and occupancy.
7. Compare results against a known baseline.

Do not optimize by core count alone. Select systems based on workload evidence.

## Production Troubleshooting

### Problem: Tensor Cores appear underused

| Symptom | Possible cause | Investigation |
|---|---|---|
| High GPU utilization but low model throughput | General kernels dominate | Profile kernel mix |
| Matrix kernels use general pipelines | Unsupported precision or shape | Inspect framework and kernel configuration |
| Tensor kernels are present but short | Small batches or small matrices | Test representative batching |
| Tensor kernels wait frequently | Memory bottleneck | Inspect memory throughput and stalls |

### Problem: Upgrading hardware does not improve latency

A newer GPU may provide much higher Tensor Core throughput, but the application may be CPU-bound, memory-bound, network-bound, or dominated by small sequential operations. Compare request-stage latency rather than assuming the GPU is the only limiting component.

### Problem: RT Core count is used to justify an AI purchase

This is a requirements error. RT Cores may be valuable for visualization or simulation, but they are not a substitute for Tensor Core suitability, memory capacity, memory bandwidth, and software compatibility in AI workloads.

## Customer Scenario

A customer asks why two GPUs with similar power envelopes perform differently on the same model. A strong architect does not answer with core counts alone. The architect examines precision, memory capacity, memory bandwidth, Tensor Core generation, software stack, batch size, model shape, and end-to-end bottlenecks.

The recommendation should explain which execution engines the workload actually uses and whether the rest of the system can feed them efficiently.

## Interview Preparation

### Conceptual Questions

1. Why do modern GPUs contain specialized execution engines?
2. How do CUDA Cores differ from Tensor Cores?
3. Why can GPU utilization be high while Tensor Core utilization is low?

### Architecture Questions

1. Explain how a warp instruction reaches an execution pipeline.
2. Design a validation plan for confirming Tensor Core use in an inference workload.
3. Explain why memory architecture still matters when Tensor Core throughput is high.

### Scenario Questions

1. A model becomes faster after switching precision. What changed architecturally?
2. A custom CUDA kernel does not benefit from Tensor Cores. What do you investigate?
3. A customer compares GPUs using only CUDA Core count. How do you correct the analysis?

## Summary

Modern NVIDIA GPUs combine general and specialized execution engines. CUDA Core pipelines provide flexible arithmetic. Tensor Cores accelerate structured matrix operations. RT Cores accelerate ray-tracing traversal and intersection work. Additional units handle memory access and special functions.

The software stack determines whether these engines are used effectively. Core counts alone do not explain performance. Architects must connect workload structure, data type, libraries, memory behavior, and end-to-end system constraints.

## Key Takeaways

- Different GPU engines exist because different workloads benefit from different datapaths.
- CUDA Cores provide flexible general arithmetic.
- Tensor Cores accelerate supported matrix operations.
- RT Cores target ray-tracing and spatial workloads.
- Utilization must be interpreted by pipeline and workload stage.
- Specialized compute is valuable only when memory and software can feed it.

## Cross References

- Previous: [Threads, Warps, Blocks, and Streaming Multiprocessors](./chapter-03-threads-warps-blocks-and-sms)
- Next: [GPU Memory Hierarchy](./chapter-05-gpu-memory-hierarchy)
- Related lab: [Inspect GPU Engine and Memory Behavior](./labs/lab-02-inspect-gpu-engine-and-memory-behavior)
