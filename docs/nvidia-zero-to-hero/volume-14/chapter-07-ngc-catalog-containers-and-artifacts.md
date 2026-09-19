---
title: "Chapter 7 — NGC Catalog, Containers, and Artifacts"
sidebar_position: 7
description: "Navigate the NVIDIA GPU Cloud (NGC) ecosystem. Learn how to securely pull and manage NVAIE-certified containers in air-gapped environments."
---

# Chapter 7 — NGC Catalog, Containers, and Artifacts

| Chapter metadata | Value |
|---|---|
| Volume | 14 — NVIDIA AI Enterprise & NIM Architecture |
| Difficulty | Intermediate |
| Estimated reading time | 25 minutes |
| Primary audience | DevOps, SREs, Kubernetes Administrators |
| Core question | If DockerHub limits pulls, and GitHub is blocked by the corporate firewall, how do you securely get NVIDIA software into your data center? |

## Introduction

In an enterprise environment, downloading software directly from the public internet onto a production server is an immediate firing offense. 

Production environments are air-gapped or strictly firewalled. All software must originate from a secure, authenticated, and verifiable source. For NVIDIA AI Enterprise (NVAIE) software, that source is the **NVIDIA GPU Cloud (NGC)**.

NGC is not a cloud hosting provider (like AWS or Azure). NGC is a massive software repository (a registry) containing highly optimized Docker containers, Helm charts, Pre-trained Models, and SDKs.

## 1. The Two Halves of NGC

A Senior Architect must understand that NGC is split into two distinct catalogs, governed by different rules:

1.  **The Public NGC Catalog (`nvcr.io/nvidia`):**
    *   This is free and open to everyone.
    *   It contains community-supported containers (e.g., standard PyTorch, standard Triton).
    *   *Architectural Warning:* These images change rapidly and do not come with enterprise SLAs or guaranteed long-term security patching.
2.  **The NVAIE Private Registry (`nvcr.io/nvaie`):**
    *   This is completely locked. You can only access it if you have purchased an NVAIE software license.
    *   It contains the strictly certified, Long-Term Support (LTS) versions of the software.
    *   It requires an **NGC API Key** specifically linked to an active NVAIE entitlement.

## 2. Managing the Air-Gap (Image Mirroring)

You cannot configure your production Kubernetes cluster to pull `nvcr.io/nvaie/tritonserver` directly from the internet. 

**The Production Workflow:**
1.  A DevOps engineer authenticates to `nvcr.io` from a secure bastion host using the NVAIE API Key.
2.  The engineer pulls the certified Docker image, the NIM container, and the required Helm charts.
3.  The engineer pushes those images into the company's internal, secure image registry (e.g., JFrog Artifactory, Sonatype Nexus, or AWS ECR).
4.  The internal security scanners (e.g., Trivy or Prisma Cloud) scan the images for CVEs.
5.  The Kubernetes cluster is configured to pull the images exclusively from the internal registry.

## 3. Pre-Trained Models on NGC

NGC is not just for software containers; it hosts massive pre-trained models (like Llama-3, Nemotron, etc.).

When building a NIM pipeline (as discussed in Chapter 4), you must mirror these model weights internally. 
NVIDIA provides a dedicated CLI tool (`ngc registry model download-version`) to pull these terabyte-scale models efficiently. You run this CLI tool on a bastion host, download the model, and then push the raw files to your internal parallel file system (e.g., Lustre or a private S3 bucket) so that the NIM containers can mount the cache volume internally without requiring internet access.

## Customer Scenario (Senior Level)

**The Situation:**
A government agency purchases an NVAIE license. They deploy the GPU Operator onto their strictly air-gapped Kubernetes cluster. They manually downloaded the GPU Operator Helm chart from NGC and applied it. The Operator pod starts, but all the subsequent DaemonSets (Driver, Toolkit, Device Plugin) fail with `ErrImagePull`. The network team confirms the cluster has absolutely zero internet access.

**The Senior Architect Response:**
"The deployment has failed because the architecture attempted to dynamically pull container images from a public endpoint across an air-gapped boundary.

While you successfully downloaded the initial Helm chart manually, you failed to override the default image repository values within the `values.yaml` file. By default, the GPU Operator Helm chart is hardcoded to pull its Operand images (like the driver container) directly from `nvcr.io/nvaie`. Because the cluster is air-gapped, the Kubernetes kubelet cannot reach `nvcr.io`, resulting in the `ErrImagePull` state.

To remediate this, we must execute a full image mirroring strategy. 
We will use a bastion host with internet access to pull the exact versions of the GPU Operator images, the Driver image, the Toolkit image, and the Device Plugin image from the NGC NVAIE registry. We will then `docker save`, transfer the tarballs across the air-gap, and `docker load` them into the agency's internal, secured image registry. 

Finally, we will edit the GPU Operator's `values.yaml` to point the `repository` fields to the internal registry URL. The Helm upgrade will force the Operator to pull the images locally, resolving the issue and bringing the GPU hardware online securely."

## Interview Preparation

**Conceptual:** What is the difference between `nvcr.io/nvidia` and `nvcr.io/nvaie`? *(Hint: The former is the public NGC catalog containing free, community-supported images. The latter is the private NVAIE registry containing certified, enterprise-supported, Long-Term Support (LTS) images, requiring a paid license and API key to access).*

**Architecture:** Explain the architectural workflow for deploying a NIM container into an air-gapped Kubernetes cluster. *(Hint: The cluster cannot reach the internet to pull the container image or the massive model weights. A DevOps engineer must use an NGC API key to pull the NIM Docker image and the raw model weights onto an internet-connected bastion host. The image is pushed to an internal, secure container registry. The model weights are transferred to an internal storage array. The Kubernetes deployment is then configured to pull the image from the internal registry and mount the model weights via a local Persistent Volume).*
