---
title: "Foundation — how the bare-metal and HPC operations stack fits together"
slug: "foundation-bare-metal-hpc-operations"
sidebar_position: 0
description: "A beginner orientation connecting BMC, BCM, Linux, IaC, Slurm, MPI, containers and cluster change."
source_document: "Authored directly as the Volume 10 foundation chapter."
---

# Foundation — how the bare-metal and HPC operations stack fits together

## What this volume is trying to teach

Volume 10 follows a physical GPU server from hardware management through operating-system provisioning, configuration, scheduling, job execution and fleet-wide change. It integrates topics from earlier volumes and is intentionally operational. This chapter gives those tools separate places before later chapters combine them.

## The stack by responsibility

| Layer/tool | Primary responsibility | It does not replace |
|---|---|---|
| BMC with Redfish/IPMI | Out-of-band hardware inventory, console, sensors and power control | Host operating system or scheduler |
| BCM | Bare-metal cluster images, node categories, provisioning and health lifecycle | Every configuration/IaC use case or job communication library |
| Linux | Host processes, memory, devices, network, security and services | Cluster scheduler |
| Ansible | Repeated host/application configuration through tasks and inventory | Terraform state or Slurm scheduling |
| Terraform | Lifecycle of provider/API-managed infrastructure objects | Arbitrary OS configuration without an appropriate provider |
| Slurm | Resource allocation, queues and batch job launch | MPI/NCCL communication |
| MPI/PMIx | Process launch/bootstrap and process communication ecosystem | Scheduler allocation |
| NCCL | GPU collective communication | General cluster lifecycle management |
| Enroot/Pyxis | Unprivileged container user space integrated with Slurm | Host driver/kernel or scheduler policy |
| CI/CD/change process | Evidence, approval and controlled promotion of changes | Technical validation and rollback design |

## Follow one node and one job

A BMC makes a powered chassis manageable. Firmware and BIOS are baselined. Network boot or BCM installs a known OS image. Configuration tools establish users, security, drivers and services. Health checks prove the node is eligible. Slurm admits it to a partition and later allocates it. A launcher starts job ranks; MPI/NCCL and the network move data; storage supplies datasets and checkpoints. Logs/accounting record outcomes. Change management maintains compatibility across every layer.

When a job fails, locate the last successful boundary. When a change is planned, identify every compatibility boundary it touches.

## Essential distinctions

- **Provisioning** creates or installs a base system; **configuration** establishes its role.
- **Desired state** is what policy declares; **observed state** is what currently exists.
- A **scheduler** allocates resources; a **communication library** moves data among processes.
- **Availability** means reachable/operating; **readiness** means safe to accept the intended work.
- **Idempotent** means repeating an operation converges without unintended repeated effects.
- A **canary** is a deliberately representative limited exposure, not merely one spare node.
- **Rollback** must be a tested procedure; some firmware and state changes are not easily reversible.

## Follow a server from delivery to first job

### 1. Physical readiness and out-of-band control

The rack must supply validated power, cooling and network cabling. The BMC has an independent management path for inventory, sensors, console and power control. Host Linux can be down while the BMC remains reachable.

### 2. Firmware and boot baseline

Record BMC, BIOS/UEFI, GPU, NVSwitch, NIC/HCA and storage firmware as a tested compatibility set. Configure supported boot, security, virtualization/IOMMU and device settings. Network boot relies on address/boot discovery and artifact delivery before an OS exists.

### 3. Image and operating system

BCM or another provisioner assigns a known image to node categories/roles. The node boots kernel/initramfs, discovers storage/network/devices and starts systemd services. Configuration/hardening establishes identity, time sync, repositories, audit, firewall and required cluster components.

### 4. Accelerator and fabric stack

Install/validate driver, CUDA user-space expectations, container integration, NIC/RDMA stack and topology. Hardware visibility, driver initialization, framework execution and distributed communication are separate gates.

### 5. Scheduler readiness

