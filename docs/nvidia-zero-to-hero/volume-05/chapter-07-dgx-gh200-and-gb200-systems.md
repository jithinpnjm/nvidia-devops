---
title: "Chapter 7 — Rack-Scale Computing: GH200 and GB200 NVL72"
sidebar_position: 7
description: "Transition from the 8-GPU chassis to the 72-GPU Rack. Understand Grace-Blackwell, NVLink Switch Trays, and the 130 TB/s NVLink domain."
---

# Chapter 7 — Rack-Scale Computing: GH200 and GB200 NVL72

| Chapter metadata | Value |
|---|---|
| Volume | 05 — DGX Systems & Infrastructure |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | DevOps, SRE, Platform, Cloud and Infrastructure Engineers |
| Core question | When models become so large that 8 GPUs are no longer enough, how do you extend NVLink across an entire data center rack? |

## Introduction

Throughout Volume 5, we explored the DGX H100. It is a masterpiece of engineering, packing 8 GPUs into a single chassis with a fully non-blocking NVSwitch mesh. 

But as models transition into the Trillion-Parameter era (e.g., GPT-4, massive Mixtures of Experts), 8 GPUs are no longer enough to hold the model weights, let alone execute inference at low latency. 

When a model must span *across multiple servers*, the GPUs are forced to communicate over the InfiniBand network. While InfiniBand is fast, it relies on network protocols and cables, introducing latency. 

The ultimate architectural goal is to expand the NVLink domain. If NVLink is 900 GB/s, how do we get more than 8 GPUs onto NVLink? 
The answer is **Rack-Scale Computing**: The Grace-Blackwell (GB200) NVL72.

## 1. Expanding the Domain: The NVLink Switch Tray

You cannot fit 72 GPUs onto a single motherboard. The PCB (Printed Circuit Board) would be the size of a dining room table. 

To solve this, NVIDIA removed the NVSwitch chips from the motherboard and placed them into standalone server chassis called **NVLink Switch Trays**. 

1. You slide 18 Compute Nodes (each containing Grace-Blackwell superchips) into a rack.
2. You slide 9 NVLink Switch Trays into the same rack.
3. You connect the compute nodes to the switch trays using a massive, custom-built copper backplane. 

This backplane physically wires 72 Blackwell GPUs directly into the NVSwitches. 

## 2. The GB200 NVL72 Architecture

The GB200 NVL72 is not a server. **The Rack is the Server.**

To the software, Kubernetes, and the PyTorch script, the rack appears as a single, monstrous GPU. 
*   **Compute:** 72 Blackwell GPUs + 36 Grace ARM CPUs.
*   **Memory Domain:** Because they are all connected via 5th-Gen NVLink, any of the 72 GPUs can read the memory of any other GPU at 1.8 TB/s. The entire rack shares a unified memory domain. 
*   **Bandwidth:** The internal copper backplane pushes **130 Terabytes per second** of aggregate bandwidth.

### Why Copper?
Optical fiber transceivers (lasers) generate heat and consume massive amounts of power (up to 20kW per rack just to power the lasers). By confining the 72 GPUs to a single rack, NVIDIA engineered the distances to be short enough to use passive copper wires, eliminating the optical power overhead entirely and saving the electricity for the GPUs.

## 3. Total Direct Liquid Cooling (DLC)

You cannot air-cool a GB200 NVL72 rack. 

*   A single GB200 Superchip consumes thousands of watts. 
*   The entire NVL72 rack pulls **120 kW of power**.

This mandates 100% Direct Liquid Cooling (DLC). Cold plates are physically bolted onto the 72 GPUs, 36 CPUs, and the NVSwitch chips. Blind-mate liquid connectors snap into manifolds at the back of the rack, pumping chilled fluid through the system. 

## Customer Scenario (Senior Level)

**The Situation:**
A generative AI startup raises $100M to build a cluster to train a 1.5-Trillion parameter Mixture of Experts (MoE) model. They are debating between purchasing 1,000 standard PCIe GPUs connected via 400G Ethernet, or purchasing a smaller fleet of GB200 NVL72 racks. They ask the Senior Architect: "Both options give us exactly 1,000 GPUs. Why should we lock ourselves into the complex liquid-cooling requirements of the NVL72 racks?"

**The Senior Architect Response:**
"Because 1,000 isolated GPUs cannot train a 1.5-Trillion parameter MoE model; they will suffocate on network latency. 

A Mixture of Experts model routes data dynamically to different "Expert" neural networks on the fly. This requires catastrophic amounts of 'All-to-All' communication between the GPUs. 

If you use standard PCIe GPUs, the GPUs must communicate this massive data volume across the Ethernet network. Standard Ethernet protocols and PCIe bottlenecks will introduce massive latency, completely stalling the training loop. Your $100M cluster will operate at 5% efficiency. 

By purchasing the **GB200 NVL72 racks**, you are expanding the high-speed NVLink domain. In the NVL72, 72 GPUs communicate over a copper backplane at 1.8 TB/s, appearing as a single 130 TB/s memory domain. This allows the MoE model to route data between experts instantly, completely bypassing standard networking protocols. The complex liquid-cooling requirements are not a drawback; they are the physical price you must pay to achieve the rack-scale density necessary to keep a Trillion-parameter model fed."

## Interview Preparation

**Conceptual:** What is the primary architectural difference between an HGX H100 server and a GB200 NVL72 rack? *(Hint: The H100 limits the NVLink domain (where GPUs share memory directly) to 8 GPUs inside a single chassis. The NVL72 extracts the NVSwitches into separate trays and uses a copper backplane to expand the NVLink domain to 72 GPUs across the entire rack, allowing the rack to act as a single GPU).*

**Architecture:** Why does the GB200 NVL72 rack use a massive copper backplane instead of fiber optics to connect the 72 GPUs? *(Hint: Fiber optic transceivers consume massive amounts of power. Because the 72 GPUs are contained within the short physical distance of a single rack, NVIDIA can use passive copper, saving 20kW of power and allocating that electricity directly to the compute silicon).*
