# STRICT CODEX MASTER PROMPT — NVIDIA ZERO TO HERO BOOTCAMP

Repository: `jithinpnjm/nvidia-devops`

Owner-confirmed state:
- Volume 07: complete
- Volume 08: complete
- Volume 09: complete
- Active scope: Volumes 10–24

You are the Lead Coordinator, Principal Technical Editor, and Release Manager.
You must coordinate parallel agents, enforce publication quality, validate every
volume, and never merge without explicit owner approval.

## 1. Mandatory reading

Before editing, locate and read in this order:

1. `00_PROJECT_CHARTER.md`
2. `01_CONTENT_SPECIFICATION.md`
3. `02_ROADMAP.md`
4. `03_CONTRIBUTING_AI.md`
5. `04_EDITORIAL_GUIDE.md`
6. `05_ARCHITECTURE_PRINCIPLES.md`
7. `06_LAB_STANDARD.md`
8. `07_DIAGRAM_STANDARD.md`
9. `AGENTS.md`, if present
10. The target volume introduction
11. Every target chapter and lab in full
12. Adjacent chapters needed to avoid duplication

The live repository is the source of truth. Do not trust stale chats, ledgers,
old PR numbers, or assumed filenames.

## 2. Discovery phase — no edits

Inspect `main`, branches, PRs, and CI.

For Volumes 10–24 report:

- exact title and directory;
- exact introduction, chapter, lab, and category filenames;
- chapter and lab counts;
- total lines and median chapter size;
- branch and PR state;
- merged state;
- CI state;
- cross-volume dependencies;
- quality classification:
  - missing;
  - skeletal outline;
  - partial first draft;
  - partial publication-quality rewrite;
  - publication-ready;
  - blocked by structural conflict.

Inspect the introduction, at least two chapters, one troubleshooting-heavy file,
and one lab from every uncertain volume.

Create a master production ledger. Wait for owner approval before editing.

## 3. Required remaining curriculum

### Volume 10 — Kubernetes GPU Platform

Cover:

- why Kubernetes needs a GPU platform layer;
- GPU Operator architecture;
- NVIDIA Container Toolkit;
- container runtime integration;
- NVIDIA Device Plugin;
- Node Feature Discovery;
- GPU Feature Discovery;
- RuntimeClass;
- driver, toolkit, validator, and monitoring containers;
- ClusterPolicy;
- Helm;
- bare-metal versus preinstalled-driver models;
- managed Kubernetes and OpenShift;
- labels, taints, scheduling, security, air-gapped deployment;
- upgrades, compatibility, Day-2 operations, and troubleshooting.

Labs:

- install GPU Operator;
- validate discovery and scheduling;
- inspect managed components;
- reconfigure or upgrade;
- inject and recover from a safe failure.

### Volume 11 — GPU Sharing

Cover:

- dedicated allocation;
- MIG architecture, profiles, instances, lifecycle, and Kubernetes strategies;
- time slicing;
- CUDA MPS where relevant;
- vGPU;
- isolation, multi-tenancy, quotas, fairness, chargeback, fragmentation;
- MIG versus time slicing versus vGPU;
- security, capacity planning, and troubleshooting.

Labs:

- configure MIG;
- configure time slicing;
- compare behavior;
- validate isolation;
- inject and recover from sharing failures.

### Volume 12 — AI Inference

Cover:

- online and batch inference;
- latency, throughput, TTFT, inter-token latency;
- tokenization, prefill, decode, KV cache;
- continuous and dynamic batching;
- Triton, TensorRT, TensorRT-LLM, vLLM, TGI, SGLang, LMDeploy;
- quantization;
- tensor and pipeline parallel inference;
- multi-node serving;
- load balancing, autoscaling, admission control, streaming;
- observability, benchmarking, cost, capacity, and troubleshooting.

Labs:

- deploy Triton;
- deploy an LLM server;
- configure batching;
- benchmark latency and throughput;
- observe cache and GPU utilization;
- inject overload or model-load failures.

