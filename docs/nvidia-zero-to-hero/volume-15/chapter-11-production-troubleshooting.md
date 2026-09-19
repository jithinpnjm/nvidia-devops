---
title: "Chapter 11 — Production Troubleshooting"
sidebar_position: 11
description: "Master the diagnostic workflow for AI data paths. Learn how to isolate bottlenecks using `iostat`, `fio`, and Nsight Systems."
---

# Chapter 11 — Production Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 15 — AI Storage and Data Paths |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Storage Admins, Network Engineers |
| Core question | When the GPU utilization drops to 10% during training, how do you mathematically prove exactly where the data is getting stuck? |

## Introduction

"The storage is slow." 

This is the most common, and most useless, complaint an SRE will receive from an AI team. 
The data path from the storage array to the GPU VRAM is long and complex. The data could be bottlenecked by the physical hard drives, the storage controller CPU, the network switch, the host server NIC, the host CPU (Bounce Buffer), the PyTorch Dataloader code, or the PCIe bus. 

A Senior SRE must execute a rigorous, layer-by-layer diagnostic workflow to mathematically isolate the exact component causing the starvation.

## 1. The Diagnostic Workflow (Isolating the Layers)

When MFU (Model Flops Utilization) drops, you must isolate the storage stack.

### Step 1: The Application Layer (PyTorch)
Is the problem the storage array, or is it terrible Python code?
*   **The Test:** Modify the PyTorch script to generate "fake" random data tensors in memory instead of reading from disk. 
*   **The Result:** If the GPU utilization instantly shoots to 100%, the PyTorch math is fine. The bottleneck is definitely the data loading pipeline.

### Step 2: The Host CPU Layer (The Dataloader)
Is the storage array delivering data fast enough, but the Host CPU is too slow to decompress it?
*   **The Test:** Look at `htop` or `top` on the GPU node. Check the CPU utilization. 
*   **The Result:** If 100% of the CPU cores are pinned at maximum utilization (often waiting on `iowait`), the CPU is the bottleneck. The Python Dataloader is executing heavy data augmentations or unzipping files sequentially. The storage array is innocent. 

### Step 3: The Network / File System Layer (`fio`)
If the CPU is relatively idle, is the storage array actually delivering the required bandwidth to the node?
*   **The Test:** Completely bypass Python and PyTorch. Run a raw synthetic benchmark using `fio` (Flexible I/O Tester) directly against the mounted file system.
*   **The Result:** Configure `fio` to mimic the AI workload (e.g., random 4KB reads for images, or sequential 1MB writes for checkpoints). If `fio` reports 500 MB/s, but you know your network is 100Gbps (12.5 GB/s), you have proven the bottleneck is the storage array, the file system configuration, or the network switch.

## 2. Advanced Telemetry: iostat and Nsight

**Using `iostat`:**
Run `iostat -xz 1` on the host. Look at the `%util` (Utilization) and `await` (Average Wait Time) columns for the specific NVMe drives or network mounts. 
If `%util` is 100%, the physical drive is saturated. If `await` is high (e.g., > 10ms for an NVMe drive), the drive controller is overwhelmed by the IOPS load.

**Using Nsight Systems (`nsys`):**
As discussed in Volume 13, wrap the training script in `nsys`. 
If you look at the timeline and see massive blocks of OS thread activity (file `open()` and `read()` calls) followed by long periods of GPU idle time, you have absolute mathematical proof that the storage pipeline is starving the compute.

## Customer Scenario (Senior Level)

**The Situation:**
An SRE receives an escalation. An AI team is training on a 4-node cluster connected to a premium Weka NVMe storage array via 200G InfiniBand. The GPUs are sitting at 15% utilization. The AI team claims the Weka array is broken. The storage team runs an `fio` test on the nodes, generating 20 GB/s of sequential read throughput, and claims the storage is perfect. The teams are deadlocked.

**The Senior Architect Response:**
"Both teams are looking at the correct metrics but drawing the wrong conclusions because they are not testing the actual workload I/O pattern.

The storage team's `fio` test generated *sequential* reads (simulating a checkpoint or a massive tarball stream). Under sequential load, the Weka array performs perfectly. 
However, if we look at the AI team's actual dataset, they are training a medical imaging model on 10 million individual 20KB DICOM files stored in a massive flat directory. 

This is a massive **IOPS and Metadata Bottleneck**, not a sequential throughput bottleneck. 

To prove this, we will run `iostat` and `nsys` during the actual PyTorch training run. `iostat` will show incredibly low actual bandwidth (MB/s) but sky-high IOPS and wait times. The `nsys` trace will show the Python threads blocked on `os.stat` and `open()` calls. 

The Weka array is perfectly healthy, but no file system in the world can serve 10 million random, tiny file opens per second across a network without latency. 

The immediate fix is to force the AI team to repackage their dataset. They must run a preprocessing script to pack the 10 million tiny DICOM files into large 1GB **WebDataset** or **TFRecord** files. Once packaged, the PyTorch Dataloader will shift from random metadata lookups to massive sequential streams, aligning the software perfectly with the storage array's strength, and returning GPU utilization to 95%."

## Interview Preparation

**Conceptual:** If PyTorch training is slow, how do you mathematically isolate whether the problem is the PyTorch code or the storage array? *(Hint: You use a synthetic data loader. You modify the PyTorch script to stop reading from disk and instead generate random tensors directly in memory. If the GPU utilization instantly jumps to 100%, the PyTorch math is fine, and you have proven the storage/dataloader pipeline is the bottleneck).*

**Architecture:** Why is running a generic `fio` sequential read test useless for diagnosing a computer vision training bottleneck? *(Hint: Computer vision workloads typically involve reading millions of tiny, independent image files (random IOPS and heavy metadata lookups). A generic `fio` test usually measures large sequential throughput. You must configure `fio` to exactly mimic the block size, read pattern (random vs sequential), and file counts of the actual AI workload to get a valid diagnostic result).*
