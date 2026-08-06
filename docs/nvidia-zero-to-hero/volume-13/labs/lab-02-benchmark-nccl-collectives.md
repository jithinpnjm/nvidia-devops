---
title: Lab 02 — Benchmark NCCL Collectives
description: Benchmark all-reduce across GPU counts and nodes, record topology, and identify degraded paths.
sidebar_position: 21
tags: [lab, nccl, benchmarking]
---

# Lab 02 — Benchmark NCCL Collectives

## 1. Objective
Establish a repeatable collective-communication baseline for one node and multiple nodes.

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
    GPU0 <--> NVLink <--> GPU1
    GPU0 <--> PCIe <--> NIC0
    NIC0 <--> Switch <--> NIC1
```

## 5. Environment Setup
Verify the environment before running the primary commands:
```bash
nvidia-smi
python -c "import torch; print(torch.cuda.is_available())"
```

## 6. Execution Specifications
**Purpose:** Run NCCL all_reduce_perf to measure collective bandwidth.
**Command:**
```bash
./build/all_reduce_perf -b 8 -e 128M -f 2 -g 8
```
**Expected Evidence:** A table showing message size, algorithm bandwidth, and bus bandwidth scaling up to near-hardware limits.
**Explanation:** This test measures out-of-box NCCL performance by performing all-reduce operations across 8 GPUs, scaling message size from 8 bytes to 128 MB.
**Common Failure:** Low bandwidth due to falling back to PCIe instead of NVLink, often caused by ACS being enabled or topology issues.

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
**Action:** Disable NVLink or export `NCCL_P2P_DISABLE=1` to force PCIe fallback and observe the bandwidth drop.
**Expected Result:** The process group should hang or crash with an explicit NCCL error.

## 12. Recovery Steps
Unset the environment variables or re-enable NVLink, then rerun the benchmark to confirm bandwidth is restored to baseline.

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
