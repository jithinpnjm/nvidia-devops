---
title: "Chapter 10 — Observability and SLOs for Shared GPUs"
sidebar_position: 10
description: "Master the telemetry of fractional hardware. Learn how to track performance, define SLOs, and identify noisy neighbors on partitioned GPUs."
---

# Chapter 10 — Observability and SLOs for Shared GPUs

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Performance Engineers |
| Core question | If a MIG slice experiences an ECC memory error, how do you alert on it without accidentally paging the SREs for the other 6 healthy slices on the same physical card? |

## Introduction

In Volume 10, we introduced DCGM Exporter for monitoring full, physical GPUs. 
When you introduce MIG or Time-Slicing, observability becomes exponentially more difficult. 

If you just monitor the physical GPU, the metrics are blended. If the physical GPU shows 80% utilization, is MIG Instance A running at 100% and MIG Instance B at 0%, or are they both running at 40%? 

To guarantee Service Level Objectives (SLOs) for multi-tenant workloads, an SRE must be able to observe the performance and health of the *fractional* GPU instances independently.

## 1. DCGM for Multi-Instance GPU (MIG)

Fortunately, the NVIDIA GPU Operator handles MIG observability natively.

When the GPU Operator detects that a GPU has been partitioned into MIG slices, it automatically configures the DCGM Exporter to track metrics at the MIG Instance level, rather than just the physical GPU level.

**The Prometheus Output:**
Instead of a generic metric like:
`DCGM_FI_DEV_GPU_UTIL{gpu="0"}`

You receive highly specific, fractional metrics:
`DCGM_FI_DEV_GPU_UTIL{gpu="0", MIG_Profile="1g.10gb", MIG_UUID="MIG-1234-abcd...", namespace="finance", pod="api-serve"}`

This allows an SRE to build Grafana dashboards that prove, mathematically, that the `api-serve` pod in the `finance` namespace is maxing out the compute cores of its specific 10GB MIG slice.

## 2. Defining SLOs on Shared Hardware

An SLO (Service Level Objective) defines the acceptable performance of a service. 
In AI inference, the primary SLO is usually **Latency** (e.g., "P99 Time-To-First-Token must be < 200ms").

**The Danger of Time-Slicing:**
You cannot write a strict latency SLO for an application running on a Time-Sliced GPU. Because Time-Slicing offers zero QoS isolation, the latency of the application is entirely dependent on the behavior of the other random workloads sharing the physical GPU at that exact millisecond. If you commit to an SLO on Time-Slicing, you will breach it.

**The Power of MIG:**
You *can* write strict latency SLOs for applications running on MIG. Because MIG provides dedicated hardware SMs and L2 Cache, the performance of the MIG slice is deterministic. You track the DCGM metrics for that specific MIG UUID and correlate them with the application's HTTP response times to prove adherence to the SLO.

## Customer Scenario (Senior Level)

**The Situation:**
A Platform team manages a large cluster of A100s partitioned entirely into `2g.20gb` MIG slices. An application team complains that their inference Pod randomly reboots every few hours, breaching their availability SLO. The Platform team looks at standard Kubernetes metrics and sees nothing wrong. The application team blames the Kubernetes scheduler for being unstable.

**The Senior Architect Response:**
"The Kubernetes scheduler is not rebooting your pod; it is responding to a localized hardware fault on a fractional piece of silicon.

When dealing with MIG, we must remember that a physical GPU can suffer partial hardware failures. 
It is highly probable that the specific `2g.20gb` MIG slice assigned to this Pod is experiencing an **XID 48 (Double-Bit ECC Memory Error)** within its physically isolated VRAM partition. 

Because we rely on standard Kubernetes metrics (which are completely blind to GPU hardware physics), we missed the error. 

We must immediately check the **DCGM Exporter** logs and the Prometheus time-series data for the specific `MIG_UUID` assigned to that Pod. We will look for the `DCGM_FI_DEV_XID_ERRORS` metric. 

When a critical XID error occurs on a MIG slice, the NVIDIA Device Plugin detects it, marks that specific MIG UUID as 'Unhealthy', and informs the kubelet. The kubelet then evicts the Pod from the broken slice, which explains the random reboots. We must use DCGM to identify the exact physical server and MIG index, cordon the node, and initiate a hardware RMA, proving that the issue was silicon degradation, not platform instability."

## Interview Preparation

**Conceptual:** Why is standard physical GPU monitoring insufficient when using MIG? *(Hint: Physical monitoring blends all the data. You need to know if a specific workload is bottlenecking its specific fractional instance. DCGM Exporter must be configured to output metrics tagged with the specific `MIG_UUID` to isolate performance data per tenant).*

**Architecture:** Can you guarantee a strict P99 latency SLA for a workload running on a Time-Sliced GPU? Why or why not? *(Hint: No. Time-Slicing has no hardware isolation. A "noisy neighbor" running a heavy batch job on the same physical GPU will consume the shared L2 cache and memory bandwidth, causing unpredictable, massive latency spikes for the SLA-bound workload).*
