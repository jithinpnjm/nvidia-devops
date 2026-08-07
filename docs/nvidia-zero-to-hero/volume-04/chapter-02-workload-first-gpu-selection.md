---
title: Chapter 02 — Workload-First GPU Selection
description: Learn how to translate training, inference, visualization, and scientific-computing requirements into defensible GPU selection criteria.
sidebar_position: 3
tags:
  - gpu-selection
  - workload-analysis
  - architecture
---

# Workload-First GPU Selection

A customer rarely begins with a complete hardware requirement. They usually begin with a product name.

> “We need H100s.”

That statement sounds specific, but it is not an architecture requirement. It does not reveal whether the customer is training a frontier model, serving a latency-sensitive application, running virtual workstations, processing scientific simulations, or simply following a recommendation copied from another environment.

A defensible GPU design begins by translating the workload into measurable constraints. Product selection comes later.

## Learning objectives

After completing this chapter, you will be able to:

- separate business requirements from assumed hardware choices;
- classify GPU workloads by execution, memory, latency, and deployment behavior;
- identify the hardware characteristics that constrain each workload;
- explain why peak compute alone is an incomplete selection metric;
- reject technically impressive but operationally unsuitable designs;
- present a workload-to-platform recommendation to an enterprise customer.

## The selection problem

GPU selection is a multi-dimensional decision.

```mermaid
flowchart LR
    Goal[Business goal] --> Workload[Workload profile]
    Workload --> Constraints{"Constraints — checked with evidence,<br/>not assumed"}
    Constraints -->|"Weights+KV-cache calc exceeds<br/>candidate memory.total"| MemFail["Memory-fit failure<br/>→ larger-HBM class required"]
    Constraints -->|"nvidia-smi dmon: sm% high,<br/>pclk at max, no throttle"| ComputeOK["Compute-bound, healthy<br/>→ proceed to precision/format check"]
    Constraints -->|"p99 latency script shows SLO miss<br/>at target concurrency"| LatencyFail["Latency-fit failure<br/>→ density/latency-tuned class required"]
    Constraints -->|"nccl-tests bandwidth scales sub-linearly<br/>past 1 node"| CommFail["Communication-fit failure<br/>→ scale-up fabric (SXM/NVLink) required"]
    MemFail --> Criteria[Selection criteria]
    ComputeOK --> Criteria
    LatencyFail --> Criteria
    CommFail --> Criteria
    Criteria --> Platform[GPU and platform]
    Platform --> Validation[Benchmark and validate]
    Validation -->|"benchmark contradicts the<br/>desk estimate"| Constraints
```

**Figure 4.2.1 — Hardware selection is the final stage, not the first, and each constraint is a checkable claim, not a guess.** The loop-back edge from Validation matters as much as the forward path: a benchmark that contradicts the paper estimate sends the process back to re-examine constraints, not straight to a purchase order.

**Worked capacity check that would drive the "Memory-fit failure" branch above:** a 70B-parameter model at FP16 needs `70,000,000,000 × 2 bytes ≈ 140 GB` for weights alone — already larger than a single 80GB H100's HBM, before activations, optimizer state (if fine-tuning), or KV cache are added. That number alone is why "does the model fit" has to be answered with arithmetic before any benchmark is run, not discovered when a training or inference job OOMs in production.

Starting with a product name reverses this flow. It encourages the design team to justify a purchase rather than determine whether the purchase is appropriate.

## Step 1: classify the workload

The first useful distinction is not “AI versus non-AI.” It is how the workload consumes compute, memory, communication, and time.

| Workload class | Primary objective | Common pressure points | Typical deployment concern |
|---|---|---|---|
| Model training | Maximize useful work completed over time | Memory capacity, memory bandwidth, collective communication | Multi-GPU and multi-node scaling |
| Real-time inference | Meet latency and availability targets | Model residency, batching delay, token generation rate | Tail latency and replica health |
| Batch inference | Minimize cost per completed item | Throughput, queue depth, utilization | Scheduling and fleet efficiency |
| Fine-tuning | Adapt a model within limited time and budget | Model size, optimizer state, checkpoint I/O | Shared-cluster access |
| Scientific computing | Accelerate numerical kernels | Precision mode, memory movement, interconnect | Application compatibility |
| Visualization | Deliver interactive graphics or remote desktops | Graphics pipeline, framebuffer, encoder support | User density and isolation |
| Edge inference | Operate within power and physical constraints | Efficiency, thermals, model footprint | Remote operations and lifecycle |

A single customer platform may host several of these classes. That does not mean one GPU model is automatically optimal for all of them.

