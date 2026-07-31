---
title: "Chapter 5 - Namespaces, cgroups and container mechanics"
slug: "chapter-5-namespaces-cgroups-and-container-mechanics"
sidebar_position: 5
description: "Chapter 5 - Namespaces, cgroups and container mechanics — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Explain what a container actually is at the Linux level and how Kubernetes requests/limits map to resource control.


## 5.1 Namespaces


<!-- source-table:2 -->

| Namespace | Isolation view |
| --- | --- |
| pid | process IDs and process tree |
| net | interfaces, routes, sockets, firewall namespace |
| mnt | mount table/filesystem view |
| uts | hostname/domain |
| ipc | IPC resources |
| user | user/group ID mappings |


<!-- source-table:3 -->

```text
lsns
readlink /proc/<PID>/ns/net
nsenter -t <PID> -n ip addr
nsenter -t <PID> -n ip route
```


## 5.2 cgroups

cgroups organize processes for resource accounting/control. In cgroup v2, controllers expose files for CPU, memory, I/O and other resources. Container runtimes place container processes into cgroups; Kubernetes requests influence scheduling while limits may become enforcement configuration.


<!-- source-table:4 -->

```text
cat /proc/<PID>/cgroup
cat /sys/fs/cgroup/cpu.stat
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.events
```


## 5.3 What an image is—and is not

A container image is a filesystem/content package plus metadata. Isolation comes from how the runtime launches the process: namespaces, cgroups, mounts, capabilities, seccomp, LSM policy and device access. This distinction is essential when debugging “container” problems that are actually host-kernel or cgroup problems.

## Worked scenario


<!-- source-table:5 -->

> Situation A Pod shows CPU latency but the node dashboard has idle CPU.


**1\. Inspect the Pod CPU limit and container cgroup cpu.stat for throttling.**

2\. Compare requested/limited CPU with application thread behavior.

3\. Check node run queue and per-CPU utilization to distinguish local quota from host saturation.

4\. Only then decide whether to change limits, requests or application concurrency.


<!-- source-table:6 -->

> Conclusion A container can be locally constrained inside an apparently idle node.
