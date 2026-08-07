# Volume 13: Distributed Training Foundations

| Chapter metadata | Value |
|---|---|
| Volume | 13 — Distributed Training Foundations |
| Difficulty | Advanced |
| Estimated total hours | 20-25 hours |
| Primary audience | ML/Infrastructure Engineers, MLOps, Platform Teams |
| Core question | How do we scale model training beyond the memory and compute limits of a single GPU? |

## Introduction

Welcome to Volume 13. Distributed training is the cornerstone of modern large-scale machine learning. This volume covers the fundamental principles of scaling models across multiple GPUs and nodes—the engineering discipline that makes it possible to train models with billions or trillions of parameters.

As models grow exponentially—GPT-3 (175B), GPT-4 (presumed ~1T), Mixtral, and others—a single GPU lacks both the memory to hold the model state and the compute power to train it within a reasonable timeframe. Distributed training is not optional for production AI systems; it is the baseline.

## What You'll Learn

**Chapters 1-3: Foundations**
- Why distributed training is necessary (memory and compute math)
- The anatomy of training memory consumption (weights, gradients, optimizer states, activations)
- Data parallelism and DDP (DistributedDataParallel)

**Chapters 4-7: Advanced Strategies**
- FSDP (Fully Sharded Data Parallel) and parameter sharding
- DeepSpeed and ZeRO optimizer state sharding
- Tensor parallelism and pipeline parallelism
- Megatron-LM architecture

**Chapters 8-11: Operations**
- NCCL collectives and communication paths (All-Reduce, All-Gather, Reduce-Scatter)
- Checkpointing and recovery strategies
- Multi-node training architecture
- Performance engineering and troubleshooting

**Labs 1-4: Hands-on Practice**
- Running multi-GPU DDP training
- Benchmarking NCCL collectives
- Testing FSDP sharding
- Recovering from distributed training failures

## Key Concepts at a Glance

| Strategy | When | Trade-off |
|---|---|---|
| Single GPU | Model + batch fit in memory; time-to-train acceptable | Baseline; slowest |
| Data Parallelism (DDP) | Model fits; need faster training | Simple; each GPU replicates full model → high memory redundancy |
| FSDP | Model or batch doesn't fit; low-bandwidth interconnect acceptable | Complex; distributed memory footprint but higher communication cost |
| Tensor Parallelism | Model too large even with FSDP; high-bandwidth interconnect (NVLink) available | Complex; requires careful communication scheduling |
| Pipeline Parallelism | Training latency bottleneck; model very large | Complex; bubble/idle time during pipeline fill/drain |

## Production Deployment Model

In production, orchestration platforms (Kubernetes with PyTorchJob/MPIJob, or SLURM) manage job placement, process group formation, and node-level fault recovery. Observability and checkpointing are critical: loss spikes, training hangs, and GPU memory fragmentation are common failure modes that require deep understanding of the layers below the framework.

## How to Use This Volume

1. **Read chapters in order** — each builds on the previous one's mental model.
2. **Run the labs** — distributed training is not learnable from reading alone. Run each lab on actual hardware before moving to the next chapter.
3. **Benchmark and measure** — the "why" behind every choice in this volume can only be understood by seeing concrete numbers from your own setup.
4. **Interview prep** — this volume's depth-rework priority is the senior-level questions at the end of each chapter. These are the questions you will be asked at NVIDIA, Meta, or any infrastructure-focused org.

## Related Materials

- **Volume 01**: Foundations of AI infrastructure — start here if distributed training is your entry point
- **Volume 04**: GPU execution and memory (required prerequisite understanding)
- **Volume 10**: Kubernetes for GPU workloads
- **Deeper dives**: NCCL documentation, PyTorch Distributed tutorials, Megatron-LM repository