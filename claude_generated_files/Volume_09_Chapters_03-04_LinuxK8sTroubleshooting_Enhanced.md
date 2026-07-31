# Chapter 3 — Linux troubleshooting questions
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Practice translating symptoms into CPU, memory, I/O, process or network evidence.

| Question | Strong first branch |
|---|---|
| Load 30, CPU 40% | runnable vs D-state blocked tasks vs cgroup throttling |
| OOMKilled but node has free memory | container cgroup limit vs node OOM |
| disk is slow | capacity vs inode vs latency/queue vs workload pattern |
| service restarts | exit code/app crash vs OOM/signal vs systemd policy/dependency |

## Worked scenario
**Situation:** Interviewer: "The system is slow. What do you do?"

1. Clarify what "system" and "slow" mean: request latency, shell responsiveness, job throughput, one node or fleet.
2. Check recent changes and scope.
3. Use a resource saturation snapshot: CPU/run queue, memory/swap, I/O latency, network/dependency latency.
4. Drill into the subsystem that correlates with the symptom.
5. Propose a safe mitigation only after evidence.

**Conclusion:** The senior answer converts an ambiguous symptom into measurable dimensions before commands.

---

## Original — Question set A: Linux and host mechanics

| Question | What a senior answer should expose |
|---|---|
| Load average 40 but CPU 25% — explain | runnable vs D-state tasks, I/O, per-cgroup throttling, vmstat/ps/wchan/PSI |
| Container OOM but node has free RAM | cgroup memory boundary, memory.events, working set, requests/limits |
| Only some GPU nodes are slow | NUMA, PCIe/NIC topology, driver/kernel image, CPU feeder/storage/fabric evidence |
| TCP connection times out | DNS/route/SYN path/firewall/conntrack/listener; packet capture and ss |
| Disk 70% full yet writes fail | inodes, quotas, read-only FS, mount/device errors, filesystem reservations |

---

## ➕ Additions

➕ **Troubleshooting decision tree — "the system is slow" (turn the vague symptom into a branch, before any command):**
```
"The system is slow" (interviewer prompt)
        │
        ▼
  CLARIFY: latency? throughput? one host or fleet? since when?
        │
        ▼
  ┌─────────────┬─────────────┬─────────────┬─────────────┐
  │   CPU/run    │  Memory/swap │   I/O/disk   │  Network/    │
  │   queue      │              │              │  dependency  │
  └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
         ▼              ▼              ▼              ▼
   r vs b (vmstat)  free vs used   iostat await   ss -tn state,
   cpu.stat throttle vs cache    vs %util       dependency
   wchan for D                  vs queue depth   latency histogram
```

➕ **Sample annotated output — the "load 30, CPU 40%" question, made concrete with real commands:**
```
$ uptime
 14:32:10 up 12 days,  3:41,  2 users,  load average: 30.14, 28.90, 25.02

$ vmstat 1 3
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 6 24      0 512300  88120 4021144   0    0   840  1200 5210 8890 22 6 40 32  0
 5 26      0 511800  88120 4021900   0    0   910  1340 5340 9010 21 7 39 33  0
```
`r=6` — CPU is genuinely not oversubscribed (matches the "CPU 40%" the interviewer stated). `b=26` — 26 tasks blocked in uninterruptible sleep, which is where the load-average-30 is actually coming from; load average sums runnable *and* uninterruptible-sleep tasks, so this single field (`b`) is the evidence that separates "CPU problem" from "I/O problem" without touching a single CPU metric. `wa=32` (I/O wait) corroborates it.
```
$ for p in $(ps -eo pid,stat | awk '$2 ~ /D/ {print $1}'); do
    echo "$p: $(cat /proc/$p/comm) -> $(cat /proc/$p/wchan)"
  done
4021: java -> nfs_wait_bit_uninterruptible
4055: java -> nfs_wait_bit_uninterruptible
4102: python3 -> wait_on_page_bit
```
Two distinct root causes hiding under one "load 30" symptom: an NFS mount stalling most of the `java` processes, and ordinary page-cache I/O wait for `python3`. **Interview-ready line:** "Load average by itself never tells you if it's CPU or I/O — `b` in `vmstat` and `wchan` per PID do."

