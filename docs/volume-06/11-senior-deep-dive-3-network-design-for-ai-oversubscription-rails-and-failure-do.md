---
title: "Senior Deep Dive 3 — Network design for AI: oversubscription, rails and failure domains"
slug: "senior-deep-dive-3-network-design-for-ai-oversubscription-rails-and-failure-do"
sidebar_position: 11
description: "Senior Deep Dive 3 — Network design for AI: oversubscription, rails and failure domains — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
AI fabrics are capacity systems. Oversubscription that is acceptable for web traffic can devastate synchronized collectives. Model the expected communication pattern and bisection bandwidth. Multi-rail designs can improve throughput and resilience but require correct routing, NIC/GPU affinity and workload configuration. Failure domains should align with scheduler placement so a single leaf/spine or rack event does not destroy all replicas or checkpoints.


<!-- source-table:1 -->

| Design variable | Why it matters | Evidence / validation |
| --- | --- | --- |
| Link rate and lane health | raw capacity | ethtool/IB port counters |
| MTU | fragmentation/compatibility | ip link, ping with DF where appropriate |
| Congestion | tail latency and retries | ECN/PFC/pause/drop counters |
| Topology/rails | collective parallelism | NCCL graph/topology, switch layout |
| NUMA locality | host/NIC/GPU path | nvidia-smi topo -m, lspci, numactl |
