---
title: "Senior Deep Dive 4 — GPU observability with DCGM and driver evidence"
slug: "senior-deep-dive-4-gpu-observability-with-dcgm-and-driver-evidence"
sidebar_position: 15
description: "Senior Deep Dive 4 — GPU observability with DCGM and driver evidence — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
A GPU dashboard should combine device health and workload performance. Device health: temperature, power, clocks, memory, ECC/error events, NVLink/PCIe status. Workload: utilization, memory occupancy, engine behavior, throughput and job identity. Driver logs provide Xid context. Correlate GPU UUID across DCGM, nvidia-smi, Kubernetes labels/allocations and job logs so that an incident survives node renumbering or Pod rescheduling.
