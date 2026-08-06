---
title: Lab 03 — Diagnose a Missing Allocatable GPU
description: Use layered evidence to find why a Kubernetes node no longer advertises nvidia.com/gpu.
sidebar_position: 22
tags: [lab, troubleshooting, device-plugin]
---

# Lab 03 — Diagnose a Missing Allocatable GPU

| Field | Value |
|---|---|
| Chapter | 11 — Upgrades and Production Troubleshooting |
| Difficulty / time | Advanced / 75 minutes |
| Type | Failure diagnosis and safe recovery planning |
| Scope | One affected node and a healthy comparison node |

## 1. Objective

Identify the lowest failed layer when a Ready node lacks `nvidia.com/gpu` Allocatable, then propose a verified, change-controlled recovery.

## 2. Production Story

After node maintenance, application Pods stay Pending even though Kubernetes reports the node Ready. Restarting every GPU component hides the evidence and can widen impact. Start with physical enumeration and advance only after each layer is proven.

## 3. Learning Outcomes

You will distinguish Capacity from Allocatable, compare a healthy node, inspect driver/plugin/kubelet evidence, separate resource loss from scheduling constraints, and define recovery gates.

## 4. Architecture

```mermaid
flowchart TD
  A[Missing Allocatable] --> B{PCI device visible?}
  B -->|yes| C{Driver healthy?}
  C -->|yes| D{Plugin healthy?}
  D -->|yes| E{Kubelet registered resource?}
  E -->|yes| F[Check scheduler policy]
  B -->|no| H[Hardware, BIOS, passthrough]
  C -->|no| I[Driver/kernel boundary]
  D -->|no| J[Plugin configuration]
  E -->|no| K[Kubelet registration]
```

## 5. Prerequisites

- Read access to Nodes, Pods, DaemonSets, events, and logs; approved SSH/console access.
- One affected node and one healthy node from the same pool/model where possible.
- Maintenance approval before any restart, drain, driver change, or plugin rollout.

## 6. Safety and Incident Boundary

This lab collects evidence and does not create the production failure. Do not delete Pods, restart kubelet, reload kernel modules, or modify DaemonSets until the incident owner approves a remediation plan.

## 7. Environment and Variables

**Purpose:** Bind investigation to named comparison targets.

**Command:**
```bash
export GPU_NODE='<affected-node>'
export HEALTHY_GPU_NODE='<healthy-comparison-node>'
kubectl get nodes -o custom-columns=NAME:.metadata.name,CAPACITY:.status.capacity.nvidia\.com/gpu,ALLOCATABLE:.status.allocatable.nvidia\.com/gpu
```

**Expected evidence:** The affected node has missing/zero resource information and the comparison node has a known-good state.

**Explanation:** A comparison eliminates assumptions about intended configuration.

**Common-failure interpretation:** If no healthy peer exists, use the node pool’s approved baseline/configuration repository and record the limitation.

## 8. Components and Evidence Map

| Layer | Proof | Typical owner |
|---|---|---|
| Hardware | PCI enumeration/BMC | hardware or cloud provider |
| Driver | `nvidia-smi`, kernel log | node platform |
| Runtime | runtime configuration | node platform |
| Device plugin | DaemonSet Pod/log | GPU platform |
| Kubelet | Node status/registration log | Kubernetes platform |
| Scheduler | Pod events/taints | workload + platform |

## 9. Procedure: Preserve Initial Evidence

**Purpose:** Capture evidence before any remediation changes timestamps or restarts components.

**Command:**
```bash
mkdir -p missing-gpu-evidence
kubectl get node "$GPU_NODE" -o yaml > missing-gpu-evidence/node.yaml
kubectl describe node "$GPU_NODE" > missing-gpu-evidence/node-describe.txt
kubectl get events -A --sort-by=.lastTimestamp > missing-gpu-evidence/events.txt
```

**Expected evidence:** Node status, conditions, events, labels, taints, Capacity, and Allocatable are retained.

**Explanation:** This is the incident’s before-state; do not overwrite it after recovery.

**Common-failure interpretation:** RBAC failures must be documented and resolved through approved access—not bypassed with cluster-admin credentials.

## 10. Validate the Symptom and Compare

**Purpose:** Confirm whether loss is Capacity, Allocatable, or only scheduling policy.

**Command:**
```bash
kubectl get node "$GPU_NODE" -o jsonpath='{.status.capacity.nvidia\.com/gpu}{" capacity\n"}{.status.allocatable.nvidia\.com/gpu}{" allocatable\n"}'
kubectl get node "$HEALTHY_GPU_NODE" -o jsonpath='{.status.capacity.nvidia\.com/gpu}{" capacity\n"}{.status.allocatable.nvidia\.com/gpu}{" allocatable\n"}'
```

**Expected evidence:** A direct affected-versus-healthy comparison is recorded.

**Explanation:** A present resource with a Pending Pod is usually a scheduler/request/taint question, not this failure mode.

**Common-failure interpretation:** Empty output may mean no registered resource, not numeric zero; retain the raw node YAML.

## 11. Procedure: Hardware and Driver (Hardware Only)

Run on the affected node through the approved access path.

**Purpose:** Prove PCI visibility and driver initialization before inspecting Kubernetes components.