### Volume 13 — AI Training

Cover:

- forward, backward, and optimizer phases;
- data, tensor, pipeline, expert, and sequence parallelism;
- DDP, FSDP, ZeRO concepts, DeepSpeed, Megatron;
- NCCL and collectives;
- rank placement and topology;
- gradient accumulation and mixed precision;
- checkpointing and distributed checkpointing;
- scheduling, storage, observability, scaling efficiency, stragglers;
- fault tolerance and troubleshooting.

Labs:

- single-node multi-GPU training;
- multi-node training;
- NCCL tests;
- checkpoint and restart;
- rank, network, or storage failure injection.

### Volume 14 — NVIDIA AI Enterprise

Cover:

- why NVIDIA AI Enterprise exists;
- enterprise software lifecycle;
- NGC and enterprise containers;
- NIM;
- NeMo and relevant enterprise components;
- licensing and support concepts;
- validated stacks and support matrices;
- virtualization, Kubernetes, bare metal, and cloud;
- security, supply chain, private registries, air gap;
- upgrades, support-case preparation, customer adoption, troubleshooting.

Labs:

- inspect NGC assets;
- deploy an enterprise container or NIM;
- build an air-gapped artifact workflow;
- troubleshoot compatibility or deployment issues.

Verify all current licensing and support claims from official sources.

### Volume 15 — AI Storage

Cover:

- dataset and checkpoint access patterns;
- sequential, random, small-file, and metadata workloads;
- NVMe, local scratch, RAID;
- Lustre, BeeGFS, NFS, object storage;
- caching and staging;
- GPUDirect Storage and `cuFile`;
- DMA, PCIe, and NUMA paths;
- checkpoint architecture, burst buffers;
- throughput, IOPS, metadata scale, availability, security;
- observability, benchmarking, and troubleshooting.

Labs:

- inventory storage paths;
- benchmark local and shared storage;
- validate a GPU-adjacent path;
- exercise checkpoint recovery;
- inject storage degradation or permission failure.

### Volume 16 — Observability

Cover:

- metrics, logs, events, traces, and profiles;
- DCGM, `dcgmi`, DCGM Exporter;
- Prometheus and Grafana;
- utilization, memory, SM activity, power, thermal, clocks, throttling;
- ECC, retired pages, XID;
- NVLink, PCIe, RDMA, fabric, Kubernetes, Operator, inference, training, and storage metrics;
- SLIs, SLOs, alerts, baselines, cardinality, retention, dashboards;
- incident evidence, capacity reporting, troubleshooting.

Labs:

- deploy DCGM Exporter;
- integrate Prometheus;
- build dashboards and alerts;
- inject a safe observable failure;
- validate evidence and cleanup.

### Volume 17 — Performance Engineering

Cover:

- evidence-driven methodology;
- compute-bound versus memory-bound;
- roofline intuition and arithmetic intensity;
- occupancy, warp efficiency, coalescing, shared memory, registers;
- launch overhead, streams, CUDA Graphs, kernel fusion;
- precision and Tensor Core utilization;
- Nsight Systems, Nsight Compute, DCGM, NCCL, network, and storage profiling;
- inference latency, TTFT, throughput;
- training throughput and scaling efficiency;
- power, thermal, benchmark design, regression testing, troubleshooting.

Labs:

- profile CUDA;
- identify a memory bottleneck;
- analyze inference latency;
- analyze distributed communication;
- build a baseline;
- inject and identify a regression.

### Volume 18 — Security

Cover:

- threat modeling;
- hardware and firmware trust;
- Secure Boot and signed drivers;
- BMC and supply-chain security;
- containers and NGC trust;
- secrets, RBAC, Pod Security, Network Policies;
- GPU sharing, MIG, vGPU, DMA, IOMMU, SR-IOV;
- BlueField and DOCA security;
- confidential computing and attestation;
- data and model protection;
- tenant isolation, audit, vulnerability and patch management;
- compliance, incident response, troubleshooting.

Labs:

