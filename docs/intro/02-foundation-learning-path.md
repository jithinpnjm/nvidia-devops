---
title: "Foundation learning path — start here if the domain is new"
slug: "foundation-learning-path"
sidebar_position: 2
description: "A prerequisite-first path through Linux, Python, AI, GPU, HPC, security and the senior curriculum."
source_document: "Authored directly as the beginner-to-senior curriculum bridge."
---

# Foundation learning path

Being senior does not mean already knowing every domain. Seniority gives you habits—decomposition, evidence, risk control, and communication—that transfer into a new technical area. This curriculum should supply the missing domain vocabulary and mental models before asking you to reason at senior depth.

## Do not study in volume-number order yet

Use this dependency path first:

```text
Stage 0: learning method and common language
   ↓
Stage 1: Linux process, memory, files, network, service
   ↓
Stage 2: small Python programs and safe system interaction
   ↓
Stage 3: containers and Kubernetes fundamentals
   ↓
Stage 4: AI workload → GPU → multi-GPU → HPC fabric/storage/scheduler
   ↓
Stage 5: observability and troubleshooting across those layers
   ↓
Stage 6: architecture, customer reasoning, and interview practice
```

Volume 10 is a cross-layer operational volume. Read it after the relevant foundations, not as an introduction to every product it mentions.

## The six-pass chapter method

Do not try to absorb a dense chapter in one reading. Use the same passes every time:

1. **Orient:** What problem does this technology solve? What sits immediately below and above it?
2. **Name:** Learn no more than ten essential terms. Explain each without using another undefined term.
3. **Trace:** Follow one request, packet, job, process, or piece of data end to end.
4. **Observe:** Run read-only commands and connect each output field to the model.
5. **Change safely:** Make one reversible change in a sandbox; predict the result first.
6. **Operate:** Break one assumption, collect evidence, recover, and explain blast radius.

Only the sixth pass is senior scenario practice. Starting there creates memorized answers without a usable model.

## Learning levels used throughout the academy

| Level | You should be able to do | Example: Slurm |
|---|---|---|
| 0 — recognize | State the problem and basic nouns | Scheduler, job, node, partition |
| 1 — explain | Draw the normal path | `sbatch` to allocation to `slurmd` |
| 2 — observe | Use read-only evidence | Explain `squeue` state and reason |
| 3 — operate | Perform a bounded change | Drain, validate, and safely resume a lab node |
| 4 — troubleshoot | Isolate the failed layer | Distinguish policy, capacity, node, and launch failures |
| 5 — design | Make trade-offs and protect production | HA, accounting, fair-share, upgrade strategy |

Do not call a subject "complete" because you read it. Mark the highest level you can demonstrate.

## Recommended routes

### One chapter per topic, foundation first

Every topic's foundation and its advanced/senior material now live on the same page — the opening chapter of each volume below starts with a **Foundations** section (plain-language definitions, concrete analogies, worked "evidence versus proof" examples, check-your-understanding questions with immediate answers, a glossary, and a readiness checklist) and flows directly into the full advanced chapter right below it. There is no separate primer volume to jump to and lose your place in.

The three pages linked below ([Systems foundation](./03-systems-foundation.md), [AI, GPU and HPC language](./04-ai-gpu-hpc-foundation.md), [Python foundation lab](./05-python-foundation-lab.md)) remain as **compressed reference companions** — dense tables and a hands-on guided lab, good for a fast lookup or a second pass once the concept is already familiar, but not the place to meet a brand-new concept for the first time.

Read **[How to use this book: evidence, not proof](./00-how-to-use-this-book-evidence-not-proof.md)** first — it's short, and every "Foundations" section below assumes you've internalized that habit.

### Route A — new to Linux, GPU, AI and HPC

