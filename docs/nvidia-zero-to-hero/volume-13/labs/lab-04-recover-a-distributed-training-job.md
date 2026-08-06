---
title: Lab 04 — Recover a Distributed Training Job
description: Create, interrupt, and restore a multi-rank training job from a validated checkpoint.
sidebar_position: 23
tags: [lab, recovery, checkpointing]
---

# Lab 04 — Recover a Distributed Training Job

## 1. Objective
Prove that a distributed job can recover after a controlled rank or node failure without silently losing state.

## 2. Target Audience
This lab is intended for AI Infrastructure Engineers, Platform Engineers, and ML Researchers who need to manage and optimize distributed training workloads.

## 3. Prerequisites
- Access to a multi-GPU node (e.g., 2+ NVIDIA A100 or H100 GPUs).
- NVIDIA Container Toolkit installed and functioning.
- A functional PyTorch distributed environment (PyTorch 2.x).
- Basic understanding of NCCL and Linux process management.

## 4. Architecture Diagram
```mermaid
flowchart TD
    Job[Training Job] --> Ckpt[Save Checkpoint]
    Ckpt --> Storage[Shared Storage / S3]
    Crash[Node Failure] -.-> Job
    Storage --> Restore[Resume Job]
```

## 5. Environment Setup
Verify the environment before running the primary commands:
```bash
nvidia-smi
python -c "import torch; print(torch.cuda.is_available())"
```

## 6. Execution Specifications
**Purpose:** Resume training from a specific checkpoint file.
**Command:**
```bash
torchrun --nproc_per_node=4 train.py --resume-from ./checkpoints/epoch_3.pt
```
**Expected Evidence:** Training resumes at epoch 4, loss matches exactly the loss recorded in the control run.
**Explanation:** Restoring from a checkpoint loads model weights, optimizer state, LR scheduler, and RNG state to ensure deterministic continuation.
**Common Failure:** Checkpoint corrupted, missing keys, or mismatch in tensor sizes.

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
**Action:** Delete a chunk of the checkpoint file or rename a parameter key in the state dict and attempt to resume.
**Expected Result:** The process group should hang or crash with an explicit NCCL error.

## 12. Recovery Steps
Identify the missing shard, restore it from backup storage or a previous epoch, and relaunch the job.

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