## Step 2: convert the workload into measurable questions

The architect should ask questions that expose the true constraints.

### Model and data questions

- What is the model parameter count?
- Which numerical formats are supported by the application?
- How much memory is required for weights, activations, optimizer state, and runtime caches?
- Does the dataset fit near the compute layer, or will storage become the limiting factor?
- Is the workload sensitive to checkpoint time?

### Service-level questions

- Is the objective throughput, latency, or both?
- Which percentile defines the latency target?
- What happens when demand exceeds capacity?
- Is graceful degradation acceptable?
- How much maintenance downtime is permitted?

### Scaling questions

- Can the workload use multiple GPUs efficiently?
- Is communication mostly within a node or across nodes?
- Does the framework support the intended topology?
- Will future model growth require more memory per accelerator or more accelerators?

### Operational questions

- Is the platform bare metal, virtualized, Kubernetes-based, or appliance-based?
- Which driver and CUDA lifecycle must be supported?
- Is multi-tenancy required?
- What level of vendor support is expected?
- Are power, cooling, rack space, or procurement lead time limiting factors?

These questions turn vague preference into architecture evidence.

## The five selection dimensions

A practical GPU selection framework evaluates five dimensions together.

```mermaid
flowchart TD
    W[Workload fit]
    M[Memory fit]
    C[Communication fit]
    O[Operational fit]
    E[Economic fit]
    D[Defensible platform decision]

    W --> D
    M --> D
    C --> D
    O --> D
    E --> D
```

### 1. Workload fit

The accelerator must support the operations and precision modes the application actually uses. Specialized hardware is valuable only when the software stack can exploit it.

### 2. Memory fit

Memory capacity determines whether the workload can run. Memory bandwidth often determines how quickly it runs. Capacity and bandwidth must be evaluated separately.

A model that barely fits leaves little room for runtime buffers, caches, framework overhead, or growth. Production design should include operational headroom rather than target theoretical minimums.

### 3. Communication fit

A workload that spans accelerators depends on the path between them. The relevant question is not simply how many GPUs exist, but how tensors move among those GPUs.

For distributed workloads, selection expands from a GPU decision into a topology decision involving PCIe, high-speed GPU interconnects, network adapters, switches, and collective-communication behavior.

### 4. Operational fit

The platform must be installable, observable, supportable, and upgradeable by the organization that owns it.

A theoretically faster accelerator may be a poor choice when it introduces unsupported operating systems, incompatible virtualization requirements, difficult cooling constraints, or an upgrade process the operations team cannot sustain.

### 5. Economic fit

Purchase price is only one component of cost.

| Cost category | Examples |
|---|---|
| Acquisition | GPUs, servers, switches, optics, storage |
| Facilities | Rack space, electrical delivery, cooling |
| Software | Enterprise subscriptions, orchestration, observability |
| Operations | Staffing, maintenance, upgrades, incident response |
| Inefficiency | Idle capacity, poor utilization, stranded memory |
| Risk | Delayed deployment, unsupported configurations, rework |

The objective is not the cheapest accelerator. It is the lowest-risk platform that satisfies the workload over its expected lifecycle.

## Why peak performance is insufficient

Peak arithmetic throughput describes a hardware capability under ideal conditions. It does not describe application performance by itself.

A workload may be limited by:

- memory bandwidth;
- memory capacity;
- CPU preprocessing;
- storage throughput;
- network congestion;
- synchronization frequency;
- small batches;
- software compatibility;
- scheduling delay;
- power or thermal limits.

This is why architecture reviews should ask, “What is the expected bottleneck?” before asking, “Which GPU has the largest specification?”

## A customer decision example

A company wants to deploy an internal language-model service. The first proposal requests the most capable training accelerator available. Further discovery reveals:

- the model already exists and will not be trained internally;
- expected demand is moderate but latency-sensitive;
- the service must run in Kubernetes;
- multiple departments will share the platform;
- the data center has limited power headroom;
- the team prioritizes predictable operations over maximum single-node scale.

The workload is an inference platform problem, not a large-scale training problem. The selection criteria should therefore emphasize model residency, latency under concurrency, partitioning or sharing options, power efficiency, software support, and replica operations.

The original product request may still prove appropriate, but now it must win against explicit criteria rather than assumption.

## When not to buy a new GPU

A new accelerator is not always the correct response to poor performance.

Do not begin with hardware replacement when:

- utilization is low because data arrives slowly;
- the model server is misconfigured;
- requests are too small to batch efficiently;
- CPU tokenization is saturated;
- the application cannot use the accelerator’s supported precision modes;
- the workload is blocked on storage or network I/O;
- existing GPUs are fragmented by poor scheduling;
- an upgrade would create unsupported software dependencies.

