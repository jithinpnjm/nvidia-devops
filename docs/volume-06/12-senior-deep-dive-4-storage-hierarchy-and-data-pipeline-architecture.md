---
title: "Senior Deep Dive 4 — Storage hierarchy and data pipeline architecture"
slug: "senior-deep-dive-4-storage-hierarchy-and-data-pipeline-architecture"
sidebar_position: 12
description: "Senior Deep Dive 4 — Storage hierarchy and data pipeline architecture — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
![](pathname:///img/generated/volume-06-03.png)

_Figure B. AI platforms need several storage tiers because active tensors, datasets and durable checkpoints have different requirements._

Separate capacity, throughput, IOPS, metadata performance and durability. Large sequential training shards favor bandwidth; millions of tiny files can bottleneck metadata; checkpoints demand sustained write bandwidth and durability; model rollout may need high fan-out reads. Object stores scale durability and distribution but have different semantics from POSIX parallel filesystems. Local NVMe is excellent cache/scratch but is a node-local failure domain.

Measure the application data loader. GPU starvation may be caused by CPU decode/augmentation, small-file lookups, network storage, page cache misses or insufficient prefetch—not the storage array headline throughput. Capture GPU duty cycle together with read throughput, queue depth and data-loader wait.

## Senior addendum

➕ **This Deep Dive is the mechanism-level companion to Chapter 6's pattern table — cross-reference rather than re-deriving: Chapter 6's checkpoint-write-path and dataset-fetch-path diagrams, `nvidia-smi dmon` + `iostat` correlation technique, and model-startup fleet-wide-event scenario are the concrete, tool-level version of this Deep Dive's "measure the application data loader" instruction. If this Deep Dive comes up in an interview, answer with Chapter 6's specific commands and numbers, not just this Deep Dive's prose.**

➕ **Diagram: the tiering tradeoff — capacity/throughput/IOPS/durability, plotted against the stack**
```
                 throughput/IOPS (per GB)   durability      capacity ($/GB)
Local NVMe            highest                lowest          smallest, cheapest per node
   │                                                          node-local failure domain
   ▼
Parallel FS /          high, shared           durable         mid-size, mid-cost
shared store           across many clients    (replicated/     shared failure domain
   │                                          erasure-coded)
   ▼
Object store           lowest per-op          highest         largest, cheapest per GB
                        (higher latency,       durability
                        great for fan-out)     (multi-AZ/region)
```
Reading this top-to-bottom is reading the exact tradeoff Figure B is illustrating: every tier down trades per-operation speed for capacity and durability — which is why the tiering model never picks one tier for everything, it routes each access pattern (hot scratch, active shared dataset, cold durable archive) to the tier whose column actually matches that pattern's requirement.

➕ **The one genuinely new framing here: "local NVMe is a node-local failure domain," made concrete.**
```
Node dies/is drained  →  local NVMe cache/scratch on that node is GONE, instantly, no replication
                      →  anything ONLY on local NVMe (not yet flushed to durable shared storage)
                         is lost — this includes in-flight checkpoint writes, unflushed logs,
                         and any "scratch" preprocessing output the next stage depends on
```
This is why the tiering model always keeps local NVMe as *cache/scratch* (Chapter 6, Deep Dive 4) and never as the sole copy of anything that must survive a node failure — the throughput benefit of local NVMe is real, but it buys speed at the cost of durability, and conflating the two is the specific mistake this framing is meant to prevent.
