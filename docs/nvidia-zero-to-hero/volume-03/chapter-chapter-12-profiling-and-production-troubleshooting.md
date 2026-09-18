---
title: "Chapter 12 — Profiling and Production Troubleshooting"
slug: "/nvidia-zero-to-hero/volume-03/profiling-and-production-troubleshooting"
sidebar_position: 12
description: "Master the NVIDIA profiling stack. Use Nsight Systems (nsys) and Nsight Compute (ncu) to hunt down bottlenecks in production AI code."
---

# Chapter 12 — Profiling and Production Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 03 — CUDA and Execution Stack |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | When `nvidia-smi` provides zero useful information about why an application is slow, what tools do you actually use? |

## Introduction

By this point in Volume 03, you understand that an AI workload can fail in a dozen invisible ways: PCIe congestion, Warp Divergence, Uncoalesced Memory, Demand Paging via UVM, or CPU launch overhead. 

None of these failures will show up in standard Linux tools like `top` or `htop`. Even `nvidia-smi` is dangerously misleading (reporting 100% utilization when the GPU is actually stalled waiting for memory).

To prove exactly what is happening in the silicon, Senior Architects rely on the **NVIDIA Nsight** suite. 

## 1. Nsight Systems (`nsys`) — The Macro View

**Nsight Systems** is a system-wide performance analysis tool. It provides a visual timeline of the entire node: the CPU cores, OS threads, the PCIe bus, and the GPU streams.

**The Workflow:** You run your Python script wrapped in the `nsys` profiler:
```bash
nsys profile -t cuda,nvtx,osrt python train.py
```
This generates an output file (`.nsys-rep`) that you open in a GUI.

### What Senior Engineers Look For in `nsys`:
1. **The PCIe Gaps:** If you see the GPU execution timeline constantly pausing, followed by activity on the Memory Transfer timeline (H2D / D2H), you have failed to overlap compute and copy. The fix is to use Pinned Memory and Custom Streams.
2. **CPU Starvation:** If the GPU timeline is empty, but the CPU timeline shows 100% utilization on a single thread doing image parsing, the CPU is starving the GPU.
3. **NVTX Markers:** NVIDIA Tools Extension (NVTX) allows developers to inject labels into their Python code (e.g., `nvtx.range_push("Forward Pass")`). This labels the visual timeline, letting you know exactly which block of Python code generated the GPU kernels.

## 2. Nsight Compute (`ncu`) — The Micro View

Once `nsys` tells you *which* kernel is slow, you use **Nsight Compute** to find out *why* the silicon is struggling with it. 

Nsight Compute profiles a specific CUDA kernel and exposes the raw hardware counters (L1 cache hits, register spills, warp divergence). 

**The Workflow:**
```bash
ncu --set full python custom_kernel.py
```

### What Senior Engineers Look For in `ncu`:
1. **The Roofline Model:** `ncu` mathematically plots the kernel on the Roofline diagram, immediately diagnosing if it is Compute Bound or Memory Bandwidth Bound.
2. **Occupancy Analysis:** It displays the Theoretical Occupancy vs. Achieved Occupancy. If theoretical occupancy is low, `ncu` will explicitly state: *"Occupancy is limited by Register Count."*
3. **Memory Coalescing:** It highlights if Global Load Transactions wildly exceed the requested byte count, proving uncoalesced memory accesses.

## Customer Scenario (Senior Level)

**The Situation:**
A Platform team is testing a new GPU cluster. They run a standard PyTorch benchmark, and it performs 30% slower than expected. They check `nvidia-smi`, and the GPUs are healthy and running at max clock speeds. They open a support ticket claiming the hardware is defective.

**The Senior Architect Response:**
"The hardware is healthy. I generated an `nsys profile` trace of your benchmark. 

Looking at the timeline, we can clearly see the CUDA execution streams are packed tightly. However, periodically, all execution on the GPU completely halts for tens of milliseconds. During these exact halts, the OS timeline shows significant activity in the Linux Page Fault handler. 

This proves that your workload is utilizing Unified Memory (`cudaMallocManaged`) without prefetching. The GPU is stalling because it is waiting for the Linux OS to handle page faults and copy data from Host RAM over the PCIe bus on demand. We must either rewrite the code to explicitly allocate Device memory (`cudaMalloc`), or insert `cudaMemPrefetchAsync` before the execution loop. The 30% performance penalty is purely page-fault latency."

## Interview Preparation

**Conceptual:** What is the difference between Nsight Systems (`nsys`) and Nsight Compute (`ncu`)? *(Hint: `nsys` provides a macro-level timeline of CPU, PCIe, and GPU interactions. `ncu` provides a micro-level analysis of a single kernel's silicon execution, like register usage and cache hit rates).*

**Troubleshooting:** You run `nsys` and notice large gaps of dead time on the GPU timeline between every kernel execution. What are two possible causes? *(Hint: 1. The CPU is performing blocking `cudaMemcpy` operations over PCIe. 2. The kernels are so fast that the CPU is struggling with kernel launch overhead, requiring the use of CUDA Graphs).*
