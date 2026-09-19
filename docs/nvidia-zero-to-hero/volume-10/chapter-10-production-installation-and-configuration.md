---
title: "Chapter 10 — Production Installation and Configuration"
sidebar_position: 10
description: "Master the deployment of the GPU Operator. Learn the critical Helm values for configuring drivers, toolkits, and device plugins securely."
---

# Chapter 10 — Production Installation and Configuration

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Advanced |
| Estimated reading time | 30 minutes |
| Primary audience | Kubernetes Administrators, Platform Engineers |
| Core question | `helm install gpu-operator` is easy. How do you configure it so it survives a production security audit and massive scale? |

## Introduction

Installing the NVIDIA GPU Operator in a homelab requires one command: `helm install`. 
Installing the GPU Operator in a highly secure, air-gapped, multi-tenant enterprise production environment requires precise architectural planning and configuration of the `values.yaml` file.

A Senior Architect does not accept default configurations. Default configurations pull images from the public internet, use default driver versions, and grant excessive privileges. This chapter details the production-ready configuration of the GPU Operator.

## 1. Air-Gapped and Secure Environments

In production, Kubernetes nodes generally do not have public internet access. If you run the default Helm chart, the Operator will fail because it cannot pull the container images from `nvcr.io` (the NVIDIA container registry).

**The Private Registry Architecture:**
1.  You must sync all required Operator images (Driver, Toolkit, Device Plugin, DCGM, NFD, GFD) into your internal, secured image registry (e.g., JFrog Artifactory, AWS ECR).
2.  You must configure the Helm chart to point to your internal registry.

```yaml
# production-values.yaml
repository: internal-registry.company.com/nvidia
imagePullSecrets:
  - name: internal-registry-secret
```

## 2. Managing the Driver Container

The driver container is the most complex configuration point. 
If your nodes are running a secure, immutable OS (like Talos Linux) that does not allow dynamic compilation, you must disable the driver compilation entirely.

```yaml
driver:
  enabled: false # We baked the driver into the OS image.
```

If you *are* using the Operator to manage drivers dynamically, you must lock down the specific version to prevent unintended upgrades during pod restarts. 
```yaml
driver:
  version: "535.104.05" # Never use 'latest' in production.
```

## 3. Toolkit and CDI Configuration

As discussed in Chapter 3, the modern standard for device injection is CDI (Container Device Interface). The GPU Operator can configure this automatically, but it must be explicitly enabled.

```yaml
toolkit:
  env:
    - name: ACCEPT_NVIDIA_VISIBLE_DEVICES_ENVVAR_WHEN_UNPRIVILEGED
      value: "false" # Security: Prevent non-privileged containers from seeing GPUs via legacy env vars.
  installDir: /usr/local/nvidia # Where to place the CDI JSON files.
```

## 4. Time-Slicing Configuration (Preview)

Often, developers just need a tiny fraction of a GPU to test a small model or run a Jupyter notebook. Giving them a full 80GB H100 is a massive waste of money. 
The GPU Operator can configure the Device Plugin to "lie" to Kubernetes and advertise multiple virtual GPUs for every physical GPU. (This is called Time-Slicing, covered extensively in Volume 11).

You can define a ConfigMap with the sharing strategy, and point the Operator to it:

```yaml
devicePlugin:
  config:
    name: time-slicing-config # Points to a ConfigMap
    default: any # The default profile to apply
```

## Customer Scenario (Senior Level)

**The Situation:**
A defense contractor is deploying a Kubernetes cluster in a strict, air-gapped environment. They successfully mirrored all GPU Operator images into their internal registry and applied the Helm chart. The Operator Pod starts, but the `nvidia-driver-daemonset` Pods fail to compile the kernel modules. The logs show the driver container attempting to reach `archive.ubuntu.com` to download kernel headers and timing out. 

**The Senior Architect Response:**
"You have successfully air-gapped the container images, but you forgot to air-gap the OS dependencies required by the dynamic driver compilation process.

When the GPU Operator's driver container starts on an Ubuntu node, it attempts to use `apt` to download the specific kernel headers (e.g., `linux-headers-$(uname -r)`) required to compile the `nvidia.ko` module. Because the environment is air-gapped, `apt` cannot reach the public internet, and compilation fails.

To fix this, we have two secure architectural choices:
1.  **Configure Internal Mirrors:** We must configure the driver container to use an internal Ubuntu package mirror. We can pass a custom `sources.list` into the driver container via a ConfigMap or Helm values.
2.  **Precompiled Driver Containers:** Instead of compiling dynamically, NVIDIA provides pre-compiled driver container images for specific OS and kernel versions (e.g., `driver:535.104.05-ubuntu22.04`). If we pull this specific pre-compiled image into our internal registry, the driver container will skip the `apt` download entirely and simply load the pre-built modules into the host kernel."

## Interview Preparation

**Conceptual:** Why is running `helm install gpu-operator` with default values unacceptable in a highly secure enterprise environment? *(Hint: Default values attempt to pull container images from the public internet (`nvcr.io`), which fails in air-gapped environments. They also dynamically download kernel headers from public OS repositories. Production deployments require pointing the Helm chart to internal image registries and strictly pinning driver versions).*

**Architecture:** If you bake the NVIDIA driver directly into your immutable machine image (AMI), what critical change must you make to the GPU Operator Helm values? *(Hint: You must explicitly set `driver.enabled=false`. If you do not, the Operator will attempt to deploy a driver container that will conflict with the host-installed driver, causing kernel module crashes).*
