---
title: "Chapter 2 - NVIDIA Base Command Manager (BCM)"
slug: "chapter-2-nvidia-base-command-manager"
sidebar_position: 2
description: "Chapter 2 - NVIDIA Base Command Manager (BCM) — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---
**Learning outcome:** Understand where a cluster-management layer like BCM sits relative to bare metal below it and Slurm/Kubernetes/Ansible/Terraform above and beside it, and be able to reason about a category-based rolling image upgrade without inventing exact CLI syntax you haven't verified.

## Start here — BCM is the cluster's lifecycle manager

Imagine receiving 200 empty physical servers. Installing Linux manually, copying configuration to each node, and remembering which node has which image will not scale. BCM provides a control plane that turns those individual machines into a consistently managed cluster.

Keep the tool boundaries clear:

| Layer | Question it answers | Typical owner |
|---|---|---|
| BMC/Redfish | Can I power, inspect, and console the physical server? | Hardware lifecycle tooling |
| BCM | Which image and cluster role should this node receive, and is it healthy? | Cluster lifecycle management |
| Slurm | Which queued job gets which healthy resources? | Batch scheduling |
| Kubernetes | Which declared services/pods should run and remain available? | Container orchestration |
| Ansible | Which files, packages, users, and services should be configured? | Configuration management |
| Terraform | Which API-managed infrastructure objects should exist? | Infrastructure provisioning |

A **software image** is the reusable OS filesystem and installed stack. A **category** is a policy grouping: nodes in the same category inherit an image and common settings. A **head node** holds and serves that desired state; a **compute node** boots the result and runs work. This gives you a crucial diagnostic question: is the problem in the desired image, distribution of that image, or a node's live state after boot?

```text
category policy → software image → provisioning service → compute-node disk/RAM
       desired state                                  observed state
```

Do not memorize `cmsh` snippets without checking your installed BCM release. Learn the object model and change workflow first, then verify syntax in the matching administrator manual. In BCM 11, provisioning behavior and external package ownership differ from older Bright/BCM releases; operational procedures must therefore be version-qualified rather than copied blindly from an older cluster.

## What BCM is, honestly

NVIDIA Base Command Manager is a commercial cluster-management product (the descendant of Bright Cluster Manager, which NVIDIA acquired and rebranded) that automates the lifecycle of a bare-metal HPC/AI cluster: provisioning nodes from a head node, managing OS images centrally, monitoring health, and provisioning workload managers (Slurm, Kubernetes) on top. It is one layer above what Chapter 1 covered — BCM assumes nodes are already powered, BMC-reachable, and PXE-capable, and it owns everything from "here is a golden image" through "this node is now a healthy member of the Slurm partition."

This chapter describes BCM's architecture and operational model the way cluster-manager products of this class generally work — head node/compute node topology, golden images, category-based configuration. Exact command syntax for `cmsh` (BCM's interactive management shell) changes across versions; where this chapter shows a `cmsh` session, treat it as illustrative of the *shape* of the interaction, not a syntax reference — consult the current BCM admin manual for exact command names and flags before running anything against a real cluster.

## Architecture

```
                     ┌─────────────────────────────┐
                     │          Head Node           │
                     │  (or HA pair: active/passive)│
                     │                              │
                     │  - CMDaemon (management svc) │
                     │  - Image repository           │
                     │  - Node categories/profiles   │
                     │  - Provisioning (PXE/DHCP)     │
                     │  - Monitoring database         │
                     │  - Workload-manager config     │
                     │    (Slurm/Kubernetes install)  │
                     └───────────────┬──────────────┘
                                     │ management network
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
     ┌────────▼────────┐   ┌─────────▼────────┐   ┌─────────▼────────┐
     │ Node Category:   │   │ Node Category:    │   │ Node Category:    │
     │ "gpu-a100"        │   │ "gpu-h100-canary"  │   │ "login"            │
     │ image: gpu-img-v42│   │ image: gpu-img-v43 │   │ image: login-img-v9│
     │ nodes: 01..30     │   │ nodes: 31          │   │ nodes: login-01/02 │
     └──────────────────┘   └────────────────────┘   └────────────────────┘
              │                       │                        │
        each node runs a lightweight CMDaemon agent that reports health/metrics
        back to the head node and pulls its category's image + config on (re)provision
```

