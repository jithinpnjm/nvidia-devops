---
title: "Senior Deep Dive 4 — GPU Operator as a dependency reconciler"
slug: "senior-deep-dive-4-gpu-operator-as-a-dependency-reconciler"
sidebar_position: 11
description: "Senior Deep Dive 4 — GPU Operator as a dependency reconciler — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
The GPU Operator automates the NVIDIA driver, Container Toolkit, Kubernetes device plugin, GPU Feature Discovery / node labels, DCGM-based monitoring and related operands. Operationally, this means one ClusterPolicy expresses desired GPU software state and multiple controllers/DaemonSets converge nodes toward it. When a node exposes zero GPUs, inspect operator state and each operand rather than reinstalling the driver blindly.


<!-- source-table:1 -->

| Failure | Likely boundary | Evidence |
| --- | --- | --- |
| nvidia-smi fails on host | driver/device/firmware | driver pod or host driver logs, dmesg, lspci |
| host works, Pod has no GPU | device plugin/runtime injection | device-plugin logs, allocatable resource, CDI/runtime config |
| GPU exists, wrong labels | feature discovery | GFD/NFD pods, node labels |
| metrics absent | DCGM/DCGM exporter/ServiceMonitor | exporter logs, /metrics endpoint, Prometheus target |
| operator stuck upgrading | ClusterPolicy/operand rollout | CSV/Helm status, DaemonSet readiness, node conditions |
