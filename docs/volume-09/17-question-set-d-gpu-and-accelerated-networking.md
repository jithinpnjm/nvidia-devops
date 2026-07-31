---
title: "Question set D — GPU and accelerated networking"
slug: "question-set-d-gpu-and-accelerated-networking"
sidebar_position: 17
description: "Question set D — GPU and accelerated networking — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

| Prompt | Expected reasoning |
| --- | --- |
| GPU util 100%, throughput low | compute vs memory/communication, clocks, batch, kernel/engine metrics |
| 8 GPUs visible, scaling poor | NVLink/NVSwitch/PCIe topology, NCCL algorithm, CPU/NIC locality |
| MIG or time-slicing? | hard isolation/predictability vs flexible sharing, workload memory/latency, ops |
| Multi-node training regressed | rank scope, RDMA/NCCL/fabric counters, topology, straggler amplification |
| Xid appears | correlate device/time/workload, DCGM/driver logs, recurrence/recovery, vendor guidance |
