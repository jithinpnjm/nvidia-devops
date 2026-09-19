---
title: "Chapter 4 — Time-Slicing and Oversubscription"
sidebar_position: 4
description: "Master GPU oversubscription. Learn how to configure Time-Slicing to maximize cluster utilization for non-critical developer workloads."
---

# Chapter 4 — Time-Slicing and Oversubscription

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | Kubernetes Administrators, Platform Engineers |
| Core question | If MIG is limited to 7 slices, how do you allow 20 students to share a single GPU for their Python homework? |

## Introduction

MIG is powerful, but it has a hard physical limit: 7 slices per GPU. 
If you are running a university lab, a massive QA environment, or a developer platform where users need tiny amounts of compute just to validate code syntax, MIG is too restrictive. 

To achieve maximum density and ROI for non-production workloads, we turn to **Software Time-Slicing**. 

Time-Slicing is a feature of the NVIDIA driver and the Kubernetes Device Plugin. It allows us to mathematically oversubscribe the hardware, telling Kubernetes that 1 physical GPU is actually 10, 20, or even 100 logical GPUs.

## 1. How Time-Slicing Works

Unlike MIG, Time-Slicing does not physically partition the silicon. 
All containers sharing the GPU run in the exact same memory space and use the exact same compute cores. 

**The Mechanics:**
1.  Container A sends a CUDA kernel to the GPU. The GPU executes it.
2.  Container B sends a CUDA kernel to the GPU. 
3.  The NVIDIA driver's scheduler rapidly context-switches between Container A and Container B (measured in microseconds). 

### The Critical Trade-offs (The Warnings)
Because there is no hardware isolation:
*   **Memory Leaks:** If Container A requests 80GB of VRAM, it will get it. Container B will instantly crash with an OOM error. There is no VRAM quota enforcement.
*   **Noisy Neighbors:** If Container A runs a massive loop, Container B will pause entirely while it waits for a time-slice on the compute cores.
*   **Security:** Processes share the same physical memory space. This is unacceptable for classified or highly secure multi-tenant data.

## 2. Configuring Time-Slicing in Kubernetes

Similar to MIG, we configure Time-Slicing using a ConfigMap and the NVIDIA GPU Operator.

**Step 1: The ConfigMap**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: time-slicing-config
data:
  any: |-
    version: v1
    sharing:
      timeSlicing:
        renameByDefault: false
        failRequestsGreaterThanOne: false
        resources:
        - name: nvidia.com/gpu
          replicas: 10 # <--- The Magic Number. 1 Physical = 10 Logical.
```

**Step 2: Apply to the Operator**
You update the GPU Operator Helm values:
`devicePlugin.config.name=time-slicing-config`

**Step 3: The Result**
If you have a node with 4 physical GPUs, the kubelet will now advertise `nvidia.com/gpu: 40`. 
You can now schedule 40 Pods onto that node simultaneously.

## 3. MPS (Multi-Process Service) - The Advanced Alternative

Standard Time-Slicing uses temporal context switching (Job A runs, then Job B runs). This leaves empty gaps in the compute cores if Job A is small. 

**NVIDIA MPS (Multi-Process Service)** is an advanced form of software sharing. Instead of context-switching over time, MPS allows kernels from Container A and Container B to execute *concurrently on the exact same SMs at the exact same time*. 
MPS also allows the administrator to set hard limits on memory allocation and compute percentage per process, solving the memory leak issue of standard Time-Slicing. 
*Note:* MPS requires complex setup (an MPS control daemon must run on the host) and is generally reserved for highly specialized batch processing environments. 

## Customer Scenario (Senior Level)

**The Situation:**
A DevOps team wants to increase cluster utilization. They read a blog post about Time-Slicing and apply a ConfigMap setting `replicas: 20` to their production inference cluster. They deploy 20 instances of an LLM microservice onto a single H100 node. 19 of the pods crash immediately with `CUDA OOM` errors. The 1 pod that survives is responding to requests, but the latency is 5x slower than expected. 

**The Senior Architect Response:**
"You have applied a development-tier sharing strategy to a production-tier workload, resulting in a total architectural failure.

Time-Slicing does not create extra VRAM. An H100 has 80GB of VRAM. By setting `replicas: 20`, you told the Kubernetes scheduler it could place 20 pods on that node. However, when the LLM microservice starts, it attempts to load its 30GB model weights into VRAM. 
Pod 1 starts and consumes 30GB. Pod 2 starts and consumes 30GB (60GB total). When Pod 3 starts, there is only 20GB of physical VRAM left. Pod 3 (and all subsequent pods) crash instantly with OOM errors because Time-Slicing provides no memory isolation or quotas. 

Furthermore, Pod 1 and Pod 2 are now fighting for the same compute cores via software context-switching. This constant thrashing destroys the L2 cache efficiency, causing the 5x latency penalty.

Time-Slicing is exclusively for environments where workloads are tiny, bursty, and idle 90% of the time (like Jupyter notebooks). For production inference requiring massive VRAM and guaranteed latency, we must immediately roll back this change and implement hardware-partitioned MIG."

## Interview Preparation

**Conceptual:** If a GPU has 80GB of memory, and you configure Time-Slicing with `replicas: 10`, how much memory is guaranteed to each of the 10 Pods? *(Hint: Exactly 0GB is guaranteed. Time-Slicing offers zero memory isolation. All 10 pods share the same 80GB pool. If one pod requests 80GB, the other 9 pods will crash with Out of Memory errors).*

**Architecture:** In what specific scenario is Time-Slicing architecturally superior to MIG? *(Hint: When maximizing density for lightweight, idle-heavy developer workloads (like a university lab with 40 students writing basic Python scripts). MIG is hard-capped at 7 users per GPU. Time-Slicing can legally oversubscribe the GPU to 40+ users, assuming they don't all execute heavy code at the exact same millisecond).*
