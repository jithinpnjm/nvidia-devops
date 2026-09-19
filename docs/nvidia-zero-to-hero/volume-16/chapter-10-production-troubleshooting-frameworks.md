---
title: "Chapter 10 — Production Troubleshooting Frameworks"
sidebar_position: 10
description: "Master the USE Method for AI infrastructure. Learn how to systematically diagnose any GPU or network bottleneck without guessing."
---

# Chapter 10 — Production Troubleshooting Frameworks

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability, Profiling, and Diagnosis |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Tier 3 Support, Platform Architects |
| Core question | When the CEO escalates a P1 incident because the AI cluster is "slow," what are the exact first three commands you run to find the root cause? |

## Introduction

In a crisis, junior engineers guess. They reboot nodes, restart pods, and blindly alter configurations, destroying forensic evidence. 

Senior SREs execute a rigid, mathematical framework. They do not guess; they isolate fault domains. 

The industry standard framework for infrastructure diagnosis is the **USE Method** (Utilization, Saturation, and Errors), adapted specifically for the unique physics of GPU and NVLink topologies.

## 1. The USE Method for AI

For every hardware resource (CPU, Memory, GPU, PCIe, NVLink, Network), you check three metrics:

1.  **Utilization:** What percentage of time was the resource busy? (e.g., `DCGM_FI_PROF_SM_ACTIVE`).
2.  **Saturation:** Is there a queue building up because the resource cannot keep up? (e.g., Triton Queue Time, or CPU `iowait`).
3.  **Errors:** Are there hardware or software faults occurring? (e.g., XID errors, NCCL Timeouts).

If you apply this matrix systematically, you will find the bottleneck 100% of the time.

## 2. The AI Diagnostic Tree

When an incident occurs, you start at the top of the stack and work down to the silicon.

### Layer 1: The Application (The Code)
*   **Check:** Is the batch size too large? Is the model running out of memory? 
*   **Signal:** PyTorch logs (`CUDA OOM`).
*   **Resolution:** Implement Gradient Accumulation or FSDP (Volume 13).

### Layer 2: The Host CPU (The Dataloader)
*   **Check:** Are the GPUs starving because the CPU cannot feed them data fast enough?
*   **Signal:** `nsys` profile shows massive white space on the GPU timeline. CPU `iowait` is high. 
*   **Resolution:** Increase `num_workers`, use WebDataset, or implement GPUDirect Storage (Volume 15).

### Layer 3: The Interconnect (PCIe / NVLink)
*   **Check:** Are the GPUs spending all their time syncing instead of doing math?
*   **Signal:** NVLink bandwidth is low, PCIe bandwidth is pegged at 100%. 
*   **Resolution:** The software topology is misaligned. NCCL is falling back to the slow PCIe bus. Fix the MPI ranks or enable NVLink. 

### Layer 4: The Silicon (The GPU)
*   **Check:** Is the GPU physically failing or throttling?
*   **Signal:** `dmesg` shows XID errors. DCGM shows thermal throttling (`CLOCK_THROTTLE_REASONS`).
*   **Resolution:** Cordon the node, run `dcgmi diag`, and execute an RMA.

## Customer Scenario (Senior Level)

**The Situation:**
A massive LLM deployment on Kubernetes begins throwing random HTTP 504 (Gateway Timeout) errors. The platform team looks at the CPU and RAM metrics for the Triton pods, and everything is at 20%. They look at `nvidia-smi` and the GPUs are at 40% utilization. They reboot the API gateway, but the 504 errors continue. They escalate to the Senior SRE, claiming the network is dropping packets.

**The Senior Architect Response:**
"The network is not dropping packets. We are flying blind because we are not using the USE Method against the correct AI abstraction layers.

Let us execute the diagnostic tree. 
First, we check **Errors**. The API Gateway is throwing 504s. This means the Gateway is giving up because Triton is taking too long to respond. 

Second, we check **Utilization**. The GPUs are at 40%. The CPUs are at 20%. The hardware is absolutely not the bottleneck. 

Third, we check **Saturation**. Because the hardware is idle, the saturation must exist within the software queues. We must immediately query Prometheus for the internal Triton metrics, specifically `nv_inference_queue_duration_us` and `nv_inference_exec_count`. 

The query reveals the root cause: The Triton queue duration has spiked to 60,000 milliseconds (60 seconds). 

The hardware is mostly idle because Triton is configured with a severe bottleneck in its concurrent execution limits (e.g., `max_queue_size` or Instance Group count). A massive burst of user traffic hit the server. Because the execution threads were full, Triton placed the requests into an internal software queue. The requests sat in this queue for 60 seconds waiting for a turn on the idle GPU. The API Gateway, configured with a 30-second timeout, gave up and threw the 504 error before Triton even attempted to process the math. 

We will instantly resolve this by reconfiguring Triton's `config.pbtxt` to increase the Instance Group count, allowing more concurrent threads to access the idle GPU, draining the queue and eliminating the timeouts."

## Interview Preparation

**Conceptual:** Explain the USE method. *(Hint: Utilization, Saturation, and Errors. It is a systematic framework for troubleshooting. For every component in a system (GPU, Network, Storage), you check how busy it is (Utilization), if it has a backlog of work waiting (Saturation), and if it is generating physical or logical faults (Errors). This prevents engineers from randomly guessing at root causes).*

**Architecture:** If a GPU is at 100% utilization, but the application is still missing its latency SLA, where do you look next in the USE framework? *(Hint: If Utilization is 100%, you must look at Saturation. The GPU is completely maxed out, which means incoming requests have nowhere to go but a queue. You must check the application's queue length (e.g., Triton queue metrics). If the queue is growing, the system is saturated, and the only architectural fixes are to optimize the code to run faster or scale out by adding more GPUs to the cluster).*
