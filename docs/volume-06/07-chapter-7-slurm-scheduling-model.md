---
title: "Chapter 7 - Slurm scheduling model"
slug: "chapter-7-slurm-scheduling-model"
sidebar_position: 7
description: "Chapter 7 - Slurm scheduling model — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand jobs, allocations, partitions, nodes and why HPC schedulers optimize a different operating model from general service orchestration.


Slurm allocates resources to batch/interactive jobs across partitions and nodes, with scheduling priorities, reservations, topology and accounting features suited to HPC. Users submit jobs; the scheduler grants allocations; launch tools start tasks. The natural unit is often a job requiring a coordinated set of resources rather than a long-lived microservice.


<!-- source-table:2 -->

```text
sinfo
squeue
scontrol show node <node>
scontrol show job <jobid>
sacct -j <jobid> --format=JobID,State,Elapsed,AllocTRES,ExitCode
```
