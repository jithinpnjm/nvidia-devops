---
title: Lab 03 — Diagnose a Missing Allocatable GPU
description: Use layered evidence to find why a Kubernetes node no longer advertises nvidia.com/gpu.
sidebar_position: 22
tags:
  - lab
  - troubleshooting
  - device-plugin
---

# Lab 03 — Diagnose a Missing Allocatable GPU

```yaml
Title: Diagnose a Missing Allocatable GPU
Volume: 10
Chapter: 11
Difficulty: Advanced
Estimated Time: 75 Minutes
Prerequisites: GPU-enabled Kubernetes cluster and node access
Target Platform: Kubernetes with GPU Operator or standalone device plugin
Target Audience: Platform Engineers and SREs
Lab Type: Failure & Troubleshooting
```

## 1. Objective

Diagnose a node that is Ready but does not advertise `nvidia.com/gpu`, separating hardware, driver, runtime, device-plugin, kubelet, and scheduler failures.

## 2. Scenario

A node can look healthy at the Kubernetes layer and still fail to advertise a GPU. The absence of allocatable GPUs is only a symptom. This lab walks the evidence chain from hardware upward so you can identify the first broken layer instead of restarting random components.

## 3. Learning Outcomes

You will be able to distinguish Capacity from Allocatable, validate the physical and software stack, inspect plugin registration, recover safely, and create prevention controls.

## 4. Architecture

```mermaid
flowchart TD
    Missing[Missing nvidia.com/gpu]
    Hardware{GPU visible?}
    Driver{Driver healthy?}
    Plugin{Plugin healthy?}
    Kubelet{Resource registered?}
    Policy{Node schedulable?}
    Restored[Resource restored]

    Missing --> Hardware
    Hardware -->|No| FixHW[Repair hardware or passthrough]
    Hardware -->|Yes| Driver
    Driver -->|No| FixDriver[Repair driver]
    Driver -->|Yes| Plugin
    Plugin -->|No| FixPlugin[Repair device plugin]
    Plugin -->|Yes| Kubelet
    Kubelet -->|No| FixKubelet[Repair registration]
    Kubelet -->|Yes| Policy --> Restored
```

## 5. Prerequisites

- Permission to inspect Nodes, Pods, DaemonSets, and events.
- Console or SSH access to the affected node.
- A healthy comparison node from the same pool.
- A maintenance window for service restarts.

## 6. Environment

Run these commands before you make any changes.

```bash
kubectl get nodes -o custom-columns=NAME:.metadata.name,CAPACITY:.status.capacity.nvidia\\.com/gpu,ALLOCATABLE:.status.allocatable.nvidia\\.com/gpu
export GPU_NODE='<affected-node>'
export HEALTHY_NODE='<healthy-node>'
```

## 7. Components

| Layer | Evidence |
|---|---|
| Hardware | `lspci`, BMC inventory, firmware logs |
| Driver | `nvidia-smi`, modules, kernel journal |
| Runtime | containerd and NVIDIA runtime configuration |
| Device plugin | DaemonSet Pod and logs |
| Kubelet | registration logs and Node status |
| Scheduler | Pod events, taints, selectors, requests |

## 8. Procedure

Prepare an evidence directory:

```bash
mkdir -p missing-gpu-evidence
kubectl get node "$GPU_NODE" -o yaml > missing-gpu-evidence/node.yaml
kubectl describe node "$GPU_NODE" > missing-gpu-evidence/node-describe.txt
kubectl get events -A --sort-by=.lastTimestamp > missing-gpu-evidence/events.txt
```

## 9. Validation

Confirm the symptom:

```bash
kubectl get node "$GPU_NODE" -o jsonpath='{.status.capacity.nvidia\\.com/gpu}{" capacity\n"}{.status.allocatable.nvidia\\.com/gpu}{" allocatable\n"}'
```

Do not create the failure in production merely to reproduce it.

## 10. Verification Workflow

### Hardware

| Purpose | Command | Expected evidence | Explanation | Common failure interpretation |
|---|---|---|---|---|
| Enumerate the GPU on the node | `lspci | grep -i nvidia` | NVIDIA device entries appear | Proves the PCIe device is visible to the host | No device suggests hardware, BIOS, passthrough, or PCIe enumeration issues |

### Driver

