---
title: "Senior Deep Dive 3 — MPI and NCCL joint debugging"
slug: "senior-deep-dive-3-mpi-and-nccl-joint-debugging"
sidebar_position: 15
description: "Senior Deep Dive 3 — MPI and NCCL joint debugging — Bare-Metal, HPC Operations and Infrastructure-as-Code."
source_document: "Authored directly for the JR2018680 gap-coverage volume — no DOCX source."
---

`docs/volume-10/07-mpi-fundamentals-for-hpc-ai-workloads.md` covers MPI's process model and its relationship to NCCL (MPI for launch/coordination, NCCL for the actual GPU collective bandwidth). Volume 6's collective-communication material covers what NCCL rings/trees are and why they matter for AI training. This deep dive is the diagnostic procedure for the single most common senior-level incident in multi-node GPU training: **the job hangs at startup and neither team's first instinct (MPI logs, NCCL logs) is checked in the right order.**

## Before this deep dive — establish a known-good ladder

Do not begin with the full training command. Record a known-good result for each increasing layer:

1. one process imports required libraries and sees its assigned GPU;
2. all local MPI ranks start and complete a CPU barrier;
3. ranks across two nodes complete a CPU collective;
4. one node completes an NCCL collective on assigned GPUs;
5. two nodes complete `nccl-tests` with expected topology and bandwidth;
6. the smallest framework workload runs before scaling to the failing size.

For every test, capture allocation, hosts, rank count, CPU/GPU binding, library versions, chosen interfaces/transports, exit status, duration, and relevant logs. Change one dimension at a time. This turns "distributed training hangs" into the first rung that changes from pass to fail and gives the network, scheduler, platform, or application owner a reproducible handoff.

## The layered decision tree

A multi-node GPU job that hangs before producing any training output is failing at exactly one of four layers, and each layer has one diagnostic command that definitively rules it in or out. Debugging out of order — e.g., staring at `NCCL_DEBUG=INFO` output when the real problem is that half the MPI ranks never launched — wastes the most time on this class of incident.

```text
LAYER 1 — LAUNCH (did every rank even start?)
  Check: mpirun --report-bindings ... ; echo $? on the launcher
  Also:  PMIX_DEBUG=1 / OMPI_MCA_plm_base_verbose=10
  Broken: fewer ranks print 'Hello from rank N' than expected, or
          mpirun itself never returns a rank count.

LAYER 2 — PMIx / RUNTIME BOOTSTRAP (did ranks find each other?)
  Check: PMIX_MCA_pmix_base_verbose=10 on any hanging rank
  Broken: ranks start (Layer 1 clean) but block in MPI_Init().
          The PMIx server never completes the out-of-band rendezvous,
          usually because of a hostname/interface mismatch between
          nodes or a firewalled PMIx-server TCP port.

LAYER 3 — NCCL COLLECTIVE (did the GPUs form a ring/tree?)
  Check: NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH
  Broken: MPI_Init() completes (Layer 2 clean), but ranks reach
          ncclCommInitRank and hang. The NCCL log starts building a
          ring/tree but not every rank reaches:
          'NCCL INFO comm ... rank N nranks N'

LAYER 4 — PHYSICAL FABRIC (is the network actually up?)
  Check: ibstat ; ibstatus ; perfquery (or ethtool for RoCE/TCP)
  Broken: NCCL repeatedly retries ring construction or falls back to a
          slower transport. Evidence includes
          'NET/IB : Got completion with error' or socket transport
          appearing instead of IB. Cable, port, and subnet-manager
          failures surface here and remain invisible to MPI itself.

DIAGNOSTIC ORDER: Launch → Bootstrap → Collective → Fabric
A failure at layer N makes every lower layer untestable, not necessarily broken.
```

