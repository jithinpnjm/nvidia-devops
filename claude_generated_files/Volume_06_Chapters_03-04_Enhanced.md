# Chapter 3 — RDMA, RoCE and InfiniBand
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Explain remote memory operations, queue pairs and why loss/congestion configuration matters.

*(original diagram: media/image1.png — preserved)*

Figure 1. GPUDirect RDMA can shorten the GPU-to-network data path on supported systems.

RDMA enables direct access to registered memory with reduced CPU-copy overhead. InfiniBand is a purpose-built fabric supporting RDMA. RoCE carries RDMA semantics over Ethernet. RoCE deployments require careful fabric design because packet loss/congestion characteristics affect transport behavior; modern designs may use ECN/congestion control and, in some environments, PFC depending on architecture.

Do not memorize "RoCE needs lossless Ethernet" as a sufficient design answer. Ask which RoCE generation/transport, congestion control, switch/NIC design, oversubscription and vendor reference architecture are in use.

```
rdma link
ibv_devinfo
ibstat
# Perftest tools such as ib_write_bw / ib_read_bw may be used in controlled labs.
```

➕ **What "remote memory operations" and "queue pairs" actually mean, mechanically — the chapter names them, this is the model:**
```
        Node A (initiator)                          Node B (target)
   ┌───────────────────────┐                   ┌───────────────────────┐
   │  App registers a      │                   │  App registers a      │
   │  memory region (MR)   │                   │  memory region (MR)   │
   │  with the NIC          │                   │  with the NIC          │
   │        │                │                   │                        │
   │        ▼                │                   │                        │
   │  ┌───────────┐         │                   │  ┌───────────┐         │
   │  │Queue Pair  │  RDMA   │   fabric (IB/RoCE) │  │Queue Pair  │         │
   │  │(SQ + RQ)   │◀───────▶│═══════════════════▶│  │(SQ + RQ)   │         │
   │  └───────────┘  WRITE   │                   │  └───────────┘         │
   └───────────────────────┘                   └───────────────────────┘
   NIC writes directly into B's registered MR — B's CPU is never interrupted for a WRITE
```
The "reduced CPU-copy overhead" line in the original text is this: a normal TCP socket send copies data from user buffer → kernel socket buffer → NIC (and the reverse on receive, with an interrupt/softirq to wake the CPU). RDMA WRITE lets the NIC place data directly into the remote application's pre-registered memory, with **zero CPU involvement on the target** for the data movement itself. This is why RDMA matters for collectives specifically: an AllReduce touching every rank at every step would otherwise burn CPU cycles on memcopy at exactly the moments the CPU should be feeding the GPU (Chapter 1's `data_load_wait_time` term).

➕ **Sample `ibstat` output, annotated:**
```
$ ibstat
CA 'mlx5_0'
        CA type: MT4123
        Number of ports: 1
        Port 1:
                State: Active                    ← link is up AND the fabric subnet manager has it joined
                Physical state: LinkUp
                Rate: 200                          ← 200 Gb/s — check this matches the expected NIC generation
                Base lid: 12
                LMC: 0
                SM lid: 1                          ← subnet manager's LID — 0 here would mean no SM found
                Capability mask: 0x2651e848
                Port GUID: 0x946dae0300aabbcc
```
`State: Active` is necessary but not sufficient — it means the physical link and subnet manager join succeeded, it says nothing about error rates, congestion, or whether the *rate* matches what you provisioned for. Always cross-check `Rate` against the NIC's rated speed; a link stuck negotiating at half rate (e.g. 100 instead of 200) will pass every "is it up" check while quietly halving your fabric bandwidth.

➕ **Sample `ib_write_bw` output, annotated (the actual bandwidth-proving command referenced in the original block):**
```
$ ib_write_bw -d mlx5_0 -a --report_gbits <remote_ip>
---------------------------------------------------------------------------------------
 #bytes  #iterations  BW peak[Gb/sec]  BW average[Gb/sec]  MsgRate[Mpps]
 65536      1000         196.42           195.88            0.373683
---------------------------------------------------------------------------------------
```
195.88 Gb/s average against a 200Gb/s rated link is ~98% efficiency — this is your baseline "the fabric itself is healthy" number, measured *before* any collective library or application code enters the picture. Run this pairwise between suspect nodes whenever a distributed job underperforms — it isolates "is the wire fast" from every other layer in Chapter 4's stack.

➕ **Shortcut — the one-line mnemonic for RDMA's whole value proposition, worth saying verbatim in an interview:** *"RDMA moves the copy out of the CPU's software path and into the NIC's hardware path — same data, same network, but the CPU stops being a mandatory stop along the way."*

