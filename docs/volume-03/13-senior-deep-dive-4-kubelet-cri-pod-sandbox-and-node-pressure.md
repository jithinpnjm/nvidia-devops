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
