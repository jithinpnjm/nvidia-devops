---
title: "Chapter 5 — Node and GPU Feature Discovery"
sidebar_position: 5
description: "Master intelligent scheduling. Learn how NFD and GFD label nodes with precise hardware specifications to ensure optimal workload placement."
---

# Chapter 5 — Node and GPU Feature Discovery

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Intermediate |
| Estimated reading time | 30 minutes |
| Primary audience | Kubernetes Administrators, AI Schedulers |
| Core question | If all nodes simply advertise `nvidia.com/gpu`, how do you prevent a 70-billion parameter LLM from accidentally being scheduled onto a weak, older GPU? |

## Introduction

In Chapter 4, we learned that the Device Plugin advertises capacity as a generic integer: `nvidia.com/gpu: 8`. 

In a heterogeneous cluster (a cluster containing different types of GPUs), this generic integer is dangerous. 
If your cluster contains both A100 (40GB memory) and H100 (80GB memory) nodes, they both simply advertise `nvidia.com/gpu: 8`. 
If a user submits an LLM training job that strictly requires 80GB of VRAM to fit the model, and the Kubernetes scheduler randomly places it on an A100 node, the job will instantly crash with a CUDA Out Of Memory (OOM) error.

We must enrich the Kubernetes API with precise hardware metadata. This is the role of **Node Feature Discovery (NFD)** and **GPU Feature Discovery (GFD)**.

## 1. Node Feature Discovery (NFD)

Node Feature Discovery is a standard Kubernetes add-on. It runs on every node and inspects the general hardware. 
It detects things like CPU architecture (x86 vs ARM), kernel versions, and available PCIe devices. 

It then applies standard Kubernetes labels to the node, such as:
*   `feature.node.kubernetes.io/cpu-cpuid.AVX512=true`
*   `feature.node.kubernetes.io/kernel-version.major=5`

This is useful, but it lacks the deep, vendor-specific introspection required for GPUs.

## 2. GPU Feature Discovery (GFD)

**GPU Feature Discovery (GFD)** is an NVIDIA-specific DaemonSet. It runs alongside the Device Plugin. 
While the Device Plugin focuses on *quantity* (counting GPUs), GFD focuses on *quality* (describing the GPUs).

GFD queries the NVIDIA driver via NVML and applies highly specific labels to the node. 
Crucial GFD labels include:
*   `nvidia.com/gpu.product=H100-SXM5-80GB`: The exact silicon model.
*   `nvidia.com/gpu.memory=81920`: The VRAM in megabytes.
*   `nvidia.com/gpu.count=8`: The number of GPUs.
*   `nvidia.com/mig.capable=true`: Whether Multi-Instance GPU is physically supported.
*   `nvidia.com/gpu.compute.major=9`: The CUDA compute capability.

## 3. Intelligent Scheduling with nodeSelectors

Once GFD has labeled the nodes, data scientists can use standard Kubernetes scheduling primitives (`nodeSelectors` or `nodeAffinity`) to explicitly target the exact hardware they need.

**Example Pod YAML:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: llm-training
spec:
  containers:
  - name: pytorch
    image: pytorch:latest
    resources:
      limits:
        nvidia.com/gpu: 8
  nodeSelector:
    nvidia.com/gpu.product: H100-SXM5-80GB
    nvidia.com/gpu.memory: "81920"
```

With this YAML, the scheduler will strictly ignore any A100 or T4 nodes, guaranteeing the workload lands on the exact required architecture.

## Customer Scenario (Senior Level)

**The Situation:**
A financial institution operates a large cluster with two node pools: Pool A has T4 GPUs (excellent for lightweight inference) and Pool B has H100 GPUs (expensive, designed for massive training). Data scientists are complaining that their massive training jobs are failing instantly with OOM errors. Simultaneously, the finance department is furious because the expensive H100 nodes are being consumed by lightweight, low-priority internal chatbot inference jobs.

**The Senior Architect Response:**
"This is a classic failure of scheduling hygiene in a heterogeneous cluster. Because all nodes are generically advertising `nvidia.com/gpu`, the Kubernetes scheduler is playing roulette with your workloads. It is blindly placing massive training jobs on the weak T4s, and tiny inference jobs on the expensive H100s.

We must implement strict scheduling governance using **GPU Feature Discovery (GFD)**. 

First, we ensure GFD is running across the entire cluster, automatically labeling nodes with their exact hardware specifications (e.g., `nvidia.com/gpu.product=T4`). 

Second, we must modify the deployment pipelines for the data science teams. We will implement OpenPolicyAgent (OPA) or Kyverno mutating admission webhooks. If a user submits a massive training job, the webhook will automatically inject a `nodeSelector` forcing it onto `nvidia.com/gpu.product=H100`. If a user submits a lightweight inference job, the webhook forces it onto the `T4` nodes. 

By tying GFD telemetry to automated admission control, we eliminate the OOM crashes and guarantee that the expensive H100 silicon is utilized solely for its intended purpose, optimizing the cluster's Total Cost of Ownership (TCO)."

## Interview Preparation

**Conceptual:** What is the difference between the NVIDIA Device Plugin and GPU Feature Discovery (GFD)? *(Hint: The Device Plugin counts GPUs and advertises them as generic allocatable resources (`nvidia.com/gpu: 8`). GFD describes the GPUs, labeling the Kubernetes node with specific hardware metadata like the GPU model, memory capacity, and compute capability).*

**Architecture:** Why is GFD mandatory in a heterogeneous GPU cluster? *(Hint: Without GFD labels, the Kubernetes scheduler cannot differentiate between an 8GB T4 and an 80GB H100. It will schedule workloads randomly. GFD provides the labels necessary for `nodeSelectors`, allowing data scientists to target the exact VRAM and architecture required by their models).*
