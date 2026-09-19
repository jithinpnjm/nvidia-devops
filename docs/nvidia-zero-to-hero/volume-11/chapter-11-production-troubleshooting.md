---
title: "Chapter 11 — Production Troubleshooting"
sidebar_position: 11
description: "Master the diagnostic workflows for shared GPUs. Learn how to resolve MIG configuration errors, Time-Slicing OOMs, and Kubernetes allocation mismatches."
---

# Chapter 11 — Production Troubleshooting

| Chapter metadata | Value |
|---|---|
| Volume | 11 — GPU Sharing, MIG, and Virtualization |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | SREs, Tier 3 Support |
| Core question | When a node suddenly stops advertising `nvidia.com/mig-1g.10gb` and all pods go Pending, how do you fix it without rebooting? |

## Introduction

Troubleshooting a dedicated GPU is straightforward: is the driver loaded, and is the hardware broken? 
Troubleshooting shared GPUs introduces layers of abstract configuration (ConfigMaps, labels, `mig-manager` daemonsets, and virtualized device plugins). 

When a shared cluster breaks, the symptoms are almost always the same: **Pods get stuck in the `Pending` state**. The root causes, however, are vastly different depending on whether you are using MIG or Time-Slicing.

A Senior SRE must execute a precise, mathematically logical diagnostic tree to isolate the failure domain.

## 1. Troubleshooting Time-Slicing

**Symptom:** Pods request `nvidia.com/gpu`, schedule successfully, but crash instantly with `CUDA OOM (Out of Memory)` or `CUDA_ERROR_OUT_OF_MEMORY`.

**The Diagnostic Workflow:**
1.  **Confirm the Profile:** Time-slicing does not isolate memory. If 10 Pods share an 80GB GPU, and Pod 1 requests 75GB, Pods 2-10 will crash.
2.  **The Fix:** This is an application problem, not an infrastructure problem. You must mandate that the application developers set strict memory growth limits inside their code (e.g., `torch.cuda.set_per_process_memory_fraction` in PyTorch) to prevent them from consuming the entire global VRAM pool.

**Symptom:** You configured the Time-Slicing ConfigMap, but the node still only advertises `nvidia.com/gpu: 1` instead of `10`.
1.  **Check the ConfigMap:** Did you apply the exact label to the node (`nvidia.com/device-plugin.config=my-config`)?
2.  **Check the Plugin:** The Device Plugin must restart to read the new ConfigMap. Check the logs of the `nvidia-device-plugin-daemonset` Pod on that node for syntax errors in your YAML.

## 2. Troubleshooting MIG Configurations

**Symptom:** You apply a MIG profile label (e.g., `nvidia.com/mig.config=all-1g.10gb`) to a node. The node drains, but the pods remain Pending forever because the node never advertises the new `nvidia.com/mig-1g.10gb` resource.

**The Diagnostic Workflow:**
1.  **Check the MIG Manager:** The GPU Operator runs a specific pod called `nvidia-mig-manager`. Check its logs. 
2.  **The "In Use" Error:** The most common failure is that the `mig-manager` cannot physically reconfigure the silicon because a process is actively using the GPU. Even a stray `nvidia-smi` background polling script running on the host OS will lock the GPU and prevent MIG reconfiguration. You must kill all active GPU processes on the host.
3.  **The NVLink Trap:** Are you trying to enable MIG on an architecture that doesn't support it, or are you trying to use Peer-to-Peer (P2P) communication between MIG slices? (MIG physically disables P2P).

## Customer Scenario (Senior Level)

**The Situation:**
An SRE receives an urgent ticket: A critical node running an 80GB H100 GPU partitioned into two `3g.40gb` MIG slices has completely stopped scheduling workloads. The workloads were evicted. The SRE runs `kubectl describe node` and sees that the node is suddenly advertising `nvidia.com/gpu: 1` instead of the expected `nvidia.com/mig-3g.40gb: 2`. The developers are panicking because their Pod YAMLs are hardcoded to request the MIG resources, so their pods are permanently stuck in `Pending`.

**The Senior Architect Response:**
"The node has autonomously reverted from a MIG-partitioned state back to a full, unified GPU state. This is a classic symptom of a severe unhandled crash within the **NVIDIA MIG Manager Control Loop**.

When the GPU Operator's `mig-manager` DaemonSet crashes, or if the underlying host undergoes an ungraceful reboot, the physical GPU silicon will often reset to its default factory state (MIG disabled, full GPU mode). 

When the node comes back online, the NVIDIA Device Plugin queries the silicon via NVML, sees a single full GPU, and obediently registers `nvidia.com/gpu: 1` with the kubelet. The Kubernetes scheduler is acting perfectly normally; it cannot schedule the MIG workloads because the MIG hardware physically does not exist right now.

To fix this without rebooting the node, we must force a state reconciliation. 
We must check the `nvidia-mig-manager` Pod logs on that specific node. If it crashed due to an out-of-memory error or a socket timeout, we must delete the Pod to force the DaemonSet to recreate it. 

Once the `mig-manager` restarts, it will read the Kubernetes node label (`nvidia.com/mig.config=...`), realize the physical silicon does not match the desired Kubernetes state, execute the NVML commands to re-partition the H100 back into two `3g.40gb` slices, and signal the Device Plugin to update the kubelet. The pending pods will then schedule instantly."

## Interview Preparation

**Conceptual:** If a Kubernetes node with a shared GPU is actively running 5 Time-Sliced Pods, and a 6th Pod schedules and crashes with a CUDA OOM error, is the infrastructure broken or is the application broken? *(Hint: The application is broken. Time-slicing provides no memory isolation. The infrastructure simply context-switches the compute. The application developers must explicitly limit their VRAM consumption inside their code to prevent starvation of the shared pool).*

**Architecture:** Why must all active GPU processes (even simple monitoring scripts on the host) be killed before the GPU Operator can change a MIG profile from `1g.10gb` to `3g.40gb`? *(Hint: MIG re-partitions the physical silicon hardware. To change the hardware boundaries of the VRAM and L2 Cache, the GPU must be in a completely idle, unlocked state. Any active process holding a CUDA context on the GPU will lock the hardware, causing the NVML reconfiguration commands to fail).*
