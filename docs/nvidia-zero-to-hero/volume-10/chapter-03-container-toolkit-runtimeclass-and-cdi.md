---
title: "Chapter 3 — Container Toolkit, RuntimeClass, and CDI"
sidebar_position: 3
description: "Master the data plane. Learn how the NVIDIA Container Toolkit pierces container isolation to expose physical GPUs safely."
---

# Chapter 3 — Container Toolkit, RuntimeClass, and CDI

| Chapter metadata | Value |
|---|---|
| Volume | 10 — Kubernetes GPU Platform Layer |
| Difficulty | Advanced |
| Estimated reading time | 35 minutes |
| Primary audience | Platform Engineers, DevSecOps |
| Core question | A container is designed to isolate an application from the host hardware. How do we securely break that isolation to pass a 700W GPU into a pod? |

## Introduction

Containers (like Docker or containerd) are built on Linux `namespaces` and `cgroups`. Their primary design goal is absolute isolation. A process inside a container should not be able to see the host's filesystem, network, or hardware devices.

GPUs are physical hardware devices represented as character files on the host OS (e.g., `/dev/nvidia0`). 

If you run a standard container, the isolation mechanisms prevent the container from seeing `/dev/nvidia0`. Furthermore, to execute CUDA code, the container needs the user-space NVIDIA driver libraries (`libcuda.so`), which exist on the host, not inside the container image.

We need a mechanism to securely pierce the container boundary, mount the correct device files, and inject the necessary driver libraries. This is the job of the **NVIDIA Container Toolkit**.

## 1. The NVIDIA Container Toolkit

The NVIDIA Container Toolkit is a set of tools that wraps the standard container runtime (`runc` or `crun`) and intercepts the container creation process.

Before the toolkit, developers had to manually mount devices and libraries:
`docker run --device /dev/nvidia0 --volume /usr/lib64/libcuda.so:/usr/lib64/libcuda.so my-image`
This was brittle, insecure, and completely unscalable in Kubernetes.

With the toolkit, you simply specify that you want GPUs, and the toolkit dynamically discovers the correct devices and mounts the necessary libraries into the container at startup.

## 2. Kubernetes RuntimeClass

In a Kubernetes environment, you don't use `docker run`. You submit a Pod YAML. How does the kubelet know to use the NVIDIA-modified runtime instead of the standard runtime?

Historically, platform engineers set the `default-runtime` in the `containerd` configuration to `nvidia`. This meant *every* container on the node used the NVIDIA wrapper, even standard CPU-only pods like CoreDNS. This was an unnecessary overhead.

The modern architectural standard is **RuntimeClass**. 
You configure `containerd` to have multiple runtimes available. 
In your Pod YAML, you specify:
```yaml
spec:
  runtimeClassName: nvidia
```
The kubelet reads this and tells `containerd`: "For this specific pod, do not use the standard `runc`. Use the `nvidia-container-runtime` wrapper." This ensures that only GPU workloads invoke the hardware-injection logic.

## 3. The Future: Container Device Interface (CDI)

While RuntimeClass and the `nvidia-container-runtime` wrapper work well, they require modifying the host's `containerd` configuration. This violates the philosophy of decoupled infrastructure.

The Cloud Native Computing Foundation (CNCF) introduced the **Container Device Interface (CDI)** as the vendor-agnostic standard for device injection.

With CDI, you do not need a custom runtime wrapper. 
Instead, a program on the host generates a JSON file (the CDI specification) that describes exactly how to inject the GPU (which `/dev` files to mount, which `.so` libraries to inject). 

When Kubernetes requests a GPU, the standard, unmodified `containerd` simply reads the CDI JSON file and follows the instructions to mount the devices. CDI eliminates the need to alter the core container runtime configuration, making GPU clusters vastly more stable and standardized.

## Customer Scenario (Senior Level)

**The Situation:**
A security team mandates an immediate upgrade of the `containerd` package across the entire Kubernetes fleet to patch a critical CVE. The platform team runs an automated Ansible playbook to `apt-get upgrade containerd` and restart the service on all GPU nodes. Ten minutes later, all GPU pods in the cluster crash and enter a `CrashLoopBackOff` state. The pods are failing with errors stating that the NVIDIA driver libraries cannot be found.

**The Senior Architect Response:**
"The automated upgrade of the `containerd` package overwrote the custom `/etc/containerd/config.toml` file, erasing the configuration that pointed `containerd` to the `nvidia-container-runtime`. 

When the service restarted, `containerd` reverted to using the default `runc`. Without the NVIDIA runtime wrapper, the container isolation mechanics are operating exactly as designed: they are blocking the pods from accessing the host's `/dev/nvidia*` devices and driver libraries. 

To restore service immediately, we must restore the modified `config.toml` and restart `containerd`. 

However, structurally, this incident proves that modifying the core container runtime configuration is brittle and prone to human or automation error. Our long-term architectural fix is to migrate to **CDI (Container Device Interface)**. By moving to CDI, we remove the custom runtime wrapper entirely. Standard `containerd` will use standard `runc`, and the GPU injection will be handled dynamically via CDI JSON specifications, completely isolating our AI capabilities from routine OS-level package upgrades."

## Interview Preparation

**Conceptual:** Why does a container need the NVIDIA Container Toolkit to access a GPU? *(Hint: Standard containers isolate the application from the host hardware (namespaces/cgroups). The toolkit securely pierces this isolation to mount the physical character devices (e.g., `/dev/nvidia0`) and inject the host's user-space driver libraries (like `libcuda.so`) into the container at startup).*

**Architecture:** Explain the transition from `nvidia-container-runtime` to CDI (Container Device Interface). *(Hint: The older method required modifying the global `containerd` configuration to use a custom NVIDIA wrapper, which was brittle during OS upgrades. CDI is a CNCF standard that allows standard, unmodified `containerd` to inject devices simply by reading a JSON specification file, making the architecture vendor-agnostic and highly resilient).*
