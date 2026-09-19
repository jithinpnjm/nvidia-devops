---
title: "Chapter 4 — NVLink Errors and Topology Issues"
sidebar_position: 4
description: "Diagnose the internal fabric. Learn how to verify NVLink health, interpret NVSwitch logs, and solve PCIe P2P routing failures."
---

# Chapter 4 — NVLink Errors and Topology Issues

| Chapter metadata | Value |
|---|---|
| Volume | 20 — Hardware Troubleshooting and XID Error Matrix |
| Difficulty | Expert |
| Estimated reading time | 25 minutes |
| Primary audience | Data Center Technicians, SREs |
| Core question | If a DGX server has 8 GPUs perfectly connected by NVSwitches, why does `nvidia-smi topo -m` show that GPU 0 cannot talk directly to GPU 4? |

## Introduction

In a modern 8-GPU AI server (HGX or DGX), the PCIe bus is only used to talk to the CPU and the Network Cards. 
GPU-to-GPU communication happens exclusively over **NVLink** and the **NVSwitch** fabric. This internal network provides 900 GB/s of bandwidth. 

If this internal fabric degrades, NCCL will silently fall back to using the slow PCIe bus (64 GB/s). Your 8-GPU supercomputer instantly turns into a massive bottleneck, and your training times will increase by 10x without throwing a single fatal error.

A Senior Architect must know how to mathematically verify the NVLink topology and diagnose physical NVSwitch failures.

## 1. Verifying the Topology (`nvidia-smi topo -m`)

The most critical diagnostic command for intra-node performance is the topology matrix. 

Run `nvidia-smi topo -m`. This generates a grid showing how every GPU connects to every other GPU and the NICs.

**The Expected State (HGX/DGX):**
If you look at the intersection of GPU 0 and GPU 7, it should say `NV8` (or `NV12`, etc., depending on the architecture). This means they are connected by multiple NVLink pathways via the NVSwitch. 

**The Degraded State:**
If the intersection says `SYS` or `NODE`, it means NVLink is broken. The GPUs are physically incapable of talking directly to each other. They are forcing their tensor traffic up the PCIe bus, through the Host CPU RAM, and back down to the other GPU. This is catastrophic for performance.

## 2. Diagnosing NVLink Degradation

Why would NVLink break?

1.  **Physical Damage (PCIe Cards):** If you are using standard PCIe GPUs with physical NVLink bridge clips, the clips might be seated incorrectly, or there is dust on the connectors. The link fails to train at boot.
2.  **NVSwitch Failure (HGX Baseboards):** In an HGX system, the NVSwitches are soldered to the baseboard. If an NVSwitch chip overheats or fails, multiple NVLink pathways will drop.
3.  **Software Disablement:** Sometimes, an SRE accidentally sets `NCCL_P2P_DISABLE=1` in the Docker container, explicitly instructing NCCL to ignore the NVLink hardware and use the PCIe bus.

## 3. NVSwitch Telemetry (nvsm)

If you suspect an NVSwitch is dying, `nvidia-smi` is not enough. You must use the **NVIDIA System Management (NVSM)** tools or DCGM.

*   Check for NVLink Replay Errors. NVLink uses a high-speed signaling protocol. If an internal trace on the motherboard is degraded, it will generate CRC errors. The hardware will automatically replay the packet (like TCP retransmission). 
*   If Replay Errors are skyrocketing, the link is heavily degraded. It won't crash, but it will cause massive micro-stutters during `AllReduce` rings, manifesting as slow epoch times.

## Customer Scenario (Senior Level)

**The Situation:**
A platform team purchases a massive 8x H100 PCIe server. They install 4 NVLink bridge clips (connecting GPU 0 to 1, 2 to 3, etc.). They run a PyTorch job using Tensor Parallelism = 8. The job runs, but it is taking 5 times longer than expected. They check `nvidia-smi topo -m`. It confirms that `NV` links exist between the paired GPUs, but `SYS` is shown for all other combinations. They open a ticket claiming the PyTorch compiler is broken.

**The Senior Architect Response:**
"The PyTorch compiler is acting flawlessly based on the physical topology it was presented. The problem is a fundamental mismatch between the software slicing strategy and the physical motherboard wiring.

By setting Tensor Parallelism (TP) to 8, you instructed PyTorch to slice a single mathematical layer across all 8 GPUs. This requires a massive `AllReduce` synchronization across all 8 GPUs simultaneously. 

You purchased PCIe GPUs with physical NVLink bridges. These bridges only connect the GPUs in pairs (0 to 1). There is no NVSwitch on this motherboard to create a full 8-way mesh. 

When PyTorch attempts the 8-way `AllReduce`, NCCL detects that GPU 0 can talk to GPU 1 at 900 GB/s (via the bridge), but GPU 0 has absolutely no NVLink path to GPU 2. Because the `AllReduce` ring must include all 8 GPUs, NCCL is forced to route the traffic across the lowest common denominator: the Host motherboard's PCIe bus. The PCIe bus maxes out at 64 GB/s. 

Your entire 8-GPU collective is bottlenecking on the PCIe bus. 

To fix this, we must align the software to the hardware. We must change the execution script to use **Tensor Parallelism = 2** (confining the heavy synchronization entirely within the bridged NVLink pairs) and **Pipeline Parallelism = 4** (which requires vastly less bandwidth, allowing it to safely cross the PCIe bus between the pairs). This topological alignment will instantly resolve the bottleneck."

## Interview Preparation

**Conceptual:** What is the difference between an NVLink connection labeled `NV` and one labeled `SYS` in the `nvidia-smi topo -m` output? *(Hint: `NV` indicates the GPUs are communicating directly over the ultra-high-speed NVLink fabric, bypassing the CPU. `SYS` indicates that no direct link exists, and the GPUs are forced to route their traffic across the slow motherboard PCIe bus and through the Host CPU's System RAM, which drastically degrades performance).*

**Architecture:** If a single trace on an HGX baseboard NVSwitch is degraded and flipping bits, why doesn't the training job crash immediately? *(Hint: NVLink implements robust hardware-level error correction, including automatic packet replays for CRC failures. The job doesn't crash because the hardware fixes the corrupted data on the fly. However, this constant re-transmission introduces massive microsecond latency, causing the entire synchronous `AllReduce` ring to stall, manifesting as inexplicably slow training times).*
