---
title: "Volume 06 — HGX Platforms & OEM Integration"
slug: "/nvidia-zero-to-hero/volume-06/index"
sidebar_position: 1
description: "Master the integration of NVIDIA HGX baseboards into OEM enterprise servers. Learn PCIe topologies, power/cooling limits, and the NVL72 rack-scale architecture."
---

# Volume 06 — HGX Platforms & OEM Integration

## Introduction

In the previous volume, we studied the **NVIDIA DGX**: the perfectly integrated, uncompromised reference architecture. 

However, the vast majority of the world's GPUs do not live in DGX appliances. They live in generic servers built by Original Equipment Manufacturers (OEMs) like Dell, HPE, and Supermicro, or in completely custom chassis designed by hyperscalers like AWS and Azure. 

These companies do not buy servers from NVIDIA; they buy **HGX Baseboards**. 

In Volume 06, we explore the chaotic reality of the OEM ecosystem. We learn how OEMs build the "top half" of the server around NVIDIA's "bottom half" baseboard, and how poor OEM engineering can inadvertently destroy the performance of a multi-million-dollar AI cluster.

## What You Will Learn

1.  **The Merchant Silicon Strategy:** Why cloud providers and enterprise IT departments prefer HGX over DGX (custom management planes, specific power footprints, and vendor lock-in).
2.  **Inside the HGX Tray:** Dissecting the SXM GPU modules, the soldered NVSwitch chips, and the PCIe retimers that bridge the baseboard to the host CPU.
3.  **OEM Support Boundaries:** Understanding who owns the firmware. Why blindly flashing NVIDIA VBIOS onto an OEM server can break the chassis thermal management and melt the GPUs.
4.  **PCIe Topologies:** How to use `nvidia-smi topo -m` to detect if an OEM wired the Network Interface Cards (NICs) behind a CPU bottleneck, breaking GPUDirect RDMA.
5.  **Power and Cooling Extremes:** The transition to 54-Volt power delivery to prevent melting copper wires, and the physics of "Airflow Shadowing" that forces OEMs to adopt Closed-Loop Liquid Cooling.
6.  **Storage Integration:** Why the physical placement of E1.S NVMe drives inside the chassis dictates whether GPUDirect Storage (GDS) functions correctly.
7.  **The Rack-Scale Era (GB200 NVL72):** How the Blackwell generation breaks the 8-GPU chassis limit, utilizing copper backplanes and switch trays to extend the NVLink domain across 72 GPUs in a single liquid-cooled rack.

## Why This Matters for Senior Architects

If you are tasked with approving a $10 Million purchase order for a new AI cluster, your reseller will present you with quotes from Dell, Supermicro, and NVIDIA.

If you only look at the "H100" sticker and the price tag, you will fail. 

A Senior Architect knows to interrogate the OEM's specific blueprint: 
*   "Are the 8 ConnectX-7 NICs located on the exact same PCIe switches as the GPUs?"
*   "Does the chassis cooling solution guarantee the rear-row GPUs will not thermal throttle under a 100% continuous Tensor Core load?"
*   "Do we have a unified firmware update mechanism that validates the OEM BIOS against the NVIDIA baseboard controller?"

Volume 06 provides the exact engineering knowledge required to ask these questions and validate the answers.

## Chapter Progression

*   **Chapter 1:** Why HGX Exists: The Merchant Silicon Strategy
*   **Chapter 2:** Inside an HGX Platform
*   **Chapter 3:** OEM Integration and Support Boundaries
*   **Chapter 4:** HGX Topology and Data Paths
*   **Chapter 5:** Power, Cooling, and Rack Integration
*   **Chapter 6:** HGX Networking, Storage, and Cluster Integration
*   **Chapter 7:** GB200 NVL72: The Rack-Scale Era
