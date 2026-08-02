---
title: "Chapter 1 - Distributed systems performance for GPU jobs"
slug: "chapter-1-distributed-systems-performance-for-gpu-jobs"
sidebar_position: 1
description: "Chapter 1 - Distributed systems performance for GPU jobs — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---

| Component | Job in the system |
|---|---|
| Slurm | Allocates resources and schedules batch jobs |
| MPI/PMIx | Starts/coordinates processes and enables communication |
| NCCL | Performs GPU-focused collective communication |
| InfiniBand/RoCE | Low-latency, high-throughput network transports supporting RDMA |
| RDMA | Moves data between hosts with reduced CPU involvement/copies |
| Parallel filesystem | Serves large shared datasets/checkpoints across nodes |
| Enroot/Pyxis | Runs containerized user space within Slurm allocations |
| BCM | Manages bare-metal cluster images, configuration, and lifecycle |

These components are not substitutes. Slurm deciding that eight GPUs belong to a job does not prove MPI ranks launched, NCCL selected the intended fabric, storage delivered data fast enough, or the GPUs are healthy.

1. Scheduler allocates nodes, CPUs, GPUs, memory, and time.
2. Launcher starts one or more ranks on each node.
3. Each rank reads/prepares a portion of training data.
4. GPUs perform forward and backward computation.
5. Ranks exchange/aggregate gradients through collectives.
6. Optimizer updates model weights.
7. Periodically, the job writes a checkpoint to storage.
8. The next step repeats; the slowest synchronized boundary affects all ranks.
```

This trace gives you failure domains: scheduling, launch, data, GPU/driver, communication/fabric, numerical/application behavior, and checkpoint/storage.

```bash
lspci | grep -i nvidia
nvidia-smi
nvidia-smi topo -m
python -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.device_count())"
```

Predict what each command proves before running it. `lspci` seeing hardware does not prove the driver loaded. `nvidia-smi` working does not prove a framework uses the expected library stack. Framework device visibility does not prove multi-node collectives or performance.

## From one process to a distributed job

| Scale | New dependency |
|---|---|
| One process on CPU | operating system, memory, local files |
| One GPU | driver, CUDA libraries, device memory |
| Several GPUs in one node | PCIe/NVLink/NVSwitch topology and synchronization |
| Several nodes | NIC/HCA, switch fabric, addressing, transport and rank coordination |
| Large cluster | scheduler policy, shared storage, health gating and failure domains |

## Essential language

- A **distributed job** uses processes/resources on more than one machine.
- A **rank** is one process identity in a coordinated parallel job.
- A **collective** is a group communication operation such as broadcast or all-reduce.
- **MPI** is a standard and library ecosystem for communication among processes.
- **NCCL** is NVIDIA's library for efficient GPU collective communication.
- **Slurm** is a scheduler allocating resources and launching batch jobs; it is not a communication library.
- **RDMA** enables direct memory-oriented network transfers with reduced CPU/copy involvement.
- **InfiniBand** is a purpose-built fabric supporting RDMA.
- **RoCE** carries RDMA semantics over Ethernet and depends on correct Ethernet fabric design.
- A **parallel filesystem** serves shared data at scale across many clients.
- A **checkpoint** is saved workload state used to resume after interruption.

## The normal training path

The scheduler allocates nodes and GPUs. A launcher starts ranks. Each rank receives data and drives GPU computation. Collectives exchange gradients or other tensors. Storage supplies datasets and receives checkpoints. At synchronized boundaries, one slow rank can delay the entire job.

This gives a clean troubleshooting order: allocation → rank launch → local GPU → inter-process bootstrap → network path → collective behavior → storage/data → application correctness.

## A real-life example

A job scales well from one to eight GPUs on one server but poorly across two servers. The change introduces rank bootstrap, NIC selection, switch fabric, RDMA/NCCL configuration and cross-node synchronization. The scheduler may have allocated correct resources while communication still falls back to a slower path. Prove each new boundary rather than blaming "the network" broadly.

## Collective communication and stragglers

An all-reduce combines values across ranks and distributes the result. Every participating rank must reach compatible collective calls. One missing, delayed or mismatched rank can stall peers.

For data-parallel training:

```mermaid
flowchart TD
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["local forward/backward compute"]
  n1["gradients become ready"]
  n2["NCCL all-reduce exchanges/combines gradients"]
  n3["every replica receives the result"]
  n4["optimizer step continues"]
