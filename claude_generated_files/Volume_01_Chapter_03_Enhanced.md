# Chapter 3 — Files, file descriptors, filesystems and block I/O
*(original text preserved in full; ➕ marks additions)*

**Learning outcome:** Understand how applications reach storage and distinguish capacity, metadata, throughput, IOPS and latency failures.

## 3.1 File descriptors and VFS
A process accesses files, sockets, pipes and many kernel objects through integer file descriptors. The VFS gives applications a common filesystem interface while specific filesystems implement semantics underneath. "Too many open files" is therefore a resource-limit/fd-leak problem, not a disk-capacity problem.
```bash
ls -l /proc/<PID>/fd | head
lsof -p <PID> | head
cat /proc/<PID>/limits | grep -i 'open files'
ss -s
```

➕ **The read path, precisely (VFS as a dispatch layer, not a filesystem itself):**
```
read(fd, buf, n)
   │
   ▼
VFS (common interface — dispatches to the right filesystem driver based on fd's mount)
   │
   ├── ext4/xfs (local disk) ──▶ page cache lookup ──▶ block layer ──▶ driver ──▶ disk
   ├── nfs/cephfs (network fs) ──▶ page cache lookup ──▶ RPC over network ──▶ remote server
   └── overlayfs (containers) ──▶ lowerdir (image, read-only) or upperdir (container writes)
```
This is why the exact same `read()` syscall can be fast (local NVMe, cache hit) or catastrophically slow (NFS server under load) with identical application code — the bottleneck is never visible from the syscall itself, only from what's underneath the VFS dispatch.

➕ **Sample `lsof`/fd output and what actually leaks in production:**
```
$ ls -l /proc/8842/fd | head -6
lrwx------ 1 app app 64 Jul 30 10:00 3 -> /dev/nvidia0
lrwx------ 1 app app 64 Jul 30 10:00 4 -> socket:[884213]
l-wx------ 1 app app 64 Jul 30 10:00 5 -> /var/log/app.log (deleted)   ← classic leak signature
lrwx------ 1 app app 64 Jul 30 10:00 6 -> /data/model-shard-0042.bin
```
The `(deleted)` marker is the single most common real-world fd leak: a log rotation tool `unlink()`s the file, but the process still holds the fd open — disk usage doesn't drop (`du` won't show it, the inode is still allocated) even though `ls` shows the file gone. **`df` and `du` disagreeing after a log rotation is this exact bug, every time — check `lsof +L1` before anything else.**

## 3.2 Capacity versus latency
| Question | Evidence |
|---|---|
| Is filesystem capacity full? | `df -hT` |
| Are inodes exhausted? | `df -ih` |
| Which directory owns space? | `du -xhd1` |
| Is device latency/queue high? | `iostat -xz 1` |
| Which process is issuing I/O? | `pidstat -d 1` / `iotop` |
| Are mounts/network filesystems involved? | `findmnt` / `mount` / storage metrics |

Throughput is data per unit time; IOPS is operations per second; latency is time per operation. A workload can have low throughput but still suffer high latency if it performs small synchronous I/O. Benchmark and diagnose against the application access pattern.

➕ **Sample `iostat -xz 1` output, read the way an interviewer wants:**
```
Device   r/s   w/s   rkB/s   wkB/s  await  aqu-sz  %util
nvme0n1  42.0  980.0 5376.0  62720  8.20   4.10    97.5
```
`%util=97.5` alone doesn't tell you if this is a problem — pair it with `await` (8.2ms is high for NVMe, which should be sub-millisecond) and `aqu-sz` (4.1 = queue is backed up, not draining as fast as requests arrive). **The one-sentence version:** high `%util` with low `await` = genuinely busy doing useful work (probably fine); high `await` with moderate `%util` = queueing/contention problem (investigate noisy neighbors or backend latency), which is the pattern in the worked scenario below.

➕ **IOPS/throughput/latency — three different failure signatures, one table:**
| Symptom | Likely pattern | Fix direction |
|---|---|---|
| High IOPS, low MB/s per op | tiny random I/O (checkpoint shard writes, many small files) | batch writes, larger blocks, fewer/larger objects |
| High MB/s, IOPS unremarkable | sequential large reads (streaming shards) | usually fine — watch NIC saturation instead of disk |
| Latency spikes, averages look normal | queueing/tail latency (`await` climbing, `%util` not pegged) | noisy-neighbor on shared parallel FS, or NFS/CSI backend queueing |

➕ **Inode exhaustion — the specific AI-infra trap:**
```bash
df -h /data      # bytes: might show 60% free
df -i /data      # inodes: might show 100% used — completely separate resource, same ENOSPC error
```
A checkpoint job writing millions of tiny shard files can exhaust inodes on ext4 (fixed count set at `mkfs` time) while bytes are nowhere near full. xfs allocates inodes dynamically — this becomes a real filesystem-choice architecture decision for checkpoint-heavy training workloads, worth naming unprompted in an SA interview.

## Worked scenario
**Situation:** A database Pod is slow after moving to a new storage class. CPU and memory look normal.

1. Measure application operation latency and correlate with storage timing.
2. Check filesystem capacity/inodes first to eliminate obvious failures.
3. Check device or CSI/backend latency, queue depth and errors rather than only throughput.
4. Compare mount options, volume topology, storage class parameters and zone/path changes.
5. Run a controlled storage benchmark with a pattern similar to the application before concluding the class is inherently slow.

**Conclusion:** Storage diagnosis is workload-pattern + path + latency evidence, not a single MB/s number.

➕ **Second worked scenario — checkpoint storm, the GPU/AI-specific version:**
> **Situation:** 64 GPU nodes all write training checkpoints to the same shared parallel filesystem every 30 minutes. Checkpoint write time has grown from 45s to 8 minutes over the last month as the cluster scaled from 16 to 64 nodes. Per-node disk (`iostat` on each node's local view) looks idle.
> 1. This is a **shared-resource contention** problem, not a per-node storage problem — `iostat` on any single node won't show it because the bottleneck is the shared filesystem's aggregate throughput/metadata server, not local block I/O.
> 2. Check the parallel filesystem's own metrics (metadata server IOPS, aggregate throughput) — 64 nodes hitting `open()`/`close()`/`fsync()` simultaneously multiplies metadata operations far faster than data volume grows linearly.
> 3. Fix directions with explicit tradeoffs: stagger checkpoint writes across nodes (adds complexity, reduces peak contention); write to node-local NVMe first then async-upload to shared storage (adds a failure mode — local disk loss between checkpoint and upload — but removes the synchronous bottleneck); reduce checkpoint frequency or use incremental/sharded checkpoint formats (changes recovery-time tradeoff).
> **This is a real, common NVIDIA-SA-relevant scenario** — "why did checkpointing get slower as we scaled" is a scaling-non-linearity question, and the correct answer starts with "metadata operations, not bytes" almost every time.

## Practice
1. Explain why df and du can disagree.
2. Find open deleted files in a lab using lsof +L1.
3. Compare sequential throughput and small random I/O using a safe benchmark tool in a test VM.

➕ 4. Run `iostat -xz 1` against both a local NVMe write and an NFS-mounted write of the same size, and compare `await` — do this once so the "same syscall, different backend, wildly different latency" point from the VFS diagram is muscle memory.
➕ 5. Simulate the checkpoint-storm scenario at small scale: have 8 parallel `dd` processes write to the same NFS/shared mount simultaneously and watch `await`/`aqu-sz` climb non-linearly relative to 1 process doing the same total write volume alone.