Key concepts:

- **Head node** — the control plane. Runs the management daemon (CMDaemon in Bright/BCM's architecture), owns the image repository, and is usually deployed HA (active/passive pair) since losing it doesn't kill running jobs but does kill your ability to provision, monitor, or make cluster-wide changes until it's back.
- **Node categories** (sometimes called profiles) — a named grouping of nodes that share a software image and a set of configuration parameters (kernel modules, driver versions, mounts, roles). Category membership, not per-node config, is the unit of change management: you change the category's image or settings, and every node in that category inherits the change on next provision/reboot.
- **Software images** — a golden filesystem image (think: a chroot/tarball or equivalent) that a node boots into via PXE + the management layer's provisioning pipeline. Nodes in the same category run the same image, guaranteeing config drift doesn't creep in per-node.
- **CMDaemon (or equivalent management agent)** — a lightweight daemon on every managed node reporting into the head node's monitoring pipeline (sensor data, service status, health-check results) and receiving configuration pushes. Conceptually this is the same role a Puppet/Chef agent or a Kubernetes kubelet plays — a persistent local agent implementing what the control plane wants.
- **Health-check framework** — periodic and on-provision checks (disk, network, GPU presence/ECC state, mount availability) that can automatically flag or drain an unhealthy node from workload-manager scheduling without a human polling dashboards.
- **Workload-manager integration** — BCM-class tools typically ship modules/roles to install and configure Slurm or Kubernetes across the managed fleet as part of category configuration, so "add 20 GPU nodes to the Slurm partition" is a provisioning-and-category operation, not a separate manual Slurm config edit on every node.

## Representative `cmsh` interaction

```
$ cmsh
[headnode]% category
[headnode->category]% list
Name              Software Image        Nodes
----------------- ---------------------- -----
default            default-image           2
gpu-a100            gpu-img-v42             30
gpu-h100-canary     gpu-img-v43              1
login               login-img-v9             2

[headnode->category]% use gpu-a100
[headnode->category[gpu-a100]]% show
Parameter                Value
------------------------  --------------------
Name                      gpu-a100
Software image            gpu-img-v42
Nodes                     30
Kernel modules             nvidia, nvidia-uvm, mlx5_core
Node prolog/epilog scripts  /cm/local/apps/... (health-check hooks)

[headnode->category[gpu-a100]]% device list -c gpu-a100
Node          Category    Status     Image        Health
------------  ----------  ---------  -----------  -------
gpu-node-01   gpu-a100    UP         gpu-img-v42  HEALTHY
gpu-node-02   gpu-a100    UP         gpu-img-v42  HEALTHY
gpu-node-09   gpu-a100    UP         gpu-img-v42  DRAINED   ← health check flagged it, excluded from Slurm scheduling
```
(Again: treat command names/nesting above as illustrative of the interaction pattern — the categorized, image-centric view of the fleet, drill-down from category to member nodes to per-node health — not as verified exact syntax.)

## Upgrade/patch workflow for a BCM-managed cluster

The general model for any image-based cluster manager: you do not patch nodes in place one at a time and hope they converge — you build or update a golden image, then move node categories onto it in a controlled sequence.

```
1. Build/update the software image  (new kernel, new NVIDIA driver, new CUDA toolkit version, package updates)
2. Validate the image in isolation   (boot a spare/test node onto it, run the health-check suite + a representative job)
3. Create or repoint a canary category onto the new image  (small node subset, e.g. 1-2 nodes out of 30)
4. Soak the canary                    (run real or synthetic jobs, watch for driver/ECC/NCCL regressions, days not minutes)
5. Repoint the main category onto the new image incrementally  (batches, not all 30 nodes at once)
6. Each batch: drain from Slurm → reboot into new image → health-check → rejoin partition
7. Roll back a batch by repointing it back to the previous image if health checks or job telemetry regress
```

## Where BCM sits relative to Ansible/Terraform

These tools are not competitors so much as different layers, and a cluster typically runs several of them together:

- **BCM** owns cluster *lifecycle and image management* — bringing bare nodes up, keeping golden images consistent per category, health-checking, and installing/configuring the workload manager itself. Its unit of change is the image + category.
- **Ansible** typically operates *inside* an image build pipeline (baking the golden image reproducibly) or as post-provision configuration for things that need to vary faster than a full image rebuild justifies — a config file tweak, a one-off compliance fix, an application-layer install that isn't worth a new image version for.
- **Terraform** is largely orthogonal for a bare-metal HPC cluster's compute nodes (there's no cloud API creating/destroying physical GPU servers), but it's very relevant for anything the cluster depends on that *is* API-managed — DNS records, load balancers/VIPs for login nodes, object storage buckets for datasets/checkpoints, or, in a hybrid deployment, cloud-bursted GPU capacity alongside the on-prem BCM-managed fleet.