```

Measure step-time distribution, per-rank timing and collective performance. Fleet averages can hide one slow node whose delay becomes global at synchronization.

## Safe observation commands

Commands vary by distribution and installed fabric tooling:

```bash
ip -brief link
ip route
ethtool INTERFACE
nvidia-smi topo -m
ibv_devices
ibv_devinfo
```

Read-only output proves local observations only. A link reporting Up does not prove end-to-end bandwidth, correct routing, congestion behavior or GPU Direct use.

## Common beginner mistakes

- calling Slurm, MPI and NCCL interchangeable;
- assuming RDMA means traffic bypasses every host/software concern;
- benchmarking one message size and generalizing to the workload;
- using aggregate bandwidth while ignoring tail/straggler behavior;
- treating a mounted filesystem as proof it can meet checkpoint demand;
- forcing interface environment variables before recording automatic selection;
- comparing theoretical line rate directly with application goodput without protocol/collective context.

## Start with the basics

### What this section does and does not do

This section builds the basic working model of High-Performance Computing (HPC — a discipline focused on solving one large computation as fast as possible by spreading it across many machines at once) that the rest of this chapter assumes you already have. It will not make you able to operate a cluster or write parallel code. Its only job is to make sure that when the rest of this chapter says "the scheduler," "the fabric," or "the ranks," you already have a picture in your head for what those words point at, instead of encountering the term and the deep technical detail about it at the same moment.

If you're a senior DevOps or backend engineer, almost everything in your existing working model of "operating servers" still applies here. HPC does not throw that away. It adds one new, genuinely different problem on top, and that problem is this section's real subject.

### The core difference: coordinated versus independent work

#### The problem, in plain terms

Think about a typical web service you've operated: many independent users send many independent requests, and many independent servers behind a load balancer each handle some subset of those requests. If one server is slow or crashes, the others keep going. Requests don't need to know about each other. This is **independent, uncoordinated work** — every unit of work (each request) can succeed or fail on its own, and the system's overall health is roughly "the sum of many small, separate outcomes."

HPC workloads are usually the opposite shape. A single large computation — say, training one large AI model — is split into many pieces, but those pieces are not independent. They are all part of *one job*, running at the same time, and they must actively cooperate to make progress. If you split a model across 64 GPUs spread over 8 physical machines, all 64 GPUs need to be running, healthy, and exchanging data with each other *simultaneously* for the job to make any progress at all. One slow or crashed GPU doesn't just fail its own eighth of the work — it can stall the entire job, because the other 63 are waiting on it.

#### Naming the concept

Call this **coordinated parallel computing**: many processes (a process is just a running copy of a program) that are all part of one logical job, running at the same time on different machines, that must communicate and stay in step with each other to make progress. This is the one idea underneath almost everything HPC-specific in the rest of this chapter.

#### The basic shape

```mermaid
flowchart LR
    subgraph WEB["Typical web service — independent"]
        R1[Request] --> S1[Server A] --> D1[Done]
        R2[Request] --> S2[Server B] --> D2[Done]
        R3[Request] --> S3[Server C] --> D3[Done]
    end
```

```mermaid
flowchart LR
    subgraph HPC["Typical HPC job — coordinated"]
        P1[Piece 1 on GPU A] --> M[Must all progress together, exchanging data]
        P2[Piece 2 on GPU B] --> M
        P3[Piece 3 on GPU C] --> M
    end
