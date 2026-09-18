---
title: "Chapter 4 — Form Factors: PCIe vs. SXM"
sidebar_position: 4
description: "Understand the physical and thermal differences between PCIe add-in cards and SXM HGX baseboards."
---

# Chapter 4 — Form Factors: PCIe vs. SXM

| Chapter metadata | Value |
|---|---|
| Volume | 04 — Accelerator Architecture & Form Factors |
| Difficulty | Advanced |
| Estimated reading time | 25 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | Why does an H100 come in two different physical shapes, and why does one cost significantly more to deploy? |

## Introduction

In the previous chapters, we looked at the silicon die itself (Hopper vs. Ampere). But silicon cannot plug directly into a wall. It must be packaged onto a printed circuit board (PCB), surrounded by memory chips, and equipped with a power delivery and cooling mechanism.

NVIDIA packages its flagship data center silicon into two completely different physical form factors: **PCIe** and **SXM**.

If an Infrastructure Architect selects the wrong form factor, the project will either fail due to a lack of intra-node bandwidth (strangling distributed training), or it will fail because the servers physically melt the data center racks.

## 1. The PCIe Form Factor (The Standard Upgrade)

The **PCIe (Peripheral Component Interconnect Express)** form factor is what most IT professionals picture when they hear "GPU." It is a rectangular card that slots vertically into a standard server motherboard.

### The Advantages
1. **Universality:** A PCIe H100 or L40S will plug into almost any standard 2U or 4U enterprise server from Dell, HPE, or Lenovo, provided the server has x16 PCIe Gen5 slots.
2. **Power & Cooling:** PCIe cards are typically restricted to a **350 Watt** Thermal Design Power (TDP). This makes them relatively easy to air-cool in standard enterprise racks. 

### The Severe Limitations
1. **Interconnect Starvation:** A standard server motherboard lacks an NVSwitch. If you plug 4 PCIe H100s into a server, they cannot communicate natively. NVIDIA offers **NVLink Bridges**—small physical clips you attach to the tops of the PCIe cards to link them together. However, these bridges typically only link cards in pairs (or limited meshes), and their bandwidth is vastly reduced compared to SXM (e.g., 600 GB/s vs 900 GB/s).
2. **Power Capping:** Because the PCIe specification and the card's physical dimensions limit heat dissipation to 350W, NVIDIA deliberately underclocks the silicon on PCIe cards. A PCIe H100 is physically slower than an SXM H100.

## 2. The SXM Form Factor (The Heavy Iron)

The **SXM (Server eXpress Module)** is a specialized form factor explicitly designed for maximum density and unrestricted performance. An SXM GPU is a flat, square module that bolts directly horizontally onto a specialized motherboard.

### The HGX Baseboard
You cannot buy a single SXM GPU. You buy an **HGX Baseboard**—a massive, custom-built tray containing 4 or 8 SXM GPUs. 
Built directly into this baseboard are the **NVSwitch** chips. This creates a fully non-blocking, all-to-all NVLink mesh between all 8 GPUs. 

### The Advantages
1. **Maximum Performance:** Because SXM modules have massive, bolted-on custom heatsinks, they can handle extraordinary heat. An SXM H100 pulls **700 Watts** of power. Because it has double the power overhead of the PCIe card, the silicon runs at maximum clock speeds, delivering significantly higher TFLOPS.
2. **Unrestricted Bandwidth:** The 8 GPUs on the HGX board communicate at 900 GB/s (Hopper) across the NVSwitch mesh, bypassing the host CPU entirely.

### The Severe Limitations
1. **Facility Reality:** An 8-GPU HGX server (like the DGX H100) pulls over 10.2 kW of power. Stacking four of these in a rack generates 40kW of heat. You cannot deploy SXM infrastructure without specialized data center facilities (Rear Door Heat Exchangers or Direct Liquid Cooling).
2. **Vendor Lock-in:** You cannot buy a generic server and drop an HGX board into it. The server chassis, power delivery, and PCIe risers must be custom-engineered around the HGX tray. 

## Architectural Comparison Matrix

| Feature | H100 PCIe | H100 SXM (HGX) |
|---|---|---|
| **Max TDP** | 350 Watts | 700 Watts |
| **GPU-to-GPU Link** | NVLink Bridge (Pairs, 600 GB/s) | NVSwitch Mesh (All 8 GPUs, 900 GB/s) |
| **Cooling** | Passive Air | Passive Air or Direct Liquid Cooling |
| **Primary Workload**| Inference, Video Processing, VDI | LLM Training, Massive Tensor Parallel Inference |
| **Installation** | Standard PCIe x16 Slot | Bolted to proprietary HGX Baseboard |

## Customer Scenario (Senior Level)

**The Situation:**
An enterprise is building an on-premise cluster to fine-tune a massive 70-billion parameter model. The IT procurement team rejected the proposed $3M budget for SXM-based DGX servers. Instead, they purchased 20 standard 2U servers and bought 80 PCIe H100 cards, saving nearly 30% of the hardware cost. They ask the SRE team to configure the cluster for distributed training.

**The Senior Architect Response:**
"The procurement team optimized for unit cost, but destroyed the architectural capability of the cluster. 

Fine-tuning a 70B parameter model requires significant Tensor Parallelism and Data Parallelism. This means gradients and intermediate tensor states must be synchronized across 8 GPUs simultaneously, thousands of times a second.

Because they purchased standard 2U servers and PCIe cards, we do not have an NVSwitch fabric. The GPUs must synchronize their gradients across the host CPU's PCIe bus. The PCIe Gen5 bus maxes out at 64 GB/s, which is less than 1/10th the speed of the 900 GB/s SXM NVLink mesh. 

The GPUs will finish their calculations in microseconds, and then spend 90% of their time stalled, waiting for the host CPU to route traffic over the PCIe bus. The 30% hardware savings will result in the training job taking 5 times longer, completely negating the cost savings in lost developer time and power consumption. We must acquire NVLink Bridges to connect the PCIe cards in pairs to mitigate some of the damage, but this cluster will never achieve SXM performance."

## Interview Preparation

**Conceptual:** Why is a PCIe H100 mathematically slower than an SXM H100, even though they use the exact same Hopper silicon die? *(Hint: Thermal Design Power. The PCIe card is capped at 350W due to slot limitations, forcing NVIDIA to underclock the chip. The SXM module is bolted to a massive heatsink, allowing 700W of power and higher clock speeds).*

**Architecture:** What hardware component exists on an HGX baseboard that does not exist on a standard PCIe motherboard? *(Hint: The NVSwitch. It creates the fully non-blocking NVLink mesh between all 8 GPUs).*
