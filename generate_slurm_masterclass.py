import os

content = r"""---
title: "Chapter 6 - Slurm Administration: HA, Topology-Aware Scheduling, Accounting, and Upgrades"
slug: "chapter-6-slurm-administration-ha-accounting-and-upgrades"
sidebar_position: 6
description: "Production Slurm administration for AI supercomputers: controller HA, GRES GPU binding, cgroups, NUMA pinning, multi-tenant fairshare mathematics, and zero-downtime upgrades."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---

# Chapter 6 — Slurm Administration: HA, Topology-Aware Scheduling, Accounting, and Upgrades

In high-performance accelerated computing, **Slurm Workload Manager** is the premier orchestration engine for large-scale distributed training. Unlike general-purpose cloud orchestrators like Kubernetes that historically focused on bin-packing single containers based on loose CPU and memory estimates, Slurm operates as a **deterministic, gang-scheduled batch fabric**. It allocates thousands of tightly coupled GPUs, guarantees hardware NUMA and PCIe locality, and coordinates synchronized multi-node launches over InfiniBand and RoCE fabrics.

In an NVIDIA AI Factory setting—such as an NVIDIA DGX SuperPOD—Slurm is the ultimate arbiter of multi-million-dollar resources. As an **NVIDIA Senior Solutions Architect** or Platform Engineer, you are not simply restarting daemons; you are expected to architect resilient Slurm control planes, configure Generic Resources (GRES) with hardware topology awareness, design multi-tenant fairshare and Quality of Service (QoS) hierarchies that balance organizational budgets, and perform zero-downtime cluster software upgrades.

This chapter transitions from the absolute foundational principles of Slurm to the complex, hyper-scale administrative operations required in a production GPU environment.

---

## 1. Foundational Architecture: The Anatomy of Slurm

To administrate Slurm effectively, you must intimately understand its distributed daemons, state management, and the lifecycle of a payload. Slurm is heavily modularized, but its core daemon architecture is elegantly simple, optimized for POSIX-compliant clusters.

### 1.1 Core Daemons and Responsibilities

Slurm distributes responsibilities across a handful of specialized daemons:

*   **`slurmctld` (Slurm Controller Daemon):** The brain. It monitors cluster state, manages the job queue, enforces scheduling policies (like fairshare and backfill), and allocates resources. It does not run user code. It is highly stateful and must be made highly available.
*   **`slurmd` (Slurm Node Daemon):** The worker agent running on every compute node. It waits for instructions from `slurmctld`, provisions the node environment (cgroups, GPU isolation, network namespaces), and launches jobs.
*   **`slurmstepd` (Slurm Step Daemon):** The true parent of user tasks. `slurmd` forks a `slurmstepd` for every job step. `slurmstepd` drops root privileges to assume the user's identity, manages I/O forwarding, and directly monitors the user processes (the actual MPI ranks or Python scripts).
*   **`slurmdbd` (Slurm Database Daemon):** The ledger. It provides a secure, centralized interface between `slurmctld` and a relational database (typically MariaDB or MySQL). It records historical cluster usage, enforces account limits, manages users, and tracks billing via Trackable Resources (TRES).
*   **`slurmrestd` (Slurm REST API Daemon):** An optional but increasingly critical daemon that provides an OpenAPI-compliant RESTful interface to Slurm, widely used by modern MLOps platforms (like Run:ai, Weights & Biases, or custom CI/CD pipelines) to submit and monitor jobs without relying on SSH or local CLI clients.

### 1.2 Jobs, Steps, and Tasks

In Slurm parlance, a user's computational request is broken down hierarchically:

1.  **Job (Allocation):** A request for resources (nodes, GPUs, memory, time) from the scheduler. For example, "I need 8 DGX nodes, 64 GPUs total, for 2 hours." This creates an allocation block, identified by a `JobID`.
2.  **Job Step (`srun`):** A set of tasks launched *within* an existing allocation. A single job can have multiple sequential or concurrent steps. A step is identified by `JobID.StepID`.
3.  **Task:** An individual operating system process launched by a step (e.g., a single PyTorch Distributed Data Parallel rank).

#### 1.2.1 Real-World Launch Example

Consider a user submitting a batch script (`sbatch train.sh`). The script requests two nodes with 8 GPUs each. 
Inside the script, the user calls `srun python train.py`. 

1.  `sbatch` contacts `slurmctld` to queue the job.
2.  `slurmctld` grants the allocation and contacts the `slurmd` on the first allocated node (the batch host).
3.  The batch host `slurmd` forks `slurmstepd` to run the shell script `train.sh`.
4.  The shell script hits `srun`. `srun` contacts `slurmctld` to get a step allocation.
5.  `slurmctld` instructs `slurmd` on *both* allocated nodes to fork new `slurmstepd` processes.
6.  These new `slurmstepd` instances pin CPU cores, isolate the GPUs using cgroups, and launch `python train.py`.

```mermaid
sequenceDiagram
    participant User
    participant slurmctld
    participant slurmd_Node1
    participant slurmd_Node2
    
    User->>slurmctld: sbatch --nodes=2 --gpus=16 train.sh
    slurmctld-->>User: Submitted Job 1042
    
    Note over slurmctld, slurmd_Node1: Job is scheduled...
    
    slurmctld->>slurmd_Node1: Run Batch Script (Job 1042)
    slurmd_Node1->>slurmd_Node1: fork() slurmstepd (Batch)
    
    Note over slurmd_Node1: Batch script executes 'srun python train.py'
    slurmd_Node1->>slurmctld: Request Step Allocation (Job 1042.0)
    slurmctld->>slurmd_Node1: Launch Step Tasks
    slurmctld->>slurmd_Node2: Launch Step Tasks
    
    slurmd_Node1->>slurmd_Node1: fork() slurmstepd (Task 0-7)
    slurmd_Node2->>slurmd_Node2: fork() slurmstepd (Task 8-15)
```

---

## 2. Advanced Slurm Configuration (`slurm.conf`)

The `slurm.conf` file is the master configuration for the cluster. In production environments, it is typically distributed by configuration management tools (Ansible, Puppet) and must remain consistent across all nodes (controllers and compute).

### 2.1 The Architecture of `slurm.conf`

A production `slurm.conf` is divided into distinct operational blocks. Let's examine a realistic excerpt for an NVIDIA DGX cluster.

```ini
# /etc/slurm/slurm.conf
# =========================================================================
# 1. CLUSTER DEFINITION & DAEMON SETTINGS
# =========================================================================
ClusterName=AIFactory
SlurmUser=slurm
SlurmdUser=root
SlurmctldPort=6817
SlurmdPort=6818
AuthType=auth/munge
CryptoType=crypto/munge
StateSaveLocation=/var/spool/slurmctld_state
SlurmdSpoolDir=/var/spool/slurmd

# =========================================================================
# 2. HIGH AVAILABILITY (ACTIVE/PASSIVE)
# =========================================================================
SlurmctldHost=slurmctl-01(10.10.10.11)
SlurmctldHost=slurmctl-02(10.10.10.12)
SlurmctldTimeout=30
SlurmdTimeout=60

# =========================================================================
# 3. ACCOUNTING & DATABASE
# =========================================================================
JobAcctGatherType=jobacct_gather/cgroup
JobAcctGatherFrequency=30
AccountingStorageType=accounting_storage/slurmdbd
AccountingStorageHost=slurmdb-01
AccountingStorageTRES=gres/gpu
AccountingStoreFlags=job_comment

# =========================================================================
# 4. SCHEDULING & POLICIES
# =========================================================================
SchedulerType=sched/backfill
SelectType=select/cons_tres
SelectTypeParameters=CR_Core_Memory,CR_CORE_DEFAULT_DIST_BLOCK
PriorityType=priority/multifactor
PriorityDecayHalfLife=14-0
PriorityWeightFairshare=100000
PriorityWeightAge=1000
PriorityWeightPartition=10000
PriorityWeightJobSize=1000
PriorityWeightQOS=1000000

# =========================================================================
# 5. RESOURCE ISOLATION & CGROUPS (V2)
# =========================================================================
ProctrackType=proctrack/cgroup
TaskPlugin=task/cgroup,task/affinity
GresTypes=gpu

# =========================================================================
# 6. NODE DEFINITIONS (NVIDIA DGX H100)
# =========================================================================
NodeName=dgx-h100-[01-32] CPUs=224 Boards=1 SocketsPerBoard=2 CoresPerSocket=56 ThreadsPerCore=2 RealMemory=1920000 Gres=gpu:h100:8 State=UNKNOWN

# =========================================================================
# 7. PARTITION (QUEUE) DEFINITIONS
# =========================================================================
PartitionName=train Nodes=dgx-h100-[01-24] Default=YES MaxTime=7-00:00:00 State=UP
PartitionName=debug Nodes=dgx-h100-[25-32] Default=NO MaxTime=01:00:00 State=UP
```

#### Detailed Breakdown of Critical Directives:

*   **`AuthType=auth/munge`**: Slurm absolutely depends on MUNGE (MUNGE Uid 'N' Gid Emporium) for cryptographic authentication. All nodes in the cluster must share the exact same `/etc/munge/munge.key` and have synchronized clocks (NTP/PTP is critical). A clock drift of even a few minutes will cause MUNGE credentials to be rejected, instantly partitioning the cluster.
*   **`SelectType=select/cons_tres`**: The "Consumable Trackable Resources" selection plugin. This is mandatory for GPU scheduling. It allows Slurm to track CPUs, Memory, and GPUs individually as consumable items, rather than dedicating an entire node to a job that only needs a fraction of it.
*   **`TaskPlugin=task/cgroup,task/affinity`**: This pair forces `slurmstepd` to use Linux Control Groups (cgroups) to constrain jobs to their allocated resources, preventing "noisy neighbor" scenarios where Job A bleeds memory or CPU usage into Job B's allocation. `task/affinity` handles the low-level NUMA pinning logic.
*   **`PriorityType=priority/multifactor`**: This tells the scheduler to calculate queue priority mathematically based on a combination of queue time (Age), job size, Quality of Service (QOS), and Historical Usage (Fairshare). We will dive deep into this later.

### 2.2 Generic Resources (GRES) and Topology-Aware GPU Binding

CPUs and Memory are standard resources to Slurm. Everything else (GPUs, FPGAs, special networking cards) is considered a Generic Resource (GRES).

Defining a node as having 8 GPUs is not enough in modern AI infrastructure. A DGX system is highly topological: specific GPUs sit on specific PCIe switches, attached to specific CPU sockets and NUMA nodes. If PyTorch tries to communicate between GPU 0 and GPU 1, it expects NVLink. If it communicates between GPU 0 and a CPU core, it expects they share the same PCIe root complex.

If Slurm blindly assigns *any* free CPU core to *any* free GPU, performance will degrade by up to 40% due to QPI/UPI cross-socket traffic or suboptimal PCIe traversal.

This is managed by `gres.conf`.

#### Example `gres.conf` for a Topology-Aware System

```ini
# /etc/slurm/gres.conf
# Define AutoDetect so Slurm interrogates NVML on startup
AutoDetect=nvml

# Explicit mapping definition (example of what AutoDetect figures out behind the scenes)
# CPU cores 0-15 and 64-79 (hyperthreads) map to NUMA node 0 and GPUs 0,1
Name=gpu Type=h100 File=/dev/nvidia0 Cores=0-15,64-79 Links=0,1
Name=gpu Type=h100 File=/dev/nvidia1 Cores=0-15,64-79 Links=0,1

# ... definitions for other GPUs mapping to their local cores ...
```

By using `AutoDetect=nvml`, the `slurmd` daemon on the compute node will query the NVIDIA Management Library (NVML) on service startup to dynamically map the true hardware topology. The controller uses this data when placing jobs.

When a user submits: `sbatch --gpus=2 --ntasks=8 --cpus-per-task=2`, Slurm will guarantee that the 16 requested CPU cores share the exact same NUMA domain as the 2 allocated GPUs.

---

## 3. Designing Slurm High Availability (Active/Passive)

The Slurm controller (`slurmctld`) is a single binary holding the state of a multi-million-dollar supercomputer. If `slurmctld` dies and is unrecoverable, the cluster stops accepting jobs, and running jobs may lose their telemetry or fail gracefully depending on configurations.

Production environments use an Active/Passive HA model for the controller.

### 3.1 Architecture of HA Controllers

```mermaid
flowchart LR
    subgraph StorageLayer["NFS / Weka / VAST"]
        StateSaveLocation["/var/spool/slurmctld_state
        (Shared File System)"]
    end
    
    subgraph ControllerFabric["Control Plane"]
        CTL1("Primary slurmctld
        (10.10.10.11)") 
        
        CTL2("Backup slurmctld
        (10.10.10.12)")
    end
    
    subgraph ComputeNodes["Compute Fabric"]
        N1("slurmd")
        N2("slurmd")
    end
    
    CTL1 -- Read/Write State (ACTIVE) --> StateSaveLocation
    CTL2 -- Read Only (STANDBY) --> StateSaveLocation
    
    CTL1 -- Heartbeat (ping) --> CTL2
    
    N1 -. Heartbeat .-> CTL1
    N2 -. Heartbeat .-> CTL1
    
    N1 -. Heartbeat Fallback .-> CTL2
    N2 -. Heartbeat Fallback .-> CTL2
```

In `slurm.conf`, HA is defined simply:

```ini
SlurmctldHost=slurmctl-01(10.10.10.11)
SlurmctldHost=slurmctl-02(10.10.10.12)
StateSaveLocation=/var/shared_spool/slurmctld_state
```

### 3.2 The Failover Mechanism

1.  **State Save Location:** Both controllers MUST mount a shared, highly available filesystem (like a resilient NFS mount, or a dedicated HA block storage) at the `StateSaveLocation`. This directory contains binary state files (`job_state`, `node_state`, `resv_state`) written continuously by the active controller.
2.  **Heartbeats:** The Primary Controller and Backup Controller communicate via periodic pings (defined by `SlurmctldTimeout`).
3.  **Takeover:** If the Backup Controller fails to receive a ping from the Primary within `SlurmctldTimeout` (e.g., 30 seconds), it assumes the Primary is dead.
4.  **State Restoration:** The Backup Controller reads the binary files from `StateSaveLocation` into RAM, reconstructing the exact state of every job, node, and partition.
5.  **Compute Node Redirection:** The `slurmd` daemons on the compute nodes are also configured with both `SlurmctldHost` entries. When they realize the Primary is unreachable, they begin routing their communications to the Backup. The Backup transitions to the ACTIVE state.

### 3.3 Split-Brain Mitigation

"Split-brain" occurs when both controllers believe they are ACTIVE. This usually happens during a network partition where the controllers cannot ping each other, but both can communicate with subsets of the compute nodes. If both write to the `StateSaveLocation` simultaneously, state corruption is imminent.

**Mitigation Strategies:**

1.  **Strict File Locking on Shared Storage:** Slurm relies on POSIX file locking on the `StateSaveLocation`. The ACTIVE controller takes an exclusive lock on a lockfile. The STANDBY controller polls this lock. If your NFS server does not respect POSIX locks perfectly (a common issue with legacy or misconfigured NFS implementations), split-brain *will* occur. Validate lock propagation heavily during deployment.
2.  **Fencing:** While Slurm natively handles failover gracefully, hyper-scale environments often use external cluster managers (like Pacemaker/Corosync) simply to STONITH ("Shoot The Other Node In The Head") a non-responsive controller via IPMI/Redfish before allowing the backup to assume the active role, guaranteeing no split-brain.

---

## 4. Multi-Tenant Accounting, `slurmdbd`, and Fairshare

A large AI factory is rarely a single monolithic team. It is shared by LLM Pretraining teams, Reinforcement Learning teams, Computer Vision researchers, and generic data science. These teams represent departments with distinct financial budgets.

Slurm uses the `slurmdbd` (Database Daemon) and the Multifactor Priority Plugin to implement a pseudo-currency system.

### 4.1 The Accounting Architecture

```mermaid
flowchart TD
    subgraph DatabaseLayer["Relational Database"]
        MySQL[(MariaDB / MySQL
        Galera Cluster)]
    end
    
    subgraph DBD["Accounting Server (slurmdb-01)"]
        Slurmdbd["slurmdbd daemon
        (Port 6819)"]
    end
    
    subgraph CTLLayer["Controllers"]
        Slurmctld["slurmctld
        (ACTIVE)"]
    end
    
    subgraph CLI["Management"]
        Sacctmgr["sacctmgr"]
        Sacct["sacct"]
    end

    Slurmdbd -- SQL / TCP 3306 --> MySQL
    Slurmctld -- RPC / TCP 6819 --> Slurmdbd
    Sacctmgr -- RPC / TCP 6819 --> Slurmdbd
    Sacct -- RPC / TCP 6819 --> Slurmdbd
```

`slurmdbd` stands between the controllers and the raw database. *Never* allow `slurmctld` to talk directly to MySQL. 

### 4.2 Configuring `slurmdbd.conf`

```ini
# /etc/slurm/slurmdbd.conf
AuthType=auth/munge
DbdHost=slurmdb-01
StorageType=accounting_storage/mysql
StorageHost=db-cluster-vip
StoragePort=3306
StorageUser=slurm
StoragePass=SuperSecretPassword
StorageLoc=slurm_acct_db

# Rollups: Aggregate raw job data for fast reporting
ArchiveEvents=yes
ArchiveJobs=yes
PurgeJobAfter=12months
```

### 4.3 The Hierarchy: Clusters, Accounts, and Users

Using `sacctmgr`, the Slurm Database Administrator creates a billing hierarchy.

```bash
# 1. Create the cluster representation in the DB
sacctmgr add cluster AIFactory

# 2. Create high-level organizational accounts
sacctmgr add account genai description="Generative AI Division"
sacctmgr add account robotics description="Robotics Research"

# 3. Create sub-accounts for specific teams
sacctmgr add account llm-pretrain parent=genai
sacctmgr add account cv-vision parent=robotics

# 4. Associate users with accounts
sacctmgr add user jsmith account=llm-pretrain
sacctmgr add user adoe account=cv-vision
```

### 4.4 The Multifactor Priority Algorithm & Fairshare

When 50 jobs are sitting in the queue waiting for a node, who gets scheduled first? Slurm calculates a priority score for every pending job.

$$ Priority = (Weight_{Age} \times Age_{Score}) + (Weight_{Fairshare} \times Fairshare_{Score}) + (Weight_{QoS} \times QoS_{Score}) + \dots $$

**The Fairshare Factor (The most complex variable):**

Fairshare is the mechanism that ensures teams get the computing time they "paid" for. If the GenAI team purchased 80% of the cluster, and Robotics purchased 20%, you assign them "shares" proportional to their investment.

```bash
sacctmgr modify account genai set shares=80
sacctmgr modify account robotics set shares=20
```

The $Fairshare_{Score}$ (a value between 0.0 and 1.0) is dynamically calculated by comparing a team's **Assigned Shares** against their **Historical Usage**.

*   If the GenAI team has historically used exactly 80% of the cluster, their Fairshare Score sits around 0.5 (neutral).
*   If the GenAI team has been dominating the cluster and using 95% of the cycles, their Fairshare Score approaches 0.0. Their future jobs are heavily penalized in the queue.
*   If the Robotics team has been on vacation and used 0% of the cluster, their Fairshare Score approaches 1.0. The moment they submit a job, its massive priority boost forces it to the top of the queue.

**Decay:** Historical usage decays over time (defined by `PriorityDecayHalfLife=14-0` in `slurm.conf`, meaning usage weight halves every 14 days). Without decay, a user who ran a huge job six months ago would be penalized forever.

### 4.5 Billing via TRES (Trackable Resources)

Historically, Slurm billed by "CPU Minutes." In an AI Factory, CPUs are cheap; GPUs are expensive. Slurm uses TRES to weight billing.

In `slurm.conf`:
```ini
AccountingStorageTRES=gres/gpu,cpu,mem
```

Using `sacctmgr`, an administrator can define TRES billing weights for a partition:
```bash
# A GPU costs 100 credits/hour, a CPU costs 1 credit/hour.
sacctmgr modify partition train set TRESBillingWeights="gres/gpu=100,cpu=1,mem=0.01"
```
When calculating a user's historical usage for Fairshare, Slurm applies these weights. Burning 1,000 CPU core hours barely registers, but burning 1,000 H100 GPU hours will heavily impact their Fairshare score.

---

## 5. Live Cluster Upgrades and Maintenance Operations

A 2000-node AI Factory running a 3-month foundation model training job cannot be rebooted for a minor Slurm patch. Slurm is designed to be upgraded *live*, with zero downtime to running jobs and no loss of queuing state.

### 5.1 The Upgrade Rule

Slurm daemons are backwards compatible, but **not forwards compatible** in an upgrade scenario. 

**The immutable order of operations for a Slurm upgrade:**
1. Upgrade `slurmdbd` (The database daemon must be the newest binary).
2. Upgrade `slurmctld` (The controller can talk to an older `slurmd`, but `slurmd` cannot be newer than the controller).
3. Upgrade `slurmd` on the compute nodes (can be done in rolling batches).

### 5.2 Step-by-Step Live Upgrade Procedure

*Scenario: Upgrading Slurm from 23.02.x to 23.11.x on a production cluster.*

#### Phase 1: Database Upgrade

1.  **Halt Accounting:** Stop the database daemon. The controllers will cache accounting data in memory and on disk until `slurmdbd` returns.
    ```bash
    systemctl stop slurmdbd
    ```
2.  **Backup Database:** Perform a mysqldump of the `slurm_acct_db`. This is non-negotiable. Major Slurm upgrades frequently include automated DB schema migrations. If the migration fails, you must rollback.
3.  **Upgrade Binaries:** Install the new `slurm` and `slurm-slurmdbd` RPMs/DEBs on the `slurmdbd` host.
4.  **Start and Migrate:** Start the daemon. It will detect the old schema and automatically lock the database, applying ALTER TABLE statements. This can take hours on massive databases.
    ```bash
    systemctl start slurmdbd
    # Tail the logs to watch schema migrations
    tail -f /var/log/slurm/slurmdbd.log
    ```

#### Phase 2: Controller Upgrade

1.  **Halt Controllers:** Stop both the primary and backup controllers. Running jobs will continue processing on the compute nodes completely undisturbed. However, users cannot run `squeue`, submit new jobs via `sbatch`, or interact with the queue.
    ```bash
    systemctl stop slurmctld # On both CTL1 and CTL2
    ```
2.  **Upgrade Binaries:** Install the new Slurm packages on both controller hosts.
3.  **Start Controllers:** Start the primary, then the backup. The new `slurmctld` will read the `StateSaveLocation`, parse the binary state files from the old version, translate them to the new internal struct formats, and resume operations.
    ```bash
    systemctl start slurmctld
    ```
4.  **Verify State:** The queue should immediately reappear.
    ```bash
    sinfo
    squeue
    ```

#### Phase 3: Rolling Compute Upgrades

Compute nodes can be upgraded incrementally without disrupting running jobs. `slurmctld` 23.11 can communicate perfectly with `slurmd` 23.02.

For a given compute node (`dgx-01`):
1.  **Drain the Node (Optional but recommended):** If you wish to be perfectly safe, drain the node to prevent new jobs from landing on it, wait for current jobs to finish, upgrade, and resume.
    ```bash
    scontrol update nodename=dgx-01 state=DRAIN reason="Slurm Upgrade"
    ```
2.  **Or, Live Upgrade:** Alternatively, simply restart the daemon. `slurmd` handles the node state. The running jobs are managed by `slurmstepd`, which is an independent process tree. Restarting `slurmd` does *not* kill the running `slurmstepd` tasks.
    ```bash
    systemctl stop slurmd
    yum update slurm-slurmd
    systemctl start slurmd
    ```

---

## 6. Senior Solutions Architect Troubleshooting Scenarios

Operations in high-performance computing regularly involve diagnosing obscure distributed systems failures. 

### Scenario 1: The Controller is Unresponsive (Database Deadlock)

**Symptom:** Users complain `squeue` hangs and eventually times out. `sinfo` hangs. The cluster appears completely dead, yet currently running training jobs are progressing.

**Diagnosis:**
1.  Check the `slurmctld` logs (`/var/log/slurm/slurmctld.log`). You see repeated messages:
    ```
    slurmctld: error: slurmdbd: agent queue is full, dropping requests
    slurmctld: error: _slurm_send_recv_msg: Header lengths are longer than data received
    ```
2.  The controller is alive, but its internal threads are completely blocked waiting on RPC responses from `slurmdbd`. Because it is single-threaded in its main event loop for many operations, blocking on the DB stalls the entire scheduler.
3.  Check the `slurmdbd` logs.
    ```
    slurmdbd: error: mysql_query failed: 1205 Lock wait timeout exceeded; try restarting transaction
    ```
4.  The root cause is not Slurm, but the backend MariaDB database. A massive complex query (perhaps an auditor running an unoptimized `sacct` query spanning 5 years of data) has taken a table-level read lock on `job_table`. `slurmdbd` is attempting to INSERT new job records and is blocked by the lock. The queue backs up, `slurmdbd` stops accepting connections, and `slurmctld` hangs waiting for `slurmdbd`.

**Remediation:**
1.  Log into the MariaDB server. Execute `SHOW FULL PROCESSLIST;`
2.  Identify the long-running SELECT query holding the locks.
3.  Kill the SQL query thread (`KILL <process_id>;`).
4.  `slurmdbd` will immediately flush its queue of INSERTs, `slurmctld` will unblock, and `squeue` will return.

### Scenario 2: Controller Split-Brain Recovery

**Symptom:** After a severe network core switch failure, the network restores, but half the compute nodes report `State=DOWN` in `sinfo`. `slurmctld` logs show chaotic node state flapping.

**Diagnosis:**
During the network partition, the NFS storage holding `StateSaveLocation` suffered a lock failure. Both controllers assumed the ACTIVE role. 
CTL1 received updates from Nodes 1-500. CTL2 received updates from Nodes 501-1000. Both controllers interleaved conflicting writes into `/var/spool/slurmctld_state/node_state`. The binary state file is heavily corrupted.

**Remediation:**
You must perform a cold start of the Slurm state. This is destructive to the queue but preserves running jobs (usually).

1.  Stop `slurmctld` on BOTH controllers.
2.  Stop `slurmd` on ALL compute nodes (use parallel SSH/Ansible).
    *CRITICAL:* Do not kill `slurmstepd`. The running GPU jobs are safe as long as `slurmstepd` lives.
3.  On the primary controller, move the corrupted state files.
    ```bash
    mv /var/spool/slurmctld_state /var/spool/slurmctld_state.corrupt_backup
    mkdir -p /var/spool/slurmctld_state
    chown slurm:slurm /var/spool/slurmctld_state
    ```
4.  Start `slurmctld` on the Primary controller using the `-c` (Clear) flag. This forces Slurm to discard all previous state and rebuild it entirely from scratch.
    ```bash
    slurmctld -c
    ```
5.  Start `slurmd` on all compute nodes. As the nodes check in, they will report any running `slurmstepd` processes. `slurmctld` will adopt these orphaned processes and reconstruct the running job table dynamically. 
6.  *Data Loss:* All *pending* (queued) jobs were lost in the state wipe and must be resubmitted by users.

### Scenario 3: GPU Binding Failures (Cgroup Issues)

**Symptom:** A user submits an 8-GPU job on a single node. The job fails immediately. The user's `slurm-%j.out` file reads: `RuntimeError: CUDA error: no CUDA-capable device is detected`. However, `nvidia-smi` on the node shows 8 healthy GPUs.

**Diagnosis:**
1.  Inspect the node's `slurmd` log (`/var/log/slurm/slurmd.log`).
    ```
    slurmd: error: cgroup/v2: unable to add task to device cgroup: Permission denied
    slurmd: error: stepd_api: could not setup cgroups
    ```
2.  The node was recently updated to a new OS kernel, which transitioned the system from cgroups v1 to cgroups v2, or the `systemd` delegate policies for the Slurm slice were overwritten. Slurm's `task/cgroup` plugin creates a device allowlist (via eBPF in cgroups v2) that explicitly prevents the user's process from communicating with the `/dev/nvidia*` character devices unless allocated. If the cgroup setup fails, the default action is total denial of access.

**Remediation:**
1.  Verify the `slurm.conf` explicitly supports the cgroup version: `CgroupPlugin=cgroup/v2`.
2.  Ensure `/etc/slurm/cgroup.conf` is correctly configured to constrain devices:
    ```ini
    ConstrainDevices=yes
    ConstrainCores=yes
    ConstrainRAMSpace=yes
    ```
3.  Check `systemd` delegation. Slurm requires the ability to manipulate eBPF programs for device control in v2.
    ```bash
    # In /etc/systemd/system/slurmd.service
    [Service]
    Delegate=yes
    ```
4.  Run `systemctl daemon-reload` and restart `slurmd`.

---

## 7. Operational Best Practices and Summary

Managing Slurm at the scale of an AI Factory requires treating the scheduler as a tier-zero infrastructure component.

1.  **Monitor the Queues, Not Just the Hardware:** A cluster with 100% hardware uptime is useless if the scheduler queue is permanently blocked by a misconfigured Fairshare policy or a database lock. Monitor Slurm RPC latencies, pending job queue depth, and DB query times via Prometheus (using the `slurm-exporter`).
2.  **Version Control Everything:** `slurm.conf`, `slurmdbd.conf`, `gres.conf`, and `cgroup.conf` must be rigorously managed via Git and deployed via Ansible/Terraform. A single typo in a node definition will permanently partition that node from the scheduler.
3.  **Regularly Purge the Database:** The `slurm_job_table` in MariaDB will grow to billions of rows in a busy cluster, causing severe performance degradation. Ensure `PurgeJobAfter` is set in `slurmdbd.conf` to automatically truncate records older than 12-18 months. Aggregate data via Slurm rollups will be preserved for high-level historical reporting.
4.  **Test Failover Quarterly:** Game-day test your HA controllers. Randomly kill the primary `slurmctld` process during peak workload hours. If your storage locks or network timeouts are misconfigured, it is better to find out during a controlled test than a 3:00 AM core switch crash.

The transition from a default Slurm installation to a multi-tenant, highly available AI orchestrator requires meticulous attention to state management, accounting physics, and deep operating system integration.
"""

file_path = "/Users/jithinpjoseph/Documents/GitHub/nvidia-devops/docs/volume-10/06-slurm-administration-ha-accounting-and-upgrades.md"

with open(file_path, "w") as f:
    f.write(content)

print(f"Successfully wrote {len(content.splitlines())} lines to {file_path}")
