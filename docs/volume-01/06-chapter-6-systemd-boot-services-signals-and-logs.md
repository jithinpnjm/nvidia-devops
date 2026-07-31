---
title: "Chapter 6 - systemd, boot, services, signals and logs"
slug: "chapter-6-systemd-boot-services-signals-and-logs"
sidebar_position: 6
description: "Chapter 6 - systemd, boot, services, signals and logs — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
<!-- source-table:1 -->

> Learning outcome Diagnose why a Linux service failed to start, restarted, stopped accepting traffic or was killed.


## 6.1 Unit state and dependency model

systemd manages units such as services, sockets, mounts and timers with dependency and ordering relationships. status is a summary; show exposes properties; journalctl gives event history. Always move from unit state to the actual process and external dependencies.


<!-- source-table:2 -->

```text
systemctl status myservice --no-pager
systemctl show myservice -p ActiveState -p SubState -p ExecMainStatus -p NRestarts
journalctl -u myservice --since '-30 min'
systemctl list-dependencies myservice
```


## 6.2 Signals and shutdown

SIGTERM requests graceful termination; SIGKILL cannot be handled. Kubernetes termination ultimately becomes process signals inside the container. Applications that ignore SIGTERM or take longer than their grace period may be killed before cleanup completes.


<!-- source-table:3 -->

```text
kill -TERM <PID>
kill -KILL <PID>  # last resort; no cleanup handler can run
```


## Worked scenario


<!-- source-table:4 -->

> Situation A service repeatedly restarts every 30 seconds.


**1\. Read systemctl show/status and journal history to determine whether systemd is restarting after non-zero exit, watchdog failure or dependency issue.**

2\. Inspect the process exit code and application logs around each restart.

3\. Check listeners, credentials, files, DNS and upstream dependencies the process needs during startup.

4\. Confirm resource/OOM/kernel events are not killing it externally.

5\. Fix the cause before increasing restart limits.


<!-- source-table:5 -->

> Conclusion Restart policy is recovery behavior; it is not root cause.


## Targeted references

[Udemy - Complete Linux Troubleshooting Course](https://www.udemy.com/course/linux-troubleshooting-course) - Target: Running Out of Memory, System is Running Slow, filesystem, access, logs/processes and networking sections.

[Linux kernel documentation](https://docs.kernel.org/) - Authoritative kernel behavior.

[Coursera - The Bits and Bytes of Computer Networking](https://www.coursera.org/learn/computer-networking) - Target TCP/IP, routing, DNS and troubleshooting modules.


<!-- source-table:6 -->

> FOURTH EDITION — SENIOR ENGINEERING EXPANSION · VOLUME 1


**Linux, networking and host mechanics for GPU and Kubernetes infrastructure**

This expansion keeps the Fourth Edition teaching flow and adds the depth expected from a senior infrastructure engineer and customer-facing Solutions Architect. The emphasis is mechanism first: understand what the system is doing, observe it with concrete tools, then reason about failure, scale, reliability, performance and trade-offs.

The practitioner material used to shape the scope is a signal, not an authority. Technical behavior is anchored in official documentation and first-principles systems reasoning. Your Staff Engineer study guide contributes useful patterns around Kubernetes, observability, distributed systems, platform design and failure isolation; the NVIDIA material adds GPU systems, AI workloads, accelerated networking and customer architecture.

![](pathname:///img/generated/volume-01-04.png)

_Figure A. Senior troubleshooting moves from symptom to mechanism instead of jumping between tools._