| Purpose | Command | Expected evidence | Explanation | Common failure interpretation |
|---|---|---|---|---|
| Confirm driver modules | `lsmod | grep '^nvidia'` | NVIDIA modules are loaded | Verifies the kernel module is present | No modules mean the driver did not load correctly |
| Query the GPU | `nvidia-smi` | Driver and device summary | Confirms the host can talk to the GPU | Driver communication errors usually stop the chain here |
| Read kernel messages | `journalctl -k | grep -Ei 'nvrm|nvidia|xid' | tail -n 100` | Driver and XID messages | Helps identify reset, load, or hardware errors | Repeating XID or module errors can explain the missing resource |

### Device plugin

| Purpose | Command | Expected evidence | Explanation | Common failure interpretation |
|---|---|---|---|---|
| Find plugin Pods on the node | `kubectl get pods -A -o wide | grep -i device-plugin | grep "$GPU_NODE"` | Device-plugin Pod on the affected node | Proves the DaemonSet is running where it should | No Pod means the plugin is not scheduled or not deployed |
| Read plugin logs | `kubectl logs -n gpu-operator <device-plugin-pod> --tail=200` | Registration and device-list output | Shows whether the plugin is advertising GPUs to kubelet | Log errors point to device enumeration, permissions, or runtime issues |

Adjust the namespace if you are not using GPU Operator.

### Kubelet

| Purpose | Command | Expected evidence | Explanation | Common failure interpretation |
|---|---|---|---|---|
| Read kubelet registration logs | `journalctl -u kubelet -n 300 | grep -Ei 'device plugin|nvidia|registration'` | Kubelet/plugin registration messages | Shows whether kubelet accepted the resource registration | No registration evidence suggests a communication issue between kubelet and the plugin |

### Scheduling policy

| Purpose | Command | Expected evidence | Explanation | Common failure interpretation |
|---|---|---|---|---|
| Inspect taints and labels | `kubectl describe node "$GPU_NODE" | sed -n '/Taints:/,/Unschedulable:/p'` | Node taints and scheduling state | Helps rule out a scheduling policy issue | A GPU may be present but unschedulable because of taints or node state |
| Confirm labels | `kubectl get node "$GPU_NODE" --show-labels` | Node labels printed inline | Lets you compare the failing node with a healthy one | Missing labels can indicate a discovery failure or a node replacement |
| Compare the healthy node | `kubectl get node "$HEALTHY_NODE" -o jsonpath='{.status.capacity.nvidia\\.com/gpu}{" capacity\n"}{.status.allocatable.nvidia\\.com/gpu}{" allocatable\n"}'` | Healthy capacity and allocatable values | Gives you a known-good comparison point | Differences between nodes often reveal a rollout or host-specific problem |

## 11. Observability

```bash
kubectl get pods -A -o wide | grep "$GPU_NODE" > missing-gpu-evidence/node-pods.txt
kubectl get daemonsets -A > missing-gpu-evidence/daemonsets.txt
nvidia-smi -q > missing-gpu-evidence/nvidia-smi-q.txt 2>&1
```

Compare this evidence with the healthy node.

## 12. Performance Measurements

After recovery, run an approved validation workload and compare initialization time, utilization, and error counters with the healthy baseline.

## 13. Failure Injection

In a disposable cluster, stop or mis-schedule the device-plugin Pod on one node. Observe the Node resource change, then restore the original DaemonSet immediately.

## 14. Troubleshooting Matrix

| Host healthy | Plugin healthy | Resource present | Likely cause |
|---|---|---|---|
| No | Any | No | Hardware or driver |
| Yes | No | No | DaemonSet, image, or policy |
| Yes | Erroring | No | Enumeration or configuration |
| Yes | Yes | No | Kubelet registration or stale state |
| Yes | Yes | Yes | Scheduling constraints |

Recovery order:

1. Repair the lowest failed layer.
2. Confirm `nvidia-smi`.
3. Confirm plugin health.
4. Verify kubelet registration.
5. Confirm Capacity and Allocatable.
6. Run a one-GPU validation Pod.
7. Return the node only after telemetry is normal.

## 15. Cleanup

Delete temporary validation Pods and retain the evidence bundle with the incident record.

## 16. Summary

You restored a Kubernetes GPU resource using dependency-ordered evidence rather than blind component restarts.

## 17. Challenge Exercises

Automate namespace detection, add alerts for device-plugin absence and resource loss, compare driver and plugin failure signatures, and quarantine unhealthy nodes automatically.

## 18. Further Reading

- [Device Plugin and Kubernetes Resource Model](../chapter-04-device-plugin-and-kubernetes-resource-model)
- [Upgrades and Production Troubleshooting](../chapter-11-upgrades-and-production-troubleshooting)
- [Lab 01 — Inspect a Kubernetes GPU Node](./lab-01-inspect-a-kubernetes-gpu-node)
