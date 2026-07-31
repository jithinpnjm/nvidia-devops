---
title: "Chapter 2 - Virtual memory, page cache, swap and OOM"
slug: "chapter-2-virtual-memory-page-cache-swap-and-oom"
sidebar_position: 2
description: "Chapter 2 - Virtual memory, page cache, swap and OOM — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Trace allocation from virtual address space through pages, reclaim and cgroup limits; distinguish node OOM from container OOM.


## 2.1 Virtual memory

Each process sees a virtual address space. The kernel maps virtual pages to physical memory and may map files into memory. This abstraction enables isolation, shared libraries, memory-mapped files and efficient paging. RSS approximates resident physical pages for a process, but system memory accounting also includes page cache, kernel memory and shared pages.


<!-- source-table:2 -->

```text
cat /proc/<PID>/status | egrep 'VmRSS|VmSize|RssAnon|RssFile'
cat /proc/<PID>/smaps_rollup
pmap -x <PID> | tail -20
```


## 2.2 Page cache and “free memory”

Linux uses unused RAM as filesystem cache because cached data can avoid slower storage I/O. Cached pages are often reclaimable. This is why MemAvailable is usually more useful than the raw free column when asking whether the system has room for new allocations.

![](pathname:///img/generated/volume-01-02.png)

Figure 2. Reclaim and swap can occur before the OOM path is forced to select a victim.


<!-- source-table:3 -->

```text
free -h
grep -E 'MemAvailable|Cached|Buffers|Swap|Dirty|Writeback' /proc/meminfo
vmstat 1   # si/so reveal swap-in/out activity
```


## 2.3 OOM at different boundaries

Node-wide OOM means the kernel cannot satisfy allocations after reclaim strategies. A memory-cgroup OOM means a workload crossed its cgroup boundary even if the node still has memory. Kubernetes can also evict Pods under node memory pressure. These are related but distinct failure paths with different remediation.


<!-- source-table:4 -->

```text
dmesg -T | grep -i -E 'oom|killed process'
journalctl -k --since '-30 min' | grep -i oom
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/memory.events
```


## Worked scenario


<!-- source-table:5 -->

> Situation A Pod shows OOMKilled, but the node dashboard reports 40% memory available.


**1\. Read Pod/container limits and events; do not assume node exhaustion.**

2\. Check the container cgroup memory.max/current/events or runtime/Kubernetes evidence for a cgroup OOM.

3\. Inspect process working set and growth. Determine whether the application legitimately needs a larger limit or has a leak/burst.

4\. Check whether sidecars share the Pod/node memory picture and whether page cache or tmpfs behavior contributes.

5\. Change limits only after understanding expected peak working set and node packing implications.


<!-- source-table:6 -->

> Conclusion The exhausted boundary is the container cgroup, not necessarily the node.


## Practice

1\. Compare VmSize and VmRSS for a process and explain why they differ.

2\. Trigger a bounded memory allocation in a container lab and inspect cgroup memory.events.

3\. Explain why dropping page cache is not a normal production “memory fix.”
