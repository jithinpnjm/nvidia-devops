---
title: "Chapter 9 — Health Checks and SLOs for GPU Clusters"
sidebar_position: 9
description: "Define the reliability contract. Learn how to construct automated health checks and mathematical Service Level Objectives (SLOs) for AI infrastructure."
---

# Chapter 9 — Health Checks and SLOs for GPU Clusters

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability, Profiling, and Diagnosis |
| Difficulty | Advanced |
| Estimated reading time | 25 minutes |
| Primary audience | SREs, Platform Owners |
| Core question | If a node is technically 'online', how do you mathematically prove it is actually capable of serving production inference traffic? |

## Introduction

In standard Kubernetes, a node is considered `Ready` if the `kubelet` is responding to the API server. 
In AI infrastructure, a node being `Ready` is meaningless. 

A node can be `Ready` while its NVIDIA driver is completely corrupted, its PCIe links are downgraded to 1x speed, and its GPUs are thermal throttling. If the Kubernetes scheduler sends a production workload to this node, the workload will fail, breaching the company's Service Level Objectives (SLOs).

A Senior Architect must design an automated **Health Checking Pipeline** that actively validates the physical silicon before allowing a node to enter the production scheduling pool.

## 1. The Automated Burn-In Test

When you add a new GPU server to a cluster, you never just turn it on and route traffic to it. You must run a "Burn-In."

A burn-in is an automated script (often an Ansible playbook or a Kubernetes Job) that pushes the hardware to its absolute physical limits for a sustained period (e.g., 24 hours). 

**The Burn-In Checklist:**
1.  **Driver Check:** `nvidia-smi` successfully reports the GPU model and topology.
2.  **PCIe Bandwidth Test:** Run a CUDA bandwidth test. Does it achieve the theoretical maximum of the PCIe Gen4/Gen5 slot?
3.  **The DCGM Diagnostic:** Execute `dcgmi diag -r 3`. This runs a comprehensive hardware stress test, checking for hidden ECC memory errors and ensuring the cooling system can handle sustained 100% Thermal Design Power (TDP) without downclocking. 
4.  **Network Burn:** Run `nccl-tests` (as discussed in Vol 9). Prove the InfiniBand/RoCE network is lossless under extreme Incast microbursts.

If any test fails, the node is automatically marked `NotReady` and cordoned.

## 2. Defining the Inference SLO

Once the hardware is validated, you must define the software contract. You cannot manage what you do not measure.

An SLO is a strict mathematical target. 
*   *Bad SLO:* "The API should be fast."
*   *Good SLO:* "99% of successful `chat/completions` requests will have a Time-To-First-Token (TTFT) of < 200ms, measured over a trailing 7-day window."

**The SLI (Service Level Indicator):**
To measure the SLO, you need an SLI. This is the actual metric pulled from Prometheus. 
For the SLO above, the SLI is a PromQL query calculating the P99 TTFT directly from the Triton or vLLM metrics endpoint. 

## 3. The Error Budget

If your SLO is 99% success, you have a 1% **Error Budget**. 

If the cluster suffers a massive crash and consumes the entire 1% error budget for the month, the Senior Architect invokes a freeze. No new features, no model updates, and no infrastructure upgrades are allowed until the next month. 100% of engineering effort is redirected toward fixing reliability. This mathematically aligns the data science team and the infrastructure team.

## Customer Scenario (Senior Level)

**The Situation:**
A bank deploys a fraud detection model to production. The business defines a strict SLO: P99 latency must be under 50ms, as the API is called during credit card swipe authorizations. The deployment team monitors the API gateway logs. The gateway reports an average latency of 30ms, and zero HTTP 500 errors. The deployment team reports the SLO is met. However, the fraud detection rate plummets, and the bank loses money. 

**The Senior Architect Response:**
"The deployment team is reporting a green dashboard based on flawed Service Level Indicators (SLIs). They are measuring the network wrapper, but ignoring the AI engine.

The API gateway reports 30ms latency and HTTP 200 OK because the inference server (Triton) is successfully receiving the request and returning an answer quickly. 

However, because they are not monitoring the deep application metrics, they missed a critical failure mode: **Graceful Degradation / Fallback**. 

During high traffic bursts, the GPUs became saturated. The inference server was configured with a strict 50ms timeout. Because the GPUs could not process the deep neural network math within 50ms, the server aborted the GPU execution. Instead of crashing (which would generate an HTTP 500), the server intentionally returned a pre-calculated, generic 'safe' response (e.g., 'Approve Transaction') to meet the latency deadline. 

The API gateway saw a fast, successful HTTP 200 response, but the business received a fundamentally incorrect, un-scored fraud prediction. 

We must immediately update our SLI definitions. We will not just measure API Gateway latency. We must query Prometheus for the specific inference engine metrics (e.g., `nv_inference_exec_count` vs `nv_inference_request_failure`). An SLO is only valid if it measures both the speed of the response *and the mathematical accuracy of the execution*."

## Interview Preparation

**Conceptual:** Why is a standard Kubernetes `Ready` state insufficient for determining if a GPU node should receive production workloads? *(Hint: Kubernetes only checks if the basic node agent (`kubelet`) is responding. It does not run deep hardware diagnostics. The node could have a thermally throttled GPU, a downgraded PCIe bus, or corrupted CUDA drivers, which would instantly fail any AI workloads assigned to it. SREs must implement dedicated GPU burn-in and health-check pipelines).*

**Architecture:** What is the difference between an SLO (Service Level Objective) and an SLI (Service Level Indicator)? *(Hint: An SLO is the business goal or target (e.g., '99% of requests must complete in under 100ms'). An SLI is the actual technical metric or query used to measure performance against that goal (e.g., the specific Prometheus PromQL query calculating the P99 latency from the inference server's `/metrics` endpoint)).*
