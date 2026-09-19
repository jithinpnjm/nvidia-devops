with open('docs/nvidia-zero-to-hero/volume-01/chapter-05-ai-infrastructure-landscape.md', 'w') as f:
    f.write(r"""---
title: "Chapter 5 — The AI Infrastructure Landscape: Kubernetes vs. Slurm"
slug: "/nvidia-zero-to-hero/volume-01/ai-infrastructure-landscape"
sidebar_position: 5
description: "Navigate the software orchestration layer of AI infrastructure. Understand the architectural trade-offs between Kubernetes (Cloud Native) and Slurm (HPC) for AI workloads."
---

# Chapter 5 — The AI Infrastructure Landscape: Kubernetes vs. Slurm

| Chapter metadata | Value |
|---|---|
| Volume | 01 — AI Infrastructure Foundations |
| Difficulty | Advanced |
| Estimated reading time | 35 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | If I have a cluster of 1,000 GPUs, should I use Kubernetes or Slurm to orchestrate them? |

## Introduction (The "Why")

You now understand the silicon. You know how CPUs and GPUs communicate, and you know how a single inference request stresses the hardware. 

But AI Factories are not built from a single server. They are built from hundreds or thousands of interconnected DGX nodes. If a data science team needs 64 GPUs to train a model for three days, someone (or something) must physically isolate those GPUs, configure the InfiniBand network paths, mount the high-speed storage, and launch the distributed Python processes simultaneously.

This is the job of the **Orchestrator**. 

If you come from the traditional web world, your immediate answer is: *"Obviously, we use Kubernetes."* 
If you come from the world of supercomputing and academia, your immediate answer is: *"Obviously, we use Slurm."*

Both answers can be correct, and both answers can be catastrophic if applied to the wrong workload. The hardest architectural decision an AI Platform team will make is selecting their orchestration layer, because the decision dictates how the entire facility operates.

## Kubernetes: The Cloud-Native Microservices Approach (The "What")

Kubernetes (K8s) was built by Google to run millions of stateless web services, scaling them up and down endlessly based on traffic. 

### How Kubernetes Adapts to AI
Out of the box, Kubernetes has absolutely no idea what a GPU is. It only understands CPU and RAM. To run AI workloads on Kubernetes, you must install the **NVIDIA GPU Operator**. 

The GPU Operator automatically deploys the NVIDIA Linux drivers, the Container Toolkit, and the Kubernetes Device Plugin. Once installed, users can request GPUs in their YAML files just like they request CPUs:

```yaml
resources:
  limits:
    nvidia.com/gpu: 8
```

### The Kubernetes Advantage
1. **The Ecosystem:** Most enterprises already have massive CI/CD pipelines, security scanning tools, and monitoring stacks (Prometheus/Grafana) built tightly around Kubernetes.
2. **Inference & Serving:** Kubernetes is unmatched at running long-lived services. If you are deploying an AI model behind a REST API (Inference) that must autoscale based on user traffic, Kubernetes is the only logical choice.

## Slurm: The High-Performance Computing Approach

**Slurm (Simple Linux Utility for Resource Management)** is a batch-processing workload manager born in the supercomputing era. 

Unlike Kubernetes, which treats servers as interchangeable generic resources to host web pods, Slurm treats the cluster as a massive, rigid, bare-metal supercomputer. 

### How Slurm Operates
In Slurm, users submit "Jobs" using shell scripts. 
*"I need 64 GPUs, on the exact same InfiniBand switch, for exactly 72 hours."*
Slurm maintains a rigid queue. When the exact physical resources become available, Slurm locks those nodes exclusively for that user, provisions the environment, and launches the parallel tasks via MPI (Message Passing Interface) or PyTorch distributed commands.

### The Slurm Advantage
1. **Gang Scheduling:** If a distributed training job requires 64 GPUs, and only 63 are available, the job *cannot start*. Standard Kubernetes will happily launch 63 pods and leave them pending forever while the user is billed. Slurm natively waits until all 64 are ready, then launches them simultaneously (Gang Scheduling).
2. **Bare-Metal Performance:** Slurm runs directly on the OS. There is no `kubelet`, no container overlay network, and no complex ingress controllers adding latency to the InfiniBand fabric. It is raw, unadulterated access to the hardware.
3. **Fair-Share Queuing:** If multiple data science teams are fighting over a limited pool of 1,000 GPUs, Slurm has decades of advanced queuing logic to manage priority, quotas, and preemptions.

## Architectural Diagram: Slurm vs Kubernetes

```mermaid
flowchart TD
    subgraph "Kubernetes (Cloud Native)"
        K_User[User submits YAML] --> K_API[Kube API Server]
        K_API --> K_Sched[Kube Scheduler]
        K_Sched --> K_Node[Node Kubelet]
        K_Node --> K_Pod[Pod: Inference Server]
        K_Pod --> K_GPU[(GPU)]
    end
    
    subgraph "Slurm (HPC)"
        S_User[User submits Bash Script] --> S_Ctl[Slurmctld (Controller)]
        S_Ctl --> S_Queue[Batch Queue / Fairshare]
        S_Queue --> S_Node[Slurmd (Daemon)]
        S_Node --> S_Task[Bare Metal Process]
        S_Task --> S_GPU[(GPU)]
    end
```

## The Architectural Trade-offs

| Feature | Kubernetes | Slurm |
|---|---|---|
| **Primary Use Case** | Model Serving (Inference), MLOps pipelines. | Large Scale Distributed Training. |
| **Paradigm** | Always-on services (`Deployment`). | Finite batch jobs (`sbatch`). |
| **GPU Scheduling** | Assigns isolated GPUs to isolated containers. | Locks entire physical nodes to a single user job. |
| **Networking** | Complex overlay networks (Calico, Cilium). Harder to integrate with bare-metal InfiniBand. | Zero-overhead. Processes talk directly over the host's InfiniBand/RoCE network. |
| **Learning Curve** | Data Scientists must learn Docker, YAML, Helm, and K8s concepts. | Data Scientists just write standard Bash and Python scripts. |

## Advanced: The Convergence (Run:ai, Kueue, Pyxis)

The industry is currently attempting to merge the best of both worlds. 
* **Making Kubernetes act like Slurm:** Projects like *Kueue*, *Volcano*, and commercial platforms like *Run:ai* bolt advanced batch-queuing and gang-scheduling onto Kubernetes, allowing it to handle massive training jobs more effectively.
* **Making Slurm act like Kubernetes:** Projects like *Enroot* and *Pyxis* (built by NVIDIA) allow Slurm to natively download and run Docker/OCI containers, giving Slurm users the reproducibility of containers without the overhead of Kubernetes.

## Customer Scenario (Senior Level)

**The Situation:** 
An enterprise IT team tells you: "We are building a new AI cluster with 500 GPUs. Our data science team needs to train models from scratch, which requires jobs running across 64 GPUs simultaneously for weeks at a time. Our IT team only knows Kubernetes, so we are going to deploy standard Kubernetes to manage this."

**The Senior Architect Response:**
"Using vanilla Kubernetes for massive, synchronized distributed training will lead to severe operational pain.

Standard Kubernetes was built to run independent, stateless microservices. It does not natively support 'Gang Scheduling'. When your data science team requests 64 GPUs, Kubernetes might find 30 GPUs available and immediately schedule those pods. Those 30 pods will sit in the cluster, consuming expensive GPU hours, indefinitely waiting for the remaining 34 GPUs to free up so training can begin. 

Furthermore, massive training jobs rely on extreme-throughput InfiniBand or RoCE networking. Routing GPUDirect RDMA traffic through Kubernetes CNI overlay networks is incredibly complex and brittle. 

I strongly recommend two paths: 
1. If the workload is strictly training, deploy **Slurm**. It natively handles batch queuing, gang scheduling, and bare-metal InfiniBand performance.
2. If your IT team mandates Kubernetes, you cannot use it 'vanilla'. You must deploy an advanced AI batch scheduler on top of Kubernetes, such as Volcano or a commercial platform like Run:ai, and carefully configure Multus CNI to expose the bare-metal RDMA network directly to the pods."

## Interview Preparation

**Conceptual:** Explain the fundamental difference between how Kubernetes and Slurm handle resource requests.

**Architecture:** What is "Gang Scheduling", and why is it mandatory for distributed AI training?

**Troubleshooting:** A data science team submits a YAML file requesting 16 GPUs on a K8s cluster. 8 pods are marked "Running", and 8 are "Pending". The 8 running pods are crashing with `NCCL Timeout` errors. What happened? *(Hint: Lack of gang scheduling. The 8 running pods are trying to communicate with the 8 pending pods over the network. Because the pending pods don't exist, the network synchronization times out and crashes the job).*

## Summary

Selecting an orchestrator is not a religious war between SysAdmins and DevOps engineers; it is a strict architectural alignment to the workload. If you are building a platform to serve models to end-users (Inference), Kubernetes is the undisputed king. If you are building a platform to train models across thousands of GPUs for months at a time, Slurm provides the bare-metal performance and strict job queuing required to protect the hardware investment. A Senior Architect understands these boundaries and deploys the right tool for the physics of the job.
""")
