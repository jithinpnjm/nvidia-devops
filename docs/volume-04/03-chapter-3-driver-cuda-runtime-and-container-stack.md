---
title: "Chapter 3 - Driver, CUDA runtime and container stack"
slug: "chapter-3-driver-cuda-runtime-and-container-stack"
sidebar_position: 3
description: "Chapter 3 - Driver, CUDA runtime and container stack — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Know which layer must be compatible and which parts are host versus container responsibility.


![](pathname:///img/generated/volume-04-01.png)

Figure 1. Debug bottom-up: hardware/driver before container runtime, operator, model server and application.

The kernel/user-space NVIDIA driver enables device access. CUDA provides a programming/runtime ecosystem and accelerated libraries. Application containers typically carry compatible user-space libraries while relying on the host driver. NVIDIA Container Toolkit configures container runtime integration so containers receive GPU devices and driver libraries.


<!-- source-table:2 -->

```text
nvidia-smi
cat /proc/driver/nvidia/version
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```


Do not diagnose “CUDA mismatch” from one version string alone. Compatibility has direction and constraints: application/runtime libraries, container image, host driver, framework build and GPU architecture all participate. Use the compatibility matrix/documentation for the versions in question.
