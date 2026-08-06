---
title: "Chapter 5 - Namespaces, cgroups and container mechanics"
slug: "chapter-5-namespaces-cgroups-and-container-mechanics"
sidebar_position: 5
description: "Chapter 5 - Namespaces, cgroups and container mechanics — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
# Chapter 5 — Namespaces, cgroups and container mechanics
*(original text preserved in full; ➕ marks additions)*

**Learning outcome:** Explain what a container actually is at the Linux level and how Kubernetes requests/limits map to resource control.

## 5.1 Namespaces
| Namespace | Isolation view |
|---|---|
| pid | process IDs and process tree |
| net | interfaces, routes, sockets, firewall namespace |
| mnt | mount table/filesystem view |
| uts | hostname/domain |
| ipc | IPC resources |
| user | user/group ID mappings |
```bash
lsns
readlink /proc/<PID>/ns/net
nsenter -t <PID> -n ip addr
nsenter -t <PID> -n ip route
```

➕ **Annotated:**
```text
$ lsns
        NS TYPE   NPROCS   PID USER COMMAND
4026531840 mnt        180     1 root /sbin/init
4026532890 net           4  8842 app  python3
4026532891 pid           3  8842 app  python3

$ readlink /proc/8842/ns/net
net:[4026532890]

$ nsenter -t 8842 -n ip addr show eth0
3: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet 10.244.1.7/24 scope global eth0

$ nsenter -t 8842 -n ip route
default via 10.244.1.1 dev eth0
```
`lsns`'s `NPROCS` column is the giveaway: `net:[4026532890]` shared by 4 processes (the pause container plus its pod's app containers) confirms real namespace sharing, not just an assumption based on them being "in the same Pod." `readlink .../ns/net` prints that same namespace's inode number directly — two different PIDs resolving to the identical number is the definitive proof two containers share a network namespace. `nsenter -t <PID> -n` runs a command *as if* executing inside that namespace without actually entering the container — this is how you inspect a pod's network from the host, exactly as the pause-container mechanism below relies on.

➕ **The pause-container mechanism, precisely (why `nsenter` even works this way):**
```mermaid
flowchart TD
    subgraph POD["Pod 'web' (2 containers)"]
        P["pause container: holds open NET+IPC namespace (created first, never restarts)"]
        A1["app container 1: own PID/MNT, shares NET/IPC"]
        A2["app container 2: own PID/MNT, shares NET/IPC"]
    end
```
`nsenter -t <pause_PID> -n ip addr` and `nsenter -t <app_container_PID> -n ip addr` return the *same* output — proving the shared netns live, not just in theory. Killing the pause container process (rare, but happens on some node-level cleanup bugs) drops pod networking even with app containers still technically alive — a real, if unusual, incident signature worth recognizing.

➕ **Diagram: which namespaces are shared vs. private, per container in a Pod**
```mermaid
flowchart TD
    subgraph PB["Pod boundary"]
        NET["NET namespace — shared by ALL containers (one IP, one port space)"]
        IPC["IPC namespace — shared by ALL containers (shared memory segments)"]
        subgraph Containers[" "]
            direction LR
            PC["pause container (owns NET+IPC)"]
            AC1["app container 1 — own PID namespace, own MNT namespace"]
            AC2["app container 2 — own PID ns, own MNT ns"]
        end
        NET --- Containers
        IPC --- Containers
    end
```
This is why `kubectl exec` into one container can `curl localhost:<port>` and reach a server listening in a *different* container of the same Pod (shared NET namespace, so "localhost" is genuinely shared) — but cannot see the other container's processes in `ps` (private PID namespaces).

➕ **`user` namespace — the one most K8s clusters *don't* use by default, and why that matters for the security answer in Chapter 2's capabilities discussion:** without a user namespace, UID 0 inside the container **is** UID 0 on the host kernel (same UID space) — capabilities/seccomp/MAC are what actually constrain it, not the namespace itself. Rootless container runtimes (or K8s user-namespace support, GA more recently) remap container UID 0 to an unprivileged host UID — genuinely stronger isolation, at the cost of complexity (volume ownership, some syscall compatibility). Worth naming as "the isolation upgrade most clusters haven't adopted yet" if asked about container security maturity.

## 5.2 cgroups
cgroups organize processes for resource accounting/control. In cgroup v2, controllers expose files for CPU, memory, I/O and other resources. Container runtimes place container processes into cgroups; Kubernetes requests influence scheduling while limits may become enforcement configuration.
```bash
cat /proc/<PID>/cgroup
cat /sys/fs/cgroup/cpu.stat
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.events
```

