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
