---
title: "Chapter 7 - Capacity and failure-domain design"
slug: "chapter-7-capacity-and-failure-domain-design"
sidebar_position: 7
description: "Chapter 7 - Capacity and failure-domain design — GPU and Accelerated Computing Foundations."
source_document: "Volume_04_GPU_and_Accelerated_Computing_Foundations(2).docx"
---
**Learning outcome:** Plan GPU pools around workload shape, topology, maintenance, spare capacity and heterogeneous generations.

GPU capacity planning should account for usable memory per workload, sharing mode, target throughput/latency, topology, driver/image compatibility, node boot/provisioning time, maintenance and failure reserve. A "64 GPU cluster" tells you little about whether those GPUs are eight 8-GPU nodes with fast fabric or 64 isolated single-GPU nodes.

## Worked scenario
**Situation:** A customer wants 95% average GPU utilization across production inference.

1. Ask whether the SLO is latency, throughput, cost per token, or utilization itself. Utilization is usually an efficiency signal, not the business outcome.
2. Measure queueing and latency as concurrency rises; identify the safe saturation point.
3. Reserve failure/traffic headroom if the service has an availability SLO.
4. Evaluate batching/sharing/model optimization before simply reducing replicas.
5. Define utilization targets by workload class rather than one fleet-wide percentage.

**Conclusion:** Optimize customer outcomes and unit economics, not a vanity utilization percentage.

## Practice
1. Draw the software path from a PyTorch container to the physical GPU.
2. Explain why GPU Operator and device plugin are related but not the same component.
3. Choose MIG versus time slicing for dev notebooks, latency-sensitive voice inference, and a full-GPU training job.
4. Create a metric set that distinguishes GPU health from inference saturation.

## Targeted references

[NVIDIA GPU Operator docs](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/) - Current component, install, MIG and troubleshooting details.

