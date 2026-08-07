---
title: "DMA Engine Failures and PCIe Issues"
slug: "dma-engine-failures-pcie-issues"
sidebar_position: 7
description: "Detect and diagnose GPU DMA engine failures, PCIe link errors, and GPU-to-host communication problems."
---

## Symptoms

- PCIe error counters increment rapidly in dmesg
- GPU falls off PCIe bus (`0000:00:1e.0 ... no hotplug support`)
- GPU becomes unresponsive after several minutes of heavy I/O
- Host-to-GPU memory copies slow or fail
- Xid 94 or Xid 63 errors (GPU lost PCIe link)

## Evidence

### Key Metrics to Collect

- PCIe error counters from dmesg
- PCIe bandwidth measurement (sustained)
- DMA error counters from DCGM
- GPU reset history
- Power line ripple on PCIe aux power

## Diagnosis

## Resolution

## Verification

## Prevention

## Escalation

