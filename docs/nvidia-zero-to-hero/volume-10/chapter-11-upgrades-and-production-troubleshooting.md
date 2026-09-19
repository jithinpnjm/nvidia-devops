---
title: "Chapter 11 — Upgrades and Production Troubleshooting"
sidebar_position: 11
description: "Master the Day-2 operations of a GPU cluster. Learn how to perform zero-downtime upgrades and diagnose complete hardware failures."
---

# Chapter 11 — Upgrades and Production Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Kubernetes Administrators |
| Core question | When you need to upgrade the GPU drivers across 500 nodes, how do you do it without killing 10,000 running AI jobs? |

## Introduction

Day 1 is installation. Day 2 is survival.

In a production AI factory, workloads run for weeks. You cannot simply reboot nodes or rip out drivers without catastrophic business impact. A Senior SRE must understand how to execute zero-downtime upgrades of the GPU Platform Layer and how to quickly diagnose issues when the platform suddenly stops reporting GPUs.

## 1. Zero-Downtime GPU Operator Upgrades

Upgrading the GPU Operator (via `helm upgrade`) is a delicate operation. If you restart the `nvidia-driver-daemonset` while a Pod is actively using the GPU, the Pod will crash.

To prevent this, the Operator supports **Driver Upgrade Policies**.
Instead of forcefully deleting all the driver containers, the Operator can be configured to respect standard Kubernetes node lifecycle commands.

**The Safe Upgrade Workflow:**
1.  **Cordon:** You run `kubectl cordon <node>`. This prevents the Kubernetes scheduler from sending any new AI jobs to the node.
2.  **Drain:** You run `kubectl drain <node>`. This safely evicts the existing workloads, moving them to other healthy nodes in the cluster.
3.  **Upgrade:** Once the node is completely empty of user workloads, the GPU Operator detects the drain and safely restarts the driver container, loading the new kernel modules.
4.  **Uncordon:** You run `kubectl uncordon <node>`, returning the node to the active scheduling pool with the new driver.

## 2. Troubleshooting: "Node has 0 GPUs"

The most common support ticket is: *"My Pod is stuck Pending, but I know the node has GPUs."*

If `kubectl describe node` shows `nvidia.com/gpu: 0` (or the label is missing entirely), you must execute a strict, layer-by-layer diagnostic process. You start at the physical silicon and work your way up to the Kubernetes control plane.

### The Diagnostic Ladder:
1.  **Layer 1 (The OS/Hardware):** SSH into the node and run `lspci | grep NVIDIA`. If the OS cannot see the PCIe device, the hardware is dead, or the motherboard is misconfigured. Kubernetes cannot fix this.
2.  **Layer 2 (The Driver):** Run `nvidia-smi`. If it returns `command not found` or `Failed to initialize NVML`, the driver container has crashed or failed to compile. Check the logs of the `nvidia-driver-daemonset` Pod.
3.  **Layer 3 (The Toolkit):** Is `containerd` configured correctly? If you are not using CDI, check `/etc/containerd/config.toml` to ensure the NVIDIA runtime is present.
4.  **Layer 4 (The Device Plugin):** Check the logs of the `nvidia-device-plugin-daemonset` Pod. Did it detect the GPUs? Did it successfully register the `nvidia.com/gpu` resource with the local `kubelet` socket?
5.  **Layer 5 (The Kubelet):** Restart the kubelet service. Sometimes the kubelet loses its connection to the Device Plugin socket.

## 3. Troubleshooting: XID Errors and Unhealthy Nodes

Sometimes `nvidia.com/gpu` drops from `8` down to `7`. 

This is not a software crash; this is the Device Plugin intentionally quarantining a broken piece of hardware.
As discussed in Chapter 4, if a GPU generates a critical XID error (e.g., XID 48 - Double Bit ECC memory error), the hardware is physically corrupt. 

1.  The Device Plugin detects the XID error via NVML.
2.  The Device Plugin marks that specific GPU as `Unhealthy`.
3.  The kubelet removes that 1 GPU from the `Allocatable` pool.

Do not reboot the node to "fix" this. Rebooting the node clears the error state, returning the physically broken GPU to the active pool, where it will instantly crash the next workload assigned to it. You must cordon the node and physically replace the GPU.

## Customer Scenario (Senior Level)

**The Situation:**
An SRE receives an automated alert: 50 GPU nodes have suddenly stopped reporting `nvidia.com/gpu` capacity. All active training jobs on those nodes were evicted. The SRE runs `kubectl get pods -n gpu-operator` and sees that all 50 `nvidia-driver-daemonset` Pods are in `CrashLoopBackOff`. The SRE is baffled because no one ran a Helm upgrade, and the cluster was completely stable an hour ago.

**The Senior Architect Response:**
"If 50 driver containers spontaneously crash simultaneously without a Helm deployment, the underlying Host OS state has changed out from under them.

The most likely culprit is an automated, unattended security update applied by the Linux operating system. 
If the OS (e.g., Ubuntu) runs `unattended-upgrades`, it will download and install the latest kernel security patches in the background. Depending on the configuration, it may restart the node or apply the kernel updates via live-patching.

When the kernel updates, the pre-compiled NVIDIA driver module (`nvidia.ko`) is suddenly mismatched against the new running kernel headers. The OS rejects the driver. The driver container detects that its module is no longer loaded, attempts to reload it, fails, and crashes.

To fix this immediately, we must force the driver containers to recompile. We can delete the crashed driver pods, forcing the DaemonSet to recreate them, download the new kernel headers, and recompile. 
To prevent this permanently, we must disable automated kernel updates on our GPU nodes. Infrastructure should be immutable; OS upgrades should be planned, tested, and executed via a controlled node replacement strategy, never via unattended background scripts on production AI hardware."

## Interview Preparation

**Conceptual:** If a Kubernetes node has physical GPUs, but `kubectl describe node` shows no `nvidia.com/gpu` capacity, describe the layer-by-layer troubleshooting process. *(Hint: 1. Check OS/Hardware (`lspci`). 2. Check Driver (`nvidia-smi`). 3. Check Device Plugin Pod logs to ensure it registered with the kubelet. 4. Check Kubelet logs for socket errors).*

**Architecture:** Why is it dangerous to simply reboot a node when `nvidia.com/gpu` drops from 8 to 7? *(Hint: A drop in capacity usually means the Device Plugin detected a critical hardware fault (XID error) and intentionally quarantined the GPU. Rebooting clears the software state, putting the physically broken GPU back into the scheduling pool, which will crash the next user's job).*