1. [How to use this book: evidence, not proof](./00-how-to-use-this-book-evidence-not-proof.md)
2. [Volume 1, Chapter 1](/curriculum/volume-01/chapter-1-processes-threads-cpu-scheduling-and-load) — opens with Linux fundamentals *(companion: [Systems foundation](./03-systems-foundation.md))*
3. [Volume 1, Chapter 4](/curriculum/volume-01/chapter-4-networking-ip-routes-sockets-tcp-dns-nat-and-tls) — opens with networking fundamentals *(companion: [Systems foundation](./03-systems-foundation.md))*
4. [Volume 1, Chapter 3](/curriculum/volume-01/chapter-3-files-file-descriptors-filesystems-and-block-i-o) — opens with storage/filesystem fundamentals *(companion: [Systems foundation](./03-systems-foundation.md))*
5. Volume 1, Chapters 2, 5–6; postpone its senior deep dives.
6. [Volume 2, Chapter 1](/curriculum/volume-02/chapter-1-how-python-actually-executes-your-infrastructure-script) — opens with Python fundamentals *(hands-on companion: [Python from zero to safe automation](./05-python-foundation-lab.md))*
7. Volume 2, Chapters 2–8; build the small exercises before advanced Python — or start at [Senior DevOps labs, Tier 1](/labs) if you'd rather learn by doing.
8. [Volume 3, Chapter 1](/curriculum/volume-03/chapter-1-api-server-etcd-and-the-object-model) — opens with containers/Kubernetes fundamentals
9. Volume 3, Chapters 2–6 for the rest of Kubernetes fundamentals.
10. [Volume 4, Chapter 1](/curriculum/volume-04/chapter-1-gpu-execution-and-memory-mental-model) — opens with GPU/CUDA fundamentals, [Volume 5, Chapter 1](/curriculum/volume-05/chapter-1-classify-the-ai-workload-before-designing-infrastructure) — opens with AI/ML fundamentals, and [Volume 6, Chapter 1](/curriculum/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs) — opens with HPC fundamentals *(companion: [AI, GPU and HPC language](./04-ai-gpu-hpc-foundation.md))*
11. Volume 4, Chapters 2–6; then Volume 5, Chapters 2–5.
12. Volume 6, Chapters 2–8; then Volume 7 incident chapters.
13. [Volume 10, Chapter 3](/curriculum/volume-10/chapter-3-os-provisioning-and-linux-security-hardening) — opens with Linux/cluster security fundamentals.
14. Return to deep dives, the rest of Volume 10, architecture, and interview volumes.

### Route B — experienced DevOps engineer, new to accelerated computing

Read the Foundations section at the top of Volume 4, 5, and 6 Chapter 1 and prove their readiness checks — use the [AI, GPU and HPC language](./04-ai-gpu-hpc-foundation.md) companion page as a fast second-pass reference. Then study the rest of Volume 4, Volume 5, Volume 6, and Volume 10. Use Volume 1 Chapters 1/3/4 and Volume 10 Chapter 3's Foundations sections, and Volumes 1–3 generally, only when a readiness check exposes a gap.

### Route C — interview refresh

Do not begin with Volume 9. Select a question, identify its prerequisite topic, explain the normal path, perform or simulate one observation, and only then give the interview answer. This prevents polished but shallow responses.

## Readiness gates

### Before Kubernetes

You can explain a Linux process, PID, memory, file descriptor, filesystem mount, IP/port, DNS lookup, service, log, namespace, and cgroup. You can distinguish "process not running," "port not listening," and "network path blocked."

### Before Python infrastructure automation

You can run a script, read an error traceback from the bottom, use variables/conditions/loops/functions, read a text file, and explain exit code `0` versus non-zero. The Python foundation lab teaches these without assuming them.

### Before NVIDIA/GPU operations

You can distinguish hardware, firmware, kernel driver, user-space library, runtime, and application. You can explain host memory versus device memory and why compatibility spans layers.

### Before AI/HPC architecture

You can distinguish training from inference, CPU process from GPU kernel, single-node from distributed execution, Ethernet from RDMA, local storage from shared storage, and scheduler from communication library.

### Before senior scenarios

You can draw the healthy path, name owners at each boundary, state what evidence each layer exposes, and choose a safe first action. If not, return to the relevant foundational chapter; this is navigation, not failure.

## The notebook template

For every topic, keep one page with these headings:

```text
Problem it solves:
Five essential nouns:
Normal path:
One read-only observation:
Expected healthy evidence:
Three failure boundaries:
One safe recovery:
What I still cannot explain:
```

This turns a very large curriculum into a collection of stable mental models rather than disconnected commands.

