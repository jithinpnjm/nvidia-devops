---
title: "Chapter 5 - GPU sharing and capacity recommendation"
slug: "chapter-5-gpu-sharing-and-capacity-recommendation"
sidebar_position: 5
description: "Chapter 5 - GPU sharing and capacity recommendation — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
> Learning outcome Translate workload footprint and SLOs into full GPU, MIG, time-slicing or other resource models.

Collect model memory footprint, peak memory with batching/KV cache, latency sensitivity, failure isolation and concurrency. Then test sharing modes. A production recommendation should include how slices/resources are scheduled, observed and reconfigured — not only the hardware feature.

| Workload | Likely starting point | Validate |
|---|---|---|
| large training job | full GPUs / coordinated multi-GPU allocation | scaling efficiency, topology, checkpoint/recovery |
| small dev notebooks | time slicing or shared dev pool | fairness, memory interference, user experience |
| latency-sensitive small inference | MIG where supported if slice fits | P95 latency, isolation, packing efficiency |
| mixed model services | benchmark full/MIG/sharing pools | fragmentation, SLO, operational complexity |

---

➕ **The sharing-mode decision tree (the table above, converted into a live-whiteboard flow):**
```
                     "How should this GPU be shared?"
                              │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
    Does the workload need              Does the workload fit
    coordinated multi-GPU                comfortably in a hardware-
    (NCCL/collective, large              isolated slice (MIG) with
    training)?                          spare capacity to spare?
              │                                 │
             YES                          YES ──┴── NO
              │                            │          │
              ▼                            ▼          ▼
     Full GPUs, topology-           MIG (hardware      Time-slicing /
     aware placement                isolation +         shared dev pool
     (NVLink/NVSwitch/               predictable         (software
     fabric-aware)                   perf) — validate    multiplexing,
                                      P95 latency &       NO memory
                                      packing efficiency  isolation —
                                                          validate fairness
                                                          & interference)
```
**The one-line test to say out loud:** MIG gives you *hardware* memory/fault isolation at the cost of fixed-size slices (fragmentation risk); time-slicing gives you *flexible* sharing at the cost of *no* memory isolation (one greedy process can starve or OOM its neighbors). That trade — isolation vs flexibility — is the actual decision, the specific technology names are secondary.

➕ **Sample annotated capacity-sizing worksheet — the missing worked artifact, with real numbers:**
```
Model: 13B parameter LLM, FP16 serving
Step 1 — static weight footprint:      13B × 2 bytes           = 26 GB
Step 2 — KV cache at target concurrency:
    KV cache per token ≈ 2 × num_layers × hidden_dim × 2 bytes (K+V, FP16)
    For this model: ≈ 0.5 MB/token (illustrative, model-specific)
    Target: 4096 context × 32 concurrent sequences
    KV cache footprint ≈ 0.5MB × 4096 × 32                    = 64 GB
Step 3 — activation/runtime overhead (engine-dependent):        ≈ 8 GB
Step 4 — TOTAL peak memory need:      26 + 64 + 8              = 98 GB

Conclusion: a single 80GB H100 does NOT fit this workload at 32-way
concurrency with 4K context — either (a) reduce concurrency/context,
(b) shard across 2 GPUs (tensor parallel), or (c) use a serving engine
with paged/quantized KV cache to shrink Step 2's number materially.

  ➤ WHY this worksheet matters: "26GB model fits on one GPU" is the
    naive answer and is WRONG for this SLO — the KV cache at realistic
    concurrency is 2.5x the model weights themselves. This is exactly
    the kind of arithmetic mistake ("theoretical GPU peak ≠ application
    capacity," Deep Dive 3's warning) that a Senior SA must catch before
    quoting a GPU count to a customer.
```

➕ **Extra worked scenario — choosing MIG vs full-GPU for a mixed fleet, with a specific customer profile:**
> **Situation:** A platform team has 8×H100 and three workload types: (1) a 7B model serving low-QPS internal tooling with strict per-team isolation for compliance, (2) bursty dev notebook usage from 40 data scientists, (3) one large fine-tuning job that runs weekly across all 8 GPUs.
> - Workload 1 → MIG. Low QPS means each MIG slice (e.g. 1g.10gb or similar) has plenty of headroom, and compliance needs the hardware isolation MIG actually provides — this is the textbook MIG case from the table.
> - Workload 2 → time-slicing / shared dev pool. 40 users bursting unpredictably is exactly the "fairness over isolation" tradeoff time-slicing accepts; MIG's fixed slice count would either under-serve peak bursts or sit idle most of the day.
> - Workload 3 → full GPUs, all 8, for the weekly window. This is the one case where sharing of any kind is actively wrong — coordinated training needs the whole fabric, and even proposing MIG here would be a sizing error worth catching in a design review.
> - Operational consequence: the same physical fleet needs a scheduling policy that can *reclaim* the 8 GPUs from workloads 1/2 for the weekly window, or a capacity plan that reserves headroom for it — this reconfiguration burden is exactly what the chapter means by "not only the hardware feature."

➕ **Mnemonic: "ISOLATE OR ELASTIC, PICK ONE PER WORKLOAD."**
MIG = isolate (hardware-enforced, fixed-size, fragmentation risk). Time-slicing = elastic (flexible, no isolation, interference risk). Full GPU = neither shared — it's the "isolate maximally, share nothing" extreme, reserved for coordinated multi-GPU work. Naming which extreme (or middle) a workload needs, out loud, before naming a product feature, is the senior move.

**Interview-ready line:** "I size the KV cache before I size the GPU count — the model weights are the easy number, the concurrency-scaled KV cache is usually the number that actually decides how many GPUs you need."

## Practice
➕ 1. Redo the capacity worksheet above for 16-way concurrency instead of 32-way, and for 8K context instead of 4K — compute both and identify which lever (concurrency or context length) has a bigger effect on total memory footprint per unit increase, and why that answer matters when a customer asks "can we just double our context window instead of adding GPUs?"
➕ 2. A customer insists on MIG for the bursty 40-user dev-notebook workload from the worked scenario because "MIG sounds more modern than time-slicing." Write the two-sentence pushback using the isolate-vs-elastic framing, including the concrete failure mode MIG would cause here (fixed slice count fragmenting under unpredictable bursty concurrency).

➕ **Visual model — sharing is an isolation–elasticity choice:**
```
hard isolation ◄── MIG ─────────────── MPS / time slicing ───────────────► elastic packing
fixed memory + fault boundary                                                shared capacity + burst tolerance
       │                                                                                │
regulated / predictable tenants                                               notebooks / variable demand
```
**Memory hook:** *"Partition when the boundary matters; share when the burst matters."*
