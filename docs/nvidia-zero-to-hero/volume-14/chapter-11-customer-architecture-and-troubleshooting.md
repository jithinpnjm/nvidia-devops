---
title: "Chapter 11 — Customer Architecture and Troubleshooting"
sidebar_position: 11
description: "Master real-world NVAIE deployments. Learn how to diagnose license server failures, NGC registry blocks, and VMware GPU passthrough errors."
---

# Chapter 11 — Customer Architecture and Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 14 — NVIDIA AI Enterprise & NIM Architecture |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | Solutions Architects, Technical Account Managers |
| Core question | When a customer complains their $1M AI deployment is failing to start, how do you mathematically prove whether the fault lies in the hardware, the hypervisor, the network, or the container? |

## Introduction

As an architect designing NVAIE deployments, you will rarely be building environments from scratch. You will be injecting AI into a customer's existing, highly complex, and often brittle enterprise IT ecosystem.

When the deployment fails, the customer will blame NVIDIA software. You must use a structured, layer-by-layer troubleshooting framework to isolate the fault domain. 

The three most common NVAIE deployment failures involve **Virtualization Abstractions**, **Network Isolation (Air-gapping)**, and **Licensing Misconfigurations**.

## 1. Troubleshooting the Virtualization Abstraction

**Symptom:** A customer uses VMware vSphere with Tanzu. They deploy a NIM container. The Pod stays in `Pending`, or starts and immediately crashes with `CUDA error: no CUDA-capable device is detected`.

**The Diagnostic Workflow:**
1.  **Layer 1: The ESXi Host.** SSH into the ESXi host. Run `nvidia-smi`. Does the hypervisor see the GPU? If no, the physical hardware is broken or the host driver (VIB) failed to install.
2.  **Layer 2: The vCenter Assignment.** Did the VMware administrator successfully assign a vGPU profile to the Kubernetes Worker Node VM? If the VM does not have the virtual hardware attached, Kubernetes cannot see it.
3.  **Layer 3: The Guest OS.** SSH into the Ubuntu/Linux guest VM. Run `lspci | grep NVIDIA`. Does the Linux kernel see the vGPU device?
4.  **Layer 4: The GPU Operator.** Did the GPU Operator successfully install the Guest Driver container? Check the `nvidia-driver-daemonset` logs. If it failed to compile the kernel module, the Pods will never see the GPU.

## 2. Troubleshooting the Air-Gap (Network Isolation)

**Symptom:** The GPU Operator is deployed, but several DaemonSets fail with `ImagePullBackOff`. Or, a NIM container starts but sits idle forever without loading the model.

**The Diagnostic Workflow:**
1.  **The Registry Mirror:** If you see `ImagePullBackOff` for NVAIE images (e.g., `nvcr.io/nvaie/...`), the Kubernetes node is trying to reach the internet and failing. You must verify that the DevOps team successfully mirrored the images to the internal registry (e.g., Artifactory), and that the Helm `values.yaml` is pointing to that internal URL.
2.  **The Pull Secret:** If the URL is correct but the pull still fails, check the `imagePullSecrets`. Does the Kubernetes Secret contain a valid NGC API Key with the required entitlement?
3.  **The NIM Cache:** If the NIM container starts but hangs, it is trying to download the massive model weights from HuggingFace/NGC. The node has no internet access. You must verify that the model weights were manually downloaded to a local disk, and that the Kubernetes `PersistentVolume` is correctly mounted into the NIM container at the `/opt/nim/.cache` directory.

## 3. Troubleshooting the Licensing Control Plane

**Symptom:** A vGPU-enabled Virtual Machine boots up successfully, and `nvidia-smi` sees the GPU. However, when the user runs an AI workload, the performance is terrible (e.g., the GPU clock speed is locked to a fraction of its maximum).

**The Diagnostic Workflow:**
1.  **The Unlicensed State:** This is the definitive symptom of a licensing failure. The NVIDIA driver has detected a vGPU profile but has failed to check out a valid license token from the NVIDIA License System (NLS). It intentionally degraded performance.
2.  **The Client Config:** Check the client configuration token inside the VM (`/etc/nvidia/ClientConfigToken/`). Does it contain the correct IP address or URL for the DLS/CLS license server?
3.  **The Network Route:** Can the VM ping the DLS server on port 443/80? Often, enterprise firewalls block communication between the user VLAN (where the VM sits) and the management VLAN (where the DLS server sits).
4.  **The License Pool:** Log into the DLS server. Are there any licenses actually available? If the customer bought 50 licenses and spun up 51 VMs, the 51st VM will be degraded.

## Customer Scenario (Senior Level)

**The Situation:**
A hospital IT team is deploying a healthcare AI model using an NVAIE Triton container on a bare-metal NVIDIA-Certified server. The hospital network is strictly air-gapped. The IT team mirrored the Triton container image internally. However, when the Triton pod starts, it immediately crashes with a `Segmentation Fault (core dumped)`. The IT team opens a ticket claiming the NVAIE software is corrupt and violates their enterprise support agreement.

**The Senior Architect Response:**
"The NVAIE software is not corrupt; the IT team has violated the **Golden Triangle of Compatibility** by modifying the base operating system on an air-gapped node.

A segmentation fault in a highly optimized C++ binary like Triton is almost never a random bug; it is a symptom of a deep library mismatch between the container's user-space and the host's kernel-space.

Because the environment is air-gapped, the IT team likely provisioned the bare-metal server using a custom, hardened, internal Linux machine image (e.g., a heavily modified RHEL or Ubuntu build) rather than a standard, internet-updated OS. 

We must immediately check the **NVAIE Support Matrix**. 
We must cross-reference the exact version of the NVAIE Triton container they deployed against the specific Host OS version, the Host Kernel version (`uname -r`), and the NVIDIA Driver version they installed.

It is highly probable that their custom air-gapped OS image is running an older kernel or a specific glibc version that is mathematically incompatible with the newer CUDA libraries inside the Triton container. 
To resolve this and return to a supported state, they must either roll back the Triton container version to one certified for their specific older OS build, or they must update their bare-metal provisioning pipeline to deploy an OS and Kernel version explicitly listed as supported in the NVAIE documentation matrix."

## Interview Preparation

**Conceptual:** If a vGPU-enabled virtual machine boots up, but the AI workloads run incredibly slowly and the GPU clock speed is locked at a low frequency, what is the most likely root cause? *(Hint: The VM is in an 'Unlicensed State'. The NVIDIA guest driver cannot communicate with the DLS/CLS license server to verify its entitlement, so it intentionally degrades performance. The architect must check network routing between the VM and the license server, and verify the license pool has available capacity).*

**Architecture:** Describe the three layers of troubleshooting required when a Kubernetes Pod fails to see a vGPU on a VMware Tanzu cluster. *(Hint: You must verify Layer 1: the physical host ESXi hypervisor sees the hardware and has the VIB installed. Layer 2: VMware vCenter successfully attached the vGPU profile to the worker node VM. Layer 3: The Guest OS (Linux) inside the VM sees the PCI device and the GPU Operator successfully compiled and loaded the guest driver).*
