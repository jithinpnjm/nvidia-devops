---
title: "Chapter 4 - Kubernetes device plugins and GPU Operator"
slug: "chapter-4-kubernetes-device-plugins-and-gpu-operator"
sidebar_position: 4
description: "Chapter 4 - Kubernetes device plugins and GPU Operator — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Trace how hardware becomes an allocatable Kubernetes extended resource and how operator lifecycle automation fits around it.


Kubernetes device plugins advertise specialized devices to kubelet; the Node status then exposes allocatable extended resources. GPU Operator automates GPU-node software such as drivers, container toolkit integration, device plugin, telemetry and MIG-related components depending on configuration. It is lifecycle automation around the node stack; scheduling still follows Kubernetes resource requests.


<!-- source-table:2 -->

```text
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.allocatable.nvidia\.com/gpu}{"\n"}{end}'
kubectl -n gpu-operator get pods -o wide
kubectl describe node <gpu-node> | grep -A10 -i nvidia
```


## Worked scenario


<!-- source-table:3 -->

> Situation nvidia-smi works on a node, but Kubernetes does not show nvidia.com/gpu.


**1\. Host hardware/driver is partially proven by nvidia-smi; move upward.**

2\. Check container-toolkit/runtime configuration and GPU Operator validation/components.

3\. Check the device-plugin Pod logs/health on that node.

4\. Inspect Node allocatable/resources and feature labels.

5\. If MIG mode is active, verify what resource names/strategies are intentionally advertised.


<!-- source-table:4 -->

> Conclusion Host driver success does not prove the Kubernetes device-advertisement layer.
