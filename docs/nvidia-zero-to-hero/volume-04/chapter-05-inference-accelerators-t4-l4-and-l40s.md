---
title: Inference Accelerators — T4, L4, and L40S
description: Learn how to compare NVIDIA inference-oriented accelerators by workload behavior, memory, media engines, deployment density, and operational constraints.
sidebar_position: 6
tags:
  - inference
  - t4
  - l4
  - l40s
  - gpu-selection
---

# Inference Accelerators — T4, L4, and L40S

A platform team is asked to replace a fleet of CPU inference servers. The first proposal is to purchase the accelerator with the highest published arithmetic throughput. That answer is attractive because it is simple. It is also incomplete.

Inference performance depends on much more than peak compute. Model size, precision, batching, latency objectives, media processing, host power limits, rack density, software compatibility, and cost per request all influence the correct choice. T4, L4, and L40S occupy different points in this design space.

| Chapter field | Value |
|---|---|
| Difficulty | Intermediate |
| Estimated reading time | 35–45 minutes |
| Prerequisites | Chapters 01–04 |
| Primary outcome | Build an inference accelerator shortlist from workload evidence |

## Learning Objectives

After completing this chapter, you will be able to:

- explain why inference accelerators cannot be compared using one performance number;
- distinguish density-oriented, balanced, and high-capacity inference designs;
- map model, latency, media, and power requirements to accelerator characteristics;
- identify when a training-oriented platform is unnecessary for inference;
- troubleshoot poor inference performance without immediately blaming the GPU.

## The Production Story

A media company operates three services:

1. image classification at high request volume;
2. video transcoding with AI enhancement;
3. an interactive generative AI assistant.

The company asks whether one GPU model should standardize all three services. A single standard simplifies procurement and operations, but each service stresses a different part of the platform. Image classification may benefit from efficient batching and density. Video pipelines depend heavily on encode and decode capabilities. Generative inference may require much more memory and memory bandwidth.

The architecture process must therefore begin with the request path, not the product list.

## Big Picture

```mermaid
flowchart LR
    Request[Inference Request] --> Prep["Preprocessing<br/>(CPU-bound)"]
    Prep -->|"healthy: top shows CPU headroom"| Queue["Scheduler and Batcher"]
    Prep -.->|"unhealthy: top/htop shows CPU pegged<br/>while GPU sm% stays low"| HostBound["Host-bound —<br/>fix here before touching the GPU"]
    Queue -->|"healthy: batch size near configured max"| Model["Model Execution"]
    Queue -.->|"unhealthy: batch size stays near 1<br/>despite concurrent requests"| BatchStarved["Batching not engaging —<br/>check scheduler/timeout config"]
    Model <-->|"nvidia-smi: memory.used stable,<br/>sm% high, mem% high"| Memory["GPU Memory"]
    Model -.->|"nvidia-smi: memory.used climbing<br/>toward memory.total"| OOMRisk["Approaching OOM —<br/>reduce batch/seq length or add headroom"]
    Prep <-->|"nvidia-smi dmon: enc/dec% nonzero"| Media["Encode or Decode engines"]
    Model --> Response[Response]
```

**Figure 4.5.1 — Inference is a pipeline, and each hop has a named signal that separates "healthy" from "this is the bottleneck."** The two dotted failure branches are the pipeline's actual fault-isolation tool: a request that misses its latency target is diagnosed by walking left to right through these signals, not by looking at the GPU first.

**Reading the evidence that separates a host-bound pipeline from a genuinely GPU-bound one:**

```bash
$ nvidia-smi dmon -s pucvmet -c 3
# gpu   pwr  gtemp  mtemp    sm   mem   enc   dec   jpg   ofa  mclk  pclk
# Idx     W      C      C     %     %     %     %     %     %   MHz   MHz
    0    58     39     37     9     3     0     0     0     0  5001   585
    0    61     39     37    11     4     0     0     0     0  5001   585
    0    57     38     36     8     3     0     0     0     0  5001   585

$ top -bn1 | head -5
top - 14:22:07 up 40 days,  3:12,  1 user,  load average: 8.02, 7.91, 7.84
%Cpu(s): 97.3 us,  1.8 sy,  0.0 ni,  0.6 id,  0.0 wa
```

