import os

LABS = [
    {
        "file": "lab-01-run-multi-gpu-ddp-training.md",
        "title": "Lab 01 — Run Multi-GPU DDP Training",
        "description": "Launch a deterministic DDP job, validate rank mapping, throughput, and gradient synchronization.",
        "sidebar_position": 20,
        "tags": "[lab, ddp, multi-gpu]",
        "objective": "Run a small approved PyTorch DDP workload across multiple GPUs, prove rank-to-device mapping, compare one- and multi-GPU throughput, and clean up.",
        "arch": """flowchart LR
    Launcher[torchrun]
    R0[Rank 0 and GPU 0]
    R1[Rank 1 and GPU 1]
    NCCL[NCCL All-Reduce]
    Data[Distributed Sampler]

    Launcher --> R0
    Launcher --> R1
    Data --> R0
    Data --> R1
    R0 <--> NCCL <--> R1""",
        "cli_purpose": "Launch a distributed data parallel training job using torchrun.",
        "cli_command": "torchrun --nproc_per_node=2 train.py --epochs 5 --batch-size 32",
        "cli_expected": "Outputs showing rank 0 and rank 1 initializing process groups and printing decreasing loss values.",
        "cli_explanation": "torchrun sets up distributed environment variables (RANK, WORLD_SIZE). train.py initializes NCCL process group and synchronizes gradients via DDP.",
        "cli_failure": "NCCL Timeout or Address already in use if another process is running.",
        "failure_inj": "Manually kill one of the worker processes (e.g., `kill -9 <PID>`) to simulate a node or GPU crash.",
        "recovery": "Restart the job using `torchrun`. PyTorch's Elastic launcher can also be configured to restart automatically if `--max_restarts` is set.",
    },
    {
        "file": "lab-02-benchmark-nccl-collectives.md",
        "title": "Lab 02 — Benchmark NCCL Collectives",
        "description": "Benchmark all-reduce across GPU counts and nodes, record topology, and identify degraded paths.",
        "sidebar_position": 21,
        "tags": "[lab, nccl, benchmarking]",
        "objective": "Establish a repeatable collective-communication baseline for one node and multiple nodes.",
        "arch": """flowchart TD
    GPU0 <--> NVLink <--> GPU1
    GPU0 <--> PCIe <--> NIC0
    NIC0 <--> Switch <--> NIC1""",
        "cli_purpose": "Run NCCL all_reduce_perf to measure collective bandwidth.",
        "cli_command": "./build/all_reduce_perf -b 8 -e 128M -f 2 -g 8",
        "cli_expected": "A table showing message size, algorithm bandwidth, and bus bandwidth scaling up to near-hardware limits.",
        "cli_explanation": "This test measures out-of-box NCCL performance by performing all-reduce operations across 8 GPUs, scaling message size from 8 bytes to 128 MB.",
        "cli_failure": "Low bandwidth due to falling back to PCIe instead of NVLink, often caused by ACS being enabled or topology issues.",
        "failure_inj": "Disable NVLink or export `NCCL_P2P_DISABLE=1` to force PCIe fallback and observe the bandwidth drop.",
        "recovery": "Unset the environment variables or re-enable NVLink, then rerun the benchmark to confirm bandwidth is restored to baseline.",
    },
    {
        "file": "lab-03-test-sharded-training-with-fsdp.md",
        "title": "Lab 03 — Test Sharded Training with FSDP",
        "description": "Compare DDP and FSDP memory, communication, checkpointing, and step time.",
        "sidebar_position": 22,
        "tags": "[lab, fsdp, sharding]",
        "objective": "Run the same model with DDP and FSDP, compare peak memory and throughput, and validate a sharded checkpoint restore.",
        "arch": """flowchart LR
    Model[Large Model]
    Shards[Parameter Shards]
    FSDP[Fully Sharded Data Parallel]
    
    Model --> FSDP
    FSDP --> Shards
    Shards --> GPU0
    Shards --> GPU1""",
        "cli_purpose": "Run an FSDP script and monitor peak memory usage.",
        "cli_command": "torchrun --nproc_per_node=4 train_fsdp.py --sharding-strategy FULL_SHARD",
        "cli_expected": "Memory consumption per GPU is roughly 1/4 of the total model size, gradients all-gather during forward/backward passes.",
        "cli_explanation": "FSDP shards the model parameters, gradients, and optimizer states across all participating GPUs, reducing per-GPU memory footprint at the cost of communication overhead.",
        "cli_failure": "OOM (Out of Memory) if the model is still too large or if CPU offloading is required but not enabled.",
        "failure_inj": "Attempt to restore an FSDP checkpoint onto a different number of GPUs without configuring the correct state dict mapping.",
        "recovery": "Use PyTorch's distributed checkpointing API to properly stitch and reshard the checkpoint for the new world size.",
    },
    {
        "file": "lab-04-recover-a-distributed-training-job.md",
        "title": "Lab 04 — Recover a Distributed Training Job",
        "description": "Create, interrupt, and restore a multi-rank training job from a validated checkpoint.",
        "sidebar_position": 23,
        "tags": "[lab, recovery, checkpointing]",
        "objective": "Prove that a distributed job can recover after a controlled rank or node failure without silently losing state.",
        "arch": """flowchart TD
    Job[Training Job] --> Ckpt[Save Checkpoint]
    Ckpt --> Storage[Shared Storage / S3]
    Crash[Node Failure] -.-> Job
    Storage --> Restore[Resume Job]""",
        "cli_purpose": "Resume training from a specific checkpoint file.",
        "cli_command": "torchrun --nproc_per_node=4 train.py --resume-from ./checkpoints/epoch_3.pt",
        "cli_expected": "Training resumes at epoch 4, loss matches exactly the loss recorded in the control run.",
        "cli_explanation": "Restoring from a checkpoint loads model weights, optimizer state, LR scheduler, and RNG state to ensure deterministic continuation.",
        "cli_failure": "Checkpoint corrupted, missing keys, or mismatch in tensor sizes.",
        "failure_inj": "Delete a chunk of the checkpoint file or rename a parameter key in the state dict and attempt to resume.",
        "recovery": "Identify the missing shard, restore it from backup storage or a previous epoch, and relaunch the job.",
    }
]

