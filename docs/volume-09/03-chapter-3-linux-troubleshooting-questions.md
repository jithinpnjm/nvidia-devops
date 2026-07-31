---
title: "Chapter 3 - Linux troubleshooting questions"
slug: "chapter-3-linux-troubleshooting-questions"
sidebar_position: 3
description: "Chapter 3 - Linux troubleshooting questions — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Practice translating symptoms into CPU, memory, I/O, process or network evidence.


<!-- source-table:2 -->

| Question | Strong first branch |
| --- | --- |
| Load 30, CPU 40% | runnable vs D-state blocked tasks vs cgroup throttling |
| OOMKilled but node has free memory | container cgroup limit vs node OOM |
| disk is slow | capacity vs inode vs latency/queue vs workload pattern |
| service restarts | exit code/app crash vs OOM/signal vs systemd policy/dependency |


## Worked scenario


<!-- source-table:3 -->

> Situation Interviewer: “The system is slow. What do you do?”


**1\. Clarify what “system” and “slow” mean: request latency, shell responsiveness, job throughput, one node or fleet.**

2\. Check recent changes and scope.

3\. Use a resource saturation snapshot: CPU/run queue, memory/swap, I/O latency, network/dependency latency.

4\. Drill into the subsystem that correlates with the symptom.

5\. Propose a safe mitigation only after evidence.


<!-- source-table:4 -->

> Conclusion The senior answer converts an ambiguous symptom into measurable dimensions before commands.
