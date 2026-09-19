---
title: "Chapter 1 — Why Kubernetes Needs a GPU Platform Layer"
sidebar_position: 1
description: "Understand why native Kubernetes cannot schedule GPUs, and the mandatory platform extensions required to bridge the gap."
---

# Chapter 1 — Why Kubernetes Needs a GPU Platform Layer

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Intermediate |
| Estimated reading time | 25 minutes |
| Primary audience | Kubernetes Administrators, Platform Engineers, DevOps |
| Core question | If Kubernetes can natively schedule CPUs and RAM, why does it crash when you ask it for a GPU? |

## Introduction

Out of the box, Kubernetes is completely blind to GPUs. 

The `kubelet` (the agent running on every node) understands how to count CPU cores and megabytes of RAM. If you submit a Pod asking for `cpu: 4`, the kubelet carves out those resources using standard Linux `cgroups`. 

However, if you submit a Pod asking for `nvidia.com/gpu: 1` to a vanilla Kubernetes cluster, the cluster will reject the Pod or leave it in a `Pending` state forever. The kubelet has no idea what `nvidia.com/gpu` is. It does not know how to find the physical hardware on the PCIe bus, it does not have the proprietary NVIDIA drivers, and it does not know how to inject the GPU devices into the container namespace.

To make Kubernetes "GPU-aware," a Senior Platform Engineer must deploy a complex, multi-layered stack of software known as the **GPU Platform Layer**.

## 1. The Broken Contract of Native Kubernetes

When a data scientist requests a GPU in Kubernetes, several distinct technical miracles must happen in perfect sequence:

1.  **Hardware Enumeration:** The host operating system must detect the physical GPU on the motherboard's PCIe bus.
2.  **Driver Injection:** A kernel-level driver (NVIDIA OpenRM or proprietary) must be loaded to interact with the silicon.
3.  **Container Runtime Modification:** The standard container runtime (e.g., `containerd` or `CRI-O`) must be modified. Standard runtimes isolate hardware; we need a runtime that intentionally pierces that isolation to expose the GPU to the container.
4.  **Resource Advertising:** The Kubernetes API server must be informed that the node actually has GPUs available to schedule.

Native Kubernetes does none of this. It delegates these responsibilities to vendor-specific plugins.

## 2. The Components of the GPU Platform Layer

To bridge the gap between vanilla Kubernetes and NVIDIA silicon, we must install four distinct foundational components:

1.  **NVIDIA Drivers:** The kernel modules (`nvidia.ko`) that allow the OS to talk to the hardware.
2.  **NVIDIA Container Toolkit:** The software that modifies `containerd`/`CRI-O` to allow GPU passthrough into containers (using CDI - Container Device Interface).
3.  **NVIDIA Device Plugin:** A daemonset that runs on the node, counts the number of healthy GPUs, and advertises them to the kubelet as allocatable resources (e.g., `nvidia.com/gpu: 8`).
4.  **GPU Feature Discovery (GFD):** A daemonset that scans the node and labels it with specific hardware features (e.g., `nvidia.com/gpu.memory=80000`, `nvidia.com/gpu.product=H100`).

## 3. The Lifecycle Problem

In the early days of Kubernetes, platform engineers installed these four components manually on every single bare-metal node using tools like Ansible or Terraform. 

This created a lifecycle nightmare. 
What happens when you upgrade the host operating system kernel? The NVIDIA driver (`nvidia.ko`) breaks because it was compiled for the old kernel. 
What happens when you add a new node to the cluster with a newer GPU architecture? You have to manually re-run your Ansible playbooks with a different driver version.

A modern, cloud-native architecture cannot rely on brittle, host-level manual installations. The entire GPU platform layer must be declarative, self-healing, and managed by Kubernetes itself. This brings us to the **NVIDIA GPU Operator**, which we will cover extensively in Chapter 6.

## Customer Scenario (Senior Level)

**The Situation:**
A junior DevOps engineer builds a new Kubernetes cluster on bare-metal servers. They manually install the NVIDIA drivers and the NVIDIA Container Toolkit on the host OS. They deploy the NVIDIA Device Plugin via Helm. The nodes successfully report `nvidia.com/gpu: 8`. A data scientist deploys a PyTorch pod requesting 1 GPU. The pod schedules successfully and transitions to the `Running` state. However, the Python script inside the pod crashes immediately with `CUDA error: no CUDA-capable device is detected`. The DevOps engineer is confused because Kubernetes says the pod is running and has a GPU.

**The Senior Architect Response:**
"You have encountered the classic disconnect between Kubernetes control-plane reality and container data-plane reality.

Kubernetes reporting that a pod is `Running` and has an allocated GPU simply means the Kubernetes scheduler found a node with the `nvidia.com/gpu` capacity and the kubelet accepted the assignment. It is purely a logical transaction.

However, the container runtime (`containerd`) is failing to actually mount the physical `/dev/nvidia0` device into the container's namespace. 

Even though you installed the NVIDIA Container Toolkit on the host, you likely failed to reconfigure the `containerd` config file (`/etc/containerd/config.toml`) to use the `nvidia` runtime class, or you failed to restart the `containerd` daemon after making the change. 

Because standard `containerd` (runc) was used to start the container, the strict Linux cgroups and namespaces blocked the container from seeing the host's GPU hardware. The pod is 'Running', but it is effectively blind. We must fix the `containerd` configuration to properly invoke the NVIDIA runtime wrapper before any CUDA operations will succeed."

## Interview Preparation

**Conceptual:** Why can't native Kubernetes schedule GPUs without third-party plugins? *(Hint: The kubelet is only programmed to understand CPU and Memory resources via standard Linux cgroups. It lacks the vendor-specific logic required to detect PCIe accelerators, manage proprietary kernel drivers, or pass character devices (`/dev/nvidia*`) into container namespaces).*

**Architecture:** What is the specific responsibility of the NVIDIA Device Plugin? *(Hint: The Device Plugin's sole job is to sit on the node, communicate with the NVIDIA driver to count the number of physical GPUs, and advertise that count to the kubelet. This translates raw hardware into a logical resource (`nvidia.com/gpu`) that the Kubernetes scheduler can understand).*