➕ **Worked scenario — the trap the original text explicitly warns about, worked through:**
> **Situation:** A customer says "our RoCE fabric intermittently drops throughput to near zero under load, but only sometimes — we've confirmed the switches support lossless Ethernet." They ask if enabling PFC everywhere will fix it.
> 1. Push back on the framing exactly as the chapter instructs: "lossless Ethernet supported" is a switch capability claim, not a live configuration fact. Ask: is PFC actually *enabled* on the relevant priority/traffic class end-to-end (every hop, not just the two edge switches)? Is ECN configured, and at what thresholds?
> 2. Blanket-enabling PFC everywhere without ECN is a known anti-pattern: PFC alone (no ECN) reacts only at buffer-full, is per-priority and per-hop (not end-to-end aware), and can cascade into head-of-line blocking / PFC storms across the whole fabric — often the actual cause of "intermittent drop to near-zero," not the absence of PFC.
> 3. Correct diagnostic order: confirm RoCE version (v1 vs v2) and transport in use, confirm ECN marking thresholds are tuned for the actual traffic pattern (not switch defaults built for generic Ethernet), check `ethtool -S`'s pause/ECN counters (Chapter 2) for storm-like patterns (pause counters spiking in bursts correlated with the throughput collapse), then check vendor reference architecture for this specific switch/NIC combination.
> 4. The "fix" is very likely to be *tuning* PFC+ECN interaction (or fixing an asymmetric configuration where one direction has ECN and the other doesn't), not simply "turn PFC on."
> **Interview-ready line:** "'Enable PFC' is not a fabric design — PFC without correctly tuned ECN is a documented cause of the exact congestion collapse it's meant to prevent."

## Practice
➕ 1. A link shows `State: Active` in `ibstat` but the customer reports half the expected bandwidth. List the three fields/tools you'd check next, in order.
➕ 2. Explain to a Kubernetes engineer, using the queue-pair diagram above, why an AllReduce over RDMA doesn't consume target-node CPU the way an equivalent TCP-based AllReduce would.

---
# Chapter 4 — GPUDirect RDMA, NIC/GPU topology and NCCL
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Connect GPU collectives to host topology and fabric evidence.

GPUDirect RDMA allows supported NICs to transfer data directly to/from GPU memory, reducing staging through host memory/CPU. The effective path depends on GPU/NIC PCIe topology and system configuration. NCCL implements GPU collective communication patterns and selects transports/topology based on environment.

```
nvidia-smi topo -m
env | grep -E '^NCCL_'
# NCCL debug is powerful but verbose; enable deliberately in a test/incident window.
export NCCL_DEBUG=INFO
```

➕ **The full data path, with and without GPUDirect RDMA — this is Figure 1's caption made explicit as two diagrams:**
```
WITHOUT GPUDirect RDMA (staged through host memory):
  GPU HBM ──PCIe──▶ Host RAM (pinned buffer) ──PCIe──▶ NIC ──▶ fabric ──▶ remote NIC ──▶ remote Host RAM ──▶ remote GPU HBM
           copy #1 (GPU→CPU)      copy #2 (CPU→NIC)                                    copy #3         copy #4

WITH GPUDirect RDMA:
  GPU HBM ──PCIe──▶ NIC ──▶ fabric ──▶ remote NIC ──▶ remote GPU HBM
           (direct — NIC DMA-reads/writes GPU memory, host CPU/RAM not in the data path)
```
Every eliminated copy in the top diagram is CPU cycles and PCIe bandwidth *not* spent — at collective-communication data rates (hundreds of GB/s aggregate across 8 GPUs), those staging copies would otherwise compete with the exact same PCIe root complex the GPUs use for compute traffic.

➕ **Sample `nvidia-smi topo -m` output, annotated — this is the single most important diagnostic table in this chapter:**
```
$ nvidia-smi topo -m
        GPU0  GPU1  GPU2  GPU3  mlx5_0  mlx5_1  CPU Affinity  NUMA Affinity
GPU0     X    NV12  NV12  NV12   PXB     SYS      0-31            0
GPU1    NV12   X    NV12  NV12   PXB     SYS      0-31            0
GPU2    NV12  NV12   X    NV12   SYS     PXB      32-63           1
GPU3    NV12  NV12  NV12   X     SYS     PXB      32-63           1
mlx5_0   PXB   PXB   SYS   SYS    X       SYS
mlx5_1   SYS   SYS   PXB   PXB   SYS       X

Legend: NV12=NVLink(12 links), PXB=PCIe through host bridge (same NUMA), SYS=crosses NUMA/QPI/UPI
```
Read this row-by-row before ever looking at NCCL logs: **GPU0/GPU1 talking to `mlx5_0`** is `PXB` — same PCIe root, same NUMA node, cheap. **GPU2/GPU3 talking to `mlx5_0`** is `SYS` — crosses the NUMA boundary, meaningfully more expensive, and exactly the kind of thing that silently doubles a collective's latency for half the ranks on a node if NCCL (or a container's CPU pinning) picks the wrong NIC for a given GPU. This table is the topology-and-fabric-evidence half of this chapter's learning outcome, made literal.

