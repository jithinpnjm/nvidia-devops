---
title: "Chapter 9 - Job Provisioning, Health Gating, and Workflow Orchestration"
slug: "chapter-9-job-provisioning-health-gating-and-workflow-orchestration"
sidebar_position: 9
description: "Comprehensive beginner-to-advanced masterclass on hardware health gating architectures for AI Factories: eliminating silent stragglers, Slurm Prolog/Epilog automation, DCGM diagnostic tiers, automated node quarantining, and workflow orchestrators."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---

# Chapter 9 — Job Provisioning, Health Gating, and Workflow Orchestration

**Learning outcome:** Architect, write, and safely operate production-grade job provisioning, health gating mechanisms, and workflow orchestrations in an NVIDIA AI Factory. You will master Slurm Prolog/Epilog hooks, DCGM diagnostics, hardware error identification (XID codes), automated node quarantining, Node Health Check (NHC) framework integration, and workflow orchestration concepts using Apache Airflow and Kubeflow. You will also dive deep into PyTorch DDP submission scripts, Kubernetes Volcano schedulers, and Prometheus alerting rules for silent straggler detection.

**Prerequisites:** Familiarity with Linux command line, cluster computing basics, basic Slurm administration (`slurm.conf`), Python/Bash scripting, Kubernetes fundamentals, and distributed training concepts.

**Difficulty:** Beginner to Advanced.

**Estimated reading time:** 150 minutes plus hands-on implementation practice.

---

## 1. Foundations: The AI Factory Job Lifecycle and the Threat of Stragglers

In traditional High-Performance Computing (HPC) running CPU-bound simulation workloads, jobs are often loosely coupled (e.g., Monte Carlo simulations or rendering farms). If one compute node fails, the overall throughput of a cluster decreases slightly, but other jobs continue unaffected.

In an **NVIDIA AI Factory**, raw node availability is a dangerous illusion. A compute node can pass basic operating system boot, report an `idle` (healthy) status to the Slurm controller or Kubernetes API server, and advertise 8 GPUs via PCI enumeration, while harboring a degraded NVLink connection, an intermittent PCIe Advanced Error Reporting (AER) fault, or a flapped 400 Gb/s InfiniBand optical transceiver. 

Because large-scale distributed training relies on **gang-scheduled, synchronized collectives** (such as `All-Reduce` in PyTorch DDP or Megatron-LM), every single GPU in a job must complete its backward pass before the model weights can synchronize across the cluster. If one GPU among 1,024 operates at 20% degraded throughput—a phenomenon known as a **silent straggler**—the entire multi-million dollar job slows to the speed of that degraded GPU. Even worse, if a single GPU drops off the PCIe bus mid-job due to an unhandled ECC memory failure, the entire multi-node training run aborts, resulting in lost compute hours and forcing a rollback to the last checkpoint.

### The Basic Job Lifecycle

Before diving into advanced health gating, let's establish the fundamental job lifecycle in an AI cluster running a resource manager like Slurm.

1.  **Submission:** A user or orchestrator submits a job script specifying resource requirements (e.g., 64 GPUs across 8 nodes).
2.  **Scheduling & Allocation:** The scheduler evaluates cluster resources, prioritizes the job based on fair-share algorithms, and allocates specific physical nodes once resources are available.
3.  **Controller Prolog (`PrologSlurmctld`):** The Slurm controller (head node) runs a preliminary script to setup centralized resources (e.g., burst buffer allocations).
4.  **Node Prolog (`Prolog`):** The resource manager runs a pre-job setup script as root on every allocated compute node. This is the primary pre-flight health gate.
5.  **Execution (Step Launch):** The user's application (e.g., a PyTorch training container via Enroot or Singularity/Apptainer) is launched on the allocated compute resources under specific Linux control groups (cgroups).
6.  **Completion/Termination:** The application finishes successfully, fails due to software/hardware errors, or is preempted/canceled.
7.  **Node Epilog (`Epilog`):** The resource manager runs a post-job cleanup script as root on every allocated compute node to sanitize the hardware.
8.  **Controller Epilog (`EpilogSlurmctld`):** The controller finishes any centralized accounting or teardown.
9.  **Deallocation:** Nodes are returned to the idle pool for the next job.

### Why Health Gating is Critical

In a distributed training run across `N` nodes, hardware Mean Time Between Failures (MTBF) scales inversely with cluster size:

```text
Cluster MTBF = Single Node MTBF / N
```

Treating failures as independent, and assuming for illustration that a single node has an MTBF of 1,000 days (~3 years; not a vendor figure), a cluster of 512 DGX nodes (4,096 GPUs) will experience an unhandled hardware fault or link drop roughly every **1.95 days**. Without proactive, automated health gating at the *Prolog* and *Epilog* stages, nodes with degraded hardware are blindly fed to multi-billion-parameter workloads. Jobs spend more time crashing, restarting, and reloading checkpoints than making training progress, severely impacting the Return on Investment (ROI) of the AI Factory.

---

## 2. Advanced Slurm Configuration for AI Workloads

To properly provision jobs and integrate health scripts, the Slurm controller (`slurm.conf`) requires highly specific tuning for GPU architectures. Out-of-the-box Slurm configurations are designed for CPU clusters and will severely bottleneck an NVIDIA AI Factory.

### Core `slurm.conf` Parameters for Health and Scheduling

```text
# /etc/slurm/slurm.conf

# ------------------------------------------------------------------------------
# Topology and GPU Scheduling
# The topology plugin ensures Slurm understands the spine-leaf network 
# architecture to place jobs on nodes connected to the same leaf switch when possible.
TopologyPlugin=topology/tree

# SelectType determines how resources are allocated. 
# cons_tres (Consumable Trackable Resources) is mandatory for GPU scheduling.
SelectType=select/cons_tres
SelectTypeParameters=CR_Core_Memory,CR_CORE_DEFAULT_DIST_BLOCK

# Enable the GRES (Generic Resource) plugin for GPUs
GresTypes=gpu,mps

# Prolog and Epilog Configuration
# The Prolog runs as root on each allocated node. If it exits non-zero, the node is set
# to DRAIN and the job is requeued (the job is held unless nohold_on_prolog_fail is set
# in SchedulerParameters). See "Failure Handling" in the Slurm Prolog and Epilog guide.
Prolog=/etc/slurm/prolog.sh

# The Epilog runs as root after the job. If it fails (non-zero) or times out, the node is DRAINED.
Epilog=/etc/slurm/epilog.sh

# PrologFlags Alloc ensures the prolog runs at the time of resource allocation,
# before the user can interactively access the node or run `srun`.
PrologFlags=Alloc

# Background Health Checking (NHC)
HealthCheckProgram=/usr/sbin/nhc
HealthCheckInterval=300
HealthCheckNodeState=ANY

# Job Limits and Timeouts
# Bound how long Slurm waits for prolog/epilog scripts. A timeout drains the node.
# (EpilogMsgTime is NOT this: it is a microsecond delay that spreads epilog-completion
# messages from large jobs so the controller is not flooded.)
PrologEpilogTimeout=300
UnkillableStepTimeout=60 # Force kill processes that ignore SIGTERM after 60s
```

### Implementing `gres.conf` for Accurate GPU Mapping

To ensure Slurm knows exactly which GPU corresponds to which NUMA node and which InfiniBand NIC, `gres.conf` must be auto-generated or meticulously mapped. This ensures CPU-GPU affinity (binding the CPU process to the core closest to the GPU) and GPUDirect RDMA.

