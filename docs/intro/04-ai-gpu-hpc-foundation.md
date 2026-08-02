---
title: "AI, GPU and HPC foundation — the language before the architecture"
slug: "ai-gpu-hpc-foundation"
sidebar_position: 4
description: "A beginner mental model for AI/ML workloads, NVIDIA GPU software and distributed HPC systems."
source_document: "Authored directly as the beginner-to-senior curriculum bridge."
---

# AI, GPU and HPC foundation

You do not need to become a data scientist or CUDA developer to operate AI infrastructure. You do need to understand what work the application performs, where data moves, and which infrastructure layer owns each step.

> **Meeting these terms for the first time?** This page is a compressed reference — tables and short definitions, not a full teaching walkthrough. For the fully explained version with analogies (the spreadsheet analogy for GPU parallelism, the four-layer driver/CUDA stack, the "what one `nvidia-smi` number does and doesn't prove" breakdown) and check-your-understanding questions, read [Volume 0, Chapter 5 (GPU/CUDA)](/curriculum/volume-00/5-nvidia-gpu-and-cuda-fundamentals-before-volume-4), [Chapter 6 (AI/ML)](/curriculum/volume-00/6-ai-and-machine-learning-fundamentals-before-volume-5), and [Chapter 7 (HPC)](/curriculum/volume-00/7-hpc-fundamentals-before-volume-6-and-10) first, then come back here for a fast refresher.

## AI and ML in plain language

- **Artificial intelligence (AI)** is the broad field of systems performing tasks associated with human intelligence.
- **Machine learning (ML)** builds behavior by learning patterns from data rather than encoding every rule manually.
- A **model** is the learned mathematical function plus parameters (weights).
- **Training** repeatedly compares predictions with expected outcomes and adjusts weights.
- **Inference** uses fixed weights to produce an output for new input.
- **Fine-tuning** continues training an existing model for a narrower behavior or dataset.
- **Evaluation** measures behavior on controlled data and metrics.

```text
training data → forward computation → prediction → loss/error
                       ↑                         ↓
                  updated weights ← gradients/backward computation

inference request → tokenize/preprocess → model forward computation → output
```

Infrastructure is shaped by the workload:

| Workload | Success measure | Common pressure |
|---|---|---|
| Training | time-to-train, convergence, successful completion | sustained compute, communication, data feed, checkpoints |
| Batch inference | corpus completed by deadline and cost | throughput and queue efficiency |
| Online inference | latency, availability, tokens/s, quality | concurrency, memory, batching, autoscaling |
| Evaluation | comparable and reproducible results | versioned model/data/code and controlled environment |

## Why GPUs help

A CPU has relatively few sophisticated cores optimized for varied control-heavy work and low latency. A GPU has many execution resources optimized for applying similar operations across large amounts of data. Neural-network computation contains large matrix operations that can exploit this parallelism.

The basic path is:

```text
CPU process prepares work and data
   → runtime/driver submits GPU work
      → GPU kernel executes across many threads
         → data is read/written in GPU device memory (HBM)
            → result returns or feeds the next GPU operation
```

Essential terms:

| Term | Meaning for an infrastructure engineer |
|---|---|
| GPU | Accelerator device executing highly parallel work |
| GPU kernel | Function launched to execute on the GPU; unrelated to the Linux kernel |
| HBM/device memory | High-bandwidth memory attached to a GPU |
| CUDA | NVIDIA programming platform, APIs, tools, and ecosystem for GPU computing |
| Driver | Host kernel/user components that control and communicate with the GPU |
| CUDA runtime/library | User-space software applications use for GPU functions |
| Tensor Core | GPU execution hardware specialized for matrix operations and numerical formats |
| SM | Streaming Multiprocessor, a major GPU execution unit |

### The compatibility stack

```text
application/framework (PyTorch, TensorFlow, inference engine)
      ↓ uses
CUDA user-space runtime and libraries
      ↓ call
NVIDIA host driver
      ↓ controls
GPU firmware and hardware
```

A container packages the application and user-space libraries, but it uses the host kernel and compatible host driver. Therefore "the container includes CUDA" does not mean the host needs no NVIDIA driver.

## Performance: capacity, movement, and computation

Do not diagnose performance from GPU utilization alone. Ask separate questions:

1. Does the model, batch, and cache fit in GPU memory?
2. Is useful computation keeping execution units busy?
3. Is work waiting for HBM, CPU preparation, storage, PCIe/NVLink, or the network?
4. Are synchronization and slow participants delaying everyone else?
5. Is the workload outcome improving—tokens/s, samples/s, step time, or latency?

Metrics are clues that must be correlated. High reported utilization does not by itself prove compute efficiency or a particular bottleneck.

## From one GPU to many

### One node, multiple GPUs

GPUs may communicate through PCIe, NVLink, or NVSwitch depending on the system. **Topology** describes which devices are connected through which paths and with what performance characteristics. CPU socket and NUMA placement can also matter because GPU, NIC, and memory traffic may cross slower inter-socket links.

### Multiple nodes

Once work crosses machines, the network becomes part of application performance:

```text
GPU memory → GPU/NIC path → NIC/HCA → switch fabric → remote NIC → remote GPU memory
```

- **Distributed training** divides work across processes, GPUs, or model components.
- A **rank** is one process identity in a distributed job.
- A **collective** is a coordinated communication operation across a group, such as all-reduce.
- **NCCL** is NVIDIA's library for high-performance GPU collectives.
- **MPI** is a standard and library ecosystem for communication among processes; it may launch/coordinate work while NCCL moves GPU tensors.
- A **straggler** is a slower participant that delays synchronized peers.

## What HPC adds

High-performance computing (HPC) is not synonymous with AI, but the domains overlap. HPC systems emphasize large parallel jobs, high-speed fabrics, shared storage, batch schedulers, reproducible software environments, and efficient use of expensive hardware.

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

## Trace one distributed training step

```text
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

## First safe observations

On a lab GPU node, start read-only:

```bash
lspci | grep -i nvidia
nvidia-smi
nvidia-smi topo -m
python -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.device_count())"
```

Predict what each command proves before running it. `lspci` seeing hardware does not prove the driver loaded. `nvidia-smi` working does not prove a framework uses the expected library stack. Framework device visibility does not prove multi-node collectives or performance.

## Readiness check

Continue to Volumes 4–6 when you can draw and explain:

- training versus inference;
- CPU process → CUDA user space → driver → GPU;
- host memory versus GPU memory;
- one GPU versus multi-GPU versus multi-node execution;
- scheduler versus MPI versus NCCL;
- why network and storage become application dependencies;
- why one green command never validates the whole stack.

