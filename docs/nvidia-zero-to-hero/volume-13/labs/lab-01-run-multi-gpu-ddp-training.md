---
title: Lab 01 — Run Multi-GPU DDP Training
description: Launch a deterministic DDP job, validate rank mapping, throughput, and gradient synchronization.
sidebar_position: 20
tags: [lab, ddp, multi-gpu]
---

# Lab 01 — Run Multi-GPU DDP Training

## 1. Objective
Run a small approved PyTorch DDP workload across multiple GPUs, prove rank-to-device mapping, compare one- and multi-GPU throughput, and clean up.

## 2. Target Audience
This lab is intended for AI Infrastructure Engineers, Platform Engineers, and ML Researchers who need to manage and optimize distributed training workloads.

## 3. Prerequisites
- Access to a multi-GPU node (e.g., 2+ NVIDIA A100 or H100 GPUs).
- NVIDIA Container Toolkit installed and functioning.
- A functional PyTorch distributed environment (PyTorch 2.x).
- Basic understanding of NCCL and Linux process management.

## 4. Architecture Diagram
```mermaid
flowchart LR
    Launcher[torchrun]
    R0[Rank 0 and GPU 0]
    R1[Rank 1 and GPU 1]
    NCCL[NCCL All-Reduce]
    Data[Distributed Sampler]

    Launcher --> R0
    Launcher --> R1
    Data --> R0
    Data --> R1
    R0 <--> NCCL <--> R1
```

## 5. Environment Setup
Verify the environment before running the primary commands:
```bash
nvidia-smi
python -c "import torch; print(torch.cuda.is_available())"
```

## 6. Execution Specifications
**Purpose:** Launch a distributed data parallel training job using torchrun.
**Command:**
```bash
torchrun --nproc_per_node=2 train.py --epochs 5 --batch-size 32
```
**Expected Evidence:** Outputs showing rank 0 and rank 1 initializing process groups and printing decreasing loss values.
**Explanation:** torchrun sets up distributed environment variables (RANK, WORLD_SIZE). train.py initializes NCCL process group and synchronizes gradients via DDP.
**Common Failure:** NCCL Timeout or Address already in use if another process is running.

## 7. Expected Evidence
Beyond the CLI output, you should observe corresponding GPU utilization using `nvidia-smi dmon` or `nvtop` matching the expected parallel workload behavior.

## 8. Explanation of Behavior
The distributed process group coordinates across the GPUs using NCCL. When synchronized, all ranks wait at collective boundaries (like All-Reduce or All-Gather).

## 9. Performance Benchmarking
Monitor throughput metrics (e.g., items/sec or tokens/sec). The multi-GPU throughput should scale efficiently relative to the single-GPU baseline, typically >80% scaling efficiency.

## 10. Common Failures
- **NCCL Timeout:** Usually caused by a network partition or a rank crashing silently without tearing down the process group.
- **OOM (Out of Memory):** Batch size is too large for the available VRAM.

## 11. Safe Failure Injection
**Action:** Manually kill one of the worker processes (e.g., `kill -9 <PID>`) to simulate a node or GPU crash.
**Expected Result:** The process group should hang or crash with an explicit NCCL error.

## 12. Recovery Steps
Restart the job using `torchrun`. PyTorch's Elastic launcher can also be configured to restart automatically if `--max_restarts` is set.

## 13. Troubleshooting Guide
- Check `dmesg -T` for Xid errors (e.g., Xid 79, Xid 13).
- Enable NCCL debug logs by setting `export NCCL_DEBUG=INFO`.
- Ensure firewall rules are not blocking inter-node communication if running across multiple nodes.

## 14. Validation
Validate the outcome by confirming the checkpoint integrity or by ensuring the model loss continues to converge at the expected rate without spikes.

## 15. Real-World Pitfalls
- Forgetting to synchronize the random number generator (RNG) seeds across ranks can cause divergence.
- Unmatched tensor shapes in DDP models if dynamic control flow is used without `.join()`.

## 16. Cleanup Procedures
```bash
# Terminate lingering torchrun processes
pkill -f torchrun
# Remove temporary checkpoints
rm -rf ./checkpoints/*
```

## 17. Knowledge Check
- What happens if one rank crashes during an all-reduce operation?
- How does `torchrun` assign `RANK` and `LOCAL_RANK`?
- What is the difference between NVLink and PCIe data transfers?

## 18. Additional References
- [PyTorch Distributed Overview](https://pytorch.org/tutorials/beginner/dist_overview.html)
- [NVIDIA NCCL Documentation](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/index.html)