A common real-world split: BCM/image pipeline for "what does every node in this category run," Ansible for "day-2 config drift fixes and image-build automation," Terraform for "everything that has an API and isn't a physical server."

## Worked scenario — rolling a new image to a GPU category without an all-at-once outage

**Situation:** A new NVIDIA driver + CUDA minor version needs to roll out to the `gpu-a100` category (30 nodes, all currently running production training jobs across several partitions). An all-at-once reboot would kill every running job simultaneously and is not acceptable.

1. **Build the new image** (`gpu-img-v43`) with the updated driver/CUDA, keeping the previous image (`gpu-img-v42`) intact and addressable — never overwrite the last-known-good image in place.
2. **Stand up a canary category** (`gpu-h100-canary`-style pattern, but for a1 subset of the a100 fleet) pointing at `gpu-img-v43`, move 1-2 nodes into it. This is a category *reassignment*, not a fleet-wide image swap.
3. **Drain those 1-2 nodes from Slurm** (`scontrol update nodename=<n> state=drain reason=image_upgrade`), wait for running jobs to finish or checkpoint, then reprovision into the canary category and reboot.
4. **Soak**: run `nvidia-smi`, `dcgmi diag`, and a representative multi-GPU NCCL/all-reduce job on the canary nodes for at least one full job-length cycle — a driver regression that only shows up under sustained multi-hour collective communication load will not show up in a five-minute smoke test.
5. **Batch the rest**: once the canary is clean, move the remaining 28 nodes in batches (e.g., 5 at a time) — drain, reprovision, health-check, rejoin — sized so the partition never loses more capacity at once than the scheduler's queue can absorb without stalling every pending job.
6. **Rollback path stays available at every step**: any batch that fails health-check or shows job-telemetry regression gets its category pointer moved back to `gpu-img-v42` and rebooted — because the previous image was never deleted, this is a category reassignment, not a rebuild.

**Interview-ready line:** "The unit of change in an image-based cluster manager is the category-to-image mapping, not the individual node — a safe rollout is a canary category soak followed by batched category repointing, with the previous image kept live so rollback is a pointer change and a reboot, not a rebuild."

**Mnemonic:** **"CIRC-B"** — **C**ategory defines the image, **I**mage is golden and versioned, **R**oll canary first, **C**onfirm under real load, **B**atch the rest with rollback intact.

## Practice

1. Explain to a Kubernetes-only engineer what a "node category" and a "software image" are in BCM's model, using the analogy of a Kubernetes node pool and a container image.
2. Why is a canary soak for a driver/CUDA upgrade measured in "at least one full job-length cycle" rather than a quick smoke test — what specific class of regression does this catch that a smoke test wouldn't?
3. A node is marked `DRAINED` by BCM's health-check framework. What does this state mean for the Slurm scheduler, and how is it different from the node simply being powered off?
4. Describe the boundary between what BCM owns and what Ansible typically owns in a cluster that uses both — give one concrete example of a change that belongs to each.
5. Why is Terraform largely orthogonal to the physical compute nodes in an on-prem BCM-managed cluster, and name one thing in that same environment Terraform would still plausibly manage.
