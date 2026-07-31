---
title: "Chapter 3 - Files, file descriptors, filesystems and block I/O"
slug: "chapter-3-files-file-descriptors-filesystems-and-block-i-o"
sidebar_position: 3
description: "Chapter 3 - Files, file descriptors, filesystems and block I/O — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Understand how applications reach storage and distinguish capacity, metadata, throughput, IOPS and latency failures.


## 3.1 File descriptors and VFS

A process accesses files, sockets, pipes and many kernel objects through integer file descriptors. The VFS gives applications a common filesystem interface while specific filesystems implement semantics underneath. “Too many open files” is therefore a resource-limit/fd-leak problem, not a disk-capacity problem.


<!-- source-table:2 -->

```text
ls -l /proc/<PID>/fd | head
lsof -p <PID> | head
cat /proc/<PID>/limits | grep -i 'open files'
ss -s
```


## 3.2 Capacity versus latency


<!-- source-table:3 -->

| Question | Evidence |
| --- | --- |
| Is filesystem capacity full? | df -hT |
| Are inodes exhausted? | df -ih |
| Which directory owns space? | du -xhd1 |
| Is device latency/queue high? | iostat -xz 1 |
| Which process is issuing I/O? | pidstat -d 1 / iotop |
| Are mounts/network filesystems involved? | findmnt / mount / storage metrics |


Throughput is data per unit time; IOPS is operations per second; latency is time per operation. A workload can have low throughput but still suffer high latency if it performs small synchronous I/O. Benchmark and diagnose against the application access pattern.

## Worked scenario


<!-- source-table:4 -->

> Situation A database Pod is slow after moving to a new storage class. CPU and memory look normal.


**1\. Measure application operation latency and correlate with storage timing.**

2\. Check filesystem capacity/inodes first to eliminate obvious failures.

3\. Check device or CSI/backend latency, queue depth and errors rather than only throughput.

4\. Compare mount options, volume topology, storage class parameters and zone/path changes.

5\. Run a controlled storage benchmark with a pattern similar to the application before concluding the class is inherently slow.


<!-- source-table:5 -->

> Conclusion Storage diagnosis is workload-pattern + path + latency evidence, not a single MB/s number.


## Practice

1\. Explain why df and du can disagree.

2\. Find open deleted files in a lab using lsof +L1.

3\. Compare sequential throughput and small random I/O using a safe benchmark tool in a test VM.
