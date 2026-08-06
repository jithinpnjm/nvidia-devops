---
title: "Senior Deep Dive 2 — Memory: virtual address space, page faults, NUMA and OOM decisions"
slug: "senior-deep-dive-2-memory-virtual-address-space-page-faults-numa-and-oom-decis"
sidebar_position: 8
description: "Senior Deep Dive 2 — Memory: virtual address space, page faults, NUMA and OOM decisions — Foundations Beneath Kubernetes."
source_document: "Volume_01_Foundations_Beneath_Kubernetes(3).docx"
---
Virtual memory is an address-space abstraction. A process can reserve address ranges without immediately consuming physical RAM. Memory becomes operationally expensive when pages are faulted in, dirtied, pinned, swapped, reclaimed or moved across NUMA domains. Senior troubleshooting therefore distinguishes virtual size, resident set, anonymous memory, file-backed page cache, shared memory and pinned memory instead of treating “memory usage” as one number.

NUMA matters on large CPU/GPU servers because memory access latency and bandwidth depend on locality. A GPU connected beneath one PCIe root complex can be closer to one CPU socket and its memory controllers. If feeder threads, NIC interrupts and memory allocations land on the wrong NUMA node, an apparently healthy GPU may starve. This is one bridge between ordinary Linux knowledge and AI infrastructure: topology affects performance long before Kubernetes notices anything is wrong.

**Host commands: memory and NUMA evidence**

```bash
# Memory pressure and reclaim
free -h
vmstat 1
cat /proc/pressure/memory
cat /proc/meminfo | egrep 'MemAvailable|Anon|Mapped|Dirty|Writeback|Huge|Unevictable'

# Per-process mappings and faults
pmap -x <PID> | tail
pidstat -r -p <PID> 1

# NUMA layout and locality
numactl --hardware
numastat -p <PID>
lscpu -e=CPU,NODE,SOCKET,CORE
```

➕ **`/proc/pressure/memory` (PSI), annotated — the number this Deep Dive's command list has that Chapter 2 doesn't:**
```text
$ cat /proc/pressure/memory
some avg10=2.34 avg60=1.02 avg300=0.41 total=48291822
full avg10=0.11 avg60=0.05 avg300=0.02 total=1893004
```
`some` = the percentage of the last 10/60/300 seconds during which *at least one* task was stalled waiting on memory (reclaim, swap-in, compaction). `full` = the percentage during which *every* runnable task was stalled simultaneously — that's the number that actually correlates with user-visible latency, because it means nothing useful could run at all during that window. `some avg10=2.34` with `full avg10=0.11` describes a system where memory pressure exists but is mostly hidden behind other runnable work — a single average `%used` metric cannot distinguish "some contention, no real stall" from "everything stopped," which is exactly why PSI exists.

➕ **`pmap -x <PID> | tail` and `pidstat -r -p <PID> 1`, annotated — continuing Chapter 2's PID 8842 example:**
```text
$ pmap -x 8842 | tail -3
Address           Kbytes     RSS   Dirty Mode  Mapping
00007f2c40000000 8388608  412300  380120 rw---   [ anon ]
---------------- ------- ------- -------
total kB          8421604  412300  380120
```
This is the mapping-level breakdown behind the single `VmRSS`/`VmSize` numbers Chapter 2 already read from `/proc/<PID>/status` — `pmap -x` shows *which* mapping (`[ anon ]` here = heap/stack, not a file) is actually holding the resident memory, which matters when a process has hundreds of mappings and one summary number isn't enough to find the culprit.
```text
$ pidstat -r -p 8842 1
Linux 5.15.0 ...
UID   PID   minflt/s  majflt/s     VSZ    RSS  %MEM  Command
1000  8842   1180.00      0.00 8421604 412300   0.6  python3
```
`-r` reports faults, not CPU. `minflt/s` (minor faults/sec) climbing with `majflt/s` at `0.00` is Chapter 2's page-fault diagram in one line: this process is faulting in already-cached/shared pages constantly (cheap, no I/O) — if `majflt/s` were nonzero instead, every one of those faults is real disk/swap I/O, and that's a very different incident.

