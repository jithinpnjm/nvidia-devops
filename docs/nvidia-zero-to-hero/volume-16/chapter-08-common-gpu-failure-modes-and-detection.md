---
title: "Chapter 8 — Common GPU Failure Modes and Detection"
sidebar_position: 8
description: "Diagnose hardware degradation. Learn how to interpret XID errors, ECC bit flips, and PCIe bus faults before they crash production."
---

# Chapter 8 — Common GPU Failure Modes and Detection

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability, Profiling, and Diagnosis |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Data Center Operations |
| Core question | When a neural network suddenly starts generating total garbage (NaNs), how do you prove it's a degraded memory chip and not a bad hyperparameter? |

## Introduction

Hardware breaks. 
At massive scale, GPUs run at maximum thermal capacity (TDP) for months on end. This sustained electrical and thermal stress inevitably degrades the silicon. 

A Senior SRE must distinguish between a software crash (bad code) and a hardware fault (dying silicon). 
If you fail to diagnose a dying GPU, the Kubernetes scheduler will keep sending workloads to it. The workloads will silently fail, generating corrupted data (NaNs) or crashing the entire distributed training ring.

To manage this, you must master the **NVIDIA XID Error** framework and ECC memory metrics.

## 1. The XID Error Framework

When the NVIDIA driver detects a hardware or software fault, it generates an **XID Error**. 
These errors are logged directly to the host operating system's kernel ring buffer. You must monitor `/var/log/syslog` or use `dmesg` to find them. 

*Architectural Mandate:* Your centralized logging system (Elasticsearch/Splunk) must have an alert configured for the regex `NVRM: Xid`. 

**Critical XID Codes to Memorize:**
*   **XID 13 (Graphics Engine Exception):** Usually a software bug. A CUDA kernel did something illegal (like an out-of-bounds memory read). The application crashes, but the hardware is fine. 
*   **XID 31 (Memory Page Fault):** The application tried to access VRAM it didn't allocate. Often caused by bad pointers in C++ code.
*   **XID 48 (Double-Bit ECC Error):** **Hardware Failure.** The VRAM is physically degraded. The data is corrupted. The GPU must be taken out of production immediately.
*   **XID 62/63 (Page Retirement):** The driver detected degraded memory pages and permanently disabled them. A warning sign of impending hardware failure.
*   **XID 79 (Fallen off the bus):** **Hardware Failure.** The GPU completely stopped communicating over the PCIe bus. Usually caused by physical motherboard issues, bad power delivery, or extreme overheating. 

## 2. ECC Memory: Correctable vs. Uncorrectable

GPUs use Error Correcting Code (ECC) memory. Cosmic rays or silicon degradation can flip a 0 to a 1 in VRAM.

*   **Single-Bit Errors (SBE):** The ECC algorithm detects the flipped bit and fixes it on the fly. The application continues running flawlessly.
    *   *SRE Action:* Monitor `DCGM_FI_DEV_ECC_SBE_VOL_TOTAL`. A few SBEs are normal. If a specific GPU sees thousands of SBEs a day, it is heavily degraded and should be scheduled for replacement.
*   **Double-Bit Errors (DBE):** Two bits flipped simultaneously. The ECC algorithm can detect this, but it *cannot fix it*. The data is corrupt. 
    *   *SRE Action:* The NVIDIA driver immediately throws an XID 48, hard-crashes the application using that memory, and poisons the VRAM page. The GPU must be replaced.

## 3. PCIe and NVLink Link Downgrades

Sometimes a component doesn't die completely; it just degrades. 

If a PCIe slot is dusty, or an NVLink cable is bent, the hardware error correction will detect massive signal noise. To stabilize the connection, the hardware will automatically **downgrade the link speed**. 
A PCIe Gen4 x16 link (64 GB/s) might silently negotiate down to a PCIe Gen3 x8 link (8 GB/s). 

The cluster stays online. There are no crash logs. But the training job takes 8x longer. You must actively monitor `DCGM_FI_DEV_PCIE_LINK_WIDTH` and `GEN` to catch silent downgrades.

## Customer Scenario (Senior Level)

**The Situation:**
A massive LLM training job crashes randomly on a 100-node cluster. The PyTorch logs simply say `CUDA error: uncorrectable NVLink error detected`. The data science team restarts the job, but it fails again 4 hours later. The SRE team checks the Grafana dashboards, but sees no massive heat spikes or power drops. They reboot the entire cluster. The job crashes again.

**The Senior Architect Response:**
"Rebooting the cluster is 'hope-driven operations'. It resets the software state but does absolutely nothing to fix a physical hardware degradation.

The PyTorch log indicates an uncorrectable NVLink error. This means data was physically corrupted while traveling between GPUs across the NVSwitch fabric. 

We must move past the application logs and interrogate the hardware layer. 
We will query our centralized logging system (Elasticsearch) and filter the `dmesg` kernel logs across all 100 nodes for the string `NVRM: Xid`. 

We find that Node 42 recorded an **XID 74 (NVLink Error)** exactly 2 seconds before the PyTorch job crashed. 

This proves that the physical NVLink connection on Node 42 is degraded—perhaps a damaged NVSwitch component on the HGX baseboard. 

Because we are running a tightly coupled distributed training job, a hardware failure on one specific link will poison the math and crash the entire 100-node collective. We will immediately cordon Node 42 in Kubernetes to remove it from the scheduling pool, allowing the training job to resume safely on the remaining 99 nodes while we initiate an RMA for the degraded hardware."

## Interview Preparation

**Conceptual:** What is the difference between a Single-Bit ECC Error (SBE) and a Double-Bit ECC Error (DBE)? *(Hint: An SBE is a minor data corruption that the GPU hardware instantly detects and corrects on the fly without impacting the application. A DBE is a severe corruption that the hardware detects but cannot fix. It results in corrupted data, triggering an XID 48 error, and requires the OS to crash the application to prevent the spread of bad math).*

**Architecture:** Why must an SRE configure alerts for silent PCIe link downgrades? *(Hint: If a motherboard slot or GPU connector is physically degraded, the hardware will automatically downgrade the PCIe link speed (e.g., from Gen4 x16 to Gen3 x8) to maintain stability. The system will not crash, and no error logs will be generated, but the GPU's data bandwidth will be slashed by 75%, silently crippling the performance of the AI cluster).*
