---
title: "Chapter 10 — Capacity, Performance, and Cost Planning"
sidebar_position: 10
description: "Master FinOps for AI Storage. Learn how to architect multi-tiered storage systems that balance extreme performance with long-term data retention budgets."
---

# Chapter 10 — Capacity, Performance, and Cost Planning

| Chapter metadata | Value |
|---|---|
| Volume | 15 — AI Storage and Data Paths |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | Solutions Architects, FinOps, Storage Leads |
| Core question | If NVMe storage costs $1000/TB and S3 costs $20/TB, how do you build a 50-Petabyte AI data lake without bankrupting the company? |

## Introduction

In AI infrastructure, storage is often the second largest capital expense (CapEx) after the GPUs themselves. 

If a Senior Architect specifies that all 50 Petabytes of corporate data must live on an ultra-high-performance NVMe Parallel File System, the CFO will reject the design instantly. 
If the Architect specifies that all 50 Petabytes must live on cheap, slow S3 object storage, the training jobs will stall, and the $50 Million GPU cluster will sit idle, resulting in an even worse Return on Investment (ROI).

You must design a **Tiered Storage Architecture** that satisfies the brutal mathematics of GPU throughput while adhering to strict financial constraints.

## 1. The Mathematics of Storage Tiering

A production AI storage architecture consists of at least three distinct tiers, managed by automated data lifecycle policies.

### Tier 1: The Hot Scratch (The Arena)
*   **Technology:** Local NVMe arrays (e.g., inside the DGX) or a small, ultra-fast NVMe Parallel File System (Weka, Lustre, VAST).
*   **Purpose:** To feed active training jobs and absorb massive checkpoint bursts instantly. 
*   **Capacity Rule:** Should only be large enough to hold the *currently active* datasets and the last 3 checkpoints. (e.g., 500 TB total).
*   **Cost:** Extremely high.

### Tier 2: The Warm Lake (The Repository)
*   **Technology:** High-capacity Enterprise NAS (Isilon, NetApp) or On-Premises High-Performance Object Storage (MinIO on HDDs/SSDs).
*   **Purpose:** To store curated, formatted datasets (e.g., WebDataset tarballs) ready to be staged into Tier 1 for upcoming experiments.
*   **Capacity Rule:** Holds the active data science workspace. (e.g., 5 Petabytes).
*   **Cost:** Moderate.

### Tier 3: The Cold Archive (The Vault)
*   **Technology:** Public Cloud S3 (Glacier) or massive on-premises Tape/HDD arrays.
*   **Purpose:** To store the raw, unformatted petabytes of telemetry data, old experiments, and historical checkpoints required for compliance. 
*   **Capacity Rule:** Infinite. (e.g., 50 Petabytes).
*   **Cost:** Very low.

## 2. Automated Data Movement (Data Staging)

A tiered architecture is useless if data scientists have to manually copy 10TB files between systems.

The Senior Architect must implement a **Data Orchestration Engine**. 
1.  A data scientist submits a Kubernetes training job.
2.  The orchestrator reads the job YAML, identifies the dataset required from Tier 2, and automatically copies it into the fast Tier 1 NVMe scratch space.
3.  The job trains at maximum speed.
4.  The orchestrator detects the job has finished, automatically copies the final model weights to Tier 2, and deletes the dataset from Tier 1, freeing the expensive NVMe space for the next job.

## 3. The IOPS vs. Bandwidth Dilemma

When purchasing Tier 1 storage, you must explicitly define whether your workload is **IOPS-bound** or **Bandwidth-bound**.

*   **Bandwidth-Bound:** Large Language Models (LLMs). The data consists of massive sequential text corpuses. You need raw throughput (GB/s). You can often achieve this with fewer, very large NVMe drives.
*   **IOPS-Bound:** Computer Vision or Audio. The data consists of millions of tiny files. You need massive I/O Operations Per Second (IOPS). You must purchase arrays with highly optimized metadata controllers and *many* smaller NVMe drives to aggregate the queue depths.

## Customer Scenario (Senior Level)

**The Situation:**
A massive enterprise buys 50 Petabytes of high-performance Weka NVMe storage to build their new AI data lake. They ingest all their raw corporate data directly into it. Six months later, the cluster is 99% full. The AI team demands another $10 Million to double the Weka storage. The CFO refuses. The AI team claims they cannot delete any data because they "might need to train on it later."

**The Senior Architect Response:**
"The architecture has failed financially because it lacks a data lifecycle management strategy. You have treated Tier-1 hot scratch space as a permanent data archive.

Weka is an elite, high-performance Parallel File System designed to feed hungry GPUs. It is mathematically irresponsible to store 50 Petabytes of raw, inactive corporate data on premium NVMe drives. 

We will not purchase more NVMe storage. We will implement a strict **Tiered Storage Architecture**. 

First, we will procure a massive, cheap Object Storage cluster (like MinIO backed by high-capacity HDDs) to act as Tier 2 and Tier 3. 
Second, we will implement automated data lifecycle policies. Any raw data that has not been actively read by a PyTorch training job in the last 14 days will be automatically and transparently tiered off the Weka NVMe drives and pushed into the cheap Object Store. 

When a data scientist needs an older dataset, the data orchestration layer will transparently pull it back from the Object Store into the Weka NVMe tier (Data Staging) before the training job begins. 

This architecture will instantly free up 90% of the expensive Weka NVMe capacity for active training and checkpoint bursts, satisfying the AI team's performance needs while adhering to the CFO's budget constraints."

## Interview Preparation

**Conceptual:** What is the primary financial reason for implementing a Tiered Storage Architecture for AI? *(Hint: High-performance NVMe storage (Tier 1) required to keep GPUs fed is extremely expensive. Storing petabytes of raw, inactive data on Tier 1 destroys the project's ROI. You must push inactive data to cheap, slow Object Storage (Tier 3), and only automatically stage active datasets into Tier 1 right before training begins).*

**Architecture:** Describe the difference between a Bandwidth-bound storage workload and an IOPS-bound storage workload. *(Hint: Bandwidth-bound workloads (like LLM text training or massive checkpoint writes) require moving massive sequential files at high GB/s. IOPS-bound workloads (like unoptimized computer vision loading millions of tiny JPEGs) require the storage controller to handle massive amounts of rapid, random metadata lookups and small file reads).*
