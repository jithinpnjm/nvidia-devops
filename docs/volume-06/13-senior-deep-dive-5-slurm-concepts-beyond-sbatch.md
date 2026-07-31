---
title: "Senior Deep Dive 5 — Slurm concepts beyond sbatch"
slug: "senior-deep-dive-5-slurm-concepts-beyond-sbatch"
sidebar_position: 13
description: "Senior Deep Dive 5 — Slurm concepts beyond sbatch — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
Slurm separates control and execution: slurmctld schedules jobs; slurmd runs on compute nodes; partitions group resources/policy; jobs request resources and can contain job steps. GRES/TRES express accelerators and track consumption. Fair-share, QoS, reservations and priorities shape queue behavior. Prolog/epilog hooks prepare and clean nodes; failures there can make nodes drain or jobs fail before user code runs.

**Slurm operational evidence**

sinfo -Nel
squeue -o '%.18i %.9P %.16j %.8u %.2t %.10M %.6D %R'
scontrol show job &lt;JOBID>
scontrol show node &lt;NODE>
sacct -j &lt;JOBID> --format=JobID,State,Elapsed,AllocTRES,MaxRSS,ExitCode

NVIDIA Base Command Manager 2026 releases include current Slurm, CUDA, container toolkit and Enroot/Pyxis stacks. Enroot provides an HPC-friendly container runtime model; Pyxis integrates containers with Slurm. This is an important bridge for SAs because many AI factories use Slurm for tightly coupled batch workloads while teams may also run Kubernetes for services and platform workflows.