➕ **`numactl --hardware`, `numastat -p <PID>`, `lscpu -e`, annotated — this is where the actual new material in this Deep Dive lives:**
```text
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
node 0 size: 128772 MB
node 0 free: 41233 MB
node 1 cpus: 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
node 1 size: 128999 MB
node 1 free: 39876 MB
node distances:
node   0   1
  0:  10  21
  1:  21  10
```
The **distance table at the bottom is the number that matters**: `10` is the reference cost of a local access; `21` means a Node-0-to-Node-1 access costs roughly twice as much latency. Everything else in this output (node sizes, free memory) is context; the distance matrix is the evidence that a "wrong" placement is measurably, not just theoretically, slower.
```text
$ numastat -p 8842
Per-node process memory usage (in MBs) for PID 8842 (python3)
                           Node 0          Node 1           Total
                  --------------- --------------- ---------------
Heap                        45.20            0.30           45.50
Stack                        0.10            0.00            0.10
Private                    380.20            2.10          382.30
                  --------------- --------------- ---------------
Total                      425.50            2.40          427.90
```
This is the single most useful command in this list: it shows *where a specific process's memory actually landed*, node by node. A process whose memory is ~99% on Node 0 (as here) is fine only if the GPU and NIC it's feeding are also under Node 0's PCIe root complex — check that against `nvidia-smi topo -m` (Chapter 4/Volume 4 territory) or the `lscpu -e` output below.
```text
$ lscpu -e=CPU,NODE,SOCKET,CORE
CPU NODE SOCKET CORE
0    0    0    0
1    0    0    1
...
16   1    1    0
17   1    1    1
```
This is the lookup table that turns "GPU2 is under PCIe root complex B" into "root complex B is Node 1, which is CPUs 16-31" — without it, `numactl --cpunodebind=1` is just a number with no traceable meaning.

OOM reasoning must identify the boundary — Chapter 2 now covers the three distinct memory-death paths (container cgroup OOM, node-wide OOM, kubelet soft eviction) and the exact `memory.events` fields that prove each one, in full depth, so this Deep Dive doesn't repeat that table. The one-line version worth keeping here: the right question is never "did we run out of memory?" — it's "which allocator or control boundary could not satisfy the request, and what evidence records that decision?"

## ➕ Senior addendum

*(extends Chapter 2, which now covers the virtual-memory/page-cache/OOM mechanism in depth. This Deep Dive's genuinely new concept beyond that chapter is NUMA-and-GPU locality — worth a diagram, since the text above states it but doesn't draw it.)*

