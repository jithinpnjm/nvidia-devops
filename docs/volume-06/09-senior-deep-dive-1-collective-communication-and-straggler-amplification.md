---
title: "Senior Deep Dive 1 — Collective communication and straggler amplification"
slug: "senior-deep-dive-1-collective-communication-and-straggler-amplification"
sidebar_position: 9
description: "Senior Deep Dive 1 — Collective communication and straggler amplification — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
Distributed training performance is bounded by the slowest rank at synchronization points. AllReduce, AllGather, ReduceScatter and All-to-All move different amounts of data and stress the fabric differently. A single node with slower PCIe, NIC congestion, thermal throttling or storage delay can reduce throughput for the whole job. Therefore monitor distributions per rank/node, not only cluster averages.

NCCL chooses algorithms and transport based on topology and environment. Troubleshooting starts by confirming topology, then validating link state and RDMA path, then comparing NCCL logs and per-node timings. Avoid cargo-cult environment variables: each tuning flag changes transport or algorithm decisions and can hide the real infrastructure defect.

**Multi-node communication evidence**

\# Topology and fabric evidence
nvidia-smi topo -m
ibv\_devinfo
rdma link
ethtool -S &lt;iface> | egrep -i 'drop|discard|pause|ecn|error'

# NCCL diagnostics - enable only for diagnosis because logs can be large
    export NCCL\_DEBUG=INFO
    export NCCL\_DEBUG\_SUBSYS=INIT,NET,GRAPH