➕ **Extra worked scenario (new) — "disk 70% full yet writes fail," fully diagnosed:**
> **Situation:** `df -h` shows 30% free on `/var/log`, but an application logging to that mount gets `ENOSPC`.
> 1. Clarify: is it every write or specific paths? Since when?
> 2. Check inodes, not just blocks: `df -i /var/log` — a directory with millions of tiny files (a runaway per-request log file, a stuck rotation job) can exhaust the inode table while block usage looks fine.
> ```
> $ df -i /var/log
> Filesystem      Inodes  IUsed   IFree IUse% Mounted on
> /dev/sdb1      1310720 1310720      0  100% /var/log
> ```
> 3. If inodes are fine, check for a read-only remount after a filesystem error (`dmesg | grep -i "remount-ro"`), quota (`repquota`), or a reserved-blocks percentage (`tune2fs -l` shows `Reserved block count` — ext-family filesystems reserve ~5% for root by default; a non-root writer can hit ENOSPC while `df` still shows "free" space that's actually root-reserved).
> **Conclusion:** "70% full" from `df -h` and "writes fail" are only connected through one of at least three distinct mechanisms (inodes, RO remount, reserved blocks) — never assume block-capacity is the story just because a percentage is quoted.

## Practice
➕ 6. Reproduce the D-state/NFS scenario: mount a deliberately slow/throttled NFS/loopback target, drive writes against it, and confirm `vmstat`'s `b` column and `wchan` both point at it before you'd normally suspect CPU.
➕ 7. Fill an inode table on a scratch filesystem (`for i in $(seq 1 200000); do touch /mnt/scratch/f$i; done` on a small filesystem) and reproduce ENOSPC with free blocks still showing — narrate the `df -i` evidence out loud.

---

# Chapter 4 — Kubernetes troubleshooting questions
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Use object status/events to find the control-loop stage, then descend to node/Linux evidence.

| Symptom | First evidence |
|---|---|
| Pending | Pod events + scheduler constraints |
| ContainerCreating | kubelet/CNI/CSI/image/sandbox events |
| CrashLoopBackOff | previous termination reason/exit code + previous logs |
| NotReady | readiness probe/dependency/application evidence |
| Service unreachable | EndpointSlice -> DNS -> service dataplane -> CNI/policy |

## Worked scenario
**Situation:** Interviewer: "Pods are Pending despite cluster autoscaler enabled."

1. Read FailedScheduling reason.
2. Ask whether any node type the autoscaler can create would satisfy the Pod.
3. Check max size/resource limits/quota.
4. Check affinity/taints/PVC topology/GPU resource type that may prevent expansion from helping.
5. Only then investigate autoscaler implementation/logs.

**Conclusion:** Autoscaler is not a universal cure for unschedulable constraints.

---

## Original — Question set C: Kubernetes platform depth

| Prompt | Expected reasoning |
|---|---|
| Pod Pending on GPU cluster | scheduler event -> requests/DRA -> affinity/taint -> topology -> capacity/autoscaler |
| Service reachable from some Pods only | EndpointSlice, DNS, policy, CNI route, node-specific dataplane |
| Node Ready but GPU unavailable | host driver -> operator operands -> device plugin/DRA -> allocatable -> runtime injection |
| Deployment rollout stuck | new ReplicaSet, readiness/startup, capacity, PDB/maxSurge, image/config, events |
| Control plane writes slow | apiserver latency, admission webhooks/policies, etcd latency/quorum |

---

## ➕ Additions

➕ **Kubernetes symptom-to-layer decision tree (covers both original tables at once):**
```
Pod/Service symptom
        │
        ▼
 Pending? ──yes──▶ kubectl describe pod → Events
   │no                  │
   │              FailedScheduling reason:
   │              - Insufficient <resource>   → capacity/quota/autoscaler
   │              - node(s) had taint          → affinity/toleration mismatch
   │              - node(s) didn't match       → nodeSelector/topology/PVC zone
   ▼
 ContainerCreating stuck? ──yes──▶ kubelet events: image pull, CNI, CSI mount, sandbox
   │no
   ▼
 CrashLoopBackOff? ──yes──▶ previous container's exit code + `--previous` logs
   │no                         137=SIGKILL(OOM/manual) 1=app error 143=SIGTERM
   ▼
 Running but NotReady? ──yes──▶ readiness probe result + app dependency check
   │no
   ▼
 Running+Ready but unreachable? ──▶ EndpointSlice has IP? → DNS resolves? →
                                     kube-proxy/CNI dataplane → NetworkPolicy
```

➕ **Sample annotated output — GPU-specific Pending Pod, the exact evidence chain:**
```
$ kubectl describe pod bert-train-0 | tail -15
Events:
  Type     Reason            Age   From               Message
  ----     ------            ----  ----               -------
  Warning  FailedScheduling  38s   default-scheduler   0/12 nodes are available:
           8 Insufficient nvidia.com/gpu, 4 node(s) had untolerated taint
           {nvidia.com/gpu: present}.
```
Two distinct causes in one message: 8 nodes simply don't have enough free GPU allocatable (capacity question — will autoscaler help, or is the whole fleet saturated?), and 4 nodes are GPU nodes tainted to keep non-GPU workloads off them, and this Pod has no matching toleration (spec bug, not a capacity problem — adding nodes won't fix it). **Interview-ready line:** "One FailedScheduling message can bundle two unrelated root causes — I'd never add capacity before reading which specific nodes failed for which specific predicate."

