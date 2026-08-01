---
title: "7 - HPC fundamentals: what you need before Volumes 6 and 10"
slug: "7-hpc-fundamentals-before-volume-6-and-10"
sidebar_position: 7
description: "HPC fundamentals: what you need before Volumes 6 and 10 — Foundations Primer."
source_document: "Authored directly for the Foundations Primer — no DOCX source."
---

## What this chapter does and does not do

This chapter builds the basic mental model of High-Performance Computing (HPC — a discipline focused on solving one large computation as fast as possible by spreading it across many machines at once) that Volume 6 (HPC, Networking and Storage for AI) and Volume 10's Slurm and MPI chapters assume you already have. It will not make you able to operate a cluster or write parallel code. Its only job is to make sure that when those volumes say "the scheduler," "the fabric," or "the ranks," you already have a picture in your head for what those words point at, instead of encountering the term and the deep technical detail about it at the same moment.

If you're a senior DevOps or backend engineer, almost everything in your existing mental model of "operating servers" still applies here. HPC does not throw that away. It adds one new, genuinely different problem on top, and that problem is this chapter's real subject.

## The core difference: coordinated versus independent work

### The problem, in plain terms

Think about a typical web service you've operated: many independent users send many independent requests, and many independent servers behind a load balancer each handle some subset of those requests. If one server is slow or crashes, the others keep going. Requests don't need to know about each other. This is **independent, uncoordinated work** — every unit of work (each request) can succeed or fail on its own, and the system's overall health is roughly "the sum of many small, separate outcomes."

HPC workloads are usually the opposite shape. A single large computation — say, training one large AI model — is split into many pieces, but those pieces are not independent. They are all part of *one job*, running at the same time, and they must actively cooperate to make progress. If you split a model across 64 GPUs spread over 8 physical machines, all 64 GPUs need to be running, healthy, and exchanging data with each other *simultaneously* for the job to make any progress at all. One slow or crashed GPU doesn't just fail its own eighth of the work — it can stall the entire job, because the other 63 are waiting on it.

### Naming the concept

Call this **coordinated parallel computing**: many processes (a process is just a running copy of a program) that are all part of one logical job, running at the same time on different machines, that must communicate and stay in step with each other to make progress. This is the one idea underneath almost everything HPC-specific in Volumes 6 and 10.

### The basic shape

```
Typical web service:                 Typical HPC job:
[req] -> [server A] -> done          [piece 1 on GPU A] --\
[req] -> [server B] -> done          [piece 2 on GPU B] ---> must all progress
[req] -> [server C] -> done          [piece 3 on GPU C] --/  together, exchanging
(independent; one slowdown           data with each other
 doesn't block the others)           (one stall blocks all)
```

### Check your understanding

**Q1: Why does a single slow machine matter so much more in an HPC job than in a typical web service?**
A: In a web service, each request is handled independently, so one slow server only slows down the requests it personally handles. In an HPC job, all the machines are collaborating on one piece of work at the same time, so if one machine falls behind, the others must wait for it — the whole job runs at the speed of its slowest participant.

**Q2: Is HPC just "DevOps but with bigger machines"? Why or why not?**
A: No. The machines and the OS-level skills are similar, but the workload shape is fundamentally different — coordinated, simultaneous, interdependent work versus independent, uncoordinated requests. That difference is why HPC has its own scheduling model, its own networking priorities, and its own failure modes, which is what the rest of this chapter and Volumes 6/10 cover.

## What a "cluster" means here

### The problem

If you have one big coordinated job that needs, say, 8 machines with GPUs at once, you can't just let each machine be "someone's individual server" that people log into and use however they like. You need a way to treat a group of machines as one shared pool of capacity that jobs can be handed out of, on demand, without two different people accidentally grabbing the same machine for two different jobs.

### Naming the concept

That shared pool is a **cluster**: a group of machines that are managed and allocated together as one resource, rather than as separate individually-owned servers. Being "in the cluster" means a machine's compute capacity (its CPUs, memory, and GPUs) is available to be handed out to whichever job needs it next, under the control of one central system — not that any one person is logged into it doing their own thing.

### The basic shape

A cluster typically has:
- **Compute nodes** — the machines that actually run jobs (a "node" is just HPC vocabulary for one machine in the cluster).
- **A scheduler** — the central system that decides which job gets which nodes and when (covered next).
- A shared way for jobs to read/write data that any node might need to access (Volume 6 covers this in depth as cluster storage).

### Check your understanding

