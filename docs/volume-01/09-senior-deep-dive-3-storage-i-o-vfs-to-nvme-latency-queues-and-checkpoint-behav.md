---
title: "Senior Deep Dive 3 — Storage I/O: VFS to NVMe, latency queues and checkpoint behavior"
slug: "senior-deep-dive-3-storage-i-o-vfs-to-nvme-latency-queues-and-checkpoint-behav"
sidebar_position: 9
description: "Senior Deep Dive 3 — Storage I/O: VFS to NVMe, latency queues and checkpoint behavior — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
An application write can pass through a language runtime, libc, the VFS, filesystem code, page cache, block layer, I/O scheduler, device driver and physical device. Each layer can buffer work, so throughput and durability are separate questions. fsync changes the contract; buffered writes may look fast until writeback or checkpoint pressure catches up.

AI infrastructure intensifies these issues. Training jobs can read enormous datasets while periodically writing multi-gigabyte checkpoints. Model-serving fleets may stampede object storage during rollout. Local NVMe can absorb bursty reads, but cache warm-up and eviction behavior must be considered. A storage design that advertises high sequential bandwidth may still collapse under metadata-heavy small-file access.

**Host commands: storage evidence**

\# Device and filesystem pressure
iostat -xz 1
cat /proc/pressure/io
lsblk -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS,ROTA
findmnt -T /path/to/data

# Which processes are issuing I/O?
pidstat -d 1
lsof +D /path/to/checkpoint 2>/dev/null | head

# Quick latency test - never run destructive tests on production devices
fio --name=readcheck --filename=/safe/testfile --rw=randread     --bs=4k --iodepth=32 --size=1G --runtime=30 --time\_based