`sm` averaging ~9% and `pclk` at only 585MHz (well under the card's boost clock — the GPU has clocked down because it has nothing queued) paired with `top` showing 97.3% CPU user time and a load average above core count is the paired snapshot that proves this is the "Preprocessing" hop failing, not the "Model Execution" hop — the fix is CPU-side (parallelize preprocessing, add worker processes), and swapping to a faster GPU here would leave `sm%` just as low.

## Why These Products Exist

Inference often rewards different design priorities than large-scale training.

Training commonly favors high aggregate throughput, large scale-up domains, and fast collective communication. Inference may instead prioritize:

- low power per server;
- many independent model replicas;
- predictable tail latency;
- efficient low-precision execution;
- video encode and decode capacity;
- broad server compatibility;
- cost per successful request.

T4 established a widely deployed low-profile inference pattern. L4 modernized that pattern for newer AI and media workloads. L40S serves workloads that need substantially more memory, compute, and graphics capability while remaining in a PCIe server form factor.

## Architectural Positioning

| Design question | T4 tendency | L4 tendency | L40S tendency |
|---|---|---|---|
| Deployment objective | Cost-sensitive legacy and established inference | Modern density-efficient inference and media | Larger models, heavier inference, graphics, and mixed workloads |
| Server integration | Low-profile, low-power PCIe environments | Low-profile, energy-conscious PCIe environments | Full-size, higher-power PCIe platforms |
| Memory requirement | Smaller model footprints | Moderate model and pipeline footprints | Larger model footprints and richer workloads |
| Media processing | Useful video acceleration | Strong modern media acceleration | High-end media and graphics capability |
| Operational impact | Easy to place in many existing servers | Often suitable for dense inference nodes | Requires more deliberate thermal and power planning |

This table describes architectural tendencies, not universal rules. Exact suitability must be validated against the current product documentation, server qualification, software stack, and benchmark results.

## The Five Questions That Matter

### 1. Does the model fit?

Model weights are only part of memory consumption. Runtime memory also includes activations, framework workspaces, CUDA contexts, KV cache, batching buffers, and fragmentation. A model that barely fits during a synthetic test may fail under production concurrency.

A practical capacity estimate is:

```text
required GPU memory = weights + runtime workspace + request state + safety margin
```

For large language models, request state can grow with sequence length, batch size, and concurrent sessions. The capacity plan must therefore model the operating envelope rather than a single request.

### 2. Is the workload latency-bound or throughput-bound?

A real-time service may optimize p95 or p99 latency. A batch service may optimize completed items per hour. The best batch size for throughput can violate an interactive latency objective.

```mermaid
flowchart TD
    Start[Workload Objective]
    Latency{Strict interactive latency?}
    Small[Use conservative batching]
    Throughput[Optimize dynamic batching]
    Validate[Benchmark full request path]

    Start --> Latency
    Latency -->|Yes| Small --> Validate
    Latency -->|No| Throughput --> Validate
```

**Figure 4.5.2 — Batching is a service-level decision.** It should be tuned from latency and throughput objectives, not copied from a benchmark.

### 3. Does media processing dominate?

Video analytics pipelines may spend substantial time decoding, resizing, color converting, encoding, or transferring frames. A GPU with suitable media engines can remove CPU bottlenecks, but only when the application actually uses those engines.

Observe each stage separately. High GPU utilization does not prove the tensor execution path is efficient, and low SM utilization may be healthy when dedicated media engines perform much of the work.

### 4. Can the server power and cool the card?

PCIe compatibility is not merely whether a card fits into a slot. Validate:

- mechanical dimensions;
- slot width and spacing;
- auxiliary power connectors;
- airflow direction and pressure;
- per-slot power delivery;
- host BIOS and firmware support;
- validated GPU count per server;
- NIC and storage lane contention.

A high-capacity accelerator installed in an unsuitable chassis may throttle, reset, or operate below expected performance.

### 5. Does the software stack support the chosen architecture?

Driver, CUDA, framework, inference runtime, container image, and model engine must form a compatible chain. Newer GPUs may require newer software. Older applications may contain architecture-specific binaries or unsupported plugins.

The selection decision must include an upgrade plan, not only a purchase order.

## Production Deployment Patterns

### Pattern A — Dense stateless inference

Many independent replicas serve small or moderate models. The design emphasizes power efficiency, horizontal scaling, autoscaling signals, and rapid replacement of failed instances.

### Pattern B — Video analytics node

The node combines network ingestion, decoding, preprocessing, inference, tracking, and encoding. Capacity planning must include media sessions and network throughput in addition to model execution.

### Pattern C — Generative inference node

The design emphasizes memory capacity, memory bandwidth, KV-cache management, continuous batching, and request admission control. L40S-class deployments may be considered when the model and service envelope exceed density-oriented accelerator capacity but do not require an SXM scale-up platform.

## Observability Model

| Layer | Evidence |
|---|---|
| Service | request rate, p50/p95/p99 latency, errors, queue depth |
| Runtime | batch size, active sequences, cache use, model instance count |
| GPU | SM activity, memory use, memory bandwidth, power, temperature, throttling |
| Media | decoder and encoder utilization, dropped frames |
| Host | CPU saturation, NUMA locality, PCIe health, network and storage throughput |

A useful dashboard aligns all layers on the same timeline. GPU metrics without service metrics cannot explain customer impact.

## Production Troubleshooting

### Problem — Low GPU utilization and high request latency

**Symptoms**

- GPU utilization remains low;
- request queues grow;
- CPU utilization is high;
- batch sizes are smaller than expected.

**Diagnosis**

Inspect preprocessing time, tokenizer saturation, request scheduler behavior, CPU affinity, and host-to-device transfer timing. Confirm that the runtime actually forms batches and that requests are not serialized before reaching the GPU.

The paired `nvidia-smi dmon` / `top` snapshot in the Big Picture section above is exactly this evidence: `sm%` near 9% with `pclk` clocked down to 585MHz alongside `top` showing 97.3% CPU user time is the signature of this specific problem, not a coincidence — it is the diagnostic proof that the GPU has nothing to execute because the host can't produce requests fast enough.

**Root cause**

The GPU is starved by the host pipeline.

**Resolution**

Parallelize preprocessing, increase scheduler concurrency, use pinned buffers where appropriate, improve NUMA placement, and tune batching against the latency objective.

**Prevention**

Benchmark the complete service path and alert on queue delay separately from GPU execution time.

### Problem — Throughput collapses under concurrency

**Symptoms**

- single-request tests appear healthy;
- memory use grows sharply with concurrency;
- latency increases nonlinearly;
- the runtime reports allocation failures or cache eviction.

**Root cause**

The concurrency model exceeds the memory envelope, often because request-state growth was omitted from sizing.

**Evidence walkthrough — watching `memory.used` climb across a concurrency ramp:**

```bash
$ for i in 1 2 3; do nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader; sleep 5; done
18420 MiB, 24576 MiB, 41 %
21980 MiB, 24576 MiB, 58 %
24310 MiB, 24576 MiB, 61 %
```

On a 24GB L4-class card, `memory.used` climbs from 18.4GB to 24.3GB across three concurrency steps while `memory.total` stays fixed — the last sample is within 300MB of the ceiling. This is the KV-cache-growth pattern the "Root cause" line describes: sizing that only accounted for weights (a fixed cost) missed that KV cache grows with sequence length × concurrent sessions (a variable cost), and at this trajectory the very next concurrency step fails with an allocator OOM rather than degrading gracefully — the runtime's own "allocation failures or cache eviction" log line is the confirming evidence to pull alongside this.

**Resolution**

Introduce admission control, reduce maximum sequence length or batch size, partition model replicas, or select an accelerator with a larger validated memory envelope.

## Customer Scenario

A bank wants to deploy document classification, speech transcription, and an internal assistant on one shared GPU pool. The architect should not begin by selecting one card. First classify each service by memory, latency, concurrency, media, and regulatory isolation requirements. A standardized server may still be appropriate, but the evidence may justify separate node pools: density-efficient accelerators for classification and speech, and higher-capacity accelerators for generative inference.

The customer recommendation should include a benchmark plan, software compatibility matrix, failure-domain design, and a method for measuring cost per successful request.

## Interview Preparation

### Architecture question

Why might a lower-power inference accelerator deliver better fleet economics than a faster card?

**Model answer:** "Because fleet economics is about requests served per rack, not requests served per GPU. A lower-power card like an L4 lets me fit more replicas in the same power and cooling budget than a larger card would, and inference workloads often parallelize better across many small replicas than they benefit from one very fast one — each replica just needs to hold its model and serve its share of traffic. So the actual comparison I'd run is cost per successful request at a fixed rack power budget, not FLOPs per dollar per card. I've seen a 'slower' card win that comparison outright once density is factored in, because the faster card's higher TDP meant fewer of them fit per rack, and the extra headroom on each one went unused by workloads that don't need it."

### Troubleshooting question

An inference service has 20% GPU utilization and misses latency objectives. What do you inspect first?

**Model answer:** "I wouldn't start at the GPU — 20% utilization with a missed latency target is almost always a symptom of something upstream, not a GPU capacity problem. I'd walk the request timeline in order: queueing first, because requests waiting for a scheduler slot show up in end-to-end latency but never touch `nvidia-smi`. Then CPU preprocessing — I'd pull a paired `nvidia-smi dmon` and `top` snapshot, and if I see `sm%` low with `pclk` clocked down while CPU is pegged, that's host starvation, not a GPU problem, and it's the most common cause of exactly this pattern. Then batching — is the runtime actually forming batches, or is every request going through one at a time? Only once I've ruled out all of that would I look at whether the GPU execution time itself is the issue."

### Customer question

When should a customer avoid standardizing all inference workloads on one GPU model?

**Model answer:** "When the workload envelopes are different enough that one choice creates persistent waste or risk somewhere. If I have both small classification models and a memory-hungry generative assistant, standardizing on the generative-service card means paying for unused memory and power on every classification replica; standardizing on the smaller card means the generative service doesn't fit at all. I'd show that with two side-by-side capacity estimates — weights-plus-overhead for each workload against each candidate's actual memory — rather than arguing the point qualitatively. When the math shows one card structurally can't serve one of the workloads, or serves it at a large efficiency loss, that's the evidence for a second pool, not a compromise on the same card."

## Key Takeaways

- Inference accelerator selection begins with the service envelope.
- Model fit includes runtime state and safety margin, not only weights.
- Media engines, host behavior, and batching can matter as much as tensor throughput.
- PCIe form factor does not eliminate power, cooling, topology, and qualification constraints.
- The final decision must be supported by end-to-end benchmarks and operational evidence.

## Cross References

- [Workload-First GPU Selection](./chapter-02-workload-first-gpu-selection)
- [PCIe, SXM, and Platform Integration](./chapter-04-pcie-sxm-and-platform-integration)
- [Training Accelerators](./chapter-06-training-accelerators-v100-to-b200)
- [Lab 02 — Benchmark an Inference Accelerator Shortlist](./labs/lab-02-benchmark-an-inference-accelerator-shortlist)