Benchmark the existing pipeline first. Otherwise, new hardware may preserve the same bottleneck at greater cost.

## Production troubleshooting: wrong hardware, or wrong pipeline?

### Symptoms

- low throughput despite expensive accelerators;
- low power draw during peak demand;
- memory is full while compute utilization remains low;
- adding GPUs does not improve completion time;
- tail latency grows sharply under moderate concurrency.

**Evidence walkthrough — "memory is full while compute utilization remains low," a fragmentation/oversubscription signature:**

```bash
$ nvidia-smi --query-gpu=index,memory.used,memory.total,utilization.gpu,utilization.memory --format=csv
index, memory.used [MiB], memory.total [MiB], utilization.gpu [%], utilization.memory [%]
0, 78120 MiB, 81920 MiB, 14 %, 9 %
```

`memory.used` at 95% of capacity while `utilization.gpu` sits at 14% is not a bandwidth story — `utilization.memory` (9%) confirms the memory subsystem isn't even being pushed hard. This combination usually means the memory is *held*, not *used*: multiple processes sharing the GPU without MIG or time-slicing isolation, a framework caching allocator (e.g. PyTorch) that grabbed a large pool early and never released it, or several stale sessions still resident. The fix is process/session cleanup or proper GPU-sharing isolation, not a bigger GPU — a bigger GPU would just let the same leak grow before it's noticed.

### Diagnostic path

```mermaid
flowchart TD
    S[Performance target missed] --> U{"GPU busy?<br/>nvidia-smi dmon sm%"}
    U -->|"sm% < 30%,<br/>host CPU near 100%"| Feed["Host-bound<br/>Inspect CPU, storage, request feed"]
    U -->|"sm% > 80%"| Mem{"Memory pressure?<br/>memory.used / memory.total"}
    Mem -->|"> 90% of capacity,<br/>or allocator OOM in logs"| MemFix["Memory-bound<br/>Reduce batch/seq length or move to larger-HBM class"]
    Mem -->|"comfortable headroom"| Comm{"Multi-GPU workload?"}
    Comm -->|"Yes — check nccl-tests<br/>or nvidia-smi topo -m"| Topo["Communication-bound<br/>Inspect topology and collective time share"]
    Comm -->|"No"| Profile["Compute-bound<br/>Profile kernels with Nsight; check precision path"]
```

**Evidence walkthrough — turning "GPU busy?" into a real answer instead of a guess:**

```bash
$ nvidia-smi dmon -s pucvmet -c 4
# gpu   pwr  gtemp  mtemp    sm   mem   enc   dec   jpg   ofa  mclk  pclk
# Idx     W      C      C     %     %     %     %     %     %   MHz   MHz
    0   165     44     41    18     6     0     0     0     0  2619  1410
    0   162     44     41    17     5     0     0     0     0  2619  1410
    0   168     45     42    19     6     0     0     0     0  2619  1410
    0   160     44     41    16     5     0     0     0     0  2619  1410
```

`sm` (compute busy %) averaging ~17% with `pclk` pinned at its max boost clock (1410MHz — no throttling) is the "No" branch of the diagnostic tree: the GPU is idle waiting on work, not struggling to keep up with it. Paired with a `top`/`htop` read showing one CPU core pegged at 100% doing request tokenization or image preprocessing, this combination is the standard signature of a host-feed bottleneck — the fix is on the CPU/data-loading side, and buying a faster GPU here would just idle more expensively.

### Root causes

Common root causes include an undersized memory configuration, a topology mismatch, a host bottleneck, an application that cannot exploit the device, or a service design optimized for throughput when the requirement is latency.

### Resolution

Resolve the measured bottleneck first. Change hardware only when the evidence shows that the existing accelerator or platform cannot satisfy the requirement within acceptable operational and economic limits.

## Customer conversation

A Solutions Architect should avoid answering “Which GPU should we buy?” with a product list.

A stronger response is:

> “Let us first identify the workload, memory footprint, scaling pattern, latency target, deployment model, and facility constraints. Then we can compare platforms against those requirements and validate the shortlist with representative benchmarks.”

That answer changes the engagement from procurement assistance into architecture discovery.

## Interview preparation

### Knowledge questions

**1. Why is GPU memory capacity different from GPU memory bandwidth?**