```text
# /etc/slurm/gres.conf for DGX H100
# Auto-detects GPUs using the NVML library (recommended for modern setups)
AutoDetect=nvml
```

If manual mapping is required (e.g., in legacy environments without `AutoDetect`), the configuration maps the physical device files and links them to CPUs:

```text
# Legacy /etc/slurm/gres.conf example
Name=gpu Type=h100 File=/dev/nvidia0 Cores=0-15
Name=gpu Type=h100 File=/dev/nvidia1 Cores=16-31
```

---

## 3. Cgroups v2: Enforcing Hardware Boundaries

When jobs are launched, the resource manager must enforce strict hardware isolation. If User A requests 4 GPUs on an 8-GPU node, and User B requests the other 4 GPUs, the OS must ensure User A cannot accidentally access User B's GPUs.

In modern AI Factories, **cgroups v2** (Control Groups version 2) is the standard for resource constraint.

### Slurm `cgroup.conf`

```text
# /etc/slurm/cgroup.conf
CgroupAutomount=yes   # ignored/not needed with cgroup v2 in recent Slurm releases; harmless to omit
ConstrainCores=yes
ConstrainRAMSpace=yes
ConstrainSwapSpace=yes
ConstrainDevices=yes
```

When `ConstrainDevices=yes` is set, Slurm uses the Linux device cgroup controller to strictly limit which `/dev/nvidiaX` character devices the user's process can see and access. 

This prevents "noisy neighbor" issues on shared nodes. However, in large-scale LLM training, jobs typically request exclusive node access (`--exclusive`), meaning the cgroup is primarily used to ensure rogue processes are easily killed when the job ends, rather than for multi-tenant isolation on the same physical node.

---

## 4. Writing the Perfect AI Job Submission Script

An architect must provide templates to data scientists to ensure workloads leverage the cluster efficiently. A naive `sbatch` script will result in poor GPU utilization, CPU starvation, and network congestion.

### The Physics of the PyTorch PyData Stack

Before looking at the script, understand the processes involved:
1.  **Main Process:** Orchestrates the training loop, computes loss, and triggers the `All-Reduce`.
2.  **Dataloader Workers (CPUs):** PyTorch spawns multiple CPU threads to read data from the NVMe/network, augment the images/text, and stage them in RAM.
3.  **GPU Execution:** The data is pushed from RAM to GPU VRAM via PCIe, and the GPU executes the matrix multiplications.

If you allocate 8 GPUs but only 2 CPU cores per task, your GPUs will sit idle at 0% utilization waiting for the CPUs to fetch data. A DGX H100 has 112 CPU cores in total across its two sockets (2 x 56), which works out to 14 cores per GPU. Map your `--cpus-per-task` to your platform's actual core count.

### Deconstructing PyTorch DistributedDataParallel (DDP) Variables

PyTorch DDP requires specific environment variables to establish the NCCL communication mesh:
*   `MASTER_ADDR`: The IP address or hostname of the rank 0 node (the node coordinating the setup).
*   `MASTER_PORT`: A free TCP port on the `MASTER_ADDR` used for initial rendezvous.
*   `WORLD_SIZE`: The total number of GPUs across the entire cluster participating in the job.
*   `RANK`: The global index of a specific GPU (0 to `WORLD_SIZE - 1`).
*   `LOCAL_RANK`: The local index of a GPU on a specific physical node (0 to 7 on an 8-GPU node).

### Masterclass `sbatch` Template for PyTorch DDP / Megatron

```bash
#!/bin/bash
#SBATCH --job-name=llama3_70b_pretrain
#SBATCH --nodes=32                     # Number of physical nodes (256 GPUs total)
#SBATCH --ntasks-per-node=8            # One task per GPU (crucial for PyTorch DDP)
#SBATCH --gpus-per-node=8              # Request all 8 GPUs per node
#SBATCH --cpus-per-task=12             # Allocate 12 CPU cores per GPU task (data loaders)
#SBATCH --mem=0                        # Request all available memory on the node
#SBATCH --exclusive                    # Do not share nodes with other jobs
#SBATCH --time=48:00:00                # Max runtime (48 hours)
#SBATCH --partition=llm-training
#SBATCH --output=/scratch/logs/%x-%j.out
#SBATCH --error=/scratch/logs/%x-%j.err

# 1. Environment Setup & NCCL Tuning
# Force the IB network module. NCCL_NET=IB makes NCCL fail if the IB transport cannot be used,
# rather than silently falling back to slow TCP sockets, which causes silent stragglers.
export NCCL_NET=IB                     # Fail instead of silently falling back to the Socket (TCP) transport
# Explicitly map the ConnectX-7 HCAs to ensure NCCL doesn't guess wrong
export NCCL_IB_HCA=mlx5_0:1,mlx5_1:1,mlx5_2:1,mlx5_3:1,mlx5_4:1,mlx5_5:1,mlx5_6:1,mlx5_7:1
export NCCL_IB_TIMEOUT=22              # Increase timeout for large clusters
export NCCL_DEBUG=INFO                 # Crucial for troubleshooting

# 2. PyTorch Distributed Configuration (illustrative: adapt to your training entrypoint)
# Fetch the master node IP address dynamically from Slurm
export MASTER_ADDR=$(scontrol show hostnames $SLURM_JOB_NODELIST | head -n 1)
export MASTER_PORT=6000
export WORLD_SIZE=$(( SLURM_NNODES * SLURM_NTASKS_PER_NODE ))

echo "Training on $WORLD_SIZE GPUs. Master: $MASTER_ADDR:$MASTER_PORT"

# 3. Launch the Workload via srun
# srun propagates the tasks to all allocated nodes.
# We use Apptainer (Singularity) or Enroot to run the NVIDIA PyTorch container.
# RANK and LOCAL_RANK come from Slurm per task, so set them inside each task.
# Megatron-LM reads MASTER_ADDR/MASTER_PORT/WORLD_SIZE/RANK/LOCAL_RANK from the environment
# (it has no --master-addr, --node-rank, or --world-size flags).
srun \
  --mpi=none \
  bash -c 'export RANK=$SLURM_PROCID LOCAL_RANK=$SLURM_LOCALID; exec "$@"' _ \
  apptainer exec --nv \
  --bind /scratch/datasets:/data \
  --bind /scratch/checkpoints:/checkpoints \
  /shared/containers/pytorch_24.03.sif \
  python3 /opt/megatron-lm/pretrain_gpt.py \
    --num-layers 80 \
    --hidden-size 8192 \
    --num-attention-heads 64 \
    --micro-batch-size 4 \
    --global-batch-size 1024 \
    --tensor-model-parallel-size 8 \
    --pipeline-model-parallel-size 4 \
    --distributed-backend nccl
```

Notice the explicit failure boundary: `NCCL_NET=IB` forces the IB network module, so if the health gates missed an InfiniBand failure the job fails at initialization instead of silently running over TCP sockets. (`NCCL_IB_DISABLE=0` is already the default and does not provide this guarantee.)

### Masterclass `sbatch` Template for MPI-based NCCL Tests

While PyTorch DDP uses its own rendezvous mechanism (TCP/IP), pure MPI-based jobs (like NCCL bandwidth tests) rely entirely on PMIx or OpenMPI for process coordination. The script below tests the InfiniBand fabric by running a synchronized `all_reduce_perf` test across multiple nodes.

