---
title: "Master Index"
slug: "master-index"
sidebar_position: 1
description: "Curriculum map and guided learning flow for the NVIDIA Senior DevOps and AI Infrastructure Solutions Architect Academy."
source_document: "00_Master_Index.docx"
---
**VOLUME MASTER**

**Master Index**

Fourth Edition curriculum — Senior Engineering Expansion

> **New to one or more domains? Do not begin with the senior deep dives.** Start with **[Volume 0: Foundations Primer](/curriculum/volume-00/1-how-to-use-this-book-evidence-not-proof)** — ten chapters that build every mental model (Linux, networking, storage, containers/Kubernetes, NVIDIA GPU/CUDA, AI/ML, HPC, security, Python) from zero, in plain language, before Volumes 1-10 use that vocabulary at speed. The [Foundation learning path](./02-foundation-learning-path.md) is the route map sequencing Volume 0 alongside Volumes 1-10 and the readiness gates for entering each at the right level. Senior professional experience does not imply prior Linux-kernel, Python, NVIDIA GPU, AI/ML, or HPC knowledge.

## How the curriculum is now layered

```text
FOUNDATION BRIDGE
systems language → Python starter lab → AI/GPU/HPC language
        ↓
CORE CHAPTERS
normal path → vocabulary → observation → guided practice
        ↓
OPERATIONAL PRACTICE
failure boundaries → troubleshooting → safe changes
        ↓
SENIOR DEPTH
architecture → scale → trade-offs → customer/interview scenarios
```

Use the core chapters to learn a technology. Use senior deep dives only after you can explain and observe its normal path. Volume 9 tests communication and Volume 10 integrates many layers; neither should be used as the first explanation of those layers.

### Start with these bridges

| If this feels unfamiliar | Study first |
|---|---|
| Processes, memory, files, ports, DNS, systemd, permissions | [Volume 0, Chapters 1-3](/curriculum/volume-00/1-how-to-use-this-book-evidence-not-proof) (compressed reference: [Systems foundation](./03-systems-foundation.md)), then Volume 1 core chapters |
| Storage, filesystems, mounts, local vs. shared/network storage | [Volume 0, Chapter 10](/curriculum/volume-00/10-storage-and-filesystem-fundamentals-before-volume-1-and-6), then Volume 1 Chapter 3 or Volume 6 Chapter 6 |
| Python syntax, tracebacks, files, functions, tests | [Volume 0, Chapter 9](/curriculum/volume-00/9-python-fundamentals-before-the-labs) (hands-on companion: [Python foundation lab](./05-python-foundation-lab.md)), then Volume 2 Chapters 1–8 |
| Containers, Kubernetes objects, reconciliation | [Volume 0, Chapter 4](/curriculum/volume-00/4-containers-and-kubernetes-fundamentals-before-volume-3), then Volume 3 core chapters |
| Training, inference, CUDA, GPU memory, NCCL, MPI, Slurm, RDMA | [Volume 0, Chapters 5-7](/curriculum/volume-00/5-nvidia-gpu-and-cuda-fundamentals-before-volume-4) (compressed reference: [AI, GPU and HPC foundation](./04-ai-gpu-hpc-foundation.md)), then Volumes 4–6 |
| Linux/cluster security, SELinux/AppArmor, patch risk | [Volume 0, Chapter 8](/curriculum/volume-00/8-linux-and-cluster-security-fundamentals-before-volume-10), then Volume 10 Chapter 3 |
| How to choose an order | [Foundation learning path](./02-foundation-learning-path.md) |


<!-- source-table:1 -->

> Fourth Edition - Rebuilt as a teaching text, not an annotated checklist


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> What changed in this rebuild The series was rewritten around teaching. Concepts are explained before “why it matters.” Code is copyable. Visuals are original diagrams. Scenarios show the reasoning path step by step. Practitioner material and Udemy/Coursera/NVIDIA references appear as reinforcement after the teaching, not as substitutes for it.


<!-- source-table:3 -->

