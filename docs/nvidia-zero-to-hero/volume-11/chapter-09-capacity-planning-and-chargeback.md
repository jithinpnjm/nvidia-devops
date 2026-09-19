---
title: "Chapter 9 — Capacity Planning and Chargeback"
sidebar_position: 9
description: "Master FinOps for shared GPUs. Learn how to accurately track fractional utilization, implement quotas, and charge departments for exact consumption."
---

# Chapter 9 — Capacity Planning and Chargeback

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | FinOps, Platform Leads, Capacity Planners |
| Core question | If 10 different teams share a cluster of partitioned GPUs, how do you mathematically prove to the CFO which team is burning the budget? |

## Introduction

In a dedicated GPU environment, chargeback is easy. The Finance team buys 8 GPUs. The Finance team's Kubernetes namespace is granted 8 GPUs. You bill them for the hardware.

In a shared GPU environment, chargeback becomes incredibly complex. 
A physical GPU is sliced into MIG profiles, or oversubscribed via Time-Slicing. A user requests `nvidia.com/mig-1g.10gb`, but the workload only runs for 14 minutes and consumes 20% of the allocated compute. 

If you cannot accurately track and bill for this fractional utilization, the platform will suffer from the "Tragedy of the Commons." Teams will hoard fractional GPUs, leaving the cluster at 100% allocation but 5% physical utilization, and the CFO will refuse to approve new hardware purchases.

## 1. Defining the Metric of Consumption

To implement chargeback on shared GPUs, you must establish the unit of measure. You cannot bill based on generic "GPU hours."

### Option A: Billing by Allocation (The Simple Way)
You bill the team based on the Kubernetes `ResourceQuota` or the specific extended resource requested in the Pod YAML. 
*   **Metric:** Time spent in the `Running` state holding a specific resource (e.g., 10 hours holding `nvidia.com/mig-2g.20gb`).
*   **Pros:** Easy to calculate. Predictable for budgeting.
*   **Cons:** Does not encourage efficiency. The team pays the same amount whether they run a heavy workload at 100% utilization or leave a Jupyter notebook sitting completely idle.

### Option B: Billing by Utilization (The Accurate Way)
You bill the team based on the actual physical physics of the silicon they consumed.
*   **Metric:** Gigabytes of VRAM consumed *and* Streaming Multiprocessor (SM) active time, extracted via DCGM (as discussed in Volume 10).
*   **Pros:** Extremely accurate. Forces teams to optimize their code and scale down idle pods to save money.
*   **Cons:** Complex to implement. Requires a robust Prometheus/Grafana pipeline with deep Kubernetes context enrichment to map physical DCGM metrics back to the correct billing namespace.

## 2. Quotas and Admission Control

Once you decide how to bill, you must enforce limits. 

In Kubernetes, you use standard `ResourceQuotas` applied to Namespaces. 
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: finance-gpu-quota
  namespace: finance
spec:
  hard:
    requests.nvidia.com/mig-2g.20gb: "4"
    requests.nvidia.com/mig-1g.10gb: "10"
```

If the Finance team attempts to launch an 11th `1g.10gb` slice, the Kubernetes API server will reject the Pod before it even reaches the scheduler. This strictly bounds the financial liability of each department.

## Customer Scenario (Senior Level)

**The Situation:**
A massive enterprise AI platform implements Time-Slicing (`replicas: 10`) across their cluster to increase density. They configure simple Kubernetes allocation tracking for chargeback (billing $5 per hour per generic `nvidia.com/gpu` requested). At the end of the quarter, the R&D department receives a bill for $500,000. R&D protests, proving via their application logs that their actual AI processing time was only a few hours a week. The CFO demands an explanation.

**The Senior Architect Response:**
"The billing dispute is a direct result of choosing the wrong chargeback metric for a heavily oversubscribed, Time-Sliced environment. 

When you implement Time-Slicing, you break the 1:1 relationship between allocation and physical hardware. 
R&D requested 10 generic `nvidia.com/gpu` resources to run their Jupyter notebooks. Because they requested them, Kubernetes allocated them, and the billing system charged them $50 per hour continuously. However, because it was Time-Slicing, the physical hardware was barely doing any work. R&D was being billed massive amounts of money for idle software allocations, while other teams were concurrently using the exact same physical silicon for free.

To implement fair and mathematically sound chargeback in a Time-Sliced environment, we must abandon **Allocation Billing** and implement **Utilization Billing**. 

We must configure the **DCGM Exporter** to track the exact SM (Compute Core) active time and VRAM usage of every individual Pod. We will route these physical metrics into Prometheus, enriched with the Kubernetes Namespace labels. The CFO's dashboard will now calculate bills based on the literal milliwatts of power and seconds of compute execution R&D actually consumed on the silicon, completely eliminating disputes over idle allocation."

## Interview Preparation

**Conceptual:** Why is billing by Kubernetes Allocation unfair in a Time-Sliced GPU environment? *(Hint: In Time-Slicing, a user can allocate a 'virtual' GPU but leave it completely idle. Because multiple users are sharing the same physical silicon, billing them purely for the allocation means you might be charging three different users full price for the exact same physical piece of hardware while it does zero actual work).*

**Architecture:** How do you enforce a hard limit on how many MIG slices a specific department can consume? *(Hint: You apply a Kubernetes `ResourceQuota` to that department's specific Namespace. The quota explicitly limits the total count of the extended resources (e.g., `nvidia.com/mig-1g.10gb: 5`) they are allowed to request. The API server will reject any Pods that exceed this limit).*