```bash
#!/bin/bash
#SBATCH --job-name=nccl_ib_test
#SBATCH --nodes=4
#SBATCH --ntasks-per-node=8
#SBATCH --gpus-per-node=8
#SBATCH --exclusive
#SBATCH --time=00:30:00

# Note: with srun --mpi=pmix, Slurm (not mpirun) does the binding; OMPI_MCA_* settings apply to
# mpirun launches. Use srun --cpu-bind / --gpu-bind for placement here.

# Force NCCL to use all 8 InfiniBand cards (NDR 400G)
export NCCL_IB_HCA=mlx5_0:1,mlx5_1:1,mlx5_2:1,mlx5_3:1,mlx5_4:1,mlx5_5:1,mlx5_6:1,mlx5_7:1
export NCCL_ALGO=Ring
export NCCL_P2P_DISABLE=0

# Use srun with PMIx to launch the pre-compiled C++ MPI binary
srun --mpi=pmix /shared/nccl-tests/build/all_reduce_perf \
    -b 1G \
    -e 10G \
    -f 2 \
    -g 1 \
    -c 1 \
    -n 100
```
Running this test after node maintenance helps verify that the expected bandwidth is available across the NVLink and InfiniBand fabrics. Compare against a baseline you measured on the same hardware rather than a theoretical number.

---

## 5. The Multi-Tiered Health Architecture

As an **NVIDIA Senior Solutions Architect**, you must design an automated, multi-tiered **Hardware Health Gating Architecture**. This architecture is not a single script; it is a layered defense mechanism against continuous hardware entropy.

```mermaid
flowchart TD
    subgraph Tier1["Tier 1: Continuous Background Health Check (Every 1–5m)"]
        NHC["Node Health Check (NHC) / BCM CMDaemon"]
        NHC -->|Polls| DCGM_T1["DCGM Field Polling (XID, Clocks, Temps)"]
        NHC -->|Polls| IB_T1["InfiniBand Port Counters (SymbolErrorCounter)"]
        NHC -->|Polls| SYS_T1["Filesystem Mounts & Systemd Services"]
    end

    subgraph Tier2["Tier 2: Slurm Pre-Job Prolog Gate (< 10 seconds)"]
        PROLOG["Slurm Prolog Hook (Runs as ROOT before task launch)"]
        PROLOG -->|Check 1| GPU_NUM["Enumerate Allocated GPUs (nvidia-smi -L)"]
        PROLOG -->|Check 2| NVLINK_ST["NVLink Link State (Active 18/18)"]
        PROLOG -->|Check 3| IB_LINK["HCA Link State & Speed (ibstat == 400 Gbps)"]
        PROLOG -->|Check 4| RES_PROC["Purge Stale Processes on Allocated GPUs"]
    end

    subgraph Tier3["Tier 3: Slurm Post-Job Epilog Gate & Cleanup"]
        EPILOG["Slurm Epilog Hook (Runs as ROOT after task completion)"]
        EPILOG -->|Action 1| KILL_ZOMBIE["Terminate Rogue User Processes (pkill -9)"]
        EPILOG -->|Action 2| PURGE_CACHE["Wipe Local Job Scratch (/scratch/$SLURM_JOB_ID)"]
        EPILOG -->|Action 3| DMESG_CHECK["Audit Kernel Ring Buffer for New XIDs"]
        EPILOG -->|Action 4| GPU_RESET["Reset GPU state where supported (nvidia-smi --gpu-reset)"]
    end

    Tier1 -.->|Degradation Detected| DRAIN["Autonomous DRAIN: scontrol update NodeName=... State=DRAIN"]
    PROLOG -->|Health Gate FAILS| DRAIN
    EPILOG -->|Fatal XID Detected| DRAIN
    PROLOG -->|Health Gate PASSES| JOB_EXEC["Workload Launches (slurmstepd / container)"]
```

### The Three Tiers Explained

1.  **Tier 1 (Continuous Polling):** Lightweight agents monitor standard metrics (temperatures, basic link states, filesystem mounts) asynchronously. Tools like LBNL Node Health Check (NHC) or NVIDIA Base Command Manager (BCM) CMDaemon operate here. This tier catches nodes that fail while sitting idle in the pool.
2.  **Tier 2 (Pre-Job Prolog Gate):** A synchronous, deterministic check immediately before workload execution. This ensures that *right now*, at the exact moment of launch, the hardware allocated to the job is functionally pristine.
3.  **Tier 3 (Post-Job Epilog Gate):** A post-mortem sanitization and audit. It aggressively reclaims resources and checks if the job caused (or was killed by) a critical hardware fault during execution.

---

## 6. Tier 1: Continuous Background Health Monitoring (NHC)

Before jobs are even scheduled, nodes must monitor themselves. The **Node Health Check (NHC)** framework is an industry standard for executing periodic checks. Base Command Manager (BCM) also offers a proprietary equivalent called `CMDaemon`.

In `slurm.conf`, NHC is configured via the `HealthCheckProgram` and `HealthCheckInterval` parameters.

### NHC Configuration Examples

NHC uses a configuration file (`/etc/nhc/nhc.conf`) to define checks.

```bash
# /etc/nhc/nhc.conf

# 1. System basics
 * || check_fs_mount_rw -t nfs -f /shared_scratch
 * || check_hw_mem 2000000000  # Min RAM in kB (about 2 TB); adjust to your platform
 * || check_ps_service -S slurmd

# 2. NVIDIA GPU checks: NHC does not ship a complete GPU check set. Wrap your own checks
#    (nvidia-smi, DCGM) with check_cmd_status, or add site-specific .nhc check files.
 * || check_cmd_status -t 30 -r 0 /usr/local/sbin/gpu_health.sh

# 3. InfiniBand fabric checks (check_hw_ib: minimum rate in Gb/s, optional device:port; verify syntax
#    against the NHC documentation for your version)
 * || check_hw_ib 400 mlx5_0:1
 * || check_hw_ib 400 mlx5_1:1
```

When an NHC check fails, NHC marks the node offline in the resource manager (for Slurm, by draining it with `scontrol update`), so the scheduler stops assigning new jobs to it.

### Custom NHC Checks (Python)