➕ **Sample `NCCL_DEBUG=INFO` excerpt, annotated (what "compare NCCL logs" in the worked scenario below actually means in practice):**
```
$ NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,NET,GRAPH python train.py
node07:1234:1234 [0] NCCL INFO NET/IB : Using [0]mlx5_0:1/RoCE [RO]; OOB eth0:10.0.4.7<0>
node07:1234:1234 [0] NCCL INFO Channel 00/04 : 0[0] -> 1[1] via P2P/CUMEM
node07:1234:1234 [0] NCCL INFO Channel 00/04 : 0[0] -> 4[0] via NET/IB/0/GDRDMA   ← cross-node, GPUDirect RDMA active
node11:5678:5678 [0] NCCL INFO NET/IB : Using [0]mlx5_0:1/RoCE [RO]; OOB eth0:10.0.4.11<0>
node11:5678:5678 [0] NCCL INFO Channel 00/04 : 0[0] -> 4[0] via NET/IB/0/IB       ← notice: no GDRDMA suffix here!
```
The second node's channel log is missing the `GDRDMA` marker that the first node has — this single log-line difference means GPUDirect RDMA silently fell back to a staged (host-memory-copy) path on `node11` for that channel, even though both nodes are running identical code. Common causes: a `nv_peer_mem`/`nvidia-peermem` kernel module mismatch, an IOMMU/ACS setting difference on that host, or a BIOS/PCIe topology difference introduced by a hardware swap — exactly the kind of node-level asymmetry the Chapter 4 worked scenario below is built around, and precisely why "compare NCCL logs node-by-node" is step 3, not step 1 (you need the topology table first to know what a *correct* log should say for that node).

➕ **Shortcut — grep for the one thing that tells you GPUDirect RDMA actually engaged, without reading the whole log:**
```bash
NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=NET python train.py 2>&1 | grep -o 'via [A-Z/]*' | sort | uniq -c
#   48 via NET/IB/0/GDRDMA   ← healthy — most cross-node channels using GPUDirect RDMA
#    2 via NET/IB/0/IB       ← these 2 fell back to staged path — investigate these specific channels/nodes
```

## Worked scenario
**Situation:** A 32-GPU distributed training job slows after one node replacement.

1. Compare the replacement node hardware, NIC/GPU topology, driver/firmware and link speed with peers.
2. Check RDMA link/counters and switch-side errors/drops/congestion for paths involving that node.
3. Compare NCCL logs/collective benchmark performance node-by-node.
4. Check CPU/NUMA affinity and PCIe link width/speed.
5. Remove/replace the node in a controlled test to verify causal impact.

**Conclusion:** A single topology/fabric outlier can slow synchronized distributed work.

➕ **Extended version, with the exact commands for each of the five steps:**
> 1. `nvidia-smi topo -m` on the replacement node **and** a healthy peer, diffed side by side — a hardware swap that changed PCIe slot assignment will show up here as a different NV-link/PXB/SYS pattern immediately, before touching the network at all.
> 2. `ibstat` + `ethtool -S <iface> | egrep -i 'drop|pause|ecn|error'` on the replacement node specifically, compared against the same on two healthy peers — asymmetric error counters localize a bad cable/transceiver/port that "the link is up" alone would hide.
> 3. `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=NET` grep for `GDRDMA` as shown above — a node silently missing GPUDirect RDMA on some channels is a very common outcome of a node replacement (new node, old driver/kernel-module version, or BIOS default reset an IOMMU/ACS setting).
> 4. `numactl --hardware` and `lspci -vvv | grep -A5 <NIC PCI address>` — confirm PCIe link is negotiated at full width/speed (`LnkSta: Speed 16GT/s, Width x16` and not a degraded `x8` or `8GT/s` — a reseated card or dirty slot can silently downgrade this).
> 5. Pull the node from the job (or run `ib_write_bw`/`nccl-tests` pairwise against it in isolation) and re-measure — this converts "we think it's this node" into "removing this node restored throughput," which is the causal proof a customer or postmortem needs.
> **Interview-ready line:** "One straggler node doesn't just run slow itself — at a synchronization barrier, everyone waits for it, so a 5% local slowdown on one of 32 nodes can look like a 100% job-wide slowdown if it's bad enough to blow past a collective timeout."

## Practice
➕ 1. Given the `nvidia-smi topo -m` table above, which NIC (`mlx5_0` or `mlx5_1`) should a process pinned to GPU2 use for cross-node traffic, and why does using the other one matter for latency even though both NICs are technically reachable?
➕ 2. You grep NCCL logs for `GDRDMA` and find zero matches across the *entire* job, not just one node. What does that tell you versus the single-node case in the worked scenario, and what would you check first (hint: this points at something cluster-wide, not node-specific — e.g. a missing kernel module in the base image or container).
