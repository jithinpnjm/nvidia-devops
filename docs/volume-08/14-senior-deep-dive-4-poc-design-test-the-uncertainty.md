---
title: "Senior Deep Dive 4 — PoC design: test the uncertainty"
slug: "senior-deep-dive-4-poc-design-test-the-uncertainty"
sidebar_position: 14
description: "Senior Deep Dive 4 — PoC design: test the uncertainty — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
A PoC is not a product demo. Start with the architecture uncertainty that could invalidate the recommendation: Can the storage system feed 64 GPUs? Does disaggregated inference improve SLO/TCO for this prompt mix? Does RoCE remain stable under concurrent training? Can the customer’s security controls work with privileged GPU operands? Define success thresholds, workload generator, telemetry and failure tests before implementation.


<!-- source-table:1 -->

| PoC question | Metric | Pass/fail example |
| --- | --- | --- |
| Inference capacity | p95 TTFT, p95 ITL, tokens/s/GPU | meets SLO at peak concurrency + headroom |
| Training fabric | step time, collective bandwidth, straggler spread | within agreed % of baseline across nodes |
| Storage | GB/s, metadata ops, GPU idle due to input | GPU feed target sustained during checkpoint cycle |
| Resilience | recovery time, failed requests/jobs | node loss stays within RTO/SLO |
| Operations | upgrade duration, rollback, observability | canary upgrade + verified rollback procedure |

## Senior addendum

➕ **Cross-reference:** the hypothesis-first PoC method (hypothesis → environment → workload → metrics → baseline → matrix → pass/fail → decision) is Chapter 6's — don't re-derive the pipeline here. What's new: this table names 5 specific *uncertainty domains* (capacity, fabric, storage, resilience, operations) that Chapter 6 leaves generic. Treat this table as the "menu" you pick 2-3 hypotheses from when scoping a real PoC, directly answering Chapter 6's own instruction to "choose 2-3 hypotheses rather than attempting every platform feature."

➕ **The storage-feeding-GPUs question, worked with a number (the one row in this table that most teams underestimate):** an H100 doing FP16 training can be starved by storage well before it's compute-bound — if checkpoint/dataset reads can't sustain roughly the GB/s the GPU's memory bandwidth-bound data loader needs, GPU utilization drops even though `nvidia-smi` shows the GPU as "available," not busy. A PoC that never runs a storage-saturation test alongside a real training job is the single most common gap in "we tested GPU Kubernetes" reports — it's easy to test GPUs and storage separately and miss that they starve each other only under concurrent load.

➕ **Diagram: the 5-domain menu, and the "pick 2-3" instruction made literal:**
```
5 uncertainty domains (the menu):
Inference capacity │ Training fabric │ Storage │ Resilience │ Operations
        │
        ▼
  Pick 2-3 that actually block the production DECISION
  (Ch.6's instruction — not all 5, every time)
        │
        ▼
  Each chosen domain gets: metric, pass/fail threshold, workload
  generator, telemetry, and a FAILURE test — before implementation
```

➕ **Diagram: how storage starves a GPU without ever showing up as "GPU busy":**
```
Storage (checkpoint/dataset tier)
        │  GB/s actually sustained
        ▼
Data loader (CPU-side, feeds batches to the GPU)
        │  must keep pace with the GPU's consumption rate
        ▼
GPU compute (FP16 training step)
        │
        ▼
nvidia-smi shows GPU "available", not "busy" ──▶ hidden bottleneck:
   the GPU isn't idle by choice, it's STORAGE-BOUND — a PoC that
   never loads storage and GPU concurrently will miss this entirely
```