Health checks validate expected GPU count, critical errors, fabric links, mounts, time, daemon/config consistency and a representative test. Only then should Slurm or another scheduler accept the node.

### 6. Job lifecycle

The user submits resource requirements. Slurm selects eligible nodes. Prolog validates/prepares. Launcher/PMIx starts ranks. MPI/NCCL and storage participate in execution. Epilog/accounting cleans and records outcomes. Failed health should drain/quarantine rather than silently return capacity.

## Control plane versus data plane

| Plane | Examples |
|---|---|
| Management/control | BMC network, BCM head node, Git/IaC pipeline, Slurm controller, monitoring control services |
| Workload/data | GPU computation, MPI/NCCL fabric, dataset reads, checkpoint writes, inference traffic |

A healthy control plane can schedule a job onto a degraded data path. A healthy data fabric cannot compensate for unavailable scheduler/identity services. Monitor and test both.

## Version and ownership matrix

Maintain one artifact listing:

- hardware generation and firmware bundle;
- OS/kernel;
- GPU driver;
- CUDA/framework/container image;
- NIC/HCA firmware and OFED/driver stack;
- NCCL/MPI/PMIx;
- Slurm/BCM/Enroot/Pyxis;
- storage client/server compatibility;
- Kubernetes/operator versions where present.

For each field record owner, source of truth, validation, rollout unit and rollback constraint. "Latest" is not a production version strategy.

## Safe first lab without physical mutations

On an authorized lab node, collect an evidence-only inventory:

```bash
hostnamectl
uname -a
lspci -nn
ip -brief address
ip route
findmnt
systemctl --failed
nvidia-smi --query-gpu=index,name,uuid,driver_version --format=csv
nvidia-smi topo -m
```

If Slurm is installed:

```bash
scontrol show node "$(hostname -s)"
```

Create a table with expected, observed, evidence source and admission consequence. Do not update firmware, reset GPUs, change BMC power or resume a drained node during an observation lab.

## Worked fault isolation

**Symptom:** Slurm node is idle but a multi-node job never starts correctly.

1. Confirm allocation and node/job reasons from Slurm.
2. Confirm every expected `slurmd`/rank starts and has consistent environment.
3. Run CPU/rank bootstrap test before GPU collectives.
4. Confirm local GPU framework test on each allocated node.
5. Compare driver/container/MPI/NCCL versions and topology.
6. Run a controlled two-node NCCL test.
7. Inspect selected interface/transport and fabric counters.
8. Add storage/data path and the real framework only after lower layers pass.
9. Drain/quarantine a consistently failing node and preserve evidence.

## Official references

- [NVIDIA Base Command Manager](https://docs.nvidia.com/base-command-manager/)
- [BCM 11 administrator manual](https://docs.nvidia.com/base-command-manager/manuals/11/admin-manual.pdf)
- [NVIDIA DCGM](https://docs.nvidia.com/datacenter/dcgm/latest/learn/)
- [NVIDIA NCCL](https://docs.nvidia.com/deeplearning/nccl/)
- [Slurm documentation](https://slurm.schedmd.com/documentation.html)
- [Terraform documentation](https://developer.hashicorp.com/terraform/docs)
- [Ansible documentation](https://docs.ansible.com/projects/ansible/latest/)

## How to study this volume

Read Chapters 1–3 for hardware/OS lifecycle, 4–5 for automation ownership, 6–8 for job execution, and 9–12 for health/change/delivery/documentation. Use deep dives only after the related core chapter. Perform power, firmware, reimage, scheduler-state and infrastructure mutations only in an authorized lab or approved maintenance process.

## Readiness check

You are ready when you can explain which layer owns power, image, host configuration, infrastructure API objects, resource allocation, process communication and container user space—and why a green check at one layer cannot validate all the others.

Before interview practice, complete the companion [Slurm and BCM interview lab](./slurm-bcm-interview-lab). It turns this stack into an evidence-driven sequence of commands, failure boundaries and senior-level answer patterns.