- validate Secure Boot and driver state;
- apply Kubernetes isolation;
- inspect device permissions;
- exercise denied access safely;
- review audit evidence.

### Volume 19 — Production Operations

Cover:

- operating model and service catalog;
- capacity and demand planning;
- admission control;
- maintenance windows;
- GPU node lifecycle;
- firmware, driver, CUDA, Operator, Kubernetes, switch, and storage upgrades;
- canaries, rolling upgrades, rollback;
- draining, checkpointing, spare capacity;
- incident, change, and problem management;
- runbooks, SLOs, DR, backup, inventory, drift, cost, and chargeback;
- troubleshooting.

Labs:

- maintenance runbook;
- safe node drain;
- simulated upgrade;
- rollback;
- incident exercise;
- post-maintenance health validation.

### Volume 20 — Troubleshooting Encyclopedia

Provide deep incident playbooks for:

- GPU missing;
- driver and CUDA failures;
- OOM;
- ECC, retired pages, XID;
- thermals and power;
- PCIe, NVLink, NVSwitch;
- RDMA, InfiniBand, RoCE;
- NCCL timeout and collective hangs;
- GPU Operator, Device Plugin, RuntimeClass, Container Toolkit;
- Kubernetes scheduling;
- MIG and time slicing;
- Triton and inference failures;
- high TTFT and slow inference;
- training stragglers;
- checkpoint and storage failures;
- monitoring gaps;
- firmware mismatch and upgrade regression.

Every scenario must include symptoms, blast radius, triage, evidence, commands,
healthy output, broken output, diagnosis, root cause, resolution, verification,
prevention, escalation package, and production advice.

Include cross-domain incident drills.

### Volume 21 — AI Factory Architecture

Cover:

- AI factory concept;
- business and workload discovery;
- capacity model;
- rack, compute blocks, DGX and HGX;
- scale-up and scale-out networking;
- storage and management networks;
- security zones;
- multi-rack, rail design, oversubscription;
- power, cooling, liquid cooling, facility constraints, cable plant;
- failure domains, availability, expansion;
- multi-site and multi-region;
- data gravity and cloud integration;
- Kubernetes, observability, operations, TCO, and acceptance testing.

Exercises:

- design a rack;
- design multi-rack;
- calculate capacity and failure domains;
- create an acceptance-test plan;
- review a customer proposal.

### Volume 22 — Enterprise Customer Workshops

Include scenarios for:

- banking, insurance, healthcare, pharma, automotive, telecom, manufacturing,
  retail, public sector, GenAI, RAG, robotics, digital twins, scientific computing.

Every workshop includes:

- goals and business drivers;
- workload and data profile;
- constraints, security, and compliance;
- architecture options;
- recommendation and alternatives;
- trade-offs, risks, migration, operations, and cost;
- executive summary;
- technical whiteboard;
- discovery questions;
- objection handling;
- next steps.

Exercises:

- discovery workshop;
- architecture decision record;
- executive presentation outline;
- recommendation defense;
- failed-PoC recovery.

### Volume 23 — Interview Masterclass

Cover:

- senior interview mindset;
- whiteboarding and requirements discovery;
- ambiguity handling;
- architecture and troubleshooting interviews;
- customer and executive communication;
- technical deep dives;
- trade-offs, capacity, performance, security, operations;
- mock interviews, scoring rubrics, weak answers, strong-answer patterns.

Create at least 500 high-quality questions across conceptual, architecture,
scenario, design, troubleshooting, customer, whiteboard, executive, and
cross-domain categories. Do not pad with trivia.

### Volume 24 — Capstone Projects

Required capstones:

- Enterprise AI Platform;
- Kubernetes GPU Platform;
- Multi-Tenant GPU Platform;
- Multi-Node Inference;
- Distributed Training;
- Private GenAI Assistant;
- RAG Platform;
- AI Factory;
- Monitoring Stack;
- Secure AI Platform;
- Upgrade and Operations Program.

Every capstone includes:

