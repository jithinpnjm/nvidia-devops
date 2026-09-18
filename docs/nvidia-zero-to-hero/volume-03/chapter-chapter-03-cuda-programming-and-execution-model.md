---
title: "Chapter 3 — The CUDA Programming and Execution Model"
slug: "/nvidia-zero-to-hero/volume-03/cuda-programming-and-execution-model"
sidebar_position: 3
description: "Understand the CUDA programming model. Learn how Host and Device code interact, and how Kernels are defined and executed."
---

# Chapter 3 — The CUDA Programming and Execution Model

| Chapter metadata | Value |
|---|---|
| Volume | 03 — CUDA and Execution Stack |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | How does a software developer explicitly tell the compiler which parts of the code should run on the CPU and which parts should run on the GPU? |

## Introduction

As an infrastructure engineer, you deploy code written by others. But when that code crashes with a `CUDA OOM` or a `CUDA Illegal Memory Access` error, you must be able to read the source code and identify the architectural violation. 

CUDA is an extension of C/C++. It introduces a few simple keywords that completely alter how the compiler generates machine code. The most fundamental concept in CUDA programming is the strict separation between the **Host (CPU)** and the **Device (GPU)**.

## 1. Host vs. Device

In a CUDA program, the CPU and the GPU operate as separate entities with separate memory spaces.
* **Host (CPU):** Runs the main `int main()` function. It reads files, handles network requests, and sets up data.
* **Device (GPU):** Runs highly parallel mathematical functions. 

The developer uses function execution space specifiers to tell the `nvcc` compiler where the code belongs:
1. `__host__`: The function runs on the CPU, and can only be called from the CPU (This is the default).
2. `__device__`: The function runs on the GPU, and can *only* be called from the GPU (e.g., a helper math function).
3. `__global__`: The function runs on the GPU, but is called from the CPU. **This is called a Kernel.**

## 2. The Anatomy of a Kernel Launch

When the CPU wants the GPU to do work, it "launches a kernel". 

If we want to add two massive arrays of 1 million numbers together, a standard CPU C++ program uses a `for` loop:
```cpp
void add_arrays(float *A, float *B, float *C, int N) {
    for (int i = 0; i < N; i++) {
        C[i] = A[i] + B[i];
    }
}
```

A CUDA program removes the `for` loop. Instead, the CPU launches 1 million GPU threads, and each thread executes the addition exactly once, simultaneously.

```cpp
// 1. The __global__ keyword defines this as a GPU Kernel
__global__ void add_arrays_cuda(float *A, float *B, float *C) {
    // 2. The GPU hardware provides a built-in variable to tell the thread who it is
    int i = threadIdx.x; 
    C[i] = A[i] + B[i];
}

int main() {
    // ... allocate memory ...
    
    // 3. The Execution Configuration <<<Blocks, Threads>>>
    add_arrays_cuda<<<1, 1000000>>>(A, B, C);
}
```

*Note: The `<<< ... >>>` syntax is the CUDA Execution Configuration. It tells the GigaThread Engine exactly how many Thread Blocks and Threads to spawn.*

## 3. The Infrastructure Impact of Execution Configurations

The numbers placed inside the `<<<Blocks, Threads>>>` brackets are arguably the most important parameters in AI software. 

As we learned in Volume 2, an SM (Streaming Multiprocessor) has finite registers and finite shared memory. 
If a developer blindly types `<<<1, 1000000>>>`, the program will crash. A Thread Block has a strict physical maximum of **1024 threads**. 

To process 1,000,000 items, the developer must chunk the work into multiple blocks:
`<<<1000, 1000>>>` (1,000 blocks of 1,000 threads).

If the data scientists choose a thread block dimension that does not align with the Warp size (32), they will waste hardware. For example, a block size of `<<<1, 50>>>` requires the GPU to spawn 2 Warps (64 threads). The first 32 threads will run. The second warp will run 18 threads, and **14 threads will sit completely idle**, wasting compute cycles and lowering occupancy.

## Customer Scenario (Senior Level)

**The Situation:**
A developer complains: "I wrote a CUDA kernel to multiply two matrices. It compiles fine, but when I run it, the output matrix is completely empty (all zeros). The GPU is broken."

**The Senior Architect Response:**
"The GPU is not broken; the code violates the Host/Device memory boundary. 

You defined your matrices on the CPU using standard `malloc()`, and then passed those CPU memory pointers directly into the `<<<...>>>` kernel launch. 

The `__global__` kernel executes on the Device (GPU). The GPU cannot natively read pointers that point to System RAM. When the GPU threads attempt to read your data, they hit an illegal memory access and silently fail. 

Before you launch a kernel, you must explicitly allocate memory on the GPU using `cudaMalloc()`, and you must physically copy the data from the CPU to the GPU over the PCIe bus using `cudaMemcpy(..., cudaMemcpyHostToDevice)`. Only then can you pass those *device pointers* into the kernel."

## Interview Preparation

**Conceptual:** What does the `__global__` keyword do in CUDA? *(Hint: It defines a Kernel. It specifies that a function runs on the Device (GPU), but is callable from the Host (CPU)).*

**Architecture:** Explain the difference between `__device__` and `__global__`. *(Hint: A `__device__` function is a helper function that can only be called from inside the GPU by other GPU threads. A `__global__` function is the entry point, called by the CPU).*
