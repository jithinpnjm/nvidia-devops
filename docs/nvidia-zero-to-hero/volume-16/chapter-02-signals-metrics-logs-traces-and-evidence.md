---
title: "Chapter 2 — Signals: Metrics, Logs, Traces, and Evidence"
sidebar_position: 2
description: "Master the three pillars of observability in an AI context. Learn how to correlate metrics, logs, and traces to solve complex distributed failures."
---

# Chapter 2 — Signals: Metrics, Logs, Traces, and Evidence

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability, Profiling, and Diagnosis |
| Difficulty | Intermediate |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Platform Engineers |
| Core question | When a multi-node training job crashes after 4 days, what exact forensic evidence do you need to prove why it failed? |

## Introduction

"The job failed." 
This is the starting point for every SRE investigation. If you do not have the correct telemetry signals instrumented *before* the crash occurs, the investigation will be a guessing game.

Observability is built on three foundational pillars: **Metrics**, **Logs**, and **Traces**. 
In standard web architecture, these are well understood. In AI infrastructure, the definitions shift to accommodate massive scale, hardware faults, and synchronous execution.

A Senior Architect designs a system that captures all three signals continuously and correlates them mathematically.

## 1. Metrics (The 'What')

Metrics are numeric data points recorded over time (Time-Series Data). They are cheap to store and fast to query. They tell you *what* is happening right now, or what the trend is.

**In an AI context:**
*   *Host Metrics:* CPU usage, host memory, disk IOPS (Prometheus Node Exporter).
*   *GPU Metrics:* GPU utilization, power draw, temperature, NVLink bandwidth (DCGM Exporter).
*   *Application Metrics:* Triton queue length, KV cache usage, batch size (Triton Metrics Endpoint).

**The Architectural Goal:** You use metrics for **Alerting** and **Dashboards**. If GPU power draw drops from 700W to 50W across 64 nodes simultaneously, an alert fires. Metrics tell you the job died. They do not tell you *why*.

## 2. Logs (The 'Why')

Logs are immutable records of discrete events. They provide the context required to understand why a metric spiked or crashed.

**In an AI context, logs are distributed and massive:**
*   *Application Logs:* The PyTorch Python stack trace (e.g., `CUDA Out of Memory` or `ProcessGroupNCCL: Timeout`).
*   *System Logs:* The Linux kernel ring buffer (`dmesg`). This is critical. If a GPU physically dies, the hardware fault (XID error) is recorded here, not in the PyTorch application logs.
*   *Scheduler Logs:* Kubernetes `kubelet` or Slurm controller logs showing why a pod was evicted.

**The Architectural Goal:** You use a centralized logging aggregator (Elasticsearch, Splunk, Loki). An SRE must be able to search for a specific `job_id` and instantly see the application logs interleaved with the underlying host's kernel logs.

## 3. Traces (The 'Where')

Tracing follows a single request or execution thread as it moves through a complex, distributed system. 

**In an AI context, tracing is split into two domains:**
1.  **Distributed Tracing (Inference):** Using OpenTelemetry (Jaeger/Zipkin) to trace an API request as it moves from the API Gateway, to the Load Balancer, to the Triton Server, tracking exactly how many milliseconds it spent in each microservice.
2.  **Execution Profiling (Training):** Using NVIDIA Nsight Systems (`nsys`) to trace the execution of a CUDA kernel across the PCIe bus and onto the silicon, proving exactly where the math is stalling.

## Customer Scenario (Senior Level)

**The Situation:**
A massive LLM training job running across 32 nodes crashes randomly every few days. The data science team checks their PyTorch logs in Datadog and sees a generic `NCCL Timeout` error. They complain to the infrastructure team that the InfiniBand network is unstable and dropping packets. The network team checks their switch metrics and says the network is perfect. The teams are deadlocked.

**The Senior Architect Response:**
"We are deadlocked because we are attempting to diagnose a distributed failure using siloed telemetry signals. The PyTorch logs tell us *what* failed (the network synchronization timed out), but they do not contain the evidence of *why*. 

A generic NCCL timeout simply means that one or more GPUs failed to respond during a collective operation within the expected time limit. This can be caused by a network switch failure, but it is equally likely to be caused by a localized hardware failure on a single GPU that stalled the entire synchronization ring.

To prove the root cause, we must correlate the signals across all layers. 
We will execute a centralized log search in Elasticsearch for the exact timestamp of the NCCL timeout. We will filter not just for the PyTorch application logs, but crucially, for the **Linux kernel logs (`dmesg`)** across all 32 participating nodes within a 5-minute window of the crash. 

We are highly likely to find that exactly one node recorded an **XID 48 (Double-Bit ECC Memory Error)** or an **XID 79 (Fallen off the bus)** hardware fault in its kernel logs seconds before the NCCL timeout occurred. The hardware fault killed a single GPU, causing it to stop responding to the network, which then triggered the cascading NCCL timeout across the other 31 healthy nodes. By correlating the OS logs with the application logs, we prove the issue is degraded silicon, not the InfiniBand switches."

## Interview Preparation

**Conceptual:** Explain the difference between Metrics and Logs when diagnosing an AI cluster failure. *(Hint: Metrics are numeric, time-series data (like GPU utilization dropping to 0%) that tell you a problem has occurred and trigger alerts. Logs are text-based records of specific events (like a Linux kernel `dmesg` output showing an XID 48 hardware error) that provide the context to understand exactly why the metric dropped).*

**Architecture:** Why is centralized logging (e.g., Elasticsearch/Loki) mandatory for distributed training? *(Hint: A distributed training job spans dozens or hundreds of independent physical nodes. If the job crashes, the root cause might be a hardware failure on Node 42. Without a centralized logging system that aggregates the OS and Application logs from all nodes into a single searchable dashboard, an SRE would have to manually SSH into 100 servers to find the one kernel panic).*
