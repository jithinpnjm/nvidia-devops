---
title: Chapter 08 — NCCL Collectives and Communication Paths
description: Understand all-reduce, reduce-scatter, all-gather, all-to-all, topology, and NCCL transport behavior.
sidebar_position: 9
tags: [nccl, collectives, gpu-networking]
---

# NCCL Collectives and Communication Paths

Collectives move distributed state among ranks. Their performance depends on message size, algorithm, topology, transport, process placement, and the slowest participant.

## Core Operations

| Collective | Typical use |
|---|---|
| All-reduce | Aggregate gradients |
| Reduce-scatter | Reduce and shard results |
| All-gather | Reconstruct sharded parameters |
| Broadcast | Distribute common state |
| All-to-all | Expert or token exchange |

## Data Path

```mermaid
flowchart LR
    GPU0[GPU 0]
    NVLink[NVLink or PCIe]
    NIC0[NIC 0]
    Fabric[Network Fabric]
    NIC1[NIC 1]
    GPU1[Remote GPU]

    GPU0 <--> NVLink <--> NIC0 <--> Fabric <--> NIC1 <--> GPU1
```

## Verification

```bash
nvidia-smi topo -m
./all_reduce_perf -b 8M -e 1G -f 2 -g 8
```

Compare bus bandwidth, algorithm bandwidth, errors, and consistency across nodes.

## Troubleshooting

NCCL timeouts are symptoms. Inspect rank health, interface selection, addressing, MTU, RDMA state, topology, firewall policy, and fabric counters.
