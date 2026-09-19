---
title: "Chapter 9 — GPU Observability with DCGM"
sidebar_position: 9
description: "Master GPU monitoring in Kubernetes. Learn how DCGM Exporter translates deep hardware metrics into Prometheus time-series data."
---

# Chapter 9 — GPU Observability with DCGM

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Intermediate |
| Estimated reading time | 25 minutes |
| Primary audience | SREs, Platform Engineers, FinOps |
| Core question | If a data scientist complains their PyTorch job is "slow", how do you mathematically prove whether the bottleneck is the GPU, the CPU, or the storage? |

## Introduction

In a standard Kubernetes cluster, you use `cAdvisor` or `metrics-server` to scrape CPU and memory usage. 

If you look at `cAdvisor` metrics for a GPU-accelerated Pod, you will see a massive blind spot. The CPU might be at 5% utilization, and the host memory at 10%. To standard Kubernetes tools, the node appears completely idle. Meanwhile, the GPU could be running at 100% utilization, pulling 700 Watts of power, and thermal throttling.

Without GPU telemetry, an SRE cannot troubleshoot performance, and the FinOps team cannot calculate return on investment. 
To achieve observability, we must extract hardware metrics directly from the silicon and format them for standard cloud-native tools like Prometheus.

## 1. Data Center GPU Manager (DCGM)

The core engine for GPU observability is the **NVIDIA Data Center GPU Manager (DCGM)**. 

DCGM is a suite of tools that runs on the node. It interfaces directly with the NVIDIA driver to extract hundreds of low-level hardware metrics at high frequencies (milliseconds). 

It captures:
1.  **Hardware Health:** Temperatures, fan speeds, power draw (Watts), and ECC (Error Correction Code) memory errors.
2.  **Workload Physics:** Tensor Core utilization, FP32 utilization, NVLink bandwidth, and PCIe bus bandwidth.
3.  **Profiling (Standalone):** Deep tracing of CUDA kernel execution times.

However, DCGM is a raw tool. It does not speak the language of modern cloud-native observability (Prometheus/OpenMetrics).

## 2. The DCGM Exporter

To bridge the gap between DCGM and Prometheus, the NVIDIA GPU Operator deploys the **DCGM Exporter** as a DaemonSet across the cluster.

The DCGM Exporter is a lightweight Go application. 
1. It queries the local DCGM engine for the latest metrics.
2. It formats those metrics into the Prometheus text-based format (e.g., `DCGM_FI_DEV_GPU_UTIL{gpu="0"} 95`).
3. It exposes a `/metrics` HTTP endpoint.

A standard Prometheus server simply scrapes this endpoint every 15 seconds, storing the historical time-series data for Grafana dashboards and Alertmanager rules.

## 3. Kubernetes Context Enrichment (The Critical Feature)

If DCGM Exporter only output hardware metrics, it would be useless to a Kubernetes administrator. 

If the metric says `GPU 3 is at 100% utilization`, the SRE must manually cross-reference the physical device ID with the `kubelet` allocations to figure out *which user* is running the workload.

The DCGM Exporter solves this via **Kubernetes Context Enrichment**. 
The Exporter talks directly to the local kubelet. When it exports a metric for GPU 3, it attaches Kubernetes metadata to the Prometheus label. 

The metric becomes:
`DCGM_FI_DEV_GPU_UTIL{gpu="3", namespace="data-science", pod="pytorch-job-abc", container="training"} 100`

Now, an SRE can open Grafana and write a simple PromQL query to see exactly which Pod, in which Namespace, is consuming the most GPU power, enabling seamless chargeback and troubleshooting.

## Customer Scenario (Senior Level)

**The Situation:**
A CFO is reviewing the cloud bill for a massive Kubernetes EKS cluster running expensive P4d (A100) instances. The CFO demands a report proving that the AI teams are actually utilizing the hardware they requested. The platform team runs a script checking the Kubernetes API for `nvidia.com/gpu` allocation. The report shows the cluster is 98% allocated. The CFO is satisfied.

**The Senior Architect Response:**
"The report generated from the Kubernetes API is dangerously misleading. You have reported **Allocation**, not **Utilization**. 

In Kubernetes, if a Pod requests 8 GPUs, those GPUs are marked as 'Allocated' by the scheduler, regardless of whether the Python script inside the Pod is actually doing any math. The data science team might have launched the Pod on Friday, hit a syntax error in their code, and left the Pod running all weekend. The API will show 100% allocation, but the silicon is completely idle, burning thousands of dollars.

To prove actual ROI, we must measure true hardware utilization. We must deploy the **DCGM Exporter** via the GPU Operator and scrape the metrics into Prometheus. 

We will build a Grafana dashboard targeting the `DCGM_FI_DEV_GPU_UTIL` (streaming multiprocessor usage) and `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE` (Tensor Core usage) metrics, grouped by the `namespace` label. This will give the CFO a mathematically accurate report of exactly which teams are actively executing AI math, and which teams are hoarding idle hardware."

## Interview Preparation

**Conceptual:** What is the difference between measuring GPU Allocation and GPU Utilization in Kubernetes? *(Hint: Allocation is a logical state managed by the kube-scheduler; a Pod can reserve a GPU but do nothing with it. Utilization is the physical reality of the silicon, measuring whether the compute cores are actually executing math, captured by tools like DCGM).*

**Architecture:** Why is the DCGM Exporter crucial for cloud-native observability? *(Hint: Raw GPU telemetry is not compatible with standard Kubernetes monitoring tools. The DCGM Exporter translates hardware metrics into the Prometheus format and, crucially, enriches those metrics with Kubernetes Pod and Namespace labels, allowing SREs to map physical hardware spikes directly back to specific user workloads).*
