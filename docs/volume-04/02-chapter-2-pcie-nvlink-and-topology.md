---
title: "Chapter 2 - PCIe, NVLink and topology"
slug: "chapter-2-pcie-nvlink-and-topology"
sidebar_position: 2
description: "Chapter 2 - PCIe, NVLink and topology — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand why “same number of GPUs” can produce different performance depending on physical connectivity and NUMA placement.


GPUs connect to CPUs and sometimes to peer GPUs through PCIe and higher-bandwidth links such as NVLink/NVSwitch on supported systems. NICs also attach through PCIe topology. Distributed and multi-GPU performance can depend on whether GPU-GPU or GPU-NIC traffic traverses favorable paths or crosses CPU/NUMA boundaries.


<!-- source-table:2 -->

```text
nvidia-smi topo -m
lspci -tv
numactl --hardware
```


## Worked scenario


<!-- source-table:3 -->

> Situation Two 8-GPU servers have identical GPU models, but one is consistently slower for multi-GPU training.


**1\. Compare nvidia-smi topo -m and NIC/GPU placement rather than assuming equivalent topology.**

2\. Check CPU NUMA binding and whether workers/communication threads align with local GPUs/NICs.

3\. Check link width/speed/errors and firmware/driver consistency.

4\. Benchmark peer-to-peer and collective performance before blaming the framework.


<!-- source-table:4 -->

> Conclusion GPU count is a capacity number; topology is a performance property.
