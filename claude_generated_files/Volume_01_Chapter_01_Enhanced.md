# Chapter 1 — Processes, threads, CPU scheduling and load
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Explain process/thread state, scheduler queues, CPU time, context switches, load average, throttling and the evidence that distinguishes them.

## 1.1 Process and thread model
A program on disk is passive. A process is a running instance with virtual memory, credentials, file descriptors, signal state and one or more threads. Threads inside the same process share address space and open resources but have independent execution contexts. The Linux scheduler schedules tasks — roughly threads/process execution contexts — not Kubernetes Pods as a special kernel object.

**Inspect process identity, threads, state and file descriptors**
```bash
ps -eo pid,ppid,tid,stat,ni,psr,pcpu,pmem,comm --sort=-pcpu | head -30
ps -L -p <PID> -o pid,tid,psr,stat,pcpu,comm
cat /proc/<PID>/status
ls -l /proc/<PID>/fd | head
```

➕ **Sample output, annotated** (what you're actually looking for):
```
$ ps -eo pid,ppid,tid,stat,ni,psr,pcpu,comm --sort=-pcpu | head -5
  PID  PPID   TID STAT  NI PSR %CPU COMMAND
 8842  8801  8842 R      0   3 97.2 python3        ← running, pinned to CPU 3, hot
 8842  8801  8855 S      0  11  0.4 python3        ← sibling thread, same PID, idle
 9001     1  9001 D      0   7  0.0 java           ← STAT=D, 0% CPU but NOT the same as idle
```
The `D` line is the one that fools people: 0% CPU looks "fine" in a CPU-only dashboard, but a process stuck in `D` is exactly what inflates load average while CPU graphs look calm — this is the gap between "looks idle" and "is blocked" that Kubernetes CPU-based HPA metrics will completely miss.

➕ **Process state machine (what actually drives the transitions):**
```
        fork()/clone()
              │
              ▼
     ┌─────────────┐   scheduled on CPU    ┌─────────┐
     │  Runnable(R) │ ────────────────────▶│Running(R)│
     └─────────────┘◀──────────────────────└─────────┘
        ▲     ▲          preempted/quantum expired   │
        │     │                                       │ blocking syscall (read, futex, wait)
        │     │ event/data ready                      ▼
        │  ┌──────────────┐   uninterruptible I/O  ┌─────────┐
        │  │ Sleeping(S)  │◀──────────────────────│  D-state │
        │  └──────────────┘                        └─────────┘
        │                                                │ signal CANNOT interrupt D — must wait
        │                                                ▼ I/O completes
        └────────────────────────────────────────────────┘
   exit() → Zombie(Z) until parent wait()s → reaped, slot freed
```

➕ **Memory hook:** *"RSDZT — Running Steadily, Dead Zombies Trapped."* R=running/runnable, S=sleeping (interruptible), D=disk-wait (uninterruptible — can't even `kill -9` it out, you have to wait for the I/O), Z=zombie (exited, unreaped), T=traced/stopped. The one to instinctively distrust in dashboards is D — it's invisible to CPU metrics and immune to normal signals.

## 1.2 Process states
| State | Meaning | Operational clue |
|---|---|---|
| R | running or runnable | CPU/run-queue pressure if many remain runnable |
| S | interruptible sleep | normally waiting for timer/event/I/O |
| D | uninterruptible sleep | often waiting on kernel I/O; cannot handle normal signals until wait completes |
| Z | zombie | child exited; parent has not reaped exit status |
| T | stopped/traced | job control or debugger/signal stopped the task |

D state is a classic reason load can be high while CPU utilization is not. Load average includes runnable tasks and tasks in uninterruptible sleep, so it is a queue-pressure signal, not a CPU percentage.

➕ **Shortcut — find every D-state process on a box in one line, ranked by how long it's been stuck:**
```bash
for p in $(ps -eo pid,stat | awk '$2 ~ /D/ {print $1}'); do
  echo "PID $p: $(cat /proc/$p/comm 2>/dev/null) — waiting on: $(cat /proc/$p/wchan 2>/dev/null)"
done
```
`/proc/<pid>/wchan` names the *kernel function* it's blocked in — e.g. `wait_on_page_bit` (page cache I/O) vs `nfs_wait_bit_uninterruptible` (NFS specifically) — this single field turns "something is stuck" into "NFS is the actual root cause" in one command, which is exactly the kind of evidence-first move a Senior SA interview is scoring you on.

➕ **Zombie cleanup reality check:** a zombie holds almost no resources (just a PID table entry + exit status) — the real problem is never the zombie itself, it's *why the parent isn't calling `wait()`* (buggy supervisor, or — very common in containers — PID 1 in a container image not reaping children at all, which is why `tini`/`dumb-init` exist as PID 1 wrappers). If asked "what's wrong with a container full of zombies," the answer is about PID 1 responsibility, not the zombies.

## 1.3 CPU scheduling, run queue and context switches
Linux time-slices runnable tasks across CPUs according to scheduling policy and priority. A context switch changes the executing task. Context switches are normal, but extremely high rates can indicate excessive thread count, lock contention or I/O wakeups. The run queue tells you whether runnable work is waiting for CPU.
```bash
uptime
vmstat 1
mpstat -P ALL 1
pidstat -u -w 1
# vmstat: r=run queue, cs=context switches/s, us/sy/id/wa=CPU state percentages
```

➕ **Sample `vmstat 1` output, read left to right the way an interviewer wants to hear it:**
```
$ vmstat 1
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
12  3      0 812340  98213 3021144   0    0   140   220 4821 9902 71  8 15  6  0
```
Reading order: **r=12** on (say) an 8-core box already tells you CPU is oversubscribed *before* looking at `us`/`sy` — 12 runnable tasks, 8 cores, 4 are queued no matter what. **b=3** means 3 more are blocked (D-state) on top of that — combine with 1.2's `wchan` trick to name what they're blocked on. `cs=9902` is high; cross-check against thread count and lock-heavy code paths, not "the CPU is broken."

➕ **Scheduling policy — the piece most engineers never touch but a Senior SA should know exists:** default is `SCHED_OTHER` (CFS, fair-share, nice-value weighted). Real-time policies (`SCHED_FIFO`, `SCHED_RR`) exist for latency-critical work and **can starve everything else** if misused — `chrt -p <pid>` shows/sets policy. Relevant to HPC/GPU nodes running latency-sensitive control-plane daemons (e.g. some RDMA/fabric management agents) alongside best-effort workloads — a mis-set real-time priority is a real, if rare, "why is everything else on this node starving" root cause.

## 1.4 CPU quotas and throttling
A container can be CPU-starved even when the host has idle CPU if cgroup quota restricts it. Kubernetes CPU limits can translate into CFS bandwidth control. Throttling evidence therefore belongs beside host CPU metrics when an application reports latency under low node utilization.
```bash
# cgroup v2 examples; exact path depends on runtime
cat /sys/fs/cgroup/cpu.max
cat /sys/fs/cgroup/cpu.stat
# look for nr_throttled / throttled_usec
```

➕ **Sample `cpu.stat` and the arithmetic that actually proves throttling:**
```
$ cat /sys/fs/cgroup/cpu.max
50000 100000        ← quota=50ms, period=100ms → this container gets 0.5 CPU cores, period-by-period

$ cat /sys/fs/cgroup/cpu.stat
nr_periods 128000
nr_throttled 41200   ← 32% of all 100ms windows, this container hit its quota and got paused
throttled_usec 890000000
```
`nr_throttled / nr_periods` is your throttling *rate* — 32% here is severe. The tell-tale symptom pattern: **P99 latency spiking in short, regular sawtooth bursts** (every ~100ms period boundary) while host-level `%CPU` for the container looks unremarkable when averaged — averaging hides throttling because the pauses are sub-second. This is the single most common "why is my container slow when the node has plenty of CPU" root cause in Kubernetes, and it's a direct trap for anyone who checks `kubectl top pod` (an average) instead of `cpu.stat` (the actual enforcement counter).

➕ **One-liner to check every pod on a node for throttling, not just one:**
```bash
for cg in /sys/fs/cgroup/kubepods*/*/cpu.stat; do
  t=$(grep nr_throttled "$cg" | awk '{print $2}')
  [ "$t" -gt 0 ] 2>/dev/null && echo "$cg: throttled $t times"
done
```

## Worked scenario
**Situation:** A 16-core node has load average 35, CPU utilization 45%, and application latency is rising.

1. Confirm the load pattern and run queue with uptime/vmstat. If r is small, high load may come from blocked D-state tasks rather than runnable CPU work.
2. Inspect process states with ps/pidstat. Count D-state processes and identify common commands/PIDs.
3. Inspect iostat and dependency latency if D-state tasks point to storage or network filesystems.
4. If the symptom is container-specific, inspect cgroup CPU throttling before buying more CPU.
5. Correlate the time window with deploys, storage events and kernel logs.

**Conclusion:** The correct first branch is "runnable versus blocked versus throttled," not "CPU is high or low."

➕ **Second worked scenario — the throttling trap specifically** (complements the one above, which is D-state-focused; this one is the CPU-limit-focused mirror image):
> **Situation:** A GPU-preprocessing sidecar container has `resources.limits.cpu: "2"`. Host shows 12 of 16 cores idle. The sidecar's P99 latency has 5x'd since a traffic increase, but average CPU usage for the container is only 40%.
> 1. `kubectl top pod` shows 40% — looks fine, resist the urge to stop here.
> 2. `cat cpu.stat` inside the container's cgroup → `nr_throttled` climbing fast → this is CFS bandwidth throttling, not a CPU shortage.
> 3. Root cause: the limit (2 cores) is set below the burst the workload actually needs during traffic spikes, even though *average* usage is low — averages hide burst throttling by design.
> 4. Fix options, in order of preference: raise the limit (if headroom exists, which it does — 12 idle cores on the host), or remove the CPU *limit* while keeping the *request* (lets it burst, at the cost of noisy-neighbor risk — name this tradeoff explicitly in an interview), or move to a node with better bin-packing.
> **Conclusion:** "CPU usage is low" and "CPU is not the bottleneck" are **not the same claim** — this is the exact sentence to say out loud in an interview when this pattern comes up.

## Practice
1. Explain load average to an interviewer without saying it is CPU utilization.
2. Create CPU pressure with a stress tool in a lab and observe vmstat r, mpstat and load average.
3. Find the cgroup of a container process and inspect CPU quota/statistics.

➕ 4. Using the `wchan` one-liner above, put a process into D-state deliberately (e.g. `dd if=/dev/zero of=/mnt/slow-nfs-mount/test bs=1M` against a throttled/slow mount) and confirm you can name the blocking kernel function.
➕ 5. Deliberately under-provision a container's CPU limit relative to its burst need, generate load, and reproduce the "`kubectl top` looks fine, `cpu.stat` shows throttling" mismatch yourself — this is the single highest-value lab exercise in this chapter for interview purposes.

---
## ➕ Going deeper (added — this is the "even more depth" pass)

### perf and bpftrace for CPU scheduling (beyond vmstat/mpstat)
`vmstat`/`mpstat` tell you *that* there's contention; `perf`/`bpftrace` tell you *which code path* is causing it.
```bash
perf top                                   # live, where CPU cycles actually go, by function
perf sched latency                         # per-task scheduling latency — who's waiting longest for CPU
perf sched record -- sleep 5 && perf sched timehist   # timeline of every context switch, with wait times
```
```
bpftrace -e 'tracepoint:sched:sched_switch { @[comm] = count(); }'   # context switches by process name, live
bpftrace -e 'kprobe:finish_task_switch { @wait[comm] = hist(nsecs - @start[tid]); }'  # run-queue wait histogram
```
Interview framing: `vmstat` says "r=12, oversubscribed." `perf sched latency` says "this specific gRPC worker pool is waiting 40ms per scheduling cycle because of 200 threads on 8 cores." That second sentence is what "senior" sounds like — mechanism *and* which component, not just the symptom.

### Scheduling classes, compared (the table the JD's "advanced" bar expects)
| Class | Policy | Preemption | Typical use | Risk if misused |
|---|---|---|---|---|
| `SCHED_OTHER` (CFS) | fair-share, nice-weighted | normal timeslice | default for everything | none — it's the safe default |
| `SCHED_BATCH` | CFS variant, no wakeup preemption | lower priority for interactive | batch/background jobs | starved under interactive load — intentional |
| `SCHED_IDLE` | lowest possible | always preempted | best-effort filler work | can starve indefinitely — by design |
| `SCHED_FIFO` | real-time, run-to-completion | only by higher/equal RT priority | latency-critical daemons (fabric mgmt, some RDMA control paths) | **can starve the entire CPU**, including kernel threads, if buggy |
| `SCHED_RR` | real-time, round-robin | time-sliced among equal RT priority | similar to FIFO, bounded slices | same risk, bounded by quantum |
```bash
chrt -p <pid>            # show current policy/priority
chrt -f -p 50 <pid>       # set SCHED_FIFO priority 50 — dangerous outside controlled contexts
```

### GPU/AI-adjacent failure scenario (this chapter's concepts, applied to the actual job you're interviewing for)
> **Situation:** A multi-GPU training job's data-loader workers (CPU-side, `num_workers=32` in PyTorch DataLoader) are pinned to the same NUMA node as 2 other tenants' best-effort pods. GPU utilization oscillates between 90% and 10% in a regular pattern. Host CPU average looks fine (55%).
> 1. `vmstat 1` on the node during a "GPU util=10%" window → `r` spikes to 3-4x core count momentarily, `cs` spikes too — CPU contention is bursty, not sustained, which is exactly why the *average* looks fine.
> 2. `perf sched latency` during the same window → the DataLoader worker threads show high scheduling latency — they're ready to feed the GPU but not getting CPU time promptly.
> 3. Root cause: co-scheduled best-effort pods with no CPU limits are winning short bursts of CPU against the DataLoader's `SCHED_OTHER` threads at exactly the moments the DataLoader needs to prep the next batch.
> 4. Fix directions, with tradeoffs to state explicitly: (a) CPU-pin/reserve cores for the DataLoader via `cpuset` or K8s `static` CPU manager policy — deterministic, costs flexibility; (b) set requests/limits on the noisy neighbors — simpler, less precise; (c) increase `num_workers` and prefetch depth to smooth over short stalls — cheapest, doesn't fix root cause, just hides it with more buffering.
> This is a genuinely good interview answer because it connects Chapter 1 (scheduling) to the actual GPU utilization symptom the JD cares about, without ever needing to touch CUDA.

### Interview follow-up questions to have crisp one-liners ready for
- *"Load average is high but the box feels fine — do you page anyone?"* → depends on `r` vs `b` split; blocked-only high load on a non-latency-sensitive batch node may not need paging, runnable-heavy load on a latency-sensitive service does.
- *"What's the difference between a context switch and a mode switch (syscall)?"* → mode switch changes privilege ring (user↔kernel) without necessarily changing which task runs; context switch changes which task runs (and always involves at least one mode switch to get there via the scheduler).
- *"Why would you ever want SCHED_IDLE?"* → background compaction/GC-style work you want to run only on genuinely spare cycles, guaranteed never to compete with anything else — the opposite failure mode of the throttling scenario above (here, starvation is the *intended* behavior).
