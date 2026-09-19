---
title: "Chapter 7 — Kubernetes Scheduling for Shared GPUs"
sidebar_position: 7
description: "Master the intersection of Kubernetes schedulers and fractional GPUs. Learn how to prevent resource fragmentation and manage mixed-node clusters."
---

# Chapter 7 — Kubernetes Scheduling for Shared GPUs

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | Kubernetes Schedulers, Platform Engineers |
| Core question | If you chop an A100 into seven pieces, how do you prevent Kubernetes from scattering those pieces randomly and ruining your cluster efficiency? |

## Introduction

Once you implement MIG or Time-Slicing via the GPU Operator, the nodes begin advertising new Extended Resources to the Kubernetes API. 
Instead of `nvidia.com/gpu`, they advertise `nvidia.com/mig-1g.10gb` or a highly oversubscribed generic `nvidia.com/gpu` count.

This solves the allocation problem, but it introduces a massive scheduling problem: **Fragmentation**.

Native Kubernetes scheduling (the default `kube-scheduler`) is fundamentally designed for CPU and RAM. It treats all nodes as generic buckets of capacity. It is completely blind to the physical layout of GPU silicon and the strategic implications of scattering GPU workloads across a data center.

## 1. The Fragmentation Problem

Imagine a cluster with two A100 GPUs, both partitioned into seven `1g.10gb` MIG slices (14 slices total).

1.  User A requests two `1g.10gb` slices. The kube-scheduler places one slice on Node A, and one slice on Node B.
2.  User B requests two `1g.10gb` slices. The kube-scheduler places one on Node A, and one on Node B.
3.  User C comes along and urgently needs a full, unpartitioned A100 GPU for a large training job. 

**The Result:** User C's job sits in `Pending` forever. 
Even though the cluster technically has enough raw compute capacity available, the capacity is **fragmented** across two different physical cards. Because Kubernetes scattered the small MIG workloads, neither Node A nor Node B can be reconfigured back into a full GPU.

## 2. Bin-Packing and Custom Schedulers

To solve fragmentation, Senior Architects must alter the behavior of the Kubernetes scheduler.

### Taints, Tolerations, and Node Affinity
The most basic defense is creating dedicated node pools. You permanently configure Node A to be a "MIG Inference Node" and Node B to be a "Full GPU Training Node." You use Taints and Tolerations to strictly enforce this boundary. (This prevents fragmentation, but severely hurts overall cluster elasticity).

### Advanced Schedulers (e.g., Volcano, Run:ai)
To achieve true elasticity, you must replace or augment the default `kube-scheduler` with an advanced batch scheduler. 
These schedulers implement **Bin-Packing** algorithms. 

When User A requests two MIG slices, the Bin-Packing scheduler will forcibly cram both of those workloads onto Node A, leaving Node B completely empty and pristine. This ensures that Node B is immediately available if a massive, full-GPU training job arrives.

## 3. Dynamic MIG Reconfiguration

What if Node A is full of `1g.10gb` slices, but a user requests a `3g.40gb` slice?

In a standard deployment, the user's Pod sits in `Pending`. An SRE must manually (or via GitOps) alter the MIG ConfigMap for Node A to change the physical partition layout, wait for the node to reboot/drain, and then the Pod schedules.

Advanced third-party GPU orchestrators (and emerging features in the GPU Operator ecosystem) implement **Dynamic MIG Reconfiguration**. 
A controller watches the Kubernetes API for `Pending` pods. If it sees a pod asking for a `3g.40gb` slice, it automatically drains a node, dynamically re-partitions the silicon via NVML to match the requested profile, and then allows the pod to schedule. This turns MIG from a static, rigid architecture into a fluid, cloud-native resource pool.

## Customer Scenario (Senior Level)

**The Situation:**
A data science platform uses a massive cluster of H100s. They use MIG to slice the GPUs into `1g.10gb` profiles for Jupyter notebooks. They notice that cluster utilization is terrible. Even when only 20% of the MIG slices are consumed by notebooks, the cluster is unable to schedule any large training jobs that require full GPUs. The Kubernetes API reports plenty of raw CPU and Memory available.

**The Senior Architect Response:**
"You are suffering from severe GPU fragmentation caused by the default Kubernetes scheduling algorithm's 'Spread' priority.

By default, the `kube-scheduler` attempts to spread workloads evenly across all available nodes to maximize high availability and minimize the impact of a single node failure. 
While this is brilliant for standard stateless web microservices, it is catastrophic for fractional GPUs. 
By spreading the Jupyter notebooks evenly, the scheduler has consumed at least one MIG slice on every single physical GPU in the cluster. Because a physical GPU cannot be used for a full-card training job while even a single MIG slice is active, every GPU is effectively locked out of heavy training.

We must immediately reconfigure the cluster scheduling strategy. 
We will implement a custom scheduler profile (or a third-party scheduler like Volcano) and configure it for aggressive **Bin-Packing**. We will force the scheduler to fill up Node 1 with MIG slices until it is at 100% capacity before it is allowed to place a single MIG workload onto Node 2. This will dramatically increase our density, leaving the majority of the physical GPUs completely empty and available for massive, unpartitioned training workloads."

## Interview Preparation

**Conceptual:** Why does the default Kubernetes 'Spread' scheduling behavior cause fragmentation in a MIG-enabled cluster? *(Hint: 'Spread' tries to put Pods on as many different nodes as possible. If it places one small MIG workload on every physical GPU in the cluster, none of those GPUs can be reconfigured back into full, unpartitioned GPUs for large training jobs. The capacity is fragmented).*

**Architecture:** How does Bin-Packing solve GPU fragmentation? *(Hint: Bin-Packing is a scheduling algorithm that forces workloads to fill up a single node completely before moving to the next node. This maximizes density on a few nodes, leaving the remaining physical nodes completely pristine and available for massive, multi-GPU workloads).*