➕ **Annotated:**
```text
$ cat /proc/8842/cgroup
0::/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-podabc.slice/cri-containerd-8842.scope

$ cat /sys/fs/cgroup/kubepods.slice/.../cri-containerd-8842.scope/cpu.stat
usage_usec     48213340192
nr_periods     128000
nr_throttled   41200
throttled_usec 890000000

$ cat .../memory.current
2136745984
$ cat .../memory.events
low 0
high 12
max 0
oom 0
oom_kill 0
```
`/proc/<PID>/cgroup` is the step people skip — it's the only way to find *which* path under `/sys/fs/cgroup` actually belongs to this process, before any of the other three reads mean anything. `cpu.stat`'s `nr_throttled`/`nr_periods` (here: 41200/128000 ≈ 32%) is Chapter 1's throttling arithmetic read from an actual container. `memory.current` (≈2.0GiB) next to a `memory.max` you'd check separately tells you headroom; `memory.events`' `high 12` with `oom`/`oom_kill` still at `0` means this container has been pressured repeatedly but never actually killed — a leading indicator, not yet an incident.

➕ **requests vs limits — the exact mechanism split, worth stating precisely:**
| | Where it's used | Kernel enforcement? |
|---|---|---|
| `requests` | scheduler bin-packing input only | none — purely a placement hint |
| `limits.cpu` | written to `cpu.max` (quota/period) | yes — CFS bandwidth throttling (slows down, doesn't kill) |
| `limits.memory` | written to `memory.max` | yes — kernel OOM killer (kills the process) |

Same "limits" word, two completely different enforcement mechanisms and two completely different failure symptoms — this table is worth having memorized verbatim.

## 5.3 What an image is — and is not
A container image is a filesystem/content package plus metadata. Isolation comes from how the runtime launches the process: namespaces, cgroups, mounts, capabilities, seccomp, LSM policy and device access. This distinction is essential when debugging "container" problems that are actually host-kernel or cgroup problems.

➕ **The runtime chain and where GPU access is actually injected:**
```mermaid
flowchart LR
    K[kubelet] -->|CRI gRPC| CR["containerd/CRI-O"] --> R["runc (OCI runtime: does the literal clone() call)"]
    R -.->|"NVIDIA Container Toolkit hooks in here as an OCI prestart hook"| H["injects /dev/nvidia* + driver libs into the container's mount namespace at creation time"]
```
"How does a container see the GPU" has a precise answer: a prestart hook, not magic, not a special container type. Worth being able to say this exact chain without hesitation — it's a very likely interview question given the role.

➕ **OverlayFS — why container writes vanish and where they actually live:**
```
merged (what the process sees) = upperdir (container's own writes) + lowerdir (image layers, read-only)
```
Writes not going to a mounted volume live in `upperdir` and disappear when the container is removed. Heavy write-churn to `upperdir` (an app logging to a local file instead of stdout, or large temp files) causes real overlay-layer I/O overhead that's easy to misattribute to "the disk is slow."

➕ **Diagram: the overlay stack, bottom to top**
```mermaid
flowchart TD
    M["merged view (what the process sees) — top layer wins on conflicts"]
    U["upperdir (container's own writes, read-write, gone when container removed)"]
    subgraph LD["lowerdir — stacked, read-only, shared across every container started from this image"]
        LN["image layer N (top-most, read-only)"]
        LN1["image layer N-1 ..."]
        L1["image layer 1 (base, read-only)"]
        LN --> LN1 --> L1
    end
    M --> U --> LN
```
Reading a file that exists only in a lower layer costs one lookup; writing to it triggers copy-up (the whole file is copied into `upperdir` before the write applies) — large files modified frequently in lower layers are the specific pattern that turns "trivial write" into real, unexpected I/O.

## Worked scenario
**Situation:** A Pod shows CPU latency but the node dashboard has idle CPU.

1. Inspect the Pod CPU limit and container cgroup cpu.stat for throttling.
2. Compare requested/limited CPU with application thread behavior.
3. Check node run queue and per-CPU utilization to distinguish local quota from host saturation.
4. Only then decide whether to change limits, requests or application concurrency.

**Conclusion:** A container can be locally constrained inside an apparently idle node.

*(This is the same throttling mechanism as Chapter 1's worked scenario — cross-reference rather than re-deriving; the "container-shaped" framing here vs. the "host-shaped" framing there is the point: same evidence, different entry angle.)*
