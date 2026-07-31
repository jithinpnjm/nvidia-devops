---
title: "Chapter 1 - Processes, threads, CPU scheduling and load"
slug: "chapter-1-processes-threads-cpu-scheduling-and-load"
sidebar_position: 1
description: "Chapter 1 - Processes, threads, CPU scheduling and load — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
**VOLUME 1**

**Foundations Beneath Kubernetes**

Linux, networking, storage and container mechanisms from first principles


<!-- source-table:1 -->

> Fourth Edition - Teaching text with mechanisms, examples, visuals, scenarios and exercises


Independent study guide based on public documentation and public practitioner material. Not an NVIDIA publication.


<!-- source-table:2 -->

> Reading method For every mechanism: first understand the model, then run the commands, then interpret evidence, then work the incident. Kubernetes mapping comes after the Linux mechanism is clear.


![](pathname:///img/generated/volume-01-01.png)

Figure 1. Move downward through abstractions until the symptom maps to a mechanism.


<!-- source-table:3 -->

> Learning outcome Explain process/thread state, scheduler queues, CPU time, context switches, load average, throttling and the evidence that distinguishes them.


## 1.1 Process and thread model

A program on disk is passive. A process is a running instance with virtual memory, credentials, file descriptors, signal state and one or more threads. Threads inside the same process share address space and open resources but have independent execution contexts. The Linux scheduler schedules tasks—roughly threads/process execution contexts—not Kubernetes Pods as a special kernel object.

**Inspect process identity, threads, state and file descriptors**


<!-- source-table:4 -->

```text
ps -eo pid,ppid,tid,stat,ni,psr,pcpu,pmem,comm --sort=-pcpu | head -30
ps -L -p <PID> -o pid,tid,psr,stat,pcpu,comm
cat /proc/<PID>/status
ls -l /proc/<PID>/fd | head
```


## 1.2 Process states


<!-- source-table:5 -->

| State | Meaning | Operational clue |
| --- | --- | --- |
| R | running or runnable | CPU/run-queue pressure if many remain runnable |
| S | interruptible sleep | normally waiting for timer/event/I/O |
| D | uninterruptible sleep | often waiting on kernel I/O; cannot handle normal signals until wait completes |
| Z | zombie | child exited; parent has not reaped exit status |
| T | stopped/traced | job control or debugger/signal stopped the task |


D state is a classic reason load can be high while CPU utilization is not. Load average includes runnable tasks and tasks in uninterruptible sleep, so it is a queue-pressure signal, not a CPU percentage.

## 1.3 CPU scheduling, run queue and context switches

Linux time-slices runnable tasks across CPUs according to scheduling policy and priority. A context switch changes the executing task. Context switches are normal, but extremely high rates can indicate excessive thread count, lock contention or I/O wakeups. The run queue tells you whether runnable work is waiting for CPU.


<!-- source-table:6 -->

```text
uptime
vmstat 1
mpstat -P ALL 1
pidstat -u -w 1
# vmstat: r=run queue, cs=context switches/s, us/sy/id/wa=CPU state percentages
```


## 1.4 CPU quotas and throttling

A container can be CPU-starved even when the host has idle CPU if cgroup quota restricts it. Kubernetes CPU limits can translate into CFS bandwidth control. Throttling evidence therefore belongs beside host CPU metrics when an application reports latency under low node utilization.


<!-- source-table:7 -->

```text
# cgroup v2 examples; exact path depends on runtime
cat /sys/fs/cgroup/cpu.max
cat /sys/fs/cgroup/cpu.stat
# look for nr_throttled / throttled_usec
```


## Worked scenario


<!-- source-table:8 -->

> Situation A 16-core node has load average 35, CPU utilization 45%, and application latency is rising.


**1\. Confirm the load pattern and run queue with uptime/vmstat. If r is small, high load may come from blocked D-state tasks rather than runnable CPU work.**

2\. Inspect process states with ps/pidstat. Count D-state processes and identify common commands/PIDs.

3\. Inspect iostat and dependency latency if D-state tasks point to storage or network filesystems.

4\. If the symptom is container-specific, inspect cgroup CPU throttling before buying more CPU.

5\. Correlate the time window with deploys, storage events and kernel logs.


<!-- source-table:9 -->

> Conclusion The correct first branch is “runnable versus blocked versus throttled,” not “CPU is high or low.”


## Practice

1\. Explain load average to an interviewer without saying it is CPU utilization.

2\. Create CPU pressure with a stress tool in a lab and observe vmstat r, mpstat and load average.

3\. Find the cgroup of a container process and inspect CPU quota/statistics.
