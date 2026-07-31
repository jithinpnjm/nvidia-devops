---
title: "Chapter 1 - Classify the AI workload before designing infrastructure"
slug: "chapter-1-classify-the-ai-workload-before-designing-infrastructure"
sidebar_position: 1
description: "Chapter 1 - Classify the AI workload before designing infrastructure — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
**VOLUME 5**

**AI Workloads and AI Platform Architecture**

Training, inference, serving, scaling, state, security and performance trade-offs

**Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises**

Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.

---

**Learning outcome:** Distinguish training, fine-tuning, evaluation, batch inference and online inference by compute, communication, storage and SLO behavior.

| Workload | Dominant concerns |
|---|---|
| Pretraining / large training | GPU-hours, distributed collectives, dataset feed, checkpoints, job reliability |
| Fine-tuning | model memory, training framework, smaller distributed jobs, artifacts/checkpoints |
| Batch inference | throughput, scheduling, queue completion time, cost |
| Online inference | P95/P99 latency, TTFT/TPOT, concurrency, autoscaling, availability |
| Evaluation | repeatability, dataset/model versioning, controlled benchmark environment |

Start architecture discovery by naming the workload and measurable outcome. An online service with a 500 ms P95 constraint needs a different capacity strategy from an overnight batch job that only needs to finish by 06:00.

➕ **Why this table is the entire interview opener for this volume:** every subsequent chapter (training topology, KV cache, autoscaling signal choice, security boundary, cost model) is a *downstream consequence* of which row of this table you're in. A Senior SA who jumps straight to "you need H100s with NVLink" without first asking "is this training or online inference, and what's the SLO" is answering the wrong question confidently. The single most valuable habit this chapter teaches is: **ask for the workload classification and the measurable outcome before any hardware/topology conversation starts.**

➕ **Classification decision tree (the mechanism behind the table):**
```
                    Is the primary output a *trained/updated model artifact*?
                              │
                 ┌────────────┴────────────┐
                YES                        NO
                 │                          │
     Is it from-scratch or        Is the output produced once per
     continuing pretraining         request/interactively, or in
     on new/expanded data?          a scheduled batch sweep?
       │              │                     │              │
   Pretraining    Fine-tuning          Interactive      Scheduled/queued
   (Ch2, DD1)     (Ch2, DD1,           (Online          (Batch inference)
                   smaller scale)       inference,        — throughput/
                                        Ch3-6)             cost/deadline
                                                            dominate, not
                                                            P99 latency
       Is the job's output a *score/report*, not a model or a served
       answer, and must it be exactly reproducible run-to-run?
                              │
                             YES → Evaluation (repeatability,
                                   versioning dominate)
```
➕ **Interview-ready line:** *"Before I talk topology or GPU SKU, I need to know which cell of the workload table we're in — training and online inference have almost opposite infrastructure priorities: training optimizes for sustained throughput and restart cost, online inference optimizes for tail latency and elastic capacity."*

➕ **Extra worked scenario — the classification mistake that actually happens in the field:**
> **Situation:** A customer asks for "the same GPU cluster sizing as their training cluster" to run what they call "batch inference" — but on inspection, the workload is actually thousands of small, latency-sensitive requests arriving continuously from a live product feature, misnamed "batch" internally because it runs "in the background" from the caller's point of view.
> 1. Ask for the actual SLO: is there a deadline (batch) or a per-request latency budget (online, even if traffic-shaped)?
> 2. Check arrival pattern: a Poisson-ish continuous arrival stream with a latency budget is online inference wearing a batch costume; a large fixed corpus processed once with a completion deadline is genuine batch inference.
> 3. Misclassifying this leads to the wrong infrastructure twice: provisioning for throughput-only (no autoscaling, no P99 tracking) when the real requirement is tail latency, or over-provisioning idle always-on capacity for what is actually a nightly job.
> **Conclusion:** "Batch" and "online" are properties of the SLO and arrival pattern, not of internal team vocabulary — always verify against the measurable outcome column, not the label the requester uses.

➕ **Shortcut/mnemonic:** *"T-F-B-O-E: Time-to-train, Fit memory, Batch deadline, Online tail, Evaluation repeatability."* — five workload rows, five different primary metrics; if you can't name the primary metric in one sentence, you haven't classified the workload yet.

➕ **Diagram: arrival-pattern test for "batch" vs "online" (the field mistake, visualized)**
```
Genuine batch inference:
   fixed corpus ──────────────────────────────▶ done by deadline
   [██████████████████████████████████]   (one large sweep, no per-item SLO)
                                         └── success = finished before 06:00

"Batch" wearing a costume (actually online):
   requests: ▪  ▪▪ ▪ ▪▪▪ ▪ ▪▪ ▪ ▪▪▪▪ ▪ ▪▪ ▪ ▪▪▪ ...   (continuous Poisson-ish arrivals)
             └┬┘└┬┘        each request has its own latency budget
              ▼   ▼
           P95/P99 per request, not a corpus completion time
                                         └── success = every request under its budget
```
Same word ("batch") in the requester's vocabulary, two completely different infrastructure answers — the arrival pattern and the presence/absence of a per-item latency budget is the tell, not the label.

➕ **Diagram: workload row → dominant metric → chapter map**
```
Pretraining/Fine-tuning ──▶ GPU-hours, collectives, checkpoints ──▶ Ch2, DD1
Batch inference         ──▶ throughput, queue completion time   ──▶ (Ch1 scope)
Online inference        ──▶ P95/P99, TTFT/TPOT, autoscaling     ──▶ Ch3-6, DD2-5
Evaluation              ──▶ repeatability, versioning           ──▶ (cross-cutting)
```
The classification isn't academic — it is a routing table that tells you which later chapter's mechanisms actually apply to the workload in front of you.
