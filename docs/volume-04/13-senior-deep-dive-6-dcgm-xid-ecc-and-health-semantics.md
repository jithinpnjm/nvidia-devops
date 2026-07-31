---
title: "Senior Deep Dive 6 — DCGM, Xid, ECC and health semantics"
slug: "senior-deep-dive-6-dcgm-xid-ecc-and-health-semantics"
sidebar_position: 13
description: "Senior Deep Dive 6 — DCGM, Xid, ECC and health semantics — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
![](pathname:///img/generated/volume-04-04.png)

_Figure B. GPU health requires correlating workload errors with software, hardware and fabric evidence._

NVIDIA Data Center GPU Manager (DCGM) provides telemetry, diagnostics, health monitoring and APIs for data-center GPUs. The operational goal is not merely collecting utilization. Track temperature, power, clocks, memory use, ECC and error conditions, PCIe/NVLink health and job-level behavior. Xid messages from the driver indicate GPU-related errors but require context; the Xid number, frequency, affected device, workload and recovery behavior determine the next action.

**Health evidence: preserve timestamps and device UUIDs**

nvidia-smi -q
nvidia-smi --query-gpu=uuid,pci.bus\_id,temperature.gpu,power.draw,clocks.sm,memory.used,memory.total,ecc.errors.uncorrected.volatile.total --format=csv

dmesg -T | grep -iE 'NVRM|Xid|nvidia'
# DCGM tooling if deployed
dcgmi discovery -l
dcgmi health -g 0 -c
dcgmi diag -r 2
