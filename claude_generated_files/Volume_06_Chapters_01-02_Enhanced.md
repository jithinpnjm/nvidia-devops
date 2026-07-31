# Chapter 1 — Distributed systems performance for GPU jobs
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Build a scaling-efficiency model that separates compute, communication, synchronization and I/O.

A single GPU can run independently. Multiple GPUs introduce coordination. Within a node, peer links/topology matter; across nodes, the network fabric and collective library matter. Scaling efficiency falls when communication/synchronization consumes an increasing fraction of step time.

```
speedup = throughput_N / throughput_1
efficiency = speedup / N
# Example: 8 GPUs give 6.4x throughput -> 80% scaling efficiency
```

Do not treat efficiency loss as automatically "network." Input pipelines, CPU preprocessing, imbalance and framework configuration can all create idle time. Profile the phase that grew with scale.

➕ **The step-time decomposition the formula above hides — this is the model an interviewer wants you to draw:**
```
step_time = compute_time + communication_time + sync_wait_time + data_load_wait_time

At N=1:  step_time ≈ compute_time                    (nothing to communicate or sync)
At N=8:  step_time = compute_time/8*  + comm_time(N) + sync_wait(N) + data_wait(N)
                      *if compute scales linearly, which is the best case, not the default

efficiency_loss = 1 - (step_time(N) / N) / step_time(1)
```
The single most useful move in this chapter: **efficiency is a symptom, not a diagnosis.** "80% efficiency" tells you nothing about *which* term in the right-hand side grew. You have to instrument each term separately — that's the whole content of this chapter, restated as an equation.

➕ **ASCII view of where each term actually lives in the training loop:**
```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────┐
│  data_load   │────▶│   compute     │────▶│  communicate   │────▶│  sync_wait   │
│ (CPU/storage)│     │ (GPU forward/ │     │ (AllReduce over │     │ (barrier —   │
│ dataloader   │     │  backward)    │     │  NIC/fabric)    │     │  wait for    │
│ workers      │     │               │     │                 │     │  slowest rank)│
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────┘
     ▲                                                                    │
     └────────────────────── next step begins ─────────────────────────┘
```
Each box has a distinct tool: `nvidia-smi dmon` / GPU util for compute, `nccl-tests` / NIC counters for communicate, per-rank step-time variance for sync_wait, and `iostat`/dataloader worker queue depth for data_load. A profiler that only reports "GPU util 62%" collapses all four boxes into one number — the job in this chapter is to separate them again.