```

In the web-service diagram, one slowdown doesn't block the others. In the HPC diagram, one stall blocks all.

#### Check your understanding

**Q1: Why does a single slow machine matter so much more in an HPC job than in a typical web service?**
A: In a web service, each request is handled independently, so one slow server only slows down the requests it personally handles. In an HPC job, all the machines are collaborating on one piece of work at the same time, so if one machine falls behind, the others must wait for it — the whole job runs at the speed of its slowest participant.

**Q2: Is HPC just "DevOps but with bigger machines"? Why or why not?**
A: No. The machines and the OS-level skills are similar, but the workload shape is fundamentally different — coordinated, simultaneous, interdependent work versus independent, uncoordinated requests. That difference is why HPC has its own scheduling model, its own networking priorities, and its own failure modes, which is what the rest of this chapter covers.

### What a "cluster" means here

#### The problem

If you have one big coordinated job that needs, say, 8 machines with GPUs at once, you can't just let each machine be "someone's individual server" that people log into and use however they like. You need a way to treat a group of machines as one shared pool of capacity that jobs can be handed out of, on demand, without two different people accidentally grabbing the same machine for two different jobs.

#### Naming the concept

That shared pool is a **cluster**: a group of machines that are managed and allocated together as one resource, rather than as separate individually-owned servers. Being "in the cluster" means a machine's compute capacity (its CPUs, memory, and GPUs) is available to be handed out to whichever job needs it next, under the control of one central system — not that any one person is logged into it doing their own thing.

#### The basic shape

A cluster typically has:
- **Compute nodes** — the machines that actually run jobs (a "node" is just HPC vocabulary for one machine in the cluster).
- **A scheduler** — the central system that decides which job gets which nodes and when (covered next).
- A shared way for jobs to read/write data that any node might need to access (covered later in this chapter as cluster storage).

#### Check your understanding

**Q1: What's the difference between "a machine I personally SSH into and run things on" and "a compute node in a cluster"?**
A: With a personal machine, you decide what runs on it and when. A compute node's capacity is handed out by a central scheduler to whichever job is next in line — you generally don't decide to run something on a specific node directly; you ask the cluster for capacity and it's assigned to you.

### What problem a job scheduler solves

#### The problem

If a cluster has, say, 40 nodes, and at any moment several different teams each want to run a job that needs some number of those nodes, something has to decide: who gets which nodes, right now, and who has to wait? Left ungoverned, two jobs could easily end up assigned to the same GPU at the same time, corrupting both jobs' results without either job's owner ever knowing why their run behaved strangely.

#### Naming the concept

A **job scheduler** is the system that solves this: it takes requests for compute capacity ("I need 8 nodes with GPUs for the next 4 hours"), decides when and where each request can be satisfied, queues requests when the cluster is fully booked, and guarantees that no two jobs are ever handed the same piece of hardware at the same time. The rest of this chapter goes deep on **Slurm**, the most common scheduler in HPC — this section only needs you to have the concept, not Slurm's commands or internals.

#### The analogy

A job scheduler is like a restaurant host, not a "first person in the door gets the first open table" free-for-all. A party of 8 doesn't get seated at a 2-top just because that table is currently free — the host holds them until a table (or combination of tables) that actually fits becomes available, seats smaller parties at smaller tables in the meantime, and never double-books a table to two parties at once. Swap "party of a given size" for "job that needs a given number of GPUs," and "table" for "node," and you have the core of what a scheduler does: it matches jobs to hardware based on what each job actually needs and what's actually free, queuing when nothing fits yet, and never handing the same hardware to two jobs simultaneously.

#### First real example

You won't run real Slurm commands in this section (later in this chapter does), but here is the shape of what a request looks like conceptually, so it's not alien later:

```mermaid
flowchart TD
    A[Job request: need 2 nodes, 8 GPUs total, for up to 4 hours] --> B{Scheduler checks: are 2 free nodes with 8 GPUs available now?}
    B -->|Yes| C[Job starts immediately, those nodes are marked busy]
    B -->|No| D[Job is placed in a queue, started later when capacity frees up]
