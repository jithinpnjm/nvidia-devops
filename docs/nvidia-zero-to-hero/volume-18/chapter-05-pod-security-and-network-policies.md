---
title: "Chapter 5 — Pod Security and Network Policies"
sidebar_position: 5
description: "Lock down the runtime. Learn how to prevent container escapes, restrict network lateral movement, and enforce Pod Security Standards."
---

# Chapter 5 — Pod Security and Network Policies

| Chapter metadata | Value |
|---|---|
| Volume | 18 — Security, Compliance, and Confidential Computing |
| Difficulty | Expert |
| Estimated reading time | 30 minutes |
| Primary audience | DevSecOps, Kubernetes Administrators |
| Core question | If a hacker gains shell access inside a Jupyter notebook pod, how do you mathematically guarantee they cannot access the host file system or ping the database? |

## Introduction

In Chapter 4, we secured the Kubernetes API (the Control Plane). But what happens if an attacker doesn't attack the API? What if they exploit a vulnerability inside an application running on the cluster (the Data Plane)?

If a user uploads a malicious payload to an AI inference endpoint, and that payload exploits a bug in PyTorch to gain a reverse shell, the attacker is now inside a container running on your GPU node.

If you have not implemented strict **Pod Security Standards** and **Network Policies**, that attacker can easily escape the container, gain root access to the host server, and move laterally across the network to steal data from other departments.

## 1. Pod Security Admission (PSA)

By default, Docker and Kubernetes are dangerously permissive. A pod can ask to run as the `root` user, mount the host's `/etc` directory, or use the host's networking namespace. 

Historically, this was managed by PodSecurityPolicies (PSP), but those are deprecated. The modern standard is **Pod Security Admission (PSA)**.

PSA allows you to apply strict security profiles to entire namespaces:
1.  **Privileged:** Completely open. (Reserved exclusively for the `gpu-operator` and infrastructure agents).
2.  **Baseline:** Prevents known privilege escalations.
3.  **Restricted:** The absolute strictest standard. Forces pods to run as non-root users, drops all Linux capabilities, and prevents privilege escalation. 

*Architectural Mandate:* Every namespace hosting data science workloads or inference APIs must be labeled with `pod-security.kubernetes.io/enforce: restricted`.

## 2. Linux Capabilities and Root

Containers do not need to run as `root`. 
If an attacker gains a shell in a container running as `root`, it is trivial to exploit kernel vulnerabilities to escape to the host.

A Senior Architect enforces two rules in the Pod YAML:
```yaml
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
```
This mathematically removes the Linux capabilities required to break out of the container. 

## 3. Network Policies (Micro-Segmentation)

By default, in Kubernetes, any pod can communicate with any other pod across the entire cluster. 
If the HR chatbot pod is compromised, the attacker can use it to ping and port-scan the Finance database pod. 

You must deploy a CNI (Container Network Interface) that supports **NetworkPolicies** (e.g., Calico or Cilium).

A NetworkPolicy acts as a micro-firewall applied directly to a pod.
You operate on a **Default Deny** architecture. You write a policy that explicitly blocks all ingress and egress traffic for a namespace. Then, you write specific rules to punch tiny holes in the firewall. 

*   *Rule:* The `triton-inference` pod is only allowed to accept incoming TCP traffic on port 8000 from the `api-gateway` pod. It is only allowed to initiate outbound traffic to the `s3-storage` endpoint.
If the pod is compromised, the attacker cannot ping the internet, and they cannot scan the cluster. They are trapped.

## Customer Scenario (Senior Level)

**The Situation:**
A financial services firm runs a shared Kubernetes cluster. A data scientist in the `quant-research` namespace runs a Jupyter notebook. To install a custom Python package, they configure their Pod YAML to run as `privileged: true`. The next day, the InfoSec team detects that the underlying GPU worker node has been compromised, and proprietary model weights from a different namespace have been exfiltrated. The CISO demands to know how the isolation failed.

**The Senior Architect Response:**
"The isolation failed because we allowed a user to dictate their own security posture, effectively turning a container into a rootkit.

A container is not a virtual machine; it shares the host's Linux kernel. When a Pod is launched with `privileged: true`, all isolation mechanisms (namespaces, cgroups, AppArmor/SELinux profiles) are disabled. The process inside the container is granted absolute root authority over the physical host server. 

The data scientist, or an attacker who compromised their notebook, leveraged this privileged access to mount the host's root filesystem, traverse into the data directories of other tenants, and steal the proprietary model weights.

To ensure this never happens again, we must implement **Pod Security Admission (PSA)** at the cluster level.

We will configure the Kubernetes API server to strictly enforce the `Restricted` security standard on all user namespaces. If a user attempts to submit a Pod YAML containing `privileged: true` or requesting to run as the root user, the Kubernetes API server will instantly reject the deployment and throw an error. By enforcing security controls at the orchestration layer, we physically prevent users from bypassing the container isolation mechanisms, securing the host kernel from compromise."

## Interview Preparation

**Conceptual:** Why is running a container as the `root` user considered a severe security risk in a multi-tenant Kubernetes cluster? *(Hint: Containers share the underlying host's Linux kernel. While namespaces provide some isolation, a process running as root inside a container has a vastly larger attack surface to exploit kernel vulnerabilities (e.g., container escape exploits). If they break out, they gain root access to the physical server and all other containers running on it. Pods should always run with `runAsNonRoot: true`).*

**Architecture:** Explain the concept of a "Default Deny" NetworkPolicy in Kubernetes. *(Hint: By default, Kubernetes allows all pods to communicate with each other. A Default Deny policy is a rule applied to a namespace that blocks all incoming and outgoing network traffic. Once applied, an architect must write specific 'allow' rules to permit only the exact required communication paths (e.g., allowing an API gateway to talk to an inference pod). This drastically limits the lateral movement of an attacker if a pod is compromised).*
