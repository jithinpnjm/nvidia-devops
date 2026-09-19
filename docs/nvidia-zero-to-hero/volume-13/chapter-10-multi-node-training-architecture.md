---
title: "Chapter 10 — Multi-Node Training Architecture"
sidebar_position: 10
description: "Master the orchestration layer. Learn how to launch a single cohesive training job across 1,000 independent Kubernetes nodes."
---

# Chapter 10 — Multi-Node Training Architecture

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Architecture |
| Difficulty | Expert |
| Estimated reading time | 35 minutes |
| Primary audience | Platform Engineers, Kubernetes Schedulers |
| Core question | If you write a Python script, how do you mathematically guarantee that it executes simultaneously on exactly 1,000 servers, and they all know each other's IP addresses? |

## Introduction

Until now, we have discussed the math and the networking. Now we must discuss the execution.

If you have a 1,000-node cluster, you cannot SSH into 1,000 servers and manually type `python train.py`. 
You need an orchestrator. 

In the HPC (High-Performance Computing) world, the orchestrator is **Slurm**. 
In the enterprise cloud-native world, the orchestrator is **Kubernetes**.

Native Kubernetes is terrible at launching distributed training jobs. A Senior Architect must deploy advanced operators (like Kubeflow MPI Operator or PyTorch Operator) to bridge the gap between cloud-native microservices and tightly coupled supercomputing.

## 1. The Slurm Architecture (The HPC Standard)

Slurm is the undisputed king of traditional supercomputing. 
It is entirely designed around **Batch Jobs** and **Topology-Aware Scheduling**.

*   **The Job Script:** A researcher writes a bash script defining the exact resources required (e.g., `#SBATCH --nodes=64 --gpus-per-node=8`).
*   **The Allocation:** Slurm holds the job in a queue until exactly 64 contiguous nodes become available. 
*   **The Launch (`srun`):** Slurm uses a highly optimized launcher (`srun`) to instantiate the Python process simultaneously on all 64 nodes. It automatically sets up the environment variables (like `MASTER_ADDR` and `WORLD_SIZE`) so every process knows exactly who the master node is and how many total GPUs are participating.

## 2. The Kubernetes Challenge (Gang Scheduling)

Kubernetes was designed for stateless web servers, not tightly coupled AI jobs. 
If you submit a standard Kubernetes Deployment requesting 64 nodes, Kubernetes will spawn the pods one by one. 

**The Deadlock Problem:**
If your cluster only has 60 nodes available, Kubernetes will schedule 60 pods, and the last 4 pods will sit in `Pending`. 
Because PyTorch DDP is a synchronous protocol, the 60 running pods will boot up, attempt to establish NCCL communication rings with 64 nodes, and block forever waiting for the final 4 pods to arrive. The job is deadlocked. The 60 nodes sit idle forever.

**The Solution: Gang Scheduling**
To train AI on Kubernetes, you must implement Gang Scheduling (using tools like Volcano or Kueue). 
Gang Scheduling changes the Kubernetes math. It says: *"Do not schedule a single pod until you can mathematically guarantee that all 64 nodes are available simultaneously."* It is an all-or-nothing allocation, mimicking Slurm's behavior.

## 3. The PyTorchJob Operator (Kubeflow)

Even with Gang Scheduling, you still have to pass the `MASTER_ADDR` IP address to every pod. In Kubernetes, pod IP addresses are dynamic. 

The industry standard solution is the **Kubeflow Training Operator** (specifically the `PyTorchJob` Custom Resource Definition).

Instead of a generic Deployment, you submit a `PyTorchJob` YAML.
1. The Operator creates a headless service for network discovery.
2. It spins up exactly 1 `Master` pod.
3. It spins up 63 `Worker` pods.
4. It dynamically injects the `MASTER_ADDR`, `MASTER_PORT`, `RANK`, and `WORLD_SIZE` environment variables into every container.
5. The PyTorch script reads these variables and successfully initializes the distributed NCCL process group.

## Customer Scenario (Senior Level)

**The Situation:**
An enterprise company mandates that all infrastructure must run on Kubernetes. They dismantle their old Slurm cluster and force the AI team to run their 128-node PyTorch training jobs using standard Kubernetes `Jobs`. The AI team complains that their jobs are constantly failing on startup. They look at the logs and see NCCL timeouts (`RuntimeError: ProcessGroupNCCL: Timeout`). The platform team blames the AI code.

**The Senior Architect Response:**
"The AI code is completely fine; the Kubernetes platform architecture is hostile to distributed training. 

By using standard Kubernetes `Jobs`, you have ignored the fundamental requirement of **Gang Scheduling** and **Synchronous Discovery**. 

When you submit a 128-node job, standard Kubernetes attempts to spin the pods up sequentially. If Pod 0 (the Master) boots up instantly, it binds to the port and waits for the other 127 pods to connect. If the cluster is busy, and Pod 127 takes 15 minutes to pull the massive Docker image and start, Pod 0 will hit its NCCL timeout threshold (usually 30 minutes) and crash before the cluster even fully forms. This causes a cascading failure.

We must immediately overhaul the Kubernetes execution layer. 
We will deploy the **Volcano** batch scheduler to replace the default `kube-scheduler` for AI namespaces. This will enforce Gang Scheduling—the job will sit completely in `Pending` until exactly 128 nodes are fully available. 
Secondly, we will deploy the **Kubeflow PyTorch Operator**. We will stop using generic `Jobs` and start using `PyTorchJob` CRDs. The Operator will seamlessly handle the dynamic injection of the `MASTER_ADDR` and rank variables, completely automating the complex cluster discovery process and eliminating the NCCL initialization timeouts."

## Interview Preparation

**Conceptual:** Why is standard Kubernetes deployment logic (spinning up pods one by one) fatal for a PyTorch Distributed Data Parallel (DDP) training job? *(Hint: DDP is a tightly coupled, synchronous protocol. All GPUs must be present to establish the NCCL communication rings. If Kubernetes spins up 50% of the pods, those pods will sit idle and eventually crash with timeouts while waiting for the remaining pods to be scheduled. It requires an 'all-or-nothing' approach).*

**Architecture:** What is Gang Scheduling, and why is it mandatory for distributed training on Kubernetes? *(Hint: Gang Scheduling is an advanced algorithm (provided by tools like Volcano) that treats a multi-node job as a single indivisible unit. It ensures that either all requested nodes are scheduled simultaneously, or none are scheduled at all. This prevents partial allocations from deadlocking the cluster and wasting idle GPU time).*
