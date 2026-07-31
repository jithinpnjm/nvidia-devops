---
title: "Chapter 5 - GPU sharing: MIG, time slicing, MPS and vGPU"
slug: "chapter-5-gpu-sharing-mig-time-slicing-mps-and-vgpu"
sidebar_position: 5
description: "Chapter 5 - GPU sharing: MIG, time slicing, MPS and vGPU — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Choose sharing based on isolation, latency determinism, memory behavior, hardware support and operational model.


![](pathname:///img/generated/volume-04-02.png)

Figure 2. Decide from workload requirements; sharing mode is the consequence.


<!-- source-table:2 -->

| Mode | Strength | Trade-off |
| --- | --- | --- |
| MIG | hardware-partitioned isolation on supported GPUs | fixed slice geometries; workload must fit slice; supported hardware only |
| Time slicing | simple over-subscription / improved dev utilization | shared memory/resources; variable latency; no hard slice isolation |
| MPS | concurrent CUDA process execution / throughput | different isolation semantics; CUDA workload compatibility/operations |
| vGPU | virtualization/VM-oriented resource sharing | licensing and hypervisor/virtualization operational model |


## Practitioner lens


<!-- source-table:3 -->

> Sagar Desai: hollow GPUs are a workload-packing problem A public example compares sharing strategies for an LLM plus smaller ASR/TTS services and argues for hardware partitioning when predictable isolation and consolidation are both required. The important method is to measure workload footprint/latency sensitivity before choosing the sharing primitive.


[Public source](https://www.linkedin.com/posts/sagar-s-desai_genai-llm-gpuoptimization-activity-7413568134458142721-8b6Y)
