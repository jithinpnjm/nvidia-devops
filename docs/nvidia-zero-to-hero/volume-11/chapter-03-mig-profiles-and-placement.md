---
title: "Chapter 3 — MIG Profiles and Placement"
sidebar_position: 3
description: "Master the mathematics of MIG partitioning. Learn how to configure Compute Instances and GPU Instances for optimal Kubernetes scheduling."
---

# Chapter 3 — MIG Profiles and Placement

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Kubernetes Administrators, Infrastructure Planners |
| Core question | How do you actually slice an 80GB GPU into 7 pieces, and how do you teach Kubernetes to understand the difference between the slices? |

## Introduction

In Chapter 2, we learned *why* MIG exists. In this chapter, we learn exactly *how* to configure it. 

You cannot arbitrarily slice a GPU into any size you want (e.g., you cannot ask for a 13GB slice). The silicon is divided into rigid mathematical fractions. A Senior Architect must understand the naming conventions, the difference between a GPU Instance (GI) and a Compute Instance (CI), and how the GPU Operator exposes these slices to Kubernetes.

## 1. The MIG Naming Convention

MIG slices are defined by profiles. 
The naming convention is strictly: `<Compute_Instances>g.<Memory_in_GB>gb`.

For an 80GB H100, the available profiles include:
*   `1g.10gb`: 1/7th of the compute, 10GB of VRAM (Maximum 7 per GPU).
*   `2g.20gb`: 2/7ths of the compute, 20GB of VRAM (Maximum 3 per GPU).
*   `3g.40gb`: 3/7ths of the compute, 40GB of VRAM (Maximum 2 per GPU).
*   `7g.80gb`: The full GPU (Effectively disabling MIG partitioning).

*Note:* You can mix and match profiles on a single GPU, as long as they fit within the physical limits of the silicon (e.g., you can have one `3g.40gb`, one `2g.20gb`, and two `1g.10gb` slices on a single 80GB card).

## 2. GPU Instances (GI) vs. Compute Instances (CI)

This is a critical distinction that trips up junior engineers.

1.  **GPU Instance (GI):** This is the physical partition of the Memory, L2 Cache, and Memory Bandwidth. 
2.  **Compute Instance (CI):** This is a subdivision of the GI's Streaming Multiprocessors (SMs).

By default, an instance like `2g.20gb` means 1 GI (20GB memory) and 1 CI (2 compute blocks). 
However, you can take a large memory slice (like a `4g.40gb` GI) and subdivide its compute cores into multiple CIs (e.g., four `1c` Compute Instances). This is highly advanced and rarely used unless a specific workload requires massive memory but very little compute. In 99% of Kubernetes deployments, GI and CI map 1:1.

## 3. Configuring MIG in Kubernetes

How do we tell Kubernetes to slice the GPU? We use the **NVIDIA GPU Operator**. 

You do not SSH into the node and run `nvidia-smi mig` manually. You define a ConfigMap in Kubernetes that lists your desired profiles, and you label the node.

**Step 1: The ConfigMap**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: default-mig-parted-config
data:
  config.yaml: |
    version: v1
    mig-configs:
      all-1g.10gb: # Profile name
        - devices: all
          mig-enabled: true
          mig-devices:
            "1g.10gb": 7 # Slice the GPU into seven 10GB pieces
```

**Step 2: The Node Label**
You label the node: `kubectl label node my-node nvidia.com/mig.config=all-1g.10gb`.
The GPU Operator's `mig-manager` daemonset sees this label, safely drains the node, physically reconfigures the silicon via NVML, restarts the Device Plugin, and uncordons the node.

**Step 3: The Result**
Instead of the node advertising `nvidia.com/gpu: 1`, it now advertises `nvidia.com/mig-1g.10gb: 7`.

## Customer Scenario (Senior Level)

**The Situation:**
A team deploys an LLM inference service using vLLM. The model requires 35GB of VRAM. The platform team partitioned their A100-80GB nodes into seven `1g.10gb` MIG slices to maximize the number of available pods. The data scientists submit their Pod YAML requesting `nvidia.com/mig-1g.10gb: 4` (hoping to combine four 10GB slices to get 40GB total). The Pod schedules, but crashes immediately with an Out of Memory (OOM) error.

**The Senior Architect Response:**
"You have fundamentally misunderstood the hardware isolation properties of MIG. 

MIG instances are physically isolated PCIe devices at the hardware level. MIG Instance 0 cannot read the memory of MIG Instance 1. Furthermore, MIG physically disables the NVLink and P2P (Peer-to-Peer) PCIe bridges between the slices. 

When you assign four `1g.10gb` slices to a single container, you are not giving the container a single 40GB pool of memory. You are giving it four tiny, isolated 10GB islands. An LLM inference engine cannot automatically span its model weights across four disconnected islands without explicit, complex multi-GPU tensor-parallel coding (which vLLM will refuse to do over PCIe without NVLink). 

To fix this, we must resize the MIG partitions at the hardware layer. We must apply a new MIG ConfigMap to the node, destroying the seven `1g.10gb` slices and replacing them with a `3g.40gb` slice (which provides a single, contiguous 40GB block of VRAM) and maybe a few smaller slices. The data science pod must then be updated to request `nvidia.com/mig-3g.40gb: 1`."

## Interview Preparation

**Conceptual:** What does the MIG profile `3g.40gb` signify on an H100 GPU? *(Hint: It signifies a hardware partition containing roughly 3/7ths of the compute capacity (Streaming Multiprocessors) and 40 Gigabytes of dedicated, physically isolated VRAM and L2 Cache).*

**Architecture:** Why can't a single application simply request multiple small MIG slices to satisfy a large memory requirement? *(Hint: MIG enforces strict hardware isolation. The slices cannot share memory, and Peer-to-Peer (P2P) communication (like NVLink) is disabled between slices. A model that requires 30GB of VRAM must be assigned a single MIG slice that is 30GB or larger; it cannot span across three 10GB slices).*
