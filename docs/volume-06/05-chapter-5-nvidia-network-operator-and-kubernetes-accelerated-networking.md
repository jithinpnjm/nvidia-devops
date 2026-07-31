---
title: "Chapter 5 - NVIDIA Network Operator and Kubernetes accelerated networking"
slug: "chapter-5-nvidia-network-operator-and-kubernetes-accelerated-networking"
sidebar_position: 5
description: "Chapter 5 - NVIDIA Network Operator and Kubernetes accelerated networking — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand the software automation layer that prepares nodes for high-performance network devices and secondary networks.


Network Operator automates deployment/configuration of networking components such as drivers, device plugins and CNI-related pieces for supported accelerated networking patterns. GPU Operator and Network Operator address different device stacks but may work together for GPU workloads requiring GPUDirect RDMA.

Kubernetes primary Pod networking may remain conventional while workloads receive additional high-performance interfaces via Multus/SR-IOV patterns. The design must define which traffic uses which network and how identity/policy/observability work across both.

## Targeted references

[NVIDIA Network Operator technical blog](https://developer.nvidia.com/blog/streamlining-kubernetes-networking-in-scale-out-gpu-clusters-with-the-new-nvidia-network-operator-1-0/) - Operator component model, accelerated network modes and GPUDirect context.