While Bash is common, Python allows for deeper querying of the system state. You can write custom NHC checks for specific hardware bugs. For example, reporting PCIe ACS (Access Control Services) status, since ACS on switches between the NIC and GPU can hurt GPUDirect RDMA on some platforms (follow your platform vendor's guidance on whether it must be disabled). NHC checks are normally shell functions; a Python script is invoked through a wrapper such as `check_cmd_status`.

```python
#!/usr/bin/env python3
# /etc/nhc/scripts/check_pcie_acs.py
import subprocess
import sys

def check_pcie_acs():
    try:
        # Requires root. The ACS control register is shown as "ACSCtl:" with +/- flags,
        # e.g. "ACSCtl: SrcValid+ TransBlk- ReqRedir+ ..." (illustrative).
        lspci_out = subprocess.check_output(["lspci", "-vvv"], universal_newlines=True)
        acs_count = 0
        for line in lspci_out.split('\n'):
            if "ACSCtl:" in line and any(f in line for f in ("SrcValid+", "ReqRedir+", "CmpltRedir+", "UpstreamFwd+")):
                acs_count += 1

        if acs_count > 0:
            print(f"CRITICAL: PCIe ACS is enabled on {acs_count} devices. GPUDirect RDMA may degrade.")
            sys.exit(1)
            
        print("OK: PCIe ACS is correctly disabled.")
        sys.exit(0)
    except Exception as e:
        print(f"UNKNOWN: Failed to run lspci - {str(e)}")
        sys.exit(2)

if __name__ == "__main__":
    check_pcie_acs()
```

---

## 7. NVIDIA DCGM Diagnostic Tiers (The Source of Truth)

The **NVIDIA Data Center GPU Manager (DCGM)** provides standardized, active diagnostic testing engines capable of identifying subtle hardware, thermal, and memory defects. DCGM is the source of truth for GPU health in the AI Factory.

### DCGM Run Levels (Diagnostics)

| Level | Command | Documented duration | What it covers (DCGM diagnostics documentation) | Typical use |
|---|---|---|---|---|
| 1 (`quick`, `short`) | `dcgmi diag -r 1` | Normally seconds | Built-in software deployment checks: NVML/CUDA libraries, device access, conflicting processes, page retirement / row remap / InfoROM / memory-health state, Fabric Manager state | Readiness check, including before admitting work |
| 2 (`medium`) | `dcgmi diag -r 2` | About 2 minutes | Adds `memory` and `pcie` tests (framebuffer faults, PCIe and peer bandwidth, replays, NVLink state) | Investigating a failed workload |
| 3 (`long`) | `dcgmi diag -r 3` | About 15 minutes | Long hardware diagnostics (adds the stress, power, and bandwidth plugins) | Administrator-led isolation, acceptance, post-repair |
| 4 (`xlong`) | `dcgmi diag -r 4` | Longer than level 3 | Extended hardware diagnostics | Post-mortem and burn-in |

Later suites include the checks of earlier ones and are more invasive. Suite composition varies with the DCGM release, hardware, and privileges (DCGM docs, "Run Levels and Tests"). Run levels 2 to 4 only when the node is out of production.

### Executing and Parsing DCGM Diagnostics in Automation

While `dcgmi diag` outputs text for humans, automation should use JSON output (`-j`) for parsing.

```bash
# Example: Running a Level 1 Diagnostic with JSON output
$ sudo dcgmi diag -r 1 -j > /tmp/dcgm_diag.json
```

*Simplified, illustrative JSON structure (not captured output; the real schema and field names differ by DCGM version, so inspect `dcgmi diag -r 1 -j` on your system before writing a parser):*

```json
{
  "gpu_count": 8,
  "test_categories": [
    {
      "category": "Deployment",
      "tests": [
        {"name": "Denylist", "status": "Pass"},
        {"name": "NVML Library", "status": "Pass"},
        {"name": "CUDA Main Library", "status": "Pass"},
        {"name": "Permissions and Devices", "status": "Pass"}
      ]
    },
    {
      "category": "Hardware",
      "tests": [
        {"name": "Memory", "status": "Pass"},
        {"name": "PCIe", "status": "Pass"}
      ]
    }
  ]
}
```

If any test reports a failure, drain the node and run longer diagnostics (Level 3) or start the RMA process. In an automated script, load the JSON, walk the test categories and per-GPU results, and put the first failing test into the drain reason.

### Real-time Telemetry and Straggler Detection with DCGM-Exporter

Beyond point-in-time diagnostics, DCGM runs a background engine (`nv-hostengine`) that polls GPU fields at a configurable interval (dcgm-exporter's default collection interval is on the order of seconds; check your configuration). This data is exposed via `dcgm-exporter` to Prometheus. 

By monitoring specific metrics, your observability stack can detect **silent stragglers** that pass prolog checks but degrade under load.

**Prometheus Config for Scraping DCGM Exporter (YAML):**

```yaml
# prometheus.yml snippet
scrape_configs:
  - job_name: 'dcgm-exporter'
    scrape_interval: 10s
    static_configs:
      - targets: ['dgx-node-01:9400', 'dgx-node-02:9400']
```

**Prometheus Alerting Rule for Straggler Detection (YAML):**

```yaml
# prometheus-rules/gpu-straggler.yaml
groups:
- name: gpu-straggler-alerts
  rules:
  - alert: GPUStragglerDetected
    # Detect if one GPU's tensor core activity is significantly lower than the node average
    # during active training (GPU util > 80%)
    # DCGM_FI_PROF_PIPE_TENSOR_ACTIVE is a ratio from 0 to 1, so 0.15 means 15 percentage points.
    # Profiling metrics must be enabled in dcgm-exporter. Pipeline-parallel jobs can legitimately
    # show uneven activity between stages; baseline before alerting.
    expr: >
      (avg by (instance) (DCGM_FI_PROF_PIPE_TENSOR_ACTIVE)
       - on (instance) group_right () DCGM_FI_PROF_PIPE_TENSOR_ACTIVE) > 0.15
      and on (instance, gpu) (DCGM_FI_DEV_GPU_UTIL > 80)
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "GPU Straggler detected on {{ $labels.instance }} (GPU {{ $labels.gpu }})"
      description: "GPU {{ $labels.gpu }} Tensor Core activity is more than 15 percentage points below the node average for 5 minutes. This is stalling the entire All-Reduce collective."
```

When this alert fires, an automation webhook (e.g., via AWX or a custom Python service) can trigger a targeted pause, checkpoint, and drain of the offending node, allowing the job to resume on healthy hardware.

---

## 8. Production Slurm Prolog Implementation: The Pre-Job Gate

The Slurm `Prolog` script executes as `root` on every allocated compute node immediately before the user's workload container or task launches. If the script exits with a non-zero return code, **Slurm cancels the job step on this node, requeues the job, and drains the machine**, protecting the customer from running on bad silicon.

A production Prolog must be incredibly fast (typically < 10 seconds). It cannot run deep stress tests; it must verify current state interfaces (NVML, ibstat, sysfs).

### Masterclass Prolog Script (Bash)

```bash
#!/usr/bin/env bash
# ==============================================================================
# Script: /etc/slurm/prolog.d/90-ai-health-gate.sh
# Purpose: Slurm Job Prolog Health Gate for NVIDIA DGX H100
# Execution: Runs as root immediately prior to job step launch.
# Target runtime: < 8 seconds.

set -euo pipefail

NODE_NAME="$(hostname -s)"
LOG_FILE="/var/log/slurm/prolog_health.log"
DRAIN_REASON=""

# Helper function to drain the node on failure
drain_node() {
    local reason="$1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [CRITICAL] Draining ${NODE_NAME}: ${reason}" >> "${LOG_FILE}"
    
    # Issue administrative drain to Slurm controller asynchronously
    # We use nohup and backgrounding so the prolog exits quickly without blocking
    nohup scontrol update NodeName="${NODE_NAME}" State=DRAIN Reason="PrologFail: ${reason}" > /dev/null 2>&1 &
    
    # Returning a non-zero exit code tells Slurm to abort this job's launch on this node
    exit 1
}

echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting Prolog for Job ${SLURM_JOB_ID:-UNKNOWN} on ${NODE_NAME}" >> "${LOG_FILE}"

# Gate 1: GPU Enumeration and NVML Responsiveness
# A crashed driver or hung PCIe bus will cause nvidia-smi to hang or return fewer GPUs.
GPU_COUNT=$(timeout 5s nvidia-smi --query-gpu=name --format=csv,noheader | wc -l || echo "0")  # a timeout leaves a count of 0
if [ "${GPU_COUNT}" -ne 8 ]; then
    drain_node "Missing GPUs! Expected 8, enumerated ${GPU_COUNT} or NVML hung."
fi

# Gate 2: Uncorrectable ECC Memory Errors (Volatile)
# Double-bit ECC errors will cause application crashes and data corruption.
UNCORRECTABLE_ECC=$(nvidia-smi --query-gpu=ecc.errors.uncorrected.volatile.total --format=csv,noheader,nounits | awk '{s+=$1} END {print s}')
if [ "${UNCORRECTABLE_ECC}" -gt 0 ]; then
    drain_node "Uncorrectable ECC memory errors detected (Count: ${UNCORRECTABLE_ECC})"
fi

# Gate 3: Thermal or Power Hardware Slowdown (Throttling)
# If a cooling loop failed, the GPU might still enumerate but run at 300MHz.
# This creates a silent straggler.
# Field values are "Active" or "Not Active"; count exact "Active" fields only.
# (Older drivers name these clocks_throttle_reasons.*; verify with nvidia-smi --help-query-gpu.)
THROTTLED=$(nvidia-smi --query-gpu=clocks_event_reasons.hw_slowdown,clocks_event_reasons.sw_thermal_slowdown --format=csv,noheader | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -cx 'Active' || true)
if [ "${THROTTLED}" -gt 0 ]; then
    drain_node "Active Thermal/Hardware throttling detected on GPUs"
fi

# Gate 4: InfiniBand Fabric Health (Compute HCAs)
# Ensure all 8 ConnectX-7 compute fabric adapters are physically linked and active.
# ibstat lists every HCA port on the node (including storage/in-band ports on some systems),
# so adjust the expected count and filter by device to match your platform.
EXPECTED_HCA_PORTS=8
# Use ibstat (infiniband-diags)
ACTIVE_HCA_PORTS=$(ibstat | grep -E "State: Active" | wc -l || echo "0")
if [ "${ACTIVE_HCA_PORTS}" -lt "${EXPECTED_HCA_PORTS}" ]; then
    drain_node "InfiniBand degradation! Active ports: ${ACTIVE_HCA_PORTS}/${EXPECTED_HCA_PORTS}"
fi

# Verify link speed is NDR 400G (ibstat reports Rate: 400)
# A faulty optical cable might cause the link to negotiate down to 200G or 100G.
DEGRADED_RATES=$(ibstat | grep "Rate:" | grep -v "400" | wc -l || true)
if [ "${DEGRADED_RATES}" -gt 0 ]; then
    drain_node "InfiniBand link speed trained down below 400G line rate on one or more ports."
fi

# Gate 5: NVLink Fabric Health (NVSwitch)
# Verify no NVLink ports are disabled or degraded between the GPUs and NVSwitches.
# We parse the output of nvidia-smi nvlink.
# Active links print a speed ("Link N: <speed> GB/s"); inactive links print "<inactive>".
# Verify the exact format on your driver version.
NVLINK_DOWN=$(nvidia-smi nvlink --status | grep -ci "inactive" || true)
if [ "${NVLINK_DOWN}" -gt 0 ]; then
    drain_node "NVLink degradation! One or more NVLink ports are down."
fi

# Gate 6: Process Sanitization
# Clean up leftover orphan GPU processes from previous jobs or interactive sessions.
# Only safe on exclusive-node allocations: on shared nodes this would kill other jobs' processes.
ORPHAN_PIDS=$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)
if [ -n "${ORPHAN_PIDS}" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] Killing orphan GPU processes: ${ORPHAN_PIDS}" >> "${LOG_FILE}"
    echo "${ORPHAN_PIDS}" | xargs -r kill -9 || true
    sleep 1 # Allow VRAM to be reclaimed
fi

# Gate 7: Fast DCGM Diagnostics (Optional)
# If you have strict SLA requirements, you can run Level 1 DCGM here.
# Note: Ensure dcgmi diag -r 1 executes in <10s on your environment.
# Verify the JSON field names against your DCGM version; this greps for any failed test result.
if ! timeout 30s dcgmi diag -r 1 -j > /tmp/dcgm_prolog_$$.json 2>&1 || grep -qi '"status": *"Fail' /tmp/dcgm_prolog_$$.json; then
    drain_node "DCGM Level 1 Diagnostic Failed"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') [PASS] Node ${NODE_NAME} passed health gate for Job ${SLURM_JOB_ID}" >> "${LOG_FILE}"
exit 0
```

### Key Considerations for Prolog Scripts

*   **Idempotency & Safety:** The script must not crash if a command is unavailable. Use `|| true` and `timeout` heavily. A crashing prolog drains the node.
*   **Speed:** Never run `dcgmi diag -r 3` in a Prolog. The script will hit the prolog timeout (which drains the node), and users will see long delays starting jobs.
*   **Logging:** Always log locally to `/var/log/slurm/` or forward to a centralized logging system (syslog/FluentBit).
*   **Permissions:** Prolog runs as `root`. Be extremely careful with `rm` commands or user inputs.

---

## 9. Production Slurm Epilog Implementation: Post-Job Sanitization

When a training job terminates (whether by successful completion, cancellation, or crash), the compute node must be sanitized before being returned to the eligible scheduling pool. Residual zombie processes holding GPU VRAM, leaked IPC shared memory segments, or corrupt temporary files will cause the next user's job to fail immediately.

Crucially, the Epilog is the primary deterministic detection mechanism for **Hardware XID Errors** that occurred *during* the workload execution.

### Understanding NVIDIA Xid errors

An Xid is an event the NVIDIA kernel driver logs to the kernel log (`NVRM: Xid ...`). Do not hard-code your own "drain on these, ignore those" list from memory. NVIDIA publishes the **Xid Catalog**, which gives each code a description, the GPU generations it applies to, and two recommended actions (NVIDIA Xid Errors, "Analyzing Xid Errors with the Xid Catalog"):

- **Immediate action** (resolution bucket): an automatable recovery step to ready the system for new applications.
- **Investigatory action**: guidance if the Xid recurs or is unexpected.

The bucket names (for example `RESTART_APP`, `RESET_GPU`, `RESTART_BM`, `CONTACT_SUPPORT`, `IGNORE`) are defined on the catalog's Fault Resolution Buckets worksheet. An excerpt for the codes most often discussed (from the catalog table; check the current catalog for your GPU generation and driver):

| Xid | Description (catalog) | Immediate action | Investigatory action |
|---|---|---|---|
| 13 | Graphics Engine Exception | RESTART_APP | WORKFLOW_XID_13 |
| 31 | GPU memory page fault | RESTART_APP | WORKFLOW_XID_31 |
| 44 | Graphics Engine fault during context switch | IGNORE | CONTACT_SUPPORT |
| 45 | Preemptive cleanup, due to previous errors – Most likely to  | WORKFLOW_XID_45 | Solo: RESTART_FM  Not Solo: IGNORE (follow other Xid) |
| 48 | Double Bit ECC Error | WORKFLOW_XID_48 | WORKFLOW_XID_48 |
| 62 | Internal micro-controller halt  (newer drivers) | RESET_GPU | CONTACT_SUPPORT |
| 63 | GPU memory remapping event | IGNORE | IGNORE |
| 64 | GPU memory remapping failure | RESET_GPU | CONTACT_SUPPORT |
| 74 | NVLINK Error | WORKFLOW_NVLINK_ERR | CONTACT_SUPPORT |
| 79 | GPU has fallen off the bus | RESTART_BM | CONTACT_SUPPORT |
| 94 | Contained memory error | RESTART_APP | IGNORE (sympathetic) |
| 95 | Uncontained memory error | RESET_GPU | IGNORE (sympathetic) |
| 109 | Context Switch Timeout Error | RESET_GPU | CONTACT_SUPPORT |
| 119 | GSP RPC Timeout | RESET_GPU | INVESTIGATE_SW |
| 120 | GSP Error | RESET_GPU | INVESTIGATE_SW |

How to use this in a health gate:

1. Parse the Xid code from `NVRM: Xid (PCI:...): <code>, ...` in the kernel log.
2. Look the code up in the catalog for your driver and GPU generation.
3. Map the **immediate action** to your automation (for example restart the application, reset the GPU, restart the node), and map **CONTACT_SUPPORT** or repeated occurrence to a drain-and-escalate policy.
4. Treat a code appearing in a different state from the catalog's expectation as a reason to read the catalog entry, not as a reason to improvise.

Two cautions: some Xids are consequences of others (Xid 45 "preemptive cleanup" follows earlier errors, and the catalog marks several as "follow other Xid"), so act on the root event; and the catalog's actions differ by code, so a single blanket "drain on any Xid" or "ignore application Xids" rule will be wrong for some. Note the catalog's immediate actions: `IGNORE` for Xid 44 and `RESET_GPU` for Xid 109, which differ from common folklore.

### Masterclass Epilog Script (Python)

To demonstrate advanced parsing, here is a production Epilog written in Python, utilizing standard libraries for robust log analysis and system manipulation. Python is preferred over Bash for complex array parsing, regex, and structured logging.

```python
#!/usr/bin/env python3
# Script: /etc/slurm/epilog.d/99-ai-cleanup.py
# Purpose: Slurm Job Epilog: Process Cleanup, Scratch Purge, and Kernel XID Audit
# Execution: Runs as root after task completion.

import os
import subprocess
import sys
import syslog
import re
import time
from datetime import datetime

NODE_NAME = os.uname().nodename
LOG_FILE = "/var/log/slurm/epilog_cleanup.log"

# Site policy: Xids that send the node to drain-and-escalate instead of auto-recovery.
# Derive this set from the NVIDIA Xid Catalog for your GPU generation and driver, and review it
# when either changes. Example only; the catalog's immediate action for Xid 44 is IGNORE,
# and 119/120 are RESET_GPU with INVESTIGATE_SW as the investigatory action.
FATAL_XIDS = {48, 62, 74, 79, 119, 120}

def log(msg, level="INFO"):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_line = f"{timestamp} [{level}] {msg}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_line)
    # Also log to syslog for centralized aggregation
    syslog.syslog(syslog.LOG_INFO if level == "INFO" else syslog.LOG_ERR, f"SlurmEpilog: {msg}")

def run_cmd(cmd, ignore_errors=False):
    try:
        result = subprocess.run(cmd, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        if not ignore_errors:
            log(f"Command failed: {cmd}, Error: {e.stderr.strip()}", "ERROR")
        return ""

def drain_node(reason):
    log(f"Draining node {NODE_NAME}: {reason}", "CRITICAL")
    # Asynchronous drain command to Slurm
    run_cmd(f"nohup scontrol update NodeName={NODE_NAME} State=DRAIN Reason='EpilogFail: {reason}' > /dev/null 2>&1 &", ignore_errors=True)

def step_1_terminate_zombies():
    job_user = os.environ.get("SLURM_JOB_USER")
    if job_user and job_user != "root":
        log(f"Terminating residual processes for user {job_user}")
        # Send SIGKILL to all of the user's processes on this node. Only safe on exclusive-node
        # allocations: on shared nodes it would also kill the user's other jobs.
        run_cmd(f"pkill -9 -u {job_user}", ignore_errors=True)
        time.sleep(2) # Allow OS to reclaim resources

def step_2_gpu_reset():
    log("Releasing GPU memory and resetting compute modes")
    # GPU memory is normally freed when processes exit. A reset fails if any process still uses a GPU
    # and is not supported on every platform (e.g. NVSwitch-based systems have extra requirements),
    # so treat it as best effort and see the nvidia-smi documentation.
    run_cmd("nvidia-smi --gpu-reset", ignore_errors=True)

def step_3_purge_scratch():
    job_id = os.environ.get("SLURM_JOB_ID")
    if job_id:
        scratch_dir = f"/scratch/job_{job_id}"
        if os.path.exists(scratch_dir):
            log(f"Purging job scratch directory: {scratch_dir}")
            # Use background removal for large I/O to prevent Epilog hang
            os.makedirs("/scratch/trash", exist_ok=True)
            run_cmd(f"mv {scratch_dir} /scratch/trash/job_{job_id}_{int(time.time())}", ignore_errors=True)
            run_cmd(f"nohup rm -rf /scratch/trash/job_{job_id}_* > /dev/null 2>&1 &", ignore_errors=True)
            
        # Clean shared memory segments
        run_cmd(f"find /dev/shm -user {os.environ.get('SLURM_JOB_USER', 'nobody')} -delete", ignore_errors=True)

def step_4_audit_dmesg_xids():
    log("Auditing kernel ring buffer for critical XID errors")
    # Fetch kernel logs from the last 30 minutes. Note this can include Xids from before this job
    # or from other jobs; production code should bound the window by the job's start time.
    # Using journalctl is often more reliable than dmesg -T
    journal_output = run_cmd("journalctl -k --since '30 minutes ago'")
    
    # Regex to match NVRM Xid messages. Example: "NVRM: Xid (PCI:0000:01:00): 79, GPU has fallen off the bus."
    xid_pattern = re.compile(r"NVRM: Xid.*?: (\d+),")
    
    fatal_found = set()
    for line in journal_output.splitlines():
        match = xid_pattern.search(line)
        if match:
            xid_code = int(match.group(1))
            if xid_code in FATAL_XIDS:
                fatal_found.add(xid_code)
                log(f"Detected Fatal XID: {line}", "CRITICAL")
            else:
                log(f"Detected Non-Fatal XID (Application level): {line}", "WARN")

    if fatal_found:
        reason = f"Fatal XID(s) detected during job: {', '.join(map(str, fatal_found))}"
        drain_node(reason)

if __name__ == "__main__":
    try:
        step_1_terminate_zombies()
        step_2_gpu_reset()
        step_3_purge_scratch()
        step_4_audit_dmesg_xids()
    except Exception as e:
        log(f"Epilog encountered an unhandled exception: {str(e)}", "ERROR")
        # Do not fail the epilog if python crashes, just exit 0 to allow node return,
        # relying on Tier 1 monitors to catch persistent issues if the epilog failed to clean up.
    
    # Exit 0 so a clean epilog does not drain the node. A non-zero epilog exit drains the node
    # (see Failure Handling in the Slurm Prolog and Epilog guide); we drain explicitly instead,
    # with a clear reason.
    sys.exit(0)
```

---

## 10. Deploying Health Gates via Ansible / Terraform

In a true IaC environment, these scripts are never created manually. They are templated via Ansible or Terraform during cluster provisioning. Utilizing dynamic inventory allows Ansible to target only specific GPU models for specific scripts.

**Ansible Task for Epilog Deployment:**

```yaml
# deploy_epilog.yml
- name: Deploy Slurm Epilog Script
  hosts: compute_nodes
  become: yes
  tasks:
    - name: Ensure epilog directory exists
      file:
        path: /etc/slurm/epilog.d
        state: directory
        mode: '0755'

    - name: Copy Python cleanup script
      copy:
        src: files/slurm/99-ai-cleanup.py
        dest: /etc/slurm/epilog.d/99-ai-cleanup.py
        owner: root
        group: root
        mode: '0755'

    - name: Ensure Slurm configuration points to epilog
      lineinfile:
        path: /etc/slurm/slurm.conf
        regexp: '^Epilog='
        line: 'Epilog=/etc/slurm/epilog.d/99-ai-cleanup.py'
      notify: Restart slurmd

  handlers:
    - name: Restart slurmd
      systemd:
        name: slurmd
        state: restarted
```

---

## 11. Workflow Orchestration in AI Factories

While Slurm is exceptional at resource allocation, node management, and gang-scheduling raw binaries or containers (`sbatch`, `srun`), it is not a pipeline orchestrator. It does not understand dependencies between datasets, training jobs, and deployment servers.

Modern AI development involves complex **Directed Acyclic Graphs (DAGs)** of tasks:
1.  **Data Ingestion & Preprocessing (CPU/Spark):** Terabytes of text/images are cleaned and tokenized.
2.  **Model Training (GPU/Slurm or Volcano):** The tokens are fed into an LLM training run across 1,024 GPUs.
3.  **Model Evaluation (GPU/Slurm):** Checkpoints are evaluated against benchmark datasets.
4.  **Model Export & Deployment (Kubernetes/Triton):** The final weights are converted to TensorRT and deployed to inference servers.

This end-to-end pipeline requires workflow orchestrators like **Apache Airflow**, **Kubeflow Pipelines**, or **Prefect**, which submit and monitor jobs *on behalf of the user* into various backend systems (Slurm, Kubernetes, Spark).

### Integrating Apache Airflow with Slurm

Airflow operates as the "conductor." It doesn't run the heavy workloads directly; it delegates them to Slurm and polls for the results.

```mermaid
sequenceDiagram
    participant User
    participant Airflow as Airflow (Orchestrator)
    participant Slurm as Slurm (Resource Manager)
    participant Compute as Compute Nodes

    User->>Airflow: Trigger DAG (Prepare -> Train -> Eval)
    
    Note over Airflow, Slurm: Task 1: Data Prep (CPU)
    Airflow->>Slurm: sbatch data_prep.sh
    Slurm-->>Airflow: JobID: 1001
    loop Polling
        Airflow->>Slurm: squeue -j 1001
        Slurm-->>Airflow: State: RUNNING
    end
    Slurm-->>Airflow: State: COMPLETED
    
    Note over Airflow, Slurm: Task 2: LLM Train (GPU)
    Airflow->>Slurm: sbatch --nodes=64 train.sh
    Slurm-->>Airflow: JobID: 1002
    Slurm->>Compute: Launch Prolog & Step
    Compute-->>Slurm: XID 79 Detected! Epilog Drains Node
    Slurm-->>Airflow: State: NODE_FAIL / FAILED
    
    Note over Airflow: Airflow detects failure, triggers automated retry.
    Airflow->>Slurm: sbatch --nodes=64 train.sh (Retry 1)
    Slurm-->>Airflow: JobID: 1003
```

**Airflow Slurm Operator Example (Python):**

```python
from airflow import DAG
from airflow.providers.ssh.operators.ssh import SSHOperator
from datetime import datetime, timedelta

# A simple DAG that uses SSHOperator to interact with the Slurm login node
with DAG(
    dag_id='llm_training_pipeline',
    start_date=datetime(2024, 1, 1),
    schedule=None,  # 'schedule_interval' was removed in Airflow 3
    catchup=False,
    default_args={
        'retries': 2, # Automatically retry if the job fails (e.g., due to a drained node)
        'retry_delay': timedelta(minutes=5),
    }
) as dag:

    # 1. Submit the training job and wait for it to complete.
    # Note: In production, consider the Slurm REST API (slurmrestd) or a maintained Slurm provider,
    # but SSH is common for legacy cluster integration.
    submit_training = SSHOperator(
        task_id='submit_slurm_training',
        ssh_conn_id='slurm_login_node',
        command="""
        # Submit the job and parse the Job ID
        JOB_ID=$(sbatch --parsable /shared/scripts/train_megatron.sh)
        echo "Submitted Job: $JOB_ID"
        
        # Polling loop (Airflow sensors are preferred in prod, but this illustrates the concept)
        while true; do
            STATE=$(squeue -j $JOB_ID -h -o %T)
            if [ -z "$STATE" ]; then
                # Job no longer in queue, check accounting
                FINAL_STATE=$(sacct -j $JOB_ID -X -n -o State | tr -d ' ')
                if [[ "$FINAL_STATE" == "COMPLETED" ]]; then
                    echo "Job completed successfully."
                    exit 0
                else
                    echo "Job failed with state: $FINAL_STATE"
                    exit 1
                fi
            fi
            sleep 60
        done
        """,
        cmd_timeout=86400 # 24 hour timeout
    )
```

### Kubernetes Volcano Schedulers

While Slurm dominates the training phase in bare-metal environments, **Kubernetes** is increasingly used for training via specialized schedulers like **Volcano** or **Kueue**.

Standard Kubernetes schedulers process pods individually. This breaks distributed training because if K8s schedules 63 pods of a 64-pod job and runs out of resources, those 63 pods will sit idle indefinitely, locking up cluster resources. 

**Volcano** solves this by implementing **gang scheduling**. It evaluates the entire `PodGroup`. If all 64 pods cannot be scheduled simultaneously, none are scheduled. 

In a hybrid AI Factory, Kubernetes and Slurm often co-exist. The **NVIDIA Triton Inference Server** deployments are managed by Kubernetes, while large-scale pre-training is managed by Slurm. KFP (Kubeflow Pipelines) can orchestrate tasks across both environments by using specialized components that submit jobs via the Slurm REST API, retrieve checkpoints from S3, and deploy the resulting model to a Kubernetes cluster via Helm charts.

---

## 12. Real-World Troubleshooting: A Day in the Life of an AI SRE

Managing an AI factory requires deep forensics. When a job fails, the immediate question is always: *was it the code, or was it the hardware?*

### Scenario 1: The "Silent Straggler" in a 1,024-GPU Cluster
**Interviewer:** *"A research team is training a 405B parameter model across 128 DGX H100 nodes. Every few hours, training step time doubles from 1.2 seconds to 2.4 seconds, but no node crashes, and no errors appear in Slurm logs. How do you design an automated system to detect and isolate the offending straggler?"*

**Candidate Answer:**
> "This is the classic synchronized collective straggler problem:
> 1. **Data Plane vs. Kernel Symptoms:** In synchronized PyTorch DDP or Megatron pipeline training, a single GPU running slow forces all 1,023 other GPUs to sit idle in `ncclKernel_AllReduce` execution. Standard monitoring metrics like GPU utilization will show 100% across all GPUs because idling in an active collective spinlock registers as 100% compute utilization!
> 2. **Telemetry Collection via DCGM:**
>    - I deploy **DCGM Exporter with custom high-frequency profiling metrics**: `DCGM_FI_DEV_GPU_UTIL`, `DCGM_FI_DEV_MEM_COPY_UTIL`, and specifically `DCGM_FI_PROF_SM_ACTIVE` (Streaming Multiprocessor activity) vs `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE`.
>    - Crucially, I monitor **InfiniBand port packet error rates and congestion marks** (`port_rcv_switch_relay_errors`, `PortXmitWait`).
> 3. **A plausible root cause:** A degraded optical transceiver on one ConnectX-7 HCA causes high error-correction or retransmit activity. The link stays up (so the Prolog passes), but effective bandwidth drops well below line rate, creating an RDMA bottleneck.
> 4. **Automated Isolation Architecture:**
>    - We run periodic `nccl-tests` (or application-level step-time metrics) per node group to measure per-node collective performance; NCCL's own debug logs show collective calls, not latencies.
>    - We configure an automated Prometheus alert: if any node’s `PortXmitWait` spikes by $> 3\sigma$ relative to cluster peers, the orchestrator can checkpoint the job, drain the straggler node, and requeue the job on healthy hardware (a design target; the exact mechanics depend on the training framework's checkpointing)."

---

### Scenario 2: Distinguishing Transient Workload Errors from True Hardware Defects
**Interviewer:** *"When a GPU job crashes with CUDA error: out of memory or a PyTorch assertion failure, should the node be drained by the Epilog script?"*

**Candidate Answer:**
> "No, draining a node on application-layer errors is a severe operational flaw that leads to unnecessary cluster depletion:
> 1. **Categorizing the Error Boundary:**
>    - **Application/Software Errors (No Drain):** CUDA Out of Memory (OOM), NaN loss assertions, missing container libraries, and SIGKILL (exit code 137 from hitting memory cgroups) are purely user-space faults. The node hardware is completely healthy. The Epilog should clean up residual processes and scratch data and leave the node in `IDLE` state.
>    - **Hardware/Driver Faults (Immediate Drain):** Hardware faults are identified strictly by kernel-level indicators: NVIDIA XID errors logged in `dmesg`, InfiniBand link-state flapping, PCIe AER fatal errors, or uncorrectable double-bit ECC events.
> 2. **Remediation Architecture:**
>    The Epilog checks kernel ring buffers specifically for fatal hardware XIDs (e.g., XID 79 for GPU fallen off the bus, XID 48 for double-bit ECC, Xid 62 for an internal micro-controller halt). Only upon matching verified hardware signatures does it issue `scontrol update NodeName=... State=DRAIN`."

---

### Scenario 3: The Infinite Loop Epilog Hang
**Interviewer:** *"An operations team added a massive file deletion routine to the Epilog to clean up terabytes of user checkpoints. Now, nodes are stuck in the `alloc` or `completing` state in Slurm forever and never return to `idle`. What happened, and how do you fix it architecturally?"*

**Candidate Answer:**
> "The node is hanging because the Epilog script is blocking the Slurm Daemon (`slurmd`) from finalizing the job state.
> 1. **The Mechanism:** Slurm waits for the Node Epilog script to exit before transitioning the node from `completing` back to `idle`. If the script executes `rm -rf /scratch/terabytes_of_small_files`, the I/O bottleneck on the local NVMe or networked file system causes the script to take hours.
> 2. **The Failure Cascade:** If the Epilog runs longer than `PrologEpilogTimeout`, Slurm terminates it and **drains the node**, so the node leaves the pool. A non-zero exit from the Epilog also drains the node (Slurm Prolog and Epilog guide, Failure Handling).
> 3. **The Architectural Fix:**
>    - **Never perform unbounded synchronous I/O in an Epilog.**
>    - **Solution A (Backgrounding):** Move the heavy `rm -rf` into an asynchronous background process using `nohup` or `systemd-run`.
>    - **Solution B (Fast Filesystem Actions):** Instead of deleting files, delete the directory inode instantly by moving it to a background trash folder, then deleting the trash folder asynchronously.
>    - **Example Fix:**
>      ```bash
>      # Fast synchronous move
>      mv /scratch/job_$SLURM_JOB_ID /scratch/trash/job_$SLURM_JOB_ID
>      # Asynchronous removal
>      systemd-run --unit=cleanup_job_$SLURM_JOB_ID rm -rf /scratch/trash/job_$SLURM_JOB_ID
>      exit 0 # Return control to Slurm immediately
>      ```

---

### Scenario 4: Investigating Job Failures using `sacct` and Cgroups

When a user complains that their job "just died," the first tool is `sacct` (Slurm Accounting).

```bash
# Query the job state, exit code, and maximum memory used
$ sacct -j 104523 --format=JobID,JobName,State,ExitCode,MaxRSS,NodeList
```

`ExitCode` is reported as `exit_code:signal`. A job killed for exceeding its memory allocation typically shows a `State` of `OUT_OF_MEMORY` (or a kill signal such as `0:9`), whereas a shell reporting 137 means 128 + SIGKILL. Compare `MaxRSS` with the `--mem` you requested. The Epilog will run and clean up, and the node remains healthy. 

To verify this, an SRE can look directly at the Linux kernel cgroup logs (if systemd is managing cgroups):
```bash
# Check the systemd log for the slurmd slice
$ journalctl -u slurmd.service | grep -i oom
# and the kernel log for OOM-killer or cgroup memory events:
$ journalctl -k | grep -i -E 'out of memory|oom'
```

---

### Scenario 5: NVSwitch Routing Failures and XID 74

**Interviewer:** *"A multi-node job fails immediately upon start. The application logs show an NCCL timeout, and dmesg on one node shows `XID 74`. The `nvidia-smi nvlink -s` output shows all links are up. What is happening?"*

**Candidate Answer:**
> "Xid 74 is an NVLink error. The catalog's immediate action is the NVLink error workflow (`WORKFLOW_NVLINK_ERR`) and the investigatory action is `CONTACT_SUPPORT`. Links showing as up in `nvidia-smi nvlink -s` does not rule out a degraded link, since the Xid is the evidence.
> 1. **Investigation:** Run `dcgmi diag -r 2`, whose `pcie` test covers peer bandwidth and NVLink state and error problems. Collect the kernel log lines around the Xid, `nvidia-bug-report.sh` output, and NVSwitch and Fabric Manager state if the platform has them.
> 2. **Resolution:** Follow the workflow the catalog points to for your platform. Do not return the node to service on the strength of a reboot alone. If the Xid recurs, escalate with the evidence package."

---

## 13. Recommended Reading and External References

To continue your masterclass education, you should consult the following primary source documents maintained by NVIDIA and the open-source community:

*   **NVIDIA DCGM Documentation:** `https://docs.nvidia.com/datacenter/dcgm/latest/`
*   **Slurm Workload Manager:** `https://slurm.schedmd.com/documentation.html`
*   **NCCL Troubleshooting Guide:** `https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting.html`
*   **LBNL Node Health Check:** `https://github.com/mej/nhc`
*   **Kubernetes Volcano Scheduler:** `https://volcano.sh/en/docs/`

---

## Key Takeaways

1. **Availability $\neq$ Readiness:** A node answering ping and running `slurmd` is not ready to train. Every node must pass active hardware gates before receiving work.
2. **Gang Scheduling Amplifies Degradation:** In synchronized multi-node training, one degraded GPU holds back every other GPU in the job, so the whole allocation runs at roughly the pace of the slowest member.
3. **Prolog Prevents Waste; Epilog Guarantees Cleanliness:** The Slurm Prolog runs in under 10 seconds to validate GPU enumeration, NVLink mesh, and InfiniBand line rates. The Epilog kills zombie processes, resets GPU state, and checks for hardware XIDs.
4. **DCGM Diagnostic Tiers Serve Different Lifecycles:** Use Level 1 for rapid pre-job admission, Level 2 for scheduled maintenance, and Level 3 for Day-0 burn-in and post-drain hardware qualification.
5. **Never Drain on User-Space Errors:** Differentiate application exceptions (OOM, PyTorch NaNs) from hardware faults (XID 79, PCIe AER, double-bit ECC) to prevent artificial cluster starvation.
6. **Workflow Orchestrators Manage the DAG, Not the Hardware:** Tools like Airflow submit workloads to Slurm/Kubernetes and monitor state, allowing complex pipelines (data prep $\rightarrow$ train $\rightarrow$ eval) to flow automatically without human intervention, implementing retry logic when hardware inevitably fails.
7. **Straggler Detection is Proactive, Not Reactive:** Do not wait for jobs to fail. Use high-frequency DCGM and InfiniBand counter scraping via Prometheus to detect micro-degradations and autonomously quarantine the faulty silicon.
