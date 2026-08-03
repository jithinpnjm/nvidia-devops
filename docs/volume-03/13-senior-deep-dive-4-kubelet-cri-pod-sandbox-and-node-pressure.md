---
title: "Senior Deep Dive 4 — Kubelet, CRI, pod sandbox and node pressure"
slug: "senior-deep-dive-4-kubelet-cri-pod-sandbox-and-node-pressure"
sidebar_position: 13
description: "Senior Deep Dive 4 — Kubelet, CRI, pod sandbox and node pressure — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
The kubelet is the node control agent. It watches desired Pods for its node, asks the container runtime through CRI to create sandboxes and containers, mounts volumes, executes probes and reports status. A Running Pod therefore depends on kubelet health, runtime health, storage/network plugins and host resources. When the node is unhealthy, Kubernetes status is only one layer of evidence; systemd, journalctl, crictl and kernel logs become first-class tools.

**Node-level evidence**

systemctl status kubelet containerd
journalctl -u kubelet -S -30m
crictl pods
crictl ps -a
crictl inspectp &lt;pod-sandbox-id>
cat /proc/pressure/&#123;cpu,memory,io&#125;

Node-pressure eviction is not the same as scheduler preemption. The kubelet can evict Pods when memory, disk or inode thresholds are breached. QoS class, usage relative to requests and Pod priority influence victim selection. For GPU nodes, a tiny root filesystem or image filesystem can evict expensive workloads even when GPU memory and compute are healthy.

## Senior addendum

### Deep Dive 4 — Kubelet, CRI, pod sandbox and node pressure
*(the CRI pipeline itself — RunPodSandbox, CNI/CSI stalls, image pull — is covered in depth in Chapter 3. This section is the eviction mechanics, which Chapter 3 doesn't cover.)*

➕ **Node-pressure eviction vs scheduler preemption — the distinction the original text flags but doesn't fully separate mechanically:**
| | Scheduler preemption (Ch2/DD3) | Kubelet node-pressure eviction (this DD) |
|---|---|---|
| Triggered by | a Pending higher-priority Pod needing room | local threshold breach: memory, disk, inode, PID pressure on THIS node |
| Decided by | scheduler (control plane) | kubelet (node-local, no apiserver round-trip needed to decide) |
| Victim selection | priority, then whatever satisfies the Pending Pod's constraints | QoS class first (BestEffort evicted before Burstable before Guaranteed), then usage-over-request magnitude within a class |
| PDB respected? | yes | **no** — node-pressure eviction is not subject to PodDisruptionBudget, because it's a node-safety action, not a voluntary disruption |

➕ **Interview-ready line:** "PDB protects against voluntary disruption — drains, rolling updates, scale-downs. It does not protect against a kubelet evicting a Pod because the node itself is about to fall over from memory or disk pressure — that's an involuntary disruption, and it's a distinction worth stating explicitly because customers sometimes assume PDB is a universal safety net."

➕ **Diagram: the eviction trigger and victim-ranking sequence, end to end:**
```text
kubelet polls node signals: /proc/pressure/{cpu,memory,io}, disk/inode usage
A configured eviction threshold is breached (e.g. available memory < 100Mi)
no apiserver round-trip needed to decide this — purely node-local
kubelet ranks ALL Pods on this node as eviction candidates
1st: BestEffort QoS (no requests/limits set at all)
2nd: Burstable QoS, ranked by (usage − request) descending — the Pod
exceeding its request by the LARGEST margin goes first
3rd (last resort): Guaranteed QoS — only evicted if the above isn't enough
kubelet evicts chosen Pod directly — NO PodDisruptionBudget check,
NO eviction API 429/retry semantics — this is a direct kill, not a
voluntary-disruption request
```
The "no PDB check" step is the one worth over-stating: this is the single biggest gap between what teams assume PDB protects and what it actually protects.

➕ **GPU-specific node-pressure trap, worth stating exactly once since it's easy to miss:** `cat /proc/pressure/{cpu,memory,io}` and kubelet eviction thresholds react to **host** filesystem/memory pressure — they have zero visibility into GPU memory (HBM) pressure. A workload can be fine by every Kubernetes eviction signal while its process inside the container hits `CUDA_ERROR_OUT_OF_MEMORY` — two entirely separate resource planes, same as Volume 1's CUDA-OOM-vs-cgroup-OOM distinction, now specifically framed against kubelet eviction rather than cgroup OOM-kill.
