---
title: Chapter 10 — Kubernetes and Virtualization Integration
description: Integrate enterprise AI software with Kubernetes, GPU Operator, vGPU, storage, networking, and identity.
sidebar_position: 11
tags: [kubernetes, virtualization, integration]
---

# Kubernetes and Virtualization Integration

NVIDIA AI Enterprise can participate in bare-metal Kubernetes, virtualized Kubernetes, and VM-based application architectures. The correct model depends on isolation, operations, performance, and support requirements.

## Integration Layers

| Layer | Kubernetes concern | Virtualization concern |
|---|---|---|
| GPU access | GPU Operator, device plugin, RuntimeClass or CDI | vGPU manager, guest driver, profile |
| Identity | service accounts and workload identity | VM and platform identity |
| Storage | PVC, object storage, model cache | virtual disks and shared storage |
| Networking | Service, ingress, NetworkPolicy | virtual network and firewall |
| Lifecycle | Helm or GitOps | image and hypervisor lifecycle |

## Production Design

Choose one authoritative owner for each compatibility layer. Avoid independent driver or runtime changes inside guests that bypass the qualified matrix.

## Troubleshooting

Trace from physical GPU to host software, virtualization boundary, guest or Kubernetes runtime, application container, and model artifact.
