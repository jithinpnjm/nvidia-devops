---
title: "Senior Deep Dive 7 — Fleet lifecycle: upgrades, draining and known-good validation"
slug: "senior-deep-dive-7-fleet-lifecycle-upgrades-draining-and-known-good-validation"
sidebar_position: 14
description: "Senior Deep Dive 7 — Fleet lifecycle: upgrades, draining and known-good validation — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
GPU nodes should have an explicit lifecycle: provision -> validate -> admit workloads -> observe -> drain -> upgrade -> revalidate -> return to service. Driver and operator upgrades are workload-impacting changes. Use a canary node group, representative CUDA/inference/training smoke tests and rollback criteria. Firmware, NIC drivers, OFED/DOCA, kernel and GPU driver compatibility form a matrix; change control should capture the entire node image, not only the Kubernetes manifest.

Base Command Manager remains relevant for on-prem AI/HPC estates where bare-metal lifecycle, Slurm, Kubernetes, provisioning and firmware/software image management must be coordinated. 2026 BCM releases include current Slurm and CUDA stacks, illustrating why an SA must be comfortable with both Kubernetes-native and HPC-oriented operations.

## Targeted references and reinforcement

**NVIDIA GPU Operator:** [https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html) — Operator-managed GPU software dependency stack.

**NVIDIA MIG User Guide:** [https://docs.nvidia.com/datacenter/tesla/mig-user-guide/latest/](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/latest/) — MIG isolation, supported GPUs and operational considerations.

**NVIDIA DCGM:** [https://docs.nvidia.com/datacenter/dcgm/latest/contents.html](https://docs.nvidia.com/datacenter/dcgm/latest/contents.html) — Telemetry, diagnostics, health and topology APIs; current documentation updated in 2026.

**NVIDIA Base Command Manager:** [https://docs.nvidia.com/base-command-manager/](https://docs.nvidia.com/base-command-manager/) — Bare-metal/HPC/Kubernetes lifecycle context for AI clusters.
