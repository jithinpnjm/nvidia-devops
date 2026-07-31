---
title: "Senior Deep Dive 5 — Sharing: MIG, time-slicing, MPS and vGPU"
slug: "senior-deep-dive-5-sharing-mig-time-slicing-mps-and-vgpu"
sidebar_position: 12
description: "Senior Deep Dive 5 — Sharing: MIG, time-slicing, MPS and vGPU — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
These mechanisms solve different problems. MIG partitions supported GPUs into hardware-isolated instances with dedicated portions of compute and memory-system resources, giving much stronger performance isolation than simple time-sharing. Time-slicing lets multiple workloads take turns on a GPU but does not create the same memory or fault isolation. MPS improves concurrent CUDA process execution for compatible workloads. vGPU virtualizes GPU access into VMs and involves a separate licensing and hypervisor stack.

Choose from requirements: isolation, predictable latency, memory capacity, workload elasticity, operational complexity and licensing. A small inference model requiring predictable tenant isolation may fit MIG; a bursty development cluster may prefer time-sharing; large training normally needs whole GPUs with topology-aware placement.
