---
title: "Senior Deep Dive 1 — Linux execution: syscalls, scheduling, run queues and CPU pressure"
slug: "senior-deep-dive-1-linux-execution-syscalls-scheduling-run-queues-and-cpu-pres"
sidebar_position: 7
description: "Senior Deep Dive 1 — Linux execution: syscalls, scheduling, run queues and CPU pressure — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
A production process alternates between user mode and kernel mode. Application code executes in user mode; operations such as reading a file, opening a socket, allocating certain memory mappings or changing process state cross into the kernel through system calls. This boundary is extremely useful in troubleshooting: if an application claims to be “stuck”, strace can tell you whether it is repeatedly polling, waiting on futexes, blocked on network reads, sleeping, or failing a syscall.

Linux schedules runnable tasks, not Kubernetes Pods. A Pod may contain several containers, each container may contain several processes, and each process may have many threads. CPU requests and limits ultimately shape cgroup CPU accounting and throttling, while the scheduler decides when runnable tasks receive CPU time. This explains a common production paradox: node CPU can look moderate while a latency-sensitive container is throttled because its own quota is exhausted.

**Host commands: CPU and syscall evidence**

\# Which threads are runnable or blocked?
ps -eLo pid,tid,psr,pcpu,stat,wchan:32,comm --sort=-pcpu | head -30

# Scheduling and context-switch pressure
vmstat 1
pidstat -w -p &lt;PID> 1
cat /proc/&lt;PID>/sched

# What is the process actually waiting on?
strace -tt -T -p &lt;PID>

# cgroup v2 CPU control for a container/task
cat /sys/fs/cgroup/&lt;path>/cpu.stat
cat /sys/fs/cgroup/&lt;path>/cpu.max


<!-- source-table:1 -->

| Observation | Likely mechanism | Validate next |
| --- | --- | --- |
| High load, low CPU | Uninterruptible I/O or blocked runnable work | ps STAT/WCHAN, iostat, pressure stall information |
| High context switches | Lock contention, excessive threads, packet rate | pidstat -w, perf sched, thread count |
| Latency spikes, CPU &lt; 100% | cgroup quota throttling or single-thread saturation | cpu.stat throttled_usec, per-thread CPU |
| High system CPU | syscalls, networking, storage or kernel work | perf top, softirq counters, syscall profile |
