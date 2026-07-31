---
title: "Senior Deep Dive 2 — Memory: virtual address space, page faults, NUMA and OOM decisions"
slug: "senior-deep-dive-2-memory-virtual-address-space-page-faults-numa-and-oom-decis"
sidebar_position: 8
description: "Senior Deep Dive 2 — Memory: virtual address space, page faults, NUMA and OOM decisions — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
Virtual memory is an address-space abstraction. A process can reserve address ranges without immediately consuming physical RAM. Memory becomes operationally expensive when pages are faulted in, dirtied, pinned, swapped, reclaimed or moved across NUMA domains. Senior troubleshooting therefore distinguishes virtual size, resident set, anonymous memory, file-backed page cache, shared memory and pinned memory instead of treating “memory usage” as one number.

NUMA matters on large CPU/GPU servers because memory access latency and bandwidth depend on locality. A GPU connected beneath one PCIe root complex can be closer to one CPU socket and its memory controllers. If feeder threads, NIC interrupts and memory allocations land on the wrong NUMA node, an apparently healthy GPU may starve. This is one bridge between ordinary Linux knowledge and AI infrastructure: topology affects performance long before Kubernetes notices anything is wrong.

**Host commands: memory and NUMA evidence**

\# Memory pressure and reclaim
free -h
vmstat 1
cat /proc/pressure/memory
cat /proc/meminfo | egrep 'MemAvailable|Anon|Mapped|Dirty|Writeback|Huge|Unevictable'

# Per-process mappings and faults
pmap -x &lt;PID> | tail
pidstat -r -p &lt;PID> 1

# NUMA layout and locality
numactl --hardware
numastat -p &lt;PID>
lscpu -e=CPU,NODE,SOCKET,CORE

OOM reasoning must identify the boundary. A container can be OOM-killed inside its cgroup while the node still has free memory. Conversely, global node pressure can trigger the kernel OOM killer or kubelet eviction logic. The right question is not “did we run out of memory?” but “which allocator or control boundary could not satisfy the request, and what evidence records that decision?”
