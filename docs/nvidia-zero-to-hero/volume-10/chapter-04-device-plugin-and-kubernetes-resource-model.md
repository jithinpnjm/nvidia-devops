---
title: "Chapter 4 — Device Plugin and Kubernetes Resource Model"
sidebar_position: 4
description: "Understand the control plane. Learn how the NVIDIA Device Plugin translates raw silicon into logical Kubernetes resources."
---

# Chapter 4 — Device Plugin and Kubernetes Resource Model

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | Kubernetes Administrators, SREs |
| Core question | How exactly does the Kubernetes API server know that Node-A has 8 GPUs and Node-B has 0 GPUs? |

## Introduction

In Chapter 3, we solved the Data Plane: how to physically pass a GPU into a container. 
Now we must solve the Control Plane: how does the Kubernetes scheduler know where the GPUs actually are?

The Kubernetes scheduler (`kube-scheduler`) makes placement decisions based on resources. If a Pod requests `cpu: 4`, the scheduler looks for a node that has advertised at least 4 available CPUs. 

But Kubernetes natively only knows about `cpu`, `memory`, and `ephemeral-storage`. It has no concept of GPUs, FPGAs, or InfiniBand NICs. We must extend the Kubernetes Resource Model (KRM) using the **Device Plugin API**.

## 1. The Kubernetes Device Plugin API

To prevent Kubernetes from becoming bloated with vendor-specific code, the community created the Device Plugin framework. It allows hardware vendors to write lightweight DaemonSets that run on nodes and advertise custom hardware.

The **NVIDIA Device Plugin** is exactly this. It runs on every GPU node and performs three critical functions:

1.  **Discovery:** It queries the local NVIDIA driver (via NVML) to discover how many physical GPUs are installed.
2.  **Registration:** It connects to the local `kubelet` via a Unix socket and registers a new Extended Resource type: `nvidia.com/gpu`.
3.  **Advertising:** It tells the kubelet, "I have exactly 8 units of `nvidia.com/gpu` available, and here are their physical device IDs."

The kubelet then reports this capacity up to the Kubernetes API server. You can see this by running `kubectl describe node <node-name>` and looking at the `Capacity` and `Allocatable` sections.

## 2. Allocation and the Kubelet

When a user submits a Pod requesting `nvidia.com/gpu: 1`:
1.  The `kube-scheduler` finds a node with at least 1 available `nvidia.com/gpu`.
2.  The scheduler assigns the Pod to that node.
3.  The `kubelet` on that node receives the Pod assignment.
4.  **The Critical Step:** The kubelet realizes the Pod needs an Extended Resource. The kubelet calls the NVIDIA Device Plugin and says, "Give me 1 GPU."
5.  The Device Plugin replies with the specific physical ID of the GPU to use (e.g., `/dev/nvidia3`).
6.  The kubelet passes this physical ID down to the container runtime (via CDI or RuntimeClass), which handles the actual mounting.

## 3. Health Checks and XID Errors

The Device Plugin is not just a counter; it is a health monitor.

If a GPU suffers a hardware failure (e.g., an ECC memory error, a thermal trip, or a PCIe bus crash), it generates an **XID error** in the kernel logs. 

If a GPU dies, but the Kubernetes API server still thinks it has 8 healthy GPUs, the scheduler will continue assigning Pods to the dead GPU, causing endless CrashLoopBackOffs.

The NVIDIA Device Plugin continuously monitors the health of the GPUs via NVML. If a GPU generates a critical XID error, the Device Plugin instantly marks that specific device ID as `Unhealthy` and informs the kubelet. The kubelet removes that GPU from the node's `Allocatable` pool, preventing the scheduler from sending any more workloads to the broken hardware.

## Customer Scenario (Senior Level)

**The Situation:**
An SRE receives an alert that a critical inference Pod is stuck in the `Pending` state. The Pod YAML requests `nvidia.com/gpu: 1`. The SRE runs `kubectl get nodes` and confirms there are 10 GPU nodes in the cluster, completely idle, running no workloads. The SRE suspects the Kubernetes scheduler is broken.

**The Senior Architect Response:**
"The scheduler is almost certainly functioning perfectly. It is acting on the information it has been given. The failure is within the **Device Plugin Control Loop**. 

A node having physical GPUs bolted to the motherboard does not mean the node has `nvidia.com/gpu` capacity in Kubernetes. If the node is idle but the Pod is Pending, it means the API server is reporting 0 allocatable GPUs. 

There are three common points of failure we must check immediately:
1.  **Driver Failure:** Did a kernel update break the NVIDIA driver? If the driver is broken, the Device Plugin cannot communicate with the silicon via NVML, so it registers 0 GPUs.
2.  **Plugin Crash:** Did the NVIDIA Device Plugin DaemonSet crash on those nodes? Without the plugin running, the kubelet drops the `nvidia.com/gpu` extended resource entirely.
3.  **Unhealthy State:** Did the GPUs suffer hardware faults? Check the Device Plugin logs. If the plugin detected XID errors, it intentionally marked the GPUs as `Unhealthy`, removing them from the allocatable pool to protect workloads.

We must run `kubectl describe node` and inspect the `Allocatable` block. If `nvidia.com/gpu` is missing entirely, the plugin or driver is dead. If it is present but set to `0`, the plugin is running but the hardware is unhealthy."

## Interview Preparation

**Conceptual:** How does Kubernetes know how many GPUs a node has? *(Hint: Native Kubernetes doesn't. The NVIDIA Device Plugin (a DaemonSet) queries the local hardware, registers the custom `nvidia.com/gpu` resource with the kubelet, and the kubelet advertises this capacity to the global API server).*

**Architecture:** What happens when a GPU experiences a hardware failure (XID error) while running a Kubernetes cluster? *(Hint: The NVIDIA Device Plugin detects the hardware fault via NVML. It marks the specific device as 'Unhealthy' and informs the kubelet. The kubelet removes that GPU from the allocatable pool, ensuring the Kubernetes scheduler stops sending new Pods to the broken hardware).*