```

#### Check your understanding

**Q1: Why can't a cluster just let jobs grab whatever node they want, whenever they want?**
A: Because two jobs could end up assigned to the same hardware at the same time, silently corrupting both, and there'd be no fair or predictable way to decide who runs next when the cluster is busy. A central scheduler prevents both problems.

**Q2: In the restaurant analogy, what does "queuing" correspond to on a cluster?**
A: A job whose required nodes/GPUs aren't free yet waits in the scheduler's queue, the same way a party waits for a table to open up, rather than being seated (started) on hardware that isn't actually free.

### What MPI is, at the concept level

#### The problem

Once a job has been handed several machines by the scheduler, those machines are each running their own separate copy of the program (remember: separate processes, one logical job). But they need to actually cooperate — exchange partial results, agree on when a step is done, combine data — not just run alongside each other in silence. Without a way to talk to each other, "8 machines running the same program" is just 8 unrelated programs that happen to have started at the same time.

#### Naming the concept

**MPI (Message Passing Interface)** is a standard way for many separate running processes — usually one per machine or one per GPU — to send messages to each other and coordinate, so that a computation split across many machines can behave as one coherent, cooperating job instead of many isolated ones. This section deliberately does not teach MPI's actual API (its function calls, its send/receive mechanics) — that's covered later in this chapter. The only job here is to make sure the term and its purpose aren't alien when you get there.

#### The analogy

Think of a group project where each person owns one section of the work, but the sections depend on each other — you can't write your section's conclusion until you know roughly what the other sections found. MPI is the mechanism by which each "team member" (each process) can message the others: "here's what I've got so far," "wait for me before you move to the next step," "here's the piece you asked for." Each participant does their own share of the work, but they periodically must synchronize and exchange information for the whole thing to add up to a correct final result.

#### The basic shape

```mermaid
flowchart LR
    A[Process on Machine A] <-->|messages| B[Process on Machine B]
    A --> C[Does its share of the work]
    B --> D[Does its share of the work]
    C --> E[Periodically sync up: exchange partial results, agree a step is complete]
    D --> E