**Q1: What's the difference between "a machine I personally SSH into and run things on" and "a compute node in a cluster"?**
A: With a personal machine, you decide what runs on it and when. A compute node's capacity is handed out by a central scheduler to whichever job is next in line — you generally don't decide to run something on a specific node directly; you ask the cluster for capacity and it's assigned to you.

## What problem a job scheduler solves

### The problem

If a cluster has, say, 40 nodes, and at any moment several different teams each want to run a job that needs some number of those nodes, something has to decide: who gets which nodes, right now, and who has to wait? Left ungoverned, two jobs could easily end up assigned to the same GPU at the same time, corrupting both jobs' results without either job's owner ever knowing why their run behaved strangely.

### Naming the concept

A **job scheduler** is the system that solves this: it takes requests for compute capacity ("I need 8 nodes with GPUs for the next 4 hours"), decides when and where each request can be satisfied, queues requests when the cluster is fully booked, and guarantees that no two jobs are ever handed the same piece of hardware at the same time. Volume 6 and Volume 10 go deep on **Slurm**, the most common scheduler in HPC — this chapter only needs you to have the concept, not Slurm's commands or internals.

### The analogy

A job scheduler is like a restaurant host, not a "first person in the door gets the first open table" free-for-all. A party of 8 doesn't get seated at a 2-top just because that table is currently free — the host holds them until a table (or combination of tables) that actually fits becomes available, seats smaller parties at smaller tables in the meantime, and never double-books a table to two parties at once. Swap "party of a given size" for "job that needs a given number of GPUs," and "table" for "node," and you have the core of what a scheduler does: it matches jobs to hardware based on what each job actually needs and what's actually free, queuining when nothing fits yet, and never handing the same hardware to two jobs simultaneously.

### First real example

You won't run real Slurm commands in this primer (Volume 10 owns that), but here is the shape of what a request looks like conceptually, so it's not alien later:

```
Job request: "I need 2 nodes, 8 GPUs total, for up to 4 hours"
   -> Scheduler checks: are 2 free nodes with 8 GPUs available right now?
       - Yes -> job starts immediately, those nodes are marked busy
       - No  -> job is placed in a queue, started later when capacity frees up
```

### Check your understanding

**Q1: Why can't a cluster just let jobs grab whatever node they want, whenever they want?**
A: Because two jobs could end up assigned to the same hardware at the same time, silently corrupting both, and there'd be no fair or predictable way to decide who runs next when the cluster is busy. A central scheduler prevents both problems.

**Q2: In the restaurant analogy, what does "queuing" correspond to on a cluster?**
A: A job whose required nodes/GPUs aren't free yet waits in the scheduler's queue, the same way a party waits for a table to open up, rather than being seated (started) on hardware that isn't actually free.

## What MPI is, at the concept level

### The problem

Once a job has been handed several machines by the scheduler, those machines are each running their own separate copy of the program (remember: separate processes, one logical job). But they need to actually cooperate — exchange partial results, agree on when a step is done, combine data — not just run alongside each other in silence. Without a way to talk to each other, "8 machines running the same program" is just 8 unrelated programs that happen to have started at the same time.

### Naming the concept

**MPI (Message Passing Interface)** is a standard way for many separate running processes — usually one per machine or one per GPU — to send messages to each other and coordinate, so that a computation split across many machines can behave as one coherent, cooperating job instead of many isolated ones. This chapter deliberately does not teach MPI's actual API (its function calls, its send/receive mechanics) — that belongs to Volume 10's MPI chapter. The only job here is to make sure the term and its purpose aren't alien when you get there.

### The analogy

Think of a group project where each person owns one section of the work, but the sections depend on each other — you can't write your section's conclusion until you know roughly what the other sections found. MPI is the mechanism by which each "team member" (each process) can message the others: "here's what I've got so far," "wait for me before you move to the next step," "here's the piece you asked for." Each participant does their own share of the work, but they periodically must synchronize and exchange information for the whole thing to add up to a correct final result.

### The basic shape

```
Process on Machine A  <---- messages ---->  Process on Machine B
       |                                            |
   (does its share                            (does its share
    of the work)                               of the work)
       |                                            |
       +---------- periodically sync up ------------+
                 (exchange partial results,
                  agree that a step is complete)
```

### Check your understanding

**Q1: Why isn't "8 machines running the same program" automatically a coordinated HPC job?**
A: Because without something like MPI letting the processes communicate, each machine's copy of the program would run in isolation, unaware of the others' progress or results — there'd be no mechanism for them to actually cooperate on one shared computation.

**Q2: In your own words, what does MPI let separate processes do, without worrying about the actual function calls yet?**
A: It lets separate processes running as part of one job send each other messages and synchronize, so a computation split across many machines/GPUs can behave as one cooperating whole rather than many unrelated programs.