TEMPLATE = """---
title: {title}
description: {description}
sidebar_position: {sidebar_position}
tags: {tags}
---

# {title}

## 1. Objective
{objective}

## 2. Target Audience
This lab is intended for AI Infrastructure Engineers, Platform Engineers, and ML Researchers who need to manage and optimize distributed training workloads.

## 3. Prerequisites
- Access to a multi-GPU node (e.g., 2+ NVIDIA A100 or H100 GPUs).
- NVIDIA Container Toolkit installed and functioning.
- A functional PyTorch distributed environment (PyTorch 2.x).
- Basic understanding of NCCL and Linux process management.

## 4. Architecture Diagram
```mermaid
{arch}
```

## 5. Environment Setup
Verify the environment before running the primary commands:
```bash
nvidia-smi
python -c "import torch; print(torch.cuda.is_available())"
```

## 6. Execution Specifications
**Purpose:** {cli_purpose}
**Command:**
```bash
{cli_command}
```
**Expected Evidence:** {cli_expected}
**Explanation:** {cli_explanation}
**Common Failure:** {cli_failure}

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
**Action:** {failure_inj}
**Expected Result:** The process group should hang or crash with an explicit NCCL error.

## 12. Recovery Steps
{recovery}

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
"""

for lab in LABS:
    filepath = f"docs/nvidia-zero-to-hero/volume-13/labs/{lab['file']}"
    with open(filepath, "w") as f:
        f.write(TEMPLATE.format(**lab))
    print(f"Updated {filepath}")