```

#### Check your understanding

**Q1: Why isn't "8 machines running the same program" automatically a coordinated HPC job?**
A: Because without something like MPI letting the processes communicate, each machine's copy of the program would run in isolation, unaware of the others' progress or results — there'd be no mechanism for them to actually cooperate on one shared computation.

**Q2: In your own words, what does MPI let separate processes do, without worrying about the actual function calls yet?**
A: It lets separate processes running as part of one job send each other messages and synchronize, so a computation split across many machines/GPUs can behave as one cooperating whole rather than many unrelated programs.

### Why network speed matters so much more here

#### The one-sentence version

In HPC, machines are constantly exchanging data *in the middle of* the computation — not just at the start and end of a request — so a slow network doesn't just add a bit of latency to one operation; it can slow down the entire coordinated job for every participant, because everyone is waiting on those in-flight exchanges to keep going.

#### Why this is different from typical web services

A typical web request touches the network mainly at its boundaries: the request comes in, maybe a database is queried once or twice, and a response goes out. The bulk of the work in between is often local computation. In an HPC job using MPI-style coordination, the processes are exchanging data with each other repeatedly *throughout* the run — a slow or congested network means every one of those exchanges takes longer, and because the whole job is only as fast as its slowest participant (recall the earlier section), network slowness effectively becomes computation slowness for the entire job, not just a delay for one exchange.

This is exactly why the rest of this chapter spends so much time on high-speed networking technologies (RDMA, InfiniBand, and similar) instead of treating "the network" as a solved, uninteresting layer the way many web-service architectures can afford to.

#### Evidence vs. proof: a first example

Suppose a training job is running much slower than expected across its 8 machines, and you run a command that shows one network interface with unusually high retransmit counts on one machine.

- **What this evidence DOES show:** that machine's network interface is experiencing packet loss or congestion severe enough to trigger retransmits.
- **What it does NOT show:** that this network issue is actually the cause of the job's slowness (it could be a coincidental, unrelated problem, or a symptom of something else, like a failing NIC), that this is the *only* affected machine, or that fixing this one interface will resolve the whole job's slowness.
- **What additional evidence you'd want:** per-machine timing of the coordination steps (are the other 7 machines all shown as waiting specifically on this one?), confirmation the retransmit counts started around the same time the slowdown began, and ideally a comparison against a known-healthy run's baseline retransmit rate. Only with that combination would you be near a confident conclusion — one number is a lead, not a verdict.

#### Check your understanding

**Q1: Why does a slow network hurt an HPC job more than it hurts a typical web request?**
A: Because HPC processes exchange data with each other continuously throughout the computation, not just at request boundaries, and the whole job progresses only as fast as its slowest, most-delayed exchange — so network slowness compounds into overall job slowness for everyone involved, not just a one-time added delay.

**Q2: You see one machine with high network retransmits during a slow training job. Is that proof the network caused the slowdown?**
A: No — it's evidence worth investigating, but by itself it doesn't rule out other causes (a different failing component, an unrelated coincidence) or confirm this is even the machine the rest of the job is waiting on. You'd want timing correlation and a healthy-run baseline before treating it as the cause.

### Glossary

- **HPC (High-Performance Computing)** — a discipline focused on solving one large computation as fast as possible by spreading it across many machines working together at once.
- **Coordinated parallel computing** — many processes, all part of one logical job, running simultaneously on different machines and actively communicating to make progress together.
- **Node** — HPC vocabulary for one machine that is part of a cluster.
- **Cluster** — a group of machines managed and allocated together as one shared resource pool, rather than as separate individually-owned servers.
- **Job scheduler** — the system that decides which job gets which machines and when, queues jobs when the cluster is busy, and prevents two jobs from being given the same hardware at once (Slurm is the example named in this chapter).
- **MPI (Message Passing Interface)** — a standard way for many separate processes, usually one per machine or GPU, to send each other messages and coordinate so a split computation behaves as one cooperating job.
- **Rank** — MPI vocabulary (mentioned here only so it isn't alien later) for the identifying number given to each process participating in a coordinated job.

### Before you go deeper, make sure you can...

- Explain, without jargon, why HPC workloads are "one coordinated job across many machines" rather than "many independent requests," and why that changes what matters operationally.
- Describe what a cluster is, in contrast to a set of individually-owned servers.
- Explain, using the restaurant analogy or your own equivalent, what problem a job scheduler like Slurm solves.
- Explain, at the concept level only, what MPI lets separate processes do — without needing its API yet.
- State the one-sentence reason network speed matters more in HPC than in typical web services, and give a first example of evidence (not proof) that a network issue is affecting a coordinated job.

With that model in place, here's what actually limits performance in a distributed GPU job.

**VOLUME 6**

**HPC, Networking and Storage for AI**

Distributed communication, RDMA fabrics, storage paths, Slurm and performance troubleshooting

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises

Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.

**Learning outcome:** Build a scaling-efficiency model that separates compute, communication, synchronization and I/O.

A single GPU can run independently. Multiple GPUs introduce coordination. Within a node, peer links/topology matter; across nodes, the network fabric and collective library matter. Scaling efficiency falls when communication/synchronization consumes an increasing fraction of step time.

```
speedup = throughput_N / throughput_1
efficiency = speedup / N
# Example: 8 GPUs give 6.4x throughput -> 80% scaling efficiency
```

Do not treat efficiency loss as automatically "network." Input pipelines, CPU preprocessing, imbalance and framework configuration can all create idle time. Profile the phase that grew with scale.

**The step-time decomposition the formula above hides — this is the model an interviewer wants you to draw:**
```
step_time = compute_time + communication_time + sync_wait_time + data_load_wait_time

At N=1:  step_time ≈ compute_time                    (nothing to communicate or sync)
At N=8:  step_time = compute_time/8*  + comm_time(N) + sync_wait(N) + data_wait(N)
                      *if compute scales linearly, which is the best case, not the default