The ordering matters because layers 2–4 are each *invisible* from the layer above if the layer above never got that far: if Layer 1 shows only 6 of 8 expected ranks launched, there is no point enabling `NCCL_DEBUG=INFO` yet — the two missing ranks (usually a bad hostfile entry, an `srun`/`mpirun` node-count mismatch, or a node that failed the BCM/Slurm health check tier from the fleet-scale deep dive) are the whole incident, and NCCL has nothing to say about ranks that were never spawned.

## Environment-variable interactions that cause silent misconfiguration

Two classes of NCCL/MPI environment-variable mismatch produce hangs (not errors) because NCCL will silently choose a fallback rather than fail loudly:

- **`NCCL_SOCKET_IFNAME` / `NCCL_IB_HCA` inconsistent across nodes.** If node A's launch environment sets `NCCL_SOCKET_IFNAME=eth0` but node B (different NIC naming from a different hardware batch, or a partially-applied category push — see the fleet-scale deep dive) doesn't have `eth0` and needs `ens5f0`, NCCL on node B either picks a default interface that can't reach node A, or hangs waiting for a connection that never completes on the expected interface. Because `mpirun` typically propagates environment variables from the launching node uniformly, an interface name that's valid on the launcher but not on every worker is a common source of "hangs on some runs, not others," correlating with which physical nodes land in the allocation.
- **MPI process-pinning vs. NCCL's own GPU-affinity assumptions.** MPI binds ranks to CPU cores/NUMA nodes (`mpirun --bind-to core --map-by ppr:8:node`); NCCL separately assumes each rank's GPU affinity follows the PCIe/NVLink topology (rank N on GPU N, typically pinned via `CUDA_VISIBLE_DEVICES` per rank). If MPI's binding maps rank ordering one way and the launch script's `CUDA_VISIBLE_DEVICES` assignment maps GPUs a different way, ranks end up CPU-pinned to a NUMA node that isn't local to the GPU they were handed — the job doesn't hang, it runs, but at a fraction of expected bandwidth because every collective now crosses a NUMA/PCIe boundary it shouldn't need to. This is the specific case where the symptom isn't a hang at all — it's a training step time 2-3x worse than expected with no error anywhere, which is why bandwidth regression should always prompt an affinity check (`nvidia-smi topo -m` cross-referenced against the actual rank-to-GPU mapping the job used), not just a "network is slow" assumption.

## Why "worked with 2 nodes, hangs with 8"

This is a specific, recognizable symptom class, not a vague scaling issue. A 2-node NCCL ring only ever crosses one link (one NIC pair, possibly one switch). An 8-node job's ring or tree topology spans more switches and — on a rail-optimized fabric — potentially more rails than a 2-node job ever touches, so it exercises paths the 2-node case never did. The most common root causes:

- A **straggler node**: one of the eight nodes has a marginal NIC/port/cable (not fully failed — `ibstat` shows `LinkUp`, but at reduced width or with elevated symbol-error counters) that's invisible in isolation and only manifests as a stall once every rank in a ring must synchronize with it. NCCL rings/trees are only as fast as the slowest hop; with 2 nodes there's a 50% chance the marginal node isn't even in the tiny test allocation, with 8 nodes it's far more likely to be included and its degraded link now blocks the whole collective.
- A **topology/rail mismatch that only appears past a certain switch-radix boundary**: a 2-node job may stay within one leaf switch; an 8-node job may span a leaf-spine hop or cross rails, exposing a subnet-manager routing issue or an oversubscribed spine link that a single-switch test never touched. This is the same failure-domain reasoning as volume 6's rail material — a change or defect confined to one rail/switch is statistically far more likely to be sampled and hit once a collective spans multiple failure domains.

The diagnostic response is the same either way: don't retry the 8-node job blindly. Instead run pairwise or small-group NCCL tests (`nccl-tests` all_reduce_perf across specific node pairs) to bisect which node or which link is the outlier, rather than treating "8 nodes hangs, 2 doesn't" as one big undifferentiated network problem.

