---
title: "Chapter 3 — Security & Governance Masterclass"
sidebar_position: 3
description: "Design secure AI infrastructure. Map identity trust boundaries, data provenance, model security, and multi-tenant isolation."
---

# Chapter 3 — Security & Governance Masterclass

| Chapter metadata | Value |
|---|---|
| Volume | 08 — Architecture, Strategy, and Technical Leadership |
| Difficulty | Advanced |
| Estimated reading time | 25 minutes |
| Primary audience | Security Architects, DevSecOps, Platform Engineers |
| Core question | When your GPU cluster processes highly classified corporate IP and PII, how do you mathematically guarantee data isolation and control? |

## Introduction

AI infrastructure breaks traditional enterprise security models. 

Standard web applications have clear boundaries: Web Tier, App Tier, Database Tier. AI workloads are different. A single Python script might require deep kernel-level access to hardware drivers, pull massive unstructured datasets from network storage, and execute untrusted model weights downloaded from the public internet.

If you treat a GPU cluster like a standard web server, you will be breached. A Senior Architect must map precise trust boundaries, enforce strict data provenance, and design observability systems that do not accidentally leak sensitive training data.

## 1. Mapping Trust Boundaries and Identities

Security begins by identifying every actor (human and machine) and mapping their explicit blast radius.

**The Identity Matrix:**
*   **The Platform Admin:** Manages the Kubernetes/Slurm control plane and physical nodes. Needs root/cluster-admin access.
*   **The Data Scientist / Developer:** Needs access to submit workloads and view logs, but must *never* have SSH access to physical nodes or cluster-admin rights.
*   **The CI/CD Pipeline:** The only entity allowed to build container images, scan model weights for malware, and deploy to production namespaces.
*   **The Workload (Service Account):** The running pod itself. It should only have the exact IAM roles required to read its specific S3 bucket—nothing else.
*   **The Model Serving Client:** End-users querying the API. Authenticated via API gateways (OIDC/OAuth).

### Separation of Planes
You must physically and logically separate the network traffic:
1.  **The Control Plane Network:** Where Kubernetes API traffic and SSH live. Highly restricted.
2.  **The Data Plane Network:** Where GPUs exchange tensors (e.g., InfiniBand/RoCE). Should have zero internet access.
3.  **The Storage Network:** Dedicated paths to parallel file systems.

## 2. Multi-Tenancy and GPU Isolation

When multiple teams (e.g., HR, Finance, and R&D) share a GPU cluster, tenancy design is the core security architecture.

| Isolation Strategy | Security Posture | Trade-off |
|---|---|---|
| **Time-Slicing / Shared GPU** | **Weak.** Processes share the exact same GPU memory space. A malicious user could potentially read another user's VRAM. | High utilization, lowest security. Unacceptable for mixed-classification data. |
| **Multi-Instance GPU (MIG)** | **Strong.** Hardware-level isolation of memory and compute. A crash in MIG A cannot affect MIG B. | Strict security, but limits maximum model size to the MIG partition size. |
| **Physical Node Separation** | **Absolute.** Finance jobs run on Node X. HR jobs run on Node Y. Taints and Tolerations enforce this. | Guaranteed security. Results in lower overall hardware utilization (TCO penalty). |

A Senior Architect explicitly asks the business: *"Are you willing to pay a 20% utilization penalty to physically guarantee the Finance data is isolated from the R&D team?"* 

## 3. The Observability Privacy Trap

In traditional infrastructure, you log everything. In AI infrastructure, logging everything is a massive security breach.

AI services process raw human prompts, PII, and retrieved corporate data (RAG). If your model serving engine (like vLLM) logs every incoming payload, and those logs are shipped to Datadog or Elasticsearch, you have just leaked classified company data into your monitoring stack.

**The Rule:** Observability design is part of privacy architecture. You must implement log scrubbing at the edge, disable payload logging on production inference servers, and tightly control Role-Based Access Control (RBAC) to the logging systems.

## Customer Scenario (Senior Level)

**The Situation:**
A healthcare company is deploying an on-premises GPU cluster to train models on patient records. The data science team demands root access to the Docker daemon on the GPU nodes so they can quickly install Python dependencies and debug CUDA memory errors.

**The Senior Architect Response:**
"Granting root or Docker daemon access to data scientists on production nodes violates every fundamental principle of zero-trust architecture and regulatory compliance. 

If a user can talk to the Docker socket, they have root access to the entire host. They can mount the host filesystem, extract TLS certificates, and read the persistent volumes of other tenants.

We will implement a strict CI/CD perimeter. 
Data scientists will commit their `requirements.txt` and code to a Git repository. 
The CI pipeline will build the container, execute malware scans on any downloaded HuggingFace models, and push the artifact to a private, signed registry. 
The Kubernetes control plane (via GitOps/ArgoCD) will deploy the container with `securityContext: runAsNonRoot`. 

If the data scientists need to debug CUDA errors, we will route the `dmesg` and DCGM GPU metrics into a centralized, sanitized Grafana dashboard. They will have full visibility into the physics of the GPU, but zero interactive shell access to the host. We protect the patient data by completely removing human hands from the production servers."

## Interview Preparation

**Conceptual:** Why is time-slicing GPUs dangerous in a multi-tenant environment processing classified data? *(Hint: Time-slicing shares the same physical VRAM across multiple processes. It lacks hardware-level memory protection, creating a theoretical vector for one tenant to read another tenant's data. You must use MIG or physical node isolation for classified workloads).*

**Architecture:** How do you secure the model supply chain before deploying an open-source LLM? *(Hint: Never pull directly from the public internet to a production node. Use a CI/CD pipeline to download the model, run security scans (like `safetensors` validation) to ensure arbitrary code execution payloads aren't embedded in the weights, and store the validated model in a private, internal artifact registry).*