**Command:**
```bash
lspci | grep -i nvidia
lsmod | grep '^nvidia' || true
nvidia-smi
journalctl -k | grep -Ei 'nvrm|nvidia|xid' | tail -n 100
```

**Expected evidence:** NVIDIA PCI devices, loaded driver modules, `nvidia-smi` output, and any relevant kernel events are visible.

**Explanation:** The device plugin cannot advertise a GPU that the host cannot initialize.

**Common-failure interpretation:** No PCI device points to hardware/BIOS/passthrough. `nvidia-smi` failure with visible PCI points to the driver/kernel/firmware boundary; stop there and escalate appropriately.

## 12. Procedure: Device Plugin and Discovery

**Purpose:** Locate the actual device-plugin Pod on the affected node and inspect its recent output.

**Command:**
```bash
kubectl get pods -A -o wide | grep -i device-plugin | grep "$GPU_NODE" || true
kubectl get daemonsets -A | grep -Ei 'device.plugin|nvidia' || true
```

**Expected evidence:** The responsible Pod/DaemonSet and namespace are identified, or their absence is proven.

**Explanation:** Names and namespaces differ between GPU Operator and standalone deployments.

**Common-failure interpretation:** No Pod on a GPU node suggests DaemonSet selectors, tolerations, image pulls, or scheduling restrictions; inspect its actual DaemonSet and events next.

**Purpose:** Read the identified plugin’s logs without guessing its name.

**Command:**
```bash
kubectl logs -n <plugin-namespace> <plugin-pod-on-affected-node> --tail=200
kubectl describe pod -n <plugin-namespace> <plugin-pod-on-affected-node>
```

**Expected evidence:** Logs state enumeration/registration progress and describe output shows placement, mounts, and events.

**Explanation:** Substitute the discovered values literally; placeholders prevent accidental inspection of the wrong Pod.

**Common-failure interpretation:** Enumeration errors return to the driver layer; CrashLoop/image errors require the deployment/registry path; a healthy plugin with no resource moves to kubelet.

## 13. Procedure: Kubelet and Runtime (Hardware Only)

**Purpose:** Find device-plugin registration and runtime-related kubelet evidence.

**Command:**
```bash
journalctl -u kubelet -n 300 | grep -Ei 'device plugin|nvidia|registration' || true
sudo crictl info
```

**Expected evidence:** Registration-related log lines and the effective CRI runtime details are collected.

**Explanation:** Kubelet owns the Node status update after a plugin registers.

**Common-failure interpretation:** No matching log line is not a verdict; compare timestamps and plugin state. Repeated registration errors need kubelet/plugin configuration review before restarting either service.

## 14. Scheduler Policy Check

**Purpose:** Separate missing resource advertisement from a resource that is unavailable to a particular workload.

**Command:**
```bash
kubectl describe node "$GPU_NODE" | sed -n '/Taints:/,/Unschedulable:/p'
kubectl get node "$GPU_NODE" --show-labels
```

**Expected evidence:** Taints, cordon state, and relevant labels are visible.

**Explanation:** These conditions do not remove Allocatable but can keep a correct GPU request Pending.

**Common-failure interpretation:** If resource values are present, inspect the workload’s requests, tolerations, selectors, affinity, quotas, and Pod events rather than repairing the node.

## 15. Recovery Plan and Acceptance Gates

Repair only the lowest failed layer through the approved platform runbook. After the change, require: host `nvidia-smi` (when applicable), healthy plugin, non-empty Capacity and Allocatable, a one-GPU validation Pod, and normal telemetry/error logs. Compare each result with `$HEALTHY_GPU_NODE` before returning the node to service.

## 16. Safe Failure Exercise and Troubleshooting Matrix

In a disposable cluster, prevent the device-plugin DaemonSet from matching one test node using a reviewed temporary selector; observe resource loss, restore the exact prior spec, and verify the gates above. Never use this injection in shared production.

| Evidence | Interpretation | Next action |
|---|---|---|
| PCI device absent | physical/passthrough issue | hardware/provider escalation |
| Driver fails | driver/kernel issue | approved node remediation |
| Plugin absent/unhealthy | DaemonSet/deployment issue | inspect selector/events/logs |
| Plugin healthy, resource absent | registration issue | kubelet/plugin config review |
| Resource present | scheduling issue | inspect Pod policy/events |

## 17. Cleanup and Handoff

**Purpose:** Preserve evidence and confirm no temporary validation workload remains.

**Command:**
```bash
kubectl delete pod gpu-missing-resource-validation --ignore-not-found
```

**Expected evidence:** The named disposable Pod is absent; no platform component changes are made by cleanup.

**Explanation:** Keep `missing-gpu-evidence` with the incident, including before/after Node YAML and remediation approval.

**Common-failure interpretation:** If a real workload has the same name, stop—the target assumption is invalid. Do not delete it.

## 18. Summary, Challenges, and Further Reading

You used dependency-ordered evidence instead of broad restarts. Next, automate peer comparison, alert on resource loss and plugin absence, and apply the controlled-change discipline in [Lab 04](./lab-04-perform-a-controlled-gpu-platform-upgrade).

- [Device Plugin and Kubernetes Resource Model](../chapter-04-device-plugin-and-kubernetes-resource-model)
- [GPU Observability with DCGM](../chapter-09-gpu-observability-with-dcgm)
- [Upgrades and Production Troubleshooting](../chapter-11-upgrades-and-production-troubleshooting)