## What NCCL is actually doing inside "Layer 3": algorithm and protocol selection

Treating Layer 3 as a single opaque "NCCL collective" step hides the two independent choices NCCL makes for every collective call, and both are common sources of the "runs, but slow" (as opposed to "hangs") symptom class that gets misdiagnosed as a fabric problem:

- **Algorithm** — the communication pattern used to realize the collective across ranks. For `all_reduce`, NCCL primarily chooses between **Ring** (each rank talks only to its two ring neighbors, bandwidth-optimal at scale, but latency scales with rank count since data must traverse the whole ring) and **Tree** (a double-binary-tree pattern, latency scales with log(rank count), better for smaller messages or very large rank counts where ring's linear latency term dominates). NCCL picks automatically based on message size, rank count, and detected topology, but this is overridable with `NCCL_ALGO=Ring` or `NCCL_ALGO=Tree` for diagnosis — forcing one and comparing bandwidth against the auto-selected choice is a legitimate way to check whether NCCL's topology detection picked badly for a given job shape.
- **Protocol** — how data moves along whatever algorithm's pattern, trading latency against per-transfer overhead: **Simple** (full-size chunks, best bandwidth for large messages, highest per-step latency), **LL** ("low latency," small chunks with inline flow-control flags, better latency for small messages at the cost of only using half the line rate because half of every transfer is flow-control metadata), and **LL128** (a middle ground tuned for NVLink-class bandwidth, using 120 of every 128 bytes for data). NCCL again auto-selects based on message size; `NCCL_PROTO` overrides it.

The reason this matters for debugging rather than just tuning: a topology-detection failure (NCCL misreading the PCIe/NVLink/IB topology — for example after a category drift that changed a NIC's PCIe slot mapping, or a BIOS setting that changed PCIe ACS/relaxed-ordering behavior) doesn't usually make the job hang. It makes NCCL pick a *worse but still valid* algorithm/protocol combination, so the job completes and produces correct results at a fraction of expected bandwidth — the same "training step time 2-3x worse, no error anywhere" symptom already described for pinning mismatches, but with a different root cause. `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH` logs which algorithm/protocol/topology graph NCCL actually built (look for lines describing the detected `NVLink`/`PIX`/`PXB`/`SYS` path types between GPU pairs); comparing that log against the fleet's known-good topology (from `nvidia-smi topo -m` on a healthy node in the same category) is the concrete way to confirm whether a bandwidth regression is a topology-detection problem versus a genuinely degraded physical link.

## MPI's own layer: eager vs. rendezvous, and why small-message hangs look different from large-message hangs

Layer 1/2 diagnosis above treats MPI as "did ranks launch and bootstrap," but MPI's point-to-point transport has its own two-mode behavior that occasionally produces a distinct hang signature worth recognizing separately from the PMIx bootstrap case:

- **Eager protocol** — for small messages (below a configurable threshold, commonly tens of KB depending on the MPI implementation and transport), the sender just sends the data immediately into a pre-posted receive buffer on the destination, no handshake required. Fast, but consumes receiver-side buffer space regardless of whether the receiver has posted a matching `MPI_Recv` yet.
- **Rendezvous protocol** — for large messages, the sender first sends a small control message announcing "I have N bytes for you," waits for the receiver to acknowledge with a matching receive posted and a buffer ready, and only then transfers the actual payload. This avoids the receiver-side buffering problem eager mode has, at the cost of an extra round trip.

The debugging-relevant consequence: a hang that only appears once message sizes cross the eager/rendezvous threshold (common in framework code that switches from small gradient-metadata messages to large tensor payloads at different phases of a training step) can look identical to a Layer 2 PMIx bootstrap hang — the job stalls with no error — but has a completely different cause: a rank that never posts the matching `MPI_Recv` (a logic bug in custom collective/communication code, not an infrastructure fault) will hang forever in rendezvous mode waiting for an acknowledgment that never comes, while the same missing-receive bug under eager mode for a small message might not hang at all (the data just lands in a buffer nobody reads yet, and the bug surfaces later or differently). This is why the known-good ladder in this chapter's opening insists on testing both a CPU barrier (trivially small messages, exercises Layer 1/2 only) and a representative collective at the framework's actual message sizes before declaring a layer clean — a job that passes `nccl-tests` at nccl-tests' default message sizes but hangs in production can be hitting exactly this size-dependent protocol switch rather than anything infrastructure-side.

## Reading `nccl-tests` output correctly

`nccl-tests`' `all_reduce_perf` is the standard tool for Layer 3/4 bisection referenced above, but its output is frequently under-read — operators glance at the final bandwidth number and move on, missing the columns that actually localize a problem:

```bash
mpirun -np 16 -hostfile hosts16.txt \
  ./build/all_reduce_perf -b 8M -e 8M -f 2 -g 1
```

```
#       size    count   type   redop   root   time   algbw   busbw  #wrong
      8388608   2097152  float    sum     -1   1823    4.60   8.63       0
#                                        (usec)  (GB/s)  (GB/s)
```

- **`time` (usec)** — wall time for that message size. Compare across runs/node-subsets, not in isolation; there's no universal "good" number, only "consistent with this fabric's known-good baseline."
- **`algbw`** — algorithm bandwidth: payload size divided by time, the naive "how fast did the data move" number.
- **`busbw`** — bus bandwidth: `algbw` scaled by a factor specific to the collective algorithm (for ring all-reduce, roughly `2*(n-1)/n` of `algbw`) that estimates the bandwidth actually achieved on each link, correcting for the fact that a ring all-reduce moves more total bytes across the fabric than the logical payload size. This is the number to compare against the fabric's rated per-link bandwidth (e.g., against a known NDR/HDR IB link rate) — `algbw` alone will always look lower than the link rate even on a perfectly healthy fabric, and comparing it directly against a NIC's rated speed is a common false-alarm source.
- **`#wrong`** — count of results that failed the correctness check. Non-zero here means the run isn't a performance problem at all — it's a correctness bug (silent data corruption), a far more serious finding that should stop the investigation and escalate immediately rather than being read as "just slow."

Run at multiple message sizes (`-b`/`-e` sweep) rather than one size: a fabric or topology problem often shows up only at specific size ranges (e.g., a protocol-selection issue that only affects the LL128 size band), and a single-size test can miss it entirely.

## Worked scenario

A training job launched across 8 nodes (64 GPUs) hangs with no output after `mpirun` reports all 64 ranks started. `NCCL_DEBUG=INFO` shows ring-building log lines for 62 of 64 ranks reaching `NCCL INFO comm ... nranks 64` — two ranks on node06 never print the completion line. `ibstat` on node06 shows `State: Active`, `Physical state: LinkUp`, but `port_xmit_wait` counters climbing continuously versus flat on other nodes — a marginal link, not a down link, which is why the job hangs rather than erroring: NCCL is still trying to establish that connection, not failing to. The fix is draining node06 for a link/cable inspection (Tier 1 hardware-health remediation from the fleet-scale deep dive: alert + drain, not reboot) and re-running the 8-node job on a substitute node, which completes cleanly — confirming the root cause was that one marginal link, invisible at 2-node scale, gating the entire 8-node collective.

## Interview-ready line

"A multi-node GPU job hanging at startup is four layers deep — launch, PMIx bootstrap, NCCL collective formation, physical fabric — and each has exactly one diagnostic command that rules it in or out; the reason '2 nodes works, 8 hangs' is a specific and common pattern rather than vague scaling flakiness is that an 8-node collective's ring or tree crosses more switches and links than a 2-node test ever samples, so a marginal link that was never exercised at small scale becomes the bottleneck the entire collective blocks on at scale."