[NVIDIA DCGM](https://developer.nvidia.com/dcgm) - GPU management/monitoring foundation.

[Monitoring GPUs in Kubernetes with DCGM](https://developer.nvidia.com/blog/monitoring-gpus-in-kubernetes-with-dcgm/) - Kubernetes + exporter + Prometheus/Grafana flow.

---

➕ **ASCII diagram — "64 GPUs" as capacity number vs failure-domain reality, the chapter's opening claim made visual:**
```
Same headline number, structurally different fleets:

Fleet A — 8 nodes × 8 GPUs, NVSwitch per node, fast fabric between nodes
┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐
│ 8×GPU  ││ 8×GPU  ││ 8×GPU  ││ 8×GPU  ││ 8×GPU  ││ 8×GPU  ││ 8×GPU  ││ 8×GPU  │
│NVSwitch││NVSwitch││NVSwitch││NVSwitch││NVSwitch││NVSwitch││NVSwitch││NVSwitch│
└────────┘└────────┘└────────┘└────────┘└────────┘└────────┘└────────┘└────────┘
 losing 1 node = lose 8 GPUs AND one whole tightly-coupled training unit

Fleet B — 64 nodes × 1 GPU, PCIe-only, no fast inter-node fabric assumed
┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ ... (64 total)
│G ││G ││G ││G ││G ││G ││G ││G ││G ││G ││G ││G ││G ││G ││G ││G │
└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘
 losing 1 node = lose 1 GPU; but NO node here can run an 8-GPU-tight
 training job at all — capacity exists in aggregate but not in SHAPE
```
"64 GPUs" answers a procurement question; it does not answer "can this fleet run job X" or "what's the blast radius of one node failure" — those are the two questions capacity planning actually needs to answer, and Fleet A/B give opposite answers to both despite identical GPU counts.

➕ **Annotated real output — the inputs a capacity model actually needs, gathered from the fleet, not from a spreadsheet assumption:**
```
$ kubectl get nodes -l nvidia.com/gpu.present=true -o custom-columns=\
NAME:.metadata.name,GPUS:.status.allocatable.'nvidia\.com/gpu',\
PRODUCT:.metadata.labels.'nvidia\.com/gpu\.product',\
DRIVER:.metadata.labels.'nvidia\.com/cuda\.driver-version\.full'
NAME          GPUS   PRODUCT              DRIVER
gpu-node-01   8      NVIDIA-H100-80GB     550.90.07
gpu-node-02   8      NVIDIA-H100-80GB     550.90.07
gpu-node-03   8      NVIDIA-A100-80GB     535.183.06     ← heterogeneous generation AND driver skew in one row
gpu-node-04   4      NVIDIA-A100-40GB     535.183.06     ← different GPU count per node too — not a uniform pool
```
This single `kubectl` query answers three capacity-planning questions the "64 GPU cluster" headline hides: which nodes can run large tightly-coupled jobs (8-GPU nodes only), which nodes are on an older driver (Chapter 3's skew problem, now visible as a scheduling constraint), and which nodes have less memory per GPU (A100-40GB can't fit a workload sized for 80GB cards) — this is the concrete evidence a Senior SA should pull up first when asked "how much GPU capacity do we actually have."

➕ **Extra worked scenario — failure-domain sizing, the maintenance/spare-capacity dimension the chapter lists but the original worked scenario doesn't drill into:**
> **Situation:** A capacity plan sizes exactly 64 GPUs for a training workload requiring sustained 64-GPU-scale jobs, with zero spare nodes budgeted "to save cost." A routine driver upgrade requires draining one 8-GPU node for 45 minutes.
> 1. With zero spare capacity, draining any node either blocks the next training run entirely (if it needs the full 64) or silently drops to 56-GPU scale (if the job can flex) — either way, "capacity planning" without a failure/maintenance reserve made the drain decision the same as an incident decision.
> 2. The chapter's own list names this explicitly ("node boot/provisioning time, maintenance and failure reserve") — the fix is budgeting N+1 (or N+k, sized to the largest single failure domain you're willing to absorb without replanning) nodes above the workload's steady-state need.
> 3. Sizing the reserve to *one node*, not one GPU, matters because of Fleet A's failure-domain shape above — losing any single GPU in an 8-GPU NVSwitch node effectively takes the whole node offline for that job's purposes (you can't run an 8-GPU-tight job on 7 GPUs plus a stray GPU elsewhere).
> 4. Node boot/provisioning time compounds this: if a replacement node takes 20 minutes to provision (image, driver, GPU Operator convergence) versus 45 minutes for an in-place upgrade-and-reboot, the reserve sizing decision also depends on how fast the platform can produce a substitute node, not just how many spares sit idle.
> **Interview-ready line:** "Sizing capacity to exactly the steady-state need means every maintenance window is an incident — the reserve isn't waste, it's what makes routine driver upgrades routine instead of a renegotiation with the training team."

➕ **Shortcut — mnemonic for the five capacity-planning inputs the chapter lists, for fast recall under interview pressure:**
*"MSTDF — Memory, Sharing, Throughput/latency target, Topology, Driver/image, Failure reserve"* (six items, but the M-S-T-D-F ordering roughly matches "what does the workload need" → "what does the fleet look like" → "what happens when something breaks").

➕ 5. Given the heterogeneous fleet table above (mixed H100/A100, mixed driver versions, mixed GPU-count-per-node), design a nodeAffinity/label scheme that lets a scheduler correctly route a job requiring 8-GPU NVLink-tight placement away from gpu-node-04 (4 GPUs) and gpu-node-03 (older driver) without hand-maintained node lists.
➕ 6. Using the "N+1 node reserve" argument above, calculate the reserve needed for a fleet where the largest single job needs 64 GPUs across 8-GPU nodes, and a routine driver upgrade drains exactly one node at a time — state your reserve in nodes, not GPUs, and explain why the unit matters.

---

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 4

**GPU systems, lifecycle management and accelerated compute operations**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-04-03.png)

_Figure A. GPU problems can originate in application, runtime, container integration, driver, silicon or fabric._