➕ **Sample `nccl-tests` output, annotated** (the first thing you'd actually run to separate "compute" from "communicate"):
```
$ ./build/all_reduce_perf -b 8M -e 8M -f 2 -g 8
#      size    count   type   redop     time   algbw   busbw  #wrong
        8388608  2097152  float    sum      3821    2.19    3.84       0   ← 8 GPUs, single node
#
# Out-of-place hack: time in us, algbw/busbw in GB/s
```
`busbw` (bus bandwidth — normalized for the AllReduce ring's 2x data-movement factor) is the number to compare against the fabric's theoretical max, not `algbw`. If `busbw` is far below the NIC's line rate (e.g. 3.84 GB/s on a 200Gb/s = 25GB/s NIC), that gap is your `communication_time` term inflating — run this in isolation from the actual training job specifically so you're not also measuring `compute_time` and `data_load_wait_time` in the same number.

➕ **Worked scenario — the "80% efficiency, which term?" triage, made concrete:**
> **Situation:** Scaling from 1 to 8 nodes (64 GPUs), measured efficiency drops from 100% to 71%. The on-call engineer's first instinct is "check the network."
> 1. Capture per-step GPU utilization time series across all 64 GPUs, not the cluster average — a 71% *average* efficiency could be 8 nodes all uniformly slower (fabric-wide issue) or 1 node dramatically slower dragging the barrier (straggler — see Deep Dive 1).
> 2. Run `nccl-tests all_reduce_perf` node-pair-by-node-pair at the actual message size the model uses (not the tool's default) — isolates `communication_time` from the live job's `compute_time` and `data_load_wait_time`.
> 3. If `nccl-tests` numbers look fine in isolation but the live job still shows the gap, suspect `sync_wait_time` (one rank slow) or `data_load_wait_time` (dataloader workers under-provisioned as GPU count — and therefore CPU demand — increased 8x).
> 4. Only if `nccl-tests` itself degrades at scale do you have a genuine fabric/topology problem — and now you have a reproducible, isolated number to hand to the network team instead of "training is slower."
> **Interview-ready line:** "Scaling efficiency is the aggregate signal — I never diagnose from it directly, I use it to decide which of four separate measurements to take next."

➕ **Shortcut — the one-line mental model for fast recall:** *"Compute scales with GPUs, communication scales with the fabric, and sync_wait scales with your worst node — always suspect the max, not the mean."*

## Practice
➕ 1. Given per-step GPU utilization traces for 8 nodes where 7 show 95% and 1 shows 40%, write the one-sentence hypothesis you'd test first, and the exact command to test it.
➕ 2. A team reports "scaling efficiency dropped after we doubled batch size per GPU." Explain why this is expected to change `compute_time` and `data_load_wait_time` simultaneously, and how you'd isolate which one moved.

---
# Chapter 2 — Ethernet fundamentals for AI fabrics
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Understand link speed, MTU, queues, loss, ECMP and congestion before learning RoCE.

High-speed Ethernet still follows familiar networking principles. Link speed is a ceiling; application throughput depends on protocol overhead, path, congestion and flow distribution. MTU mismatch can cause fragmentation or connectivity failures. ECMP can distribute flows across equal-cost paths. Queue drops and congestion can damage latency and RDMA behavior.

```
ip -s link show dev <iface>
ethtool <iface>
ethtool -S <iface> | egrep -i 'drop|err|pause|ecn|pfc'
ping -M do -s 8972 <peer> # example jumbo-frame validation; adjust for headers/environment
```

➕ **Sample `ethtool -S` output, annotated the way an interviewer wants to hear it read:**
```
$ ethtool -S ens5f0 | egrep -i 'drop|err|pause|ecn|pfc'
rx_dropped: 0
tx_dropped: 0
rx_crc_errors: 0
rx_pause_ctrl_phy: 184291        ← PFC/pause frames received — this port has been told to slow down
tx_pause_ctrl_phy: 0
rx_prio3_pause_duration: 91442   ← priority-3 (often the RoCE traffic class) has been paused for 91ms total
ecn_marked_packets: 3821         ← ECN CE bits seen — congestion signaled *before* drops, this is healthy
```
Reading order: `rx_dropped`/`tx_dropped` at zero is not "no problem" by itself — `rx_pause_ctrl_phy` climbing and `rx_prio3_pause_duration` growing means the fabric *is* congested and PFC is actively intervening, it's just doing its job of converting drops into backpressure. The number to actually worry about is `ecn_marked_packets` *not* decreasing over time relative to traffic volume — ECN marking without corresponding drop or pause growth is the sign congestion control is working as designed. Zero everything across the board on a saturated link is the actually suspicious reading — it can mean the counters aren't wired up, not that the fabric is healthy.

➕ **MTU mismatch — why "ping works" is not "MTU is correct," shown as a command sequence:**
```
$ ping -M do -s 8972 10.0.4.12
PING 10.0.4.12 (10.0.4.12) 8972(9000) bytes of data.
ping: local error: message too long, mtu=9000        ← path/local MTU is 9000, payload+headers(28) = 9000 exceeds it

$ ping -M do -s 8944 10.0.4.12                         # 8944 + 28 (ICMP+IP header) = 8972... adjust for RoCE's extra headers
64 bytes from 10.0.4.12: icmp_seq=1 ttl=64 time=0.041 ms
```
`-M do` sets the Don't-Fragment bit — this is the entire point of the test: you want to *prove* a frame of exactly this size transits without silent fragmentation, not just get an ICMP reply. A regular unqualified `ping` (default 56-byte payload) will succeed across an MTU mismatch that later fails a 9000-byte RDMA send — this is precisely why "ping works" and "the fabric is fine for large transfers" are different claims. RoCEv2 has additional UDP/IB transport headers layered on top of the IP/Ethernet MTU budget, so the "jumbo frame is 9000, subtract standard headers" arithmetic from generic Ethernet tuning guides needs re-deriving for RoCE specifically — never copy a jumbo-MTU number from a non-RDMA tuning doc.

➕ **ECMP and AI collectives — the failure mode this chapter's mention of "ECMP can distribute flows" doesn't spell out:**
```
        ┌─────┐
   ┌───▶│spine1│───┐
┌──┤    └─────┘   ├──▶ dest
│leaf│             │
└──┤    ┌─────┐    │
   └───▶│spine2│───┘
        └─────┘
ECMP hashes on (src IP, dst IP, src port, dst port, protocol) → ONE flow always takes ONE path
```
A single AllReduce ring's traffic between two fixed ranks is (usually) a small number of long-lived flows — ECMP can hash them all onto the *same* spine link if the hash happens to collide, leaving other spine links idle while that one link becomes the bottleneck for the whole collective. This is fundamentally different from web traffic, where thousands of short flows average out across ECMP paths naturally. **Interview-ready line:** "ECMP load-balances flows, not bytes — a small number of fat, long-lived collective flows can defeat ECMP's statistical averaging in a way ephemeral web traffic never does, which is exactly why rail-optimized designs (Deep Dive 3) exist instead of relying on ECMP alone."

➕ **Shortcut — fast triage one-liner for "is this fabric healthy" before touching RoCE-specific tools:**
```bash
for i in $(ls /sys/class/net/ | grep -E '^(ens|eth|ib)'); do
  echo "=== $i ==="; ethtool -S "$i" 2>/dev/null | egrep -i 'drop|pause|ecn|error' | awk '$NF>0'
done
```
Anything printed by this loop is a candidate root cause before you even open `ibstat`/`rdma link` in Chapter 3 — cheap, host-local, no fabric access needed.

➕ **Worked scenario — MTU mismatch after a NIC firmware/driver upgrade:**
> **Situation:** After a routine NIC driver update on half the fleet, a subset of nodes intermittently fail to complete large RDMA writes while small control messages work fine, and `ip link show` reports the same MTU (9000) on every node.
> 1. `ip link show` matching everywhere rules out the obvious case — but it only reports *configured* MTU, not the effective *path* MTU, which can differ if an intermediate switch port or a bonded/VLAN interface silently reverted to 1500 during the upgrade.
> 2. `ping -M do -s <size>` node-pair by node-pair, sized to the actual jumbo frame in use, is the only way to prove effective path MTU — sweep sizes with a binary search (`8000, 8972, 9000...`) to find the exact breakpoint.
> 3. The breakpoint size, cross-referenced against "which nodes fail," localizes the problem to a specific switch/port/bond that the driver upgrade touched — not a generic "network is flaky" ticket.
> 4. Fix: correct the MTU on the identified hop; re-run the `ping -M do` sweep to confirm before declaring resolved — don't just restart the job and hope.
> **Conclusion:** "Configured MTU matches" and "effective path MTU matches" are different claims — this chapter's `ping -M do` command is the tool that closes that gap, and it's worth reaching for before any RDMA-specific tooling.

## Practice
➕ 1. Explain why a ping with default payload size succeeding is insufficient evidence that jumbo frames will work for RDMA traffic.
➕ 2. Given `ethtool -S` output showing `ecn_marked_packets` climbing steadily but `rx_dropped=0` and `rx_pause_ctrl_phy=0`, explain what this combination tells you about where in the congestion-response ladder (ECN vs PFC vs drop) this link currently sits, and why that's the *healthy* reading, not a red flag.