efficiency_loss = 1 - (step_time(N) / N) / step_time(1)
```
The single most useful move in this chapter: **efficiency is a symptom, not a diagnosis.** "80% efficiency" tells you nothing about *which* term in the right-hand side grew. You have to instrument each term separately — that's the whole content of this chapter, restated as an equation.

**View of where each term actually lives in the training loop:**
```mermaid
flowchart LR
    A["data_load
    (CPU/storage)
    dataloader workers"] --> B["compute
    (GPU forward/backward)"]
    B --> C["communicate
    (AllReduce over NIC/fabric)"]
    C --> D["sync_wait
    (barrier — wait for slowest rank)"]
    D -.->|next step begins| A
```
Each box has a distinct tool: `nvidia-smi dmon` / GPU util for compute, `nccl-tests` / NIC counters for communicate, per-rank step-time variance for sync_wait, and `iostat`/dataloader worker queue depth for data_load. A profiler that only reports "GPU util 62%" collapses all four boxes into one number — the job in this chapter is to separate them again.

**Sample `nccl-tests` output, annotated** (the first thing you'd actually run to separate "compute" from "communicate"):
```mermaid
flowchart TD
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["$ ./build/all_reduce_perf -b 8M -e 8M -f 2 -g 8"]
  n1["# size count type redop time algbw busbw #wrong"]
  n2["8388608 2097152 float sum 3821 2.19 3.84 0 ← 8 GPUs, single node"]
  n3["#"]
  n4["# Out-of-place hack: time in us, algbw/busbw in GB/s"]
```
`busbw` (bus bandwidth — normalized for the AllReduce ring's 2x data-movement factor) is the number to compare against the fabric's theoretical max, not `algbw`. If `busbw` is far below the NIC's line rate (e.g. 3.84 GB/s on a 200Gb/s = 25GB/s NIC), that gap is your `communication_time` term inflating — run this in isolation from the actual training job specifically so you're not also measuring `compute_time` and `data_load_wait_time` in the same number.

**Diagram: why the barrier makes the mean lie**
```mermaid
flowchart TD
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["rank0 compute ██████████████████ | idle waiting at barrier ░░░░░░░░░░"]
  n1["rank1 compute ██████████████████ | idle waiting at barrier ░░░░░░░░░░"]
  n2["rank2 compute ██████████████████ | idle waiting at barrier ░░░░░░░░░░"]
  n3["rank3 compute ████████████████████████████████████████████ (straggler)"]
  n4["barrier releases here —"]
  n5["every other rank paid"]
  n6["for rank3's slowness"]
```
Average GPU utilization across the four ranks looks moderate, but step_time is set entirely by the slowest rank. This is why "check the mean" hides the exact fault the triage below is built to find.

**Worked scenario — the "80% efficiency, which term?" triage, made concrete:**
> **Situation:** Scaling from 1 to 8 nodes (64 GPUs), measured efficiency drops from 100% to 71%. The on-call engineer's first instinct is "check the network."
> 1. Capture per-step GPU utilization time series across all 64 GPUs, not the cluster average — a 71% *average* efficiency could be 8 nodes all uniformly slower (fabric-wide issue) or 1 node dramatically slower dragging the barrier (straggler — see Deep Dive 1).
> 2. Run `nccl-tests all_reduce_perf` node-pair-by-node-pair at the actual message size the model uses (not the tool's default) — isolates `communication_time` from the live job's `compute_time` and `data_load_wait_time`.
> 3. If `nccl-tests` numbers look fine in isolation but the live job still shows the gap, suspect `sync_wait_time` (one rank slow) or `data_load_wait_time` (dataloader workers under-provisioned as GPU count — and therefore CPU demand — increased 8x).
> 4. Only if `nccl-tests` itself degrades at scale do you have a genuine fabric/topology problem — and now you have a reproducible, isolated number to hand to the network team instead of "training is slower."
> **Interview-ready line:** "Scaling efficiency is the aggregate signal — I never diagnose from it directly, I use it to decide which of four separate measurements to take next."

**Shortcut — the one-line working model for fast recall:** *"Compute scales with GPUs, communication scales with the fabric, and sync_wait scales with your worst node — always suspect the max, not the mean."*

## Practice
1. Given per-step GPU utilization traces for 8 nodes where 7 show 95% and 1 shows 40%, write the one-sentence hypothesis you'd test first, and the exact command to test it.
2. A team reports "scaling efficiency dropped after we doubled batch size per GPU." Explain why this is expected to change `compute_time` and `data_load_wait_time` simultaneously, and how you'd isolate which one moved.