**Model answer:** "Capacity is a yes/no gate — can the weights, activations, optimizer state, and KV cache all fit in device memory at once? I'd check that with `nvidia-smi --query-gpu=memory.used,memory.total` against a weights-plus-overhead calculation. Bandwidth is a rate question — once everything fits, how fast can data move between HBM and the SMs to keep them fed? A GPU can pass the capacity check completely — plenty of headroom in `memory.used` — and still underperform because bandwidth can't keep up with how often the kernel needs to re-read data from HBM. I've seen this exact split on decode-heavy LLM inference: capacity is fine, but every generated token re-reads the KV cache and weights, so bandwidth becomes the ceiling even though there's 20GB of free memory sitting there."

**2. Why can a higher-throughput accelerator produce worse application economics?**

**Model answer:** "Because throughput on a spec sheet is peak, aggregate, and workload-agnostic — it doesn't account for how many of those FLOPs your actual request pattern can use. If my service is dominated by small, latency-sensitive requests that can't batch efficiently, a bigger GPU just processes the same underfilled batches faster per unit — I'm paying for compute I structurally can't use. The number that actually matters is cost per successful request at my SLO, not FLOPs per dollar. I've challenged proposals before by asking for `requests/GPU-hour` at the target latency percentile instead of the vendor's peak-throughput number, and the 'faster' GPU sometimes loses that comparison outright."

**3. What operational factors can invalidate an otherwise suitable GPU choice?**

**Model answer:** "Power and cooling headroom in the destination rack, driver/CUDA/framework compatibility with what the team already runs, support and lifecycle commitments, and whether the operations team can actually service and monitor a new platform generation. I've seen a technically ideal GPU get vetoed at the facility review stage because the rack's PDU couldn't sustain its steady-state draw — the silicon was right and the deployment still failed."

### Architecture questions

1. Design a selection process for a shared training and inference platform.
2. Explain how topology changes the value of adding more accelerators.
3. Compare the decision criteria for batch inference and real-time inference.

### Scenario questions

**1. A customer requests premium training GPUs for a small inference service. How do you challenge the assumption?**

**Model answer:** "I wouldn't say no outright — I'd ask what's driving the request. Usually it's 'this is the GPU everyone talks about' rather than a measured requirement. So I'd walk through the same five dimensions I use everywhere: does the model's memory footprint actually need that much HBM, is the workload latency- or throughput-bound, does it need NVLink-class scale-up communication at all for a single-service inference workload, what does it cost to power and cool that class of accelerator versus a density-tuned part, and what does cost-per-request look like on each. In most small-inference cases that comparison alone reframes the conversation — the premium training GPU usually loses on cost-per-request even though it wins on the spec sheet."

**2. A workload uses only 25 percent GPU utilization. What evidence do you collect before recommending new hardware?**

**Model answer:** "25% utilization on its own tells me almost nothing — I need to know what kind of 25% it is. I'd pull `nvidia-smi dmon -s pucvmet` over the real traffic window to see whether `sm%` is low because the GPU is starved (host-bound — check CPU and request feed) or because the workload is naturally bursty and 25% average hides healthy spikes. I'd pair that with `memory.used` to rule out a memory-bound stall, and with the application's own request-latency metrics to see if the service is even missing its SLO — a service comfortably meeting latency at 25% utilization might just have correctly-provisioned headroom, not a problem to fix with new hardware at all."

**3. A model fits in memory but misses its latency target. What additional dimensions do you investigate?**

**Model answer:** "Fitting in memory only answers the capacity question — latency is a completely different axis. I'd look at batching policy first, since the batch size tuned for throughput is often exactly wrong for interactive latency. Then I'd check whether the request path has host-side cost outside the GPU entirely — CPU preprocessing, tokenization, host-to-device transfer — using host-level tooling alongside `nvidia-smi`, because a GPU that's fast in isolation can still miss its SLO if the surrounding pipeline is slow. Finally I'd check for queueing — whether requests are waiting for a GPU slot rather than executing slowly on one — because that shows up identically in an end-to-end latency number but has a completely different fix."

## Key takeaways

- Begin with workload and business constraints, not product names.
- Capacity, bandwidth, communication, operations, and economics must be evaluated together.
- Peak hardware specifications do not predict end-to-end performance.
- A platform recommendation is credible only when it is tied to measurable requirements.
- Benchmarking validates architecture assumptions; it does not replace architecture discovery.

## Cross references

- [Volume 04 introduction](./index)
- [Chapter 01 — Why NVIDIA Has Multiple GPU Families](./chapter-01-why-nvidia-has-multiple-gpu-families)
- [Lab 01 — Build a GPU Selection Scorecard](./labs/lab-01-build-a-gpu-selection-scorecard)