| Volume | Focus | Study style |
| --- | --- | --- |
| 1 | Linux, memory, storage, networking, containers | mechanism -> commands -> evidence -> scenario |
| 2 | Python for production infrastructure | code-first worked examples -> failure -> tests -> capstone |
| 3 | Kubernetes and platform engineering | control loops -> scheduling/network/storage -> troubleshooting |
| 4 | GPU foundations | hardware/software stack -> Operator -> sharing -> health |
| 5 | AI workloads | training/inference mechanics -> serving -> scaling -> state |
| 6 | HPC/network/storage | distributed data path -> RDMA -> fabric -> storage -> scheduler |
| 7 | Observability/reliability | question -> evidence -> hypothesis -> experiment |
| 8 | Solutions architecture | discovery -> constraints -> options -> trade-offs -> recommendation |
| 9 | Interview preparation | reasoning structure -> coding -> architecture -> customer scenarios |
| 10 | Bare-metal and HPC operations | BMC/BCM -> OS/IaC -> Slurm/MPI/containers -> fleet change |


# Guided tutor flow

TEACH mode should present one coherent block from the current chapter and stop. The learner reads, runs examples and asks doubts. When the learner says ready, the tutor tests that block one question at a time, corrects gaps, and then presents the next block. REFRESH and INTERVIEW modes can sample already-studied material randomly.

![](pathname:///img/generated/intro-01.png)

The later volumes reuse the same disciplined decision loop: requirements and evidence before recommendation.


<!-- source-table:4 -->

> FOURTH EDITION — CONTENT-RICH SENIOR ENGINEERING EXPANSION


This edition retains the readable Fourth Edition and adds substantial senior-level depth to every volume. It deliberately avoids priority labels or a prescriptive interview study order. The material is organized as a reference curriculum; study it in whichever sequence fits your preparation.


<!-- source-table:5 -->

| Volume | Fourth Edition additions |
| --- | --- |
| 1 — Foundations | syscalls/scheduling, cgroup CPU, NUMA, memory pressure, VFS/block I/O, packet/conntrack/TCP path, GPU-host readiness |
| 2 — Python | domain models, config validation, resilient API clients, bounded concurrency, subprocess safety, structured logs, testing, profiling, GPU-fleet CLI |
| 3 — Kubernetes | API machinery, etcd, DRA, preemption/eviction, kubelet/CRI, dataplane/DNS/Gateway API, admission/policy, GPU node lifecycle |
| 4 — GPU | execution/memory model, topology, driver/container stack, GPU Operator internals, MIG/sharing, DCGM/Xid/ECC, fleet lifecycle |
| 5 — AI workloads | training parallelism, LLM prefill/decode/KV, NIM/engines, Dynamo/disaggregated serving, inference autoscaling, RAG/agents, benchmarking |
| 6 — HPC/network/storage | collectives/NCCL, RDMA/RoCE/IB, GPUDirect, fabric design, storage hierarchy, Slurm, Enroot/Pyxis/BCM, hybrid scheduling |
| 7 — Observability | SLO/USE/RED, Prometheus cardinality/query cost, OTel, DCGM, inference metrics, evidence-tree incidents, alert design and game days |
| 8 — SA practice | workload discovery, AI factory architecture, capacity/TCO, PoC design, security/governance, product/scheduler decisions, executive communication |
| 9 — Interview | senior answer method, Linux/Python/K8s/GPU/AI/network question banks, architecture/customer drills and current NVIDIA role-family signals |


# Source architecture

Technical authority: current official NVIDIA, Kubernetes and Python documentation. Practitioner scope signals: public posts and job-family material from NVIDIA Solutions Architects, especially Vishakha Sadhwani, plus public NVIDIA SA/hiring material on GPU Kubernetes, inference and AI factory architecture. Teaching reinforcement: targeted Udemy lecture sections rather than entire courses. Internal breadth source: your Staff Engineer study guide repository, especially Kubernetes, platform patterns, observability, databases/storage and distributed-log material.
