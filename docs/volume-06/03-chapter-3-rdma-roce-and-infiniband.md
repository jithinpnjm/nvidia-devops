---
title: "Chapter 3 - RDMA, RoCE and InfiniBand"
slug: "chapter-3-rdma-roce-and-infiniband"
sidebar_position: 3
description: "Chapter 3 - RDMA, RoCE and InfiniBand — HPC, Networking and Storage for AI."
source_document: "Volume_06_HPC,_Networking_and_Storage_for_AI(2).docx"
---
**Learning outcome:** Explain remote memory operations, queue pairs and why loss/congestion configuration matters.

![](pathname:///img/generated/volume-06-01.png)

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
```mermaid
flowchart LR
    subgraph A["Node A (initiator)"]
        direction TB
        MRA["App registers a memory
        region (MR) with the NIC"] --> QPA["Queue Pair (SQ + RQ)"]
    end
    subgraph B["Node B (target)"]
        direction TB
        MRB["App registers a memory
        region (MR) with the NIC"]
        QPB["Queue Pair (SQ + RQ)"]
    end
    QPA <==>|RDMA WRITE over fabric IB/RoCE| QPB
    QPB -.-> MRB
```
NIC writes directly into B's registered MR — B's CPU is never interrupted for a WRITE
The "reduced CPU-copy overhead" line in the original text is this: a normal TCP socket send copies data from user buffer → kernel socket buffer → NIC (and the reverse on receive, with an interrupt/softirq to wake the CPU). RDMA WRITE lets the NIC place data directly into the remote application's pre-registered memory, with **zero CPU involvement on the target** for the data movement itself. This is why RDMA matters for collectives specifically: an AllReduce touching every rank at every step would otherwise burn CPU cycles on memcopy at exactly the moments the CPU should be feeding the GPU (Chapter 1's `data_load_wait_time` term).

➕ **Diagram: InfiniBand vs RoCE — same RDMA semantics, different loss model underneath**
```mermaid
flowchart TD
    subgraph IB["InfiniBand fabric"]
        IB1["purpose-built lossless fabric,
        credit-based flow control by design"]
        IB2["Subnet Manager assigns LIDs, routes"]
    end
    subgraph ROCE["RoCE (RDMA over Converged Ethernet)"]
        R1["standard/converged Ethernet,
        needs PFC/ECN layered on top for
        loss-sensitive behavior"]
        R2["Existing switch/NIC ecosystem, IP-routable"]
    end
    IB --> API["same RDMA verbs API
    (ibv_*, queue pairs, MR registration)
    above the wire"]
    ROCE --> API
```
Both give the application the same RDMA programming model from `queue pairs / registered memory` up — the difference this chapter cares about is entirely below that line: InfiniBand's flow control is native to the fabric, while RoCE inherits Ethernet's original best-effort delivery and has to have losslessness (PFC) and/or congestion avoidance (ECN) explicitly engineered back in.

➕ **Sample `ibstat` output, annotated:**
```mermaid
flowchart TD
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["$ ibstat"]
  n1["CA 'mlx5_0'"]
  n2["CA type: MT4123"]
  n3["Number of ports: 1"]
  n4["Port 1"]
  n5["State: Active ← link is up AND the fabric subnet manager has it joined"]
  n6["Physical state: LinkUp"]
  n7["Rate: 200 ← 200 Gb/s — check this matches the expected NIC generation"]
  n8["Base lid: 12"]
  n9["LMC: 0"]
  n10["SM lid: 1 ← subnet manager's LID — 0 here would mean no SM found"]
  n11["Capability mask: 0x2651e848"]
  n12["Port GUID: 0x946dae0300aabbcc"]
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