➕ **NUMA + GPU, made concrete (this Deep Dive's most important paragraph, with the diagram it's missing):**
```
Node 0: CPU 0-15 -- local RAM -- PCIe root complex A -- GPU0, GPU1, NIC0
Node 1: CPU 16-31 -- local RAM -- PCIe root complex B -- GPU2, GPU3, NIC1
                 \-- cross-node QPI/UPI hop (slower) --/
```
A data-loader thread pinned to Node-0 CPUs feeding GPU2 (Node-1) pays a real, measurable latency tax on every batch — and this is invisible to `nvidia-smi` utilization numbers, which only show the GPU side. `numactl --hardware` + `lscpu -e` (from this Deep Dive's own command list) is how you'd catch this. Kubernetes Topology Manager (`--topology-manager-policy=single-numa-node`) is the cluster-level lever to prevent it at scheduling time — worth naming as the fix, not just the diagnosis.

➕ **Pinned (page-locked) host memory — why it exists, worked from the actual constraint, not the buzzword:**

Start from what a GPU's DMA (direct memory access) engine actually does: when the GPU copies data to or from host RAM, it doesn't go through the CPU or the kernel's virtual-memory system at all — it reads and writes a *physical* memory address directly over PCIe, on its own, while the CPU does something else. That's the entire point of DMA: it's a transfer the CPU doesn't have to babysit.

Now consider a normal memory allocation (plain `malloc`, or a normal Python/PyTorch host buffer). The kernel is free to move that data's physical location at any time — during memory compaction, or by swapping it out entirely under pressure — because normal virtual memory is *pageable*: the mapping from virtual address to physical address can change, invisibly to the application, whenever the kernel wants. That's a feature everywhere else in this chapter. It becomes a problem the moment you hand that address to a DMA engine that will keep writing to it over the next several milliseconds with no kernel involvement — if the kernel moved or swapped that page mid-transfer, the DMA engine would be reading or writing memory that no longer holds what it thinks it holds, silently corrupting the transfer.

So the driver can't just point the DMA engine at your ordinary buffer. What actually happens when you call `cudaMemcpy` on normal (pageable) host memory is: CUDA first does an ordinary CPU-driven copy from your buffer into an internal buffer it maintains in **pinned** memory — memory the kernel has been told to lock in place and never move or swap — and only *then* triggers the DMA engine to transfer from that pinned staging buffer to the GPU. You paid for two copies (one CPU memcpy, then one DMA) to move data that logically only needed one.

**Pinned memory removes that first copy.** If you allocate your own buffer as pinned (`cudaHostAlloc` / `cudaMallocHost` instead of `malloc`), the kernel gives the same guarantee up front — this physical page will not move — so CUDA can point the DMA engine directly at *your* buffer with no staging copy in between. That's the entire mechanism: pinned memory isn't inherently "faster RAM," it's RAM the kernel has promised to leave alone, which is the one guarantee a DMA engine actually needs.

| | Pageable (normal) memory | Pinned (page-locked) memory |
|---|---|---|
| Kernel can move/swap it mid-transfer | Yes | No — that's the guarantee pinning buys |
| What `cudaMemcpy` actually does | CPU copies your data into an internal pinned staging buffer, *then* DMAs from there | DMA engine transfers directly from your buffer |
| Extra CPU-driven copy in the critical path | Yes, always | No |
| Can be used for true async transfers overlapping GPU compute | No — an in-flight async transfer can't tolerate its source moving | Yes — this is why async pipelines require pinned buffers |
| Reclaimable by the kernel under memory pressure | Yes | No |

That last row is the cost side, and it's why nobody pins gigabytes of RAM casually: every byte pinned is a byte the kernel can never reclaim for anything else on that host, no matter how much memory pressure builds elsewhere — over-pin, and you can starve the rest of the node the same way an unbounded cache would. In practice this means pinning only the specific transfer buffers on your hot path (the input batch about to move to the GPU), not application memory in general.

**Now the actual reason this section lives inside a NUMA deep dive, not a CUDA-programming one:** pinning answers the question "can this transfer skip the staging copy?" — it says nothing about *where* that pinned memory physically sits. A pinned buffer allocated on Node 0, feeding a GPU whose PCIe root complex is under Node 1, still has to cross the slower cross-node link on every single transfer — pinning removed one cost (the staging copy) while NUMA placement quietly left the other cost (cross-node distance) in place. Two independent things have to both be correct — pinned *and* NUMA-local — and `nvidia-smi` shows the outcome of neither; it only ever shows what the GPU itself is doing, never how the bytes got to it.

## ➕ Worked scenario

**Situation:** Two nodes in the same training cluster have identical GPU models, identical driver/CUDA versions, and near-identical `nvidia-smi` utilization during a run — but one node's per-step time is consistently 15-20% slower, and has been since it was provisioned.

1. Rule out the obvious first: `nvidia-smi topo -m` on both nodes shows the same GPU-to-GPU link types (NVLink where expected), so it isn't a topology defect on the slow node itself.
2. The remaining candidate is which NUMA node each GPU sits under versus which NUMA node is actually feeding it. Run `lscpu -e=CPU,NODE,SOCKET,CORE` on the slow node to map CPU ranges to NUMA nodes, then cross-reference against `nvidia-smi topo -m`'s PCIe-root-complex grouping to find which node each GPU belongs to.
3. Run `numastat -p <PID>` on the data-loader/feeder process for the slow GPU. The output shows its memory sitting almost entirely on Node 0 — but the GPU it feeds is enumerated under the PCIe root complex tied to Node 1.
4. That's the whole incident: the feeder process was never pinned, so the scheduler placed it wherever a CPU happened to be free at process-start time, and it landed on the wrong node relative to its GPU. Every batch pays the cross-node distance (`numactl --hardware`'s `21` vs `10`) on every host-to-device copy, and none of it shows up in `nvidia-smi` utilization, which only reports the GPU side.
5. Fix at the process level: `numactl --cpunodebind=1 --membind=1 <feeder process>` to force correct placement. Fix at the platform level, so this can't recur silently on future pods: Kubernetes Topology Manager with `--topology-manager-policy=single-numa-node`, which refuses to schedule a pod across mismatched NUMA nodes rather than letting it land wrong and run slow.

**Conclusion:** identical hardware, identical driver stack, identical `nvidia-smi` readings — and a real, reproducible performance gap that only NUMA-locality evidence (not GPU-side evidence) can explain.

## ➕ Practice

1. On a two-socket host, run `numactl --hardware` and `lscpu -e=CPU,NODE,SOCKET,CORE`, and write down which CPU numbers belong to which NUMA node — do this once so the mapping is muscle memory, not a lookup.
2. Run `numastat -p <PID>` against a long-running process on your own machine or a lab host and explain, in one sentence, what its Node 0 vs Node 1 split tells you about where it was scheduled.
3. Explain why `nvidia-smi` alone can never catch a NUMA-mismatch performance regression, and name the two commands (from this Deep Dive) that can.
4. Explain, without looking it up, why a `full avg10` value in `/proc/pressure/memory` is a more urgent signal than a `some avg10` value of the same magnitude.