➕ **Second annotated output — "Node Ready but GPU unavailable," the layer trace:**
```
$ kubectl describe node gpu-worker-07 | grep -A5 Allocatable
Allocatable:
  cpu:                62
  memory:             240Gi
  nvidia.com/gpu:     0        ← Ready node, zero GPUs allocatable

$ kubectl get pods -n gpu-operator -o wide | grep gpu-worker-07
nvidia-device-plugin-daemonset-x9k2p   0/1   CrashLoopBackOff   gpu-worker-07

$ kubectl logs -n gpu-operator nvidia-device-plugin-daemonset-x9k2p --previous
Failed to initialize NVML: Driver/library version mismatch
```
The chain: node is `Ready` (kubelet is healthy) but `nvidia.com/gpu` allocatable is 0 because the device plugin — the thing that reports GPU count to the kubelet — can't even start, because the host driver and the container-toolkit-loaded NVML library versions disagree. This is exactly the "host driver → operator operands → device plugin → allocatable" chain the original question set names; the evidence at each layer is a specific `kubectl` object, not a guess.

➕ **Extra worked scenario (new) — "Control plane writes slow," fully diagnosed for a GPU-heavy cluster:**
> **Situation:** `kubectl apply` and Pod creation across the cluster feel sluggish; read operations (`get`, `describe`) are fine.
> 1. Clarify: is it all writes, or specifically Pod creates on GPU nodes? (Admission webhooks scoped to Pods with GPU resources — e.g. the NVIDIA GPU Operator's or a scheduling extender's webhook — are a common culprit that reads-only traffic never touches.)
> 2. Check apiserver metrics: `apiserver_request_duration_seconds` bucketed by verb and resource — isolates whether it's genuinely apiserver-side or downstream.
> 3. Check admission webhook latency specifically — a slow or overloaded mutating/validating webhook adds synchronous latency to every matching write, and GPU-scheduling extenders are exactly the kind of custom webhook that regresses without much operational visibility.
> 4. Check etcd: `etcd_disk_wal_fsync_duration_seconds` and leader/quorum stability — a slow disk under etcd or a recent leader election storm degrades every write cluster-wide, not just GPU-scoped ones.
> **Conclusion:** "Slow writes, fast reads" narrows the search to the write path specifically (admission chain + etcd), and separating "all writes" from "only GPU-Pod writes" is the single fastest way to tell webhook-scoped slowness from etcd-wide slowness.

## Practice
➕ 6. Deliberately create a Pod with a `nodeSelector` that matches zero nodes and one with a GPU resource request exceeding cluster capacity — compare the two `FailedScheduling` messages verbatim and explain in one sentence how you'd tell them apart without reading the message (hint: you can't reliably — always read the actual message).
➕ 7. Simulate the device-plugin CrashLoopBackOff scenario above (or read a real cluster's) and write the one-line rule you'd give a junior engineer: "Node Ready + GPU allocatable 0 always means check the device plugin/operator pods on that node before touching the workload."
