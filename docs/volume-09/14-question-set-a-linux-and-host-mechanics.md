---
title: "Question set A — Linux and host mechanics"
slug: "question-set-a-linux-and-host-mechanics"
sidebar_position: 14
description: "Question set A — Linux and host mechanics — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

| Question | What a senior answer should expose |
| --- | --- |
| Load average 40 but CPU 25% — explain | runnable vs D-state tasks, I/O, per-cgroup throttling, vmstat/ps/wchan/PSI |
| Container OOM but node has free RAM | cgroup memory boundary, memory.events, working set, requests/limits |
| Only some GPU nodes are slow | NUMA, PCIe/NIC topology, driver/kernel image, CPU feeder/storage/fabric evidence |
| TCP connection times out | DNS/route/SYN path/firewall/conntrack/listener; packet capture and ss |
| Disk 70% full yet writes fail | inodes, quotas, read-only FS, mount/device errors, filesystem reservations |
