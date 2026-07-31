---
title: "Chapter 2 - Ethernet fundamentals for AI fabrics"
slug: "chapter-2-ethernet-fundamentals-for-ai-fabrics"
sidebar_position: 2
description: "Chapter 2 - Ethernet fundamentals for AI fabrics — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand link speed, MTU, queues, loss, ECMP and congestion before learning RoCE.


High-speed Ethernet still follows familiar networking principles. Link speed is a ceiling; application throughput depends on protocol overhead, path, congestion and flow distribution. MTU mismatch can cause fragmentation or connectivity failures. ECMP can distribute flows across equal-cost paths. Queue drops and congestion can damage latency and RDMA behavior.


<!-- source-table:2 -->

```text
ip -s link show dev <iface>
ethtool <iface>
ethtool -S <iface> | egrep -i 'drop|err|pause|ecn|pfc'
ping -M do -s 8972 <peer>   # example jumbo-frame validation; adjust for headers/environment
```
