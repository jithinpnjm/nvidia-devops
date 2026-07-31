---
title: "Senior Deep Dive 5 — Containers: namespaces, cgroups v2, overlay filesystems and runtime boundaries"
slug: "senior-deep-dive-5-containers-namespaces-cgroups-v2-overlay-filesystems-and-ru"
sidebar_position: 11
description: "Senior Deep Dive 5 — Containers: namespaces, cgroups v2, overlay filesystems and runtime boundaries — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
A container is a set of Linux processes constrained and isolated by kernel mechanisms. Namespaces provide views of resources; cgroups account and control resource consumption; capabilities and LSMs limit privilege; overlay filesystems build writable container roots from immutable image layers. containerd and an OCI runtime coordinate creation, but the kernel enforces the isolation.

**Host commands: inspect the kernel boundaries behind a container**

\# See namespace identities for a process
lsns -p &lt;PID>
readlink /proc/&lt;PID>/ns/net
readlink /proc/&lt;PID>/ns/mnt

# Enter a container's network namespace from the host
sudo nsenter -t &lt;PID> -n ip addr
sudo nsenter -t &lt;PID> -n ss -lntp

# Inspect cgroup placement and limits
cat /proc/&lt;PID>/cgroup
cat /sys/fs/cgroup/&lt;path>/memory.max
cat /sys/fs/cgroup/&lt;path>/memory.events
