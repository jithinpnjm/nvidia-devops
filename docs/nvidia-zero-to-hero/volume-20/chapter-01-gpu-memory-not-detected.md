---
title: "Chapter 1 — GPU Memory Not Detected"
sidebar_position: 1
description: "Diagnose blind nodes. Learn how to troubleshoot when Kubernetes reports zero GPUs but the physical hardware is bolted to the motherboard."
---

# Chapter 1 — GPU Memory Not Detected

| Chapter metadata | Value |
|---|---|
| Volume | 20 — Hardware Troubleshooting and XID Error Matrix |
| Difficulty | Intermediate |
| Estimated reading time | 25 minutes |
| Primary audience | Data Center Technicians, SREs |
| Core question | When `nvidia-smi` returns `No devices were found`, is the GPU dead, or is the software simply looking in the wrong place? |

## Introduction

The most basic hardware failure is complete invisibility. 
An engineer racks a $300,000 HGX baseboard, boots the server, and the OS claims there are zero GPUs installed.

Junior engineers immediately assume the motherboard is dead or the GPUs are physically broken. They request an expensive RMA (Return Merchandise Authorization). 

A Senior SRE does not request an RMA until they have mathematically proven the failure at the PCIe and kernel levels. In 90% of cases, "invisible" GPUs are caused by software configuration drift, secure boot conflicts, or PCIe bus enumeration failures.

## 1. The Enumeration Ladder (lspci)

If `nvidia-smi` says there are no GPUs, do not trust it. `nvidia-smi` relies on the NVIDIA kernel driver (`nvidia.ko`). If the driver is broken, `nvidia-smi` will lie to you.

You must query the hardware bus directly using `lspci`.
1.  Run `lspci | grep -i nvidia`.
2.  If this command returns the physical PCI addresses of the GPUs (e.g., `0000:17:00.0 3D controller: NVIDIA Corporation Device`), the physical hardware is perfectly fine. The motherboard sees the GPU. The problem is 100% software (the driver).
3.  If this command returns nothing, the GPU is physically disconnected, unpowered, or the motherboard PCIe slot is dead.

## 2. The Driver Disconnect (`dmesg`)

If `lspci` sees the GPU, but `nvidia-smi` does not, the kernel driver failed to load. 

You must query the Linux kernel ring buffer: `dmesg -T | grep NVRM`.
*   **Symptom:** `NVRM: API mismatch`. 
    *   *Cause:* You have two different versions of the NVIDIA driver installed simultaneously (e.g., a host-level `.run` file installation conflicting with a GPU Operator container). The kernel panics and refuses to load the driver. 
*   **Symptom:** `NVRM: GPU ... is lost`. 
    *   *Cause:* The GPU was detected at boot, but it suffered a massive power failure or fatal hardware error and 'fell off the bus' during initialization.

## 3. Secure Boot Conflicts

In modern enterprise data centers, UEFI Secure Boot is strictly enforced.

If Secure Boot is enabled, the Linux kernel is mathematically forbidden from loading any kernel module (driver) that is not cryptographically signed by a trusted Certificate Authority. 
When the GPU Operator dynamically compiles the `nvidia.ko` driver (as discussed in Vol 10), it generates an unsigned binary. 

*   **The Result:** The Linux kernel silently blocks the driver from loading. `lspci` sees the GPU, but `nvidia-smi` fails. 
*   **The Fix:** You must inject a Machine Owner Key (MOK) into the server's BIOS, and configure the GPU Operator to cryptographically sign the driver using that specific key during compilation.

## Customer Scenario (Senior Level)

**The Situation:**
A platform team uses the NVIDIA GPU Operator on a 50-node cluster. The security team mandates an OS patch. The nodes reboot. When they come back online, 10 of the nodes show `nvidia.com/gpu: 0` in Kubernetes. The SRE team checks the 10 nodes. `lspci` shows the GPUs are present. `nvidia-smi` returns `Failed to initialize NVML: Driver/library version mismatch`. They attempt to restart the GPU Operator pods, but the error persists.

**The Senior Architect Response:**
"The SRE team is facing a classic **User-Space vs. Kernel-Space Version Mismatch** caused by dirty OS updates.

`nvidia-smi` is a user-space utility. It communicates with the kernel-space module (`nvidia.ko`). The `Driver/library version mismatch` error explicitly states that the user-space utility (e.g., version 535) is trying to talk to a kernel module of a different version (e.g., version 525).

How did this happen if we use the GPU Operator?
The GPU Operator is designed to manage the driver exclusively. However, during the OS patch, a junior admin or an automated script likely ran an `apt-get upgrade` that inadvertently pulled a generic, older NVIDIA driver package from the public Ubuntu repositories and installed it directly onto the host OS. 

When the node rebooted, the host OS loaded the generic Ubuntu driver into the kernel. When the GPU Operator's driver container started, it detected that a driver was already loaded and correctly aborted its own installation to prevent a kernel panic. The user-space tools inside the container (version 535) are now trying to talk to the host's kernel driver (version 525), causing the NVML failure.

To fix this, we must 'clean the metal'. We will cordon the 10 broken nodes. We will execute a script to `apt-get purge` all host-level NVIDIA packages, completely removing the rogue drivers. We will reboot the nodes. The GPU Operator will detect a pristine, driverless kernel, compile the correct version 535 driver, inject it, and the GPUs will instantly reappear in Kubernetes."

## Interview Preparation

**Conceptual:** If `nvidia-smi` fails, what is the very first command a Senior SRE runs to determine if the hardware is dead? *(Hint: `lspci | grep -i nvidia`. `nvidia-smi` relies on software drivers. `lspci` queries the physical motherboard. If `lspci` sees the card, the physical hardware is alive and the issue is a software driver failure).*

**Architecture:** Explain why enabling UEFI Secure Boot on a Linux server often causes GPUs to "disappear" if the GPU Operator is used without custom configuration. *(Hint: Secure Boot mathematically prevents the Linux kernel from loading unsigned drivers. The GPU Operator often compiles the NVIDIA driver (`nvidia.ko`) dynamically on the fly. Because this dynamically compiled driver is unsigned, the kernel rejects it. The OS cannot talk to the GPU, making it appear invisible. The architect must configure the Operator to sign the driver with a trusted Machine Owner Key (MOK)).*