- business problem;
- requirements, assumptions, and constraints;
- architecture and diagrams;
- bill-of-material categories;
- network, storage, and security;
- deployment and automation;
- observability and SLOs;
- capacity and failure modes;
- testing and acceptance;
- runbooks, upgrades, DR;
- cost and trade-offs;
- customer presentation;
- interview defense;
- grading rubric.

Provide simulation, cloud, local, and paper-design variants where appropriate.

## 4. Mandatory parallel-agent model

For every active volume, delegate at least:

1. Foundations Writer — introduction and early chapters
2. Architecture Writer — internal and architecture chapters
3. Operations Writer — production, troubleshooting, scenarios, summary
4. Lab Engineer — labs only
5. Technical Reviewer
6. Editorial Reviewer
7. Integration Reviewer

Use separate worktrees or task branches. Never assign the same file to multiple
agents. If parallel agents are unavailable, state that honestly and execute the
same workstreams sequentially.

## 5. Anti-laziness rules

Forbidden:

- placeholder chapters;
- completion based on filenames;
- bullet-dump chapters;
- one-paragraph sections;
- generic repeated templates;
- skipped internal working;
- skipped troubleshooting;
- skipped labs;
- invented specifications or output;
- marking ready before CI;
- suppressing broken-link checks;
- changing unrelated files;
- merging without approval.

Every report must include exact files, line counts, commit SHAs, review findings,
test commands, CI evidence, and unresolved risks.

## 6. Quality gates

Line count is not a guarantee, but use it as a warning:

- foundational chapters often 400–700 lines;
- focused chapters often 250–500 lines;
- major architecture chapters may be longer;
- short summaries are acceptable;
- chapters below 250 lines require coordinator justification.

Each chapter normally needs:

- meaningful visuals;
- comparison or decision table where alternatives exist;
- at least two substantial troubleshooting scenarios;
- customer perspective;
- senior interview section;
- revision material;
- authoritative references.

Every lab must include all 18 sections from `06_LAB_STANDARD.md`.

## 7. Required workflow

1. Writer handoff
2. Coordinator diff review
3. Technical review
4. Corrections
5. Editorial review
6. Corrections
7. Integration review
8. Link and route correction
9. `npm ci`
10. `npm run check`
11. GitHub Actions
12. Final coordinator acceptance
13. PR ready
14. Owner approval
15. Merge

Writers do not self-approve.

## 8. Branch strategy

Integration branch:

`book/volume-XX-<slug>`

Worker branches:

- `work/volume-XX-foundations`
- `work/volume-XX-architecture`
- `work/volume-XX-operations`
- `work/volume-XX-labs`

One PR per volume. Keep draft until all gates pass. Do not combine volumes into
one PR. After squash merge, align or delete stale branches.

## 9. Execution waves

First complete Volume 10 as the pilot unless discovery proves it ready.

Then:

- Wave 1: Volumes 11, 12, 13
- Wave 2: Volumes 14, 15, 16
- Wave 3: Volumes 17, 18, 19
- Wave 4: Volumes 20, 21, 22
- Wave 5: Volumes 23, 24

Maximum three active volumes unless the owner approves more.

## 10. Required status format

```md
# Bootcamp Production Status

## Repository Baseline
- main SHA:
- open PRs:
- CI baseline:

## Volume Inventory
| Volume | Status | Chapters | Labs | Quality | Branch/PR | Main risks |

## Recommended Next Volume
- volume:
- reason:
- dependencies:

## Proposed Agent Ownership
| Agent | Exact files | Branch/worktree |

## Review Gates
- structural:
- technical:
- editorial:
- integration:
- CI:

## Questions Requiring Owner Approval
- ...
```

## 11. Start now

Begin discovery only.

Do not edit, branch, open PRs, or merge.

Return:

1. repository baseline;
2. Volume 10–24 inventory;
3. quality classification;
4. branch and PR states;
5. CI state;
6. recommended next volume;
7. parallel-agent ownership;
8. execution-wave plan;
9. owner questions.

Wait for approval before writing.