## Why network speed matters so much more here

### The one-sentence version

In HPC, machines are constantly exchanging data *in the middle of* the computation — not just at the start and end of a request — so a slow network doesn't just add a bit of latency to one operation; it can slow down the entire coordinated job for every participant, because everyone is waiting on those in-flight exchanges to keep going.

### Why this is different from typical web services

A typical web request touches the network mainly at its boundaries: the request comes in, maybe a database is queried once or twice, and a response goes out. The bulk of the work in between is often local computation. In an HPC job using MPI-style coordination, the processes are exchanging data with each other repeatedly *throughout* the run — a slow or congested network means every one of those exchanges takes longer, and because the whole job is only as fast as its slowest participant (recall the earlier section), network slowness effectively becomes computation slowness for the entire job, not just a delay for one exchange.

This is exactly why Volume 6 spends multiple chapters on high-speed networking technologies (RDMA, InfiniBand, and similar) instead of treating "the network" as a solved, uninteresting layer the way many web-service architectures can afford to.

### Evidence vs. proof: a first example

Suppose a training job is running much slower than expected across its 8 machines, and you run a command that shows one network interface with unusually high retransmit counts on one machine.

- **What this evidence DOES show:** that machine's network interface is experiencing packet loss or congestion severe enough to trigger retransmits.
- **What it does NOT show:** that this network issue is actually the cause of the job's slowness (it could be a coincidental, unrelated problem, or a symptom of something else, like a failing NIC), that this is the *only* affected machine, or that fixing this one interface will resolve the whole job's slowness.
- **What additional evidence you'd want:** per-machine timing of the coordination steps (are the other 7 machines all shown as waiting specifically on this one?), confirmation the retransmit counts started around the same time the slowdown began, and ideally a comparison against a known-healthy run's baseline retransmit rate. Only with that combination would you be near a confident conclusion — one number is a lead, not a verdict.

### Check your understanding

**Q1: Why does a slow network hurt an HPC job more than it hurts a typical web request?**
A: Because HPC processes exchange data with each other continuously throughout the computation, not just at request boundaries, and the whole job progresses only as fast as its slowest, most-delayed exchange — so network slowness compounds into overall job slowness for everyone involved, not just a one-time added delay.

**Q2: You see one machine with high network retransmits during a slow training job. Is that proof the network caused the slowdown?**
A: No — it's evidence worth investigating, but by itself it doesn't rule out other causes (a different failing component, an unrelated coincidence) or confirm this is even the machine the rest of the job is waiting on. You'd want timing correlation and a healthy-run baseline before treating it as the cause.

## Glossary

- **HPC (High-Performance Computing)** — a discipline focused on solving one large computation as fast as possible by spreading it across many machines working together at once.
- **Coordinated parallel computing** — many processes, all part of one logical job, running simultaneously on different machines and actively communicating to make progress together.
- **Node** — HPC vocabulary for one machine that is part of a cluster.
- **Cluster** — a group of machines managed and allocated together as one shared resource pool, rather than as separate individually-owned servers.
- **Job scheduler** — the system that decides which job gets which machines and when, queues jobs when the cluster is busy, and prevents two jobs from being given the same hardware at once (Slurm is the example named in Volumes 6 and 10).
- **MPI (Message Passing Interface)** — a standard way for many separate processes, usually one per machine or GPU, to send each other messages and coordinate so a split computation behaves as one cooperating job.
- **Rank** — MPI vocabulary (mentioned here only so it isn't alien later) for the identifying number given to each process participating in a coordinated job.

## You're ready for Volume 6 and Volume 10 when you can...

- Explain, without jargon, why HPC workloads are "one coordinated job across many machines" rather than "many independent requests," and why that changes what matters operationally.
- Describe what a cluster is, in contrast to a set of individually-owned servers.
- Explain, using the restaurant analogy or your own equivalent, what problem a job scheduler like Slurm solves.
- Explain, at the concept level only, what MPI lets separate processes do — without needing its API yet.
- State the one-sentence reason network speed matters more in HPC than in typical web services, and give a first example of evidence (not proof) that a network issue is affecting a coordinated job.

**Continue to:** [Volume 6, Chapter 1 — Distributed systems performance for GPU jobs](/curriculum/volume-06/chapter-1-distributed-systems-performance-for-gpu-jobs) or [Volume 10, Chapter 6 — Slurm administration: HA, accounting and upgrades](/curriculum/volume-10/chapter-6-slurm-administration-ha-accounting-and-upgrades)
