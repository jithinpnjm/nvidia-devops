---
title: Lab 04 — Troubleshoot a Multi-Tenant GPU Node
description: Diagnose missing resources, contention, memory failures, and policy errors on a shared GPU node.
sidebar_position: 23
tags: [lab, troubleshooting, multi-tenancy]
---

# Lab 04 — Troubleshoot a Multi-Tenant GPU Node

## Objective

Use a bottom-up incident workflow to diagnose a shared GPU node where one tenant reports Pending Pods and another reports latency spikes.

## Evidence Bundle

```bash
mkdir -p shared-gpu-incident
nvidia-smi -q > shared-gpu-incident/nvidia-smi-q.txt
nvidia-smi -L > shared-gpu-incident/devices.txt
nvidia-smi mig -lgi > shared-gpu-incident/mig-layout.txt 2>&1 || true
kubectl describe node <node> > shared-gpu-incident/node.txt
kubectl get events -A --sort-by=.lastTimestamp > shared-gpu-incident/events.txt
kubectl get pods -A -o wide > shared-gpu-incident/pods.txt
```

## Diagnostic Order

1. Physical GPU and driver health.
2. Active sharing mode and layout.
3. Device-plugin discovery and advertised resources.
4. Namespace quotas, selectors, taints, and priorities.
5. Physical memory and process contention.
6. Application latency and error rate.

## Failure Injection

In a disposable environment, remove one advertised profile or exceed a namespace quota. Observe the distinct scheduler messages.

## Resolution

Repair the lowest failed layer, run a validation workload for each service class, and restore traffic gradually.

## Prevention

Standardize layouts, alert on resource-count change, enforce workload-class admission, and maintain tenant-aware dashboards.

## Cleanup

Remove injected failures, restore policy, and attach the evidence bundle to the incident record.
