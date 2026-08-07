---
title: "Chapter 13 — Reference Architecture: 100-GPU Training Cluster"
description: Complete design from hardware selection through network topology to operational procedures. Real topology, cost breakdown, deployment checklist.
sidebar_position: 14
tags: [reference-architecture, training-cluster, topology, deployment]
---

# Chapter 13 — Reference Architecture: 100-GPU Training Cluster

## COMPLETE DESIGN: LLAMA-100B TRAINING

### Cluster Specification

```yaml
CONFIGURATION:

Compute:
  16 nodes × 8 GPU H100 SXM5 = 128 GPUs (overkill for 100B, allows elasticity)
  
  Per-node:
    CPU: 2× EPYC Bergamo 128 cores
    Memory: 192 GB DDR5
    GPU: 8× H100 80GB SXM5 (NVLink 5.0 within node)
    Storage: 4× 7.68TB NVMe (RAID-1, 15TB effective)
    NIC: 1× ConnectX-7 400GbE (NDR InfiniBand)

Interconnect:
  Switch: 1× NVIDIA Quantum2 NDR 400G
  Topology: Single-rack, 16 compute ports + 4 uplink ports
  Cables: Direct attach copper (DAC), 6ft

Storage:
  Cluster NAS: NetApp AFF A900 (500 TB, 10 GB/sec NFS)
  Archive: AWS S3 (training dataset versioning, checkpoints)

Cooling:
  Liquid cooling (cold plate on GPUs)
  Capacity: 50 kW (headroom 25%)

Power:
  Input: 2× 208V 3-phase circuits (72 kW total)
  PDUs: 2× 40-outlet monitored/switched
  UPS: 30 kW, 10 min backup power

Networking:
  Public: 1× 100GbE connection to production network
  Out-of-band management: 1 Gbps dedicated network

Observability:
  GPU monitoring: NVIDIA DCGM + Prometheus exporter
  Network: InfiniBand counters via Mellanox MLNX_OS
  Compute: Telegraf node exporter
  Visualization: Grafana dashboards (GPU, network, power)

TOPOLOGY DIAGRAM

                    Public Network (100GbE)
                           │
                      Gateway Router
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
      ToR 1          NVIDIA Quantum2        ToR 2
     (100GbE)        (400G NDR Switch)      (100GbE)
         │             │  │  │  │           │
         ├─────────────┼┼──────────┤
         │             │ 16 ports  │        │
    ┌────┴────┬────────┬────┬────────┐────┴─────┐
    │         │        │    │        │          │
  Node1    Node2   Node3   Node4  ...       Node16
 (8×H100)
```

### Hardware Cost Breakdown

```yaml
CAPEX ANALYSIS:

GPUs: 128 × H100 SXM5 @ $30K = $3.84M (54% of hardware)
CPUs + Memory: 16 × ($15K) = $240K
NVMe Storage: 16 × ($50K) = $800K
NDR Switch: 1 × $350K = $350K
NAS (shared infrastructure): $200K (allocated)
Cooling/Power/Rails: $400K
Installation & Testing: $200K
Subtotal Hardware: $6.03M

Software & Licensing:
  NVIDIA Collective Communications: $50K (commercial license)
  Operating system: $20K (RHEL licenses)
  Monitoring (Grafana, Prometheus): $10K
Subtotal Software: $80K

TOTAL CAPEX: $6.11M

Cost per GPU: $6.11M / 128 = $47.7K per GPU
Cost per TFLOP: $6.11M / (128 × 989 TFLOPS) ≈ $48 per TFLOP (consistent with Chapter 2's ~$30-48/TFLOP per-GPU range for H100)
```

### Deployment Procedure

```yaml
DEPLOYMENT CHECKLIST (8 weeks):

Weeks 1-2: Site Preparation
  - Install power distribution (PDUs, cables, circuit breakers)
  - Install cooling infrastructure (chiller, coolant lines)
  - Set up racks and cable trays
  - Verify utility power (208V 3-phase, 100A circuits available)
  - Test UPS failover

Weeks 3-4: Hardware Installation
  - Unpack, inventory, and burn-in test all GPUs (8 tests × 1 hour = full day per node)
  - Install nodes in rack (8 hours for 16 nodes)
  - Install network switch, connect nodes
  - Verify IB link status (ibstat on each node, all ports UP)

Weeks 5-6: Software & Configuration
  - Install OS (RHEL 8.x or Ubuntu 22.04)
  - Install NVIDIA drivers (Driver 560.x)
  - Install CUDA 12.5 + cuDNN 9.2
  - Install NCCL 2.22.x, Megatron-LM
  - Configure distributed training environment (torchrun, DeepSpeed)
  - Run NCCL tests on all node pairs (verify AllReduce latency <5ms)

Week 7: Baseline Performance Testing
  - Train small model (GPT-2, 1.5B params) for 100 steps
  - Measure throughput: Target 128 GPU × 6.5K TFLOPS = 832 TFLOPS (ideal)
  - Measure actual: Typically 90% = 750 TFLOPS (excellent scaling)
  - Verify AllReduce overhead <2%
  - Measure power draw: 16 nodes × 3.86 kW = 61.8 kW (expected)

Week 8: Production Readiness
  - Deploy Prometheus + Grafana for monitoring
  - Configure alerts (GPU temp >75°C, AllReduce >10ms, power >70 kW)
  - Set up checkpoint infrastructure (NAS NFS, S3 sync)
  - Configure job scheduler (Kubernetes or custom SLURM)
  - Run 1-week stability test (burn-in training, detect intermittent failures)

LAUNCH CHECKLIST:
  ✓ All 128 GPUs healthy (nvidia-smi output on each node)
  ✓ All AllReduce latencies <5ms (NCCL test output)
  ✓ Checkpoint save/load working (test on small model)
  ✓ Monitoring alerts configured and tested
  ✓ Runbook for common failures written
  ✓ On-call rotation established
```

### AI Factory Commissioning and Acceptance

The Week 8 "Production Readiness" checklist above answers *"is the software stack
configured?"* Commissioning and acceptance testing answers a harder question: *"does this
physical cluster actually perform to spec, and can we prove it before signing off and handing
it to researchers?"* This is the step most postmortems trace back to — a cluster that passed
`nvidia-smi` and NCCL smoke tests but had a marginal cable, a firmware mismatch, or an
underprovisioned cooling loop that only showed up under sustained load three weeks into a
customer's training run. Formal acceptance testing catches that class of failure *before*
handoff, not after.

Acceptance runs in six stages, each producing sign-off evidence — not just "it looks fine."

```yaml
STAGE 1: PHYSICAL ACCEPTANCE

Why: Everything downstream (firmware, network, training) is built on physical assumptions
     (power is stable, cooling keeps up, cables are seated). Skipping this stage means later
     failures get misdiagnosed as software bugs when the root cause is a loose transceiver.

Checks:
  - Rack/power: PDU load balanced across phases, breaker headroom >20% of rated capacity
  - Cooling: Rack inlet temp <27°C under simulated load, no hot spots (thermal camera walk)
  - Cabling: All IB/Ethernet runs labeled, no exceeded bend-radius, DAC/AOC within spec length
  - Optics/transceivers: `ethtool` / switch CLI shows no RX/TX power out of range on any port
  - BMC/OOB: Every node's BMC reachable, IPMI/Redfish power-cycle test succeeds per node

Evidence of pass: Signed physical inspection checklist + thermal scan photos + BMC reachability
  table (one row per node, all green).

Example FAILED check and triage: Thermal scan shows node 7's inlet at 34°C while neighbors
  read 24°C. Triage: check for a blocked front-panel filter or a rack blanking-panel gap
  causing hot-aisle recirculation before assuming a chiller problem — recirculation from a
  missing blanking panel is the far more common root cause and a 10-minute fix vs. a cooling
  system fault.

STAGE 2: SERVER ACCEPTANCE

Why: A cluster is only as fast as its slowest, most-error-prone node. Firmware and topology
     drift between "identical" nodes is one of the most common causes of stragglers in
     distributed training (one node running an older BIOS/GPU firmware silently throttles).

Checks:
  - Firmware baseline: BIOS, BMC, GPU VBIOS, NIC firmware versions match the qualified
    baseline on every node (`nvidia-smi -q | grep "VBIOS"`, vendor firmware inventory tool)
  - GPU inventory: `nvidia-smi -L` returns the expected GPU count and SKU per node; no GPUs
    in a degraded or "Xid" error state (`nvidia-smi -q -d ERROR`)
  - CPU/memory: All DIMM channels populated and running at rated speed (`dmidecode`), no
    memory ECC errors at boot
  - PCIe topology: `nvidia-smi topo -m` matches the expected matrix (GPUs on correct PCIe
    switch/root complex, NICs paired with the correct GPU for rail-aligned traffic)
  - NVLink/NVSwitch: `nvidia-smi nvlink -s` shows all links Active at expected speed; no
    NVSwitch reporting degraded lanes
  - NIC/HCA: `ibstat` shows State: Active, Physical state: LinkUp, correct link speed (e.g.
    NDR 400Gb/s) on every HCA
  - BlueField (if present): DPU firmware version matches baseline, DPU-hosted services
    (e.g. storage offload) reachable from the host

Evidence of pass: Per-node firmware/topology report diffed against baseline (zero deltas),
  `nvidia-smi topo -m` output archived per node, NVLink link-state table all Active.

Example FAILED check and triage: `nvidia-smi topo -m` on one node shows a GPU-NIC pair on
  different PCIe root complexes than the other 15 nodes. Triage: this node was likely
  reseated after RMA and reassembled with GPUs/NICs in different slots — don't "fix" this in
  software (NCCL will silently work but slower); physically correct the slot assignment so
  its topology matches the fleet before it becomes a straggler under AllReduce.

STAGE 3: NETWORK ACCEPTANCE

Why: Fabric issues (bad optics, asymmetric routing, one degraded rail) are the single most
     common cause of "training is 20% slower than expected" tickets, and they're invisible
     to per-node health checks — they only show up under multi-node traffic.

Checks:
  - Topology validation: Switch LLDP/neighbor tables match the design diagram; no
    unexpected or missing links
  - Link state: Every port UP at full negotiated rate (no ports auto-negotiated down)
  - Bandwidth testing: Point-to-point `ib_write_bw` / `nccl-tests` between every rail
    achieves ≥90% of theoretical per-port line rate
  - Latency testing: `ib_write_lat` within expected range for the topology (single-switch
    hop should be low single-digit microseconds)
  - Congestion testing: All-to-all traffic pattern (e.g. `nccl-tests all_reduce_perf` at
    full cluster scale) sustains bandwidth without PFC pause storms
  - Rail validation: Each GPU's dedicated NIC rail tested independently — a single degraded
    rail out of 8 per node is easy to miss in an aggregate bandwidth test

Evidence of pass: Full bandwidth/latency matrix (all node pairs, all rails) with results
  archived; `nccl-tests` at full cluster scale meets the vendor-published busbw target.

Example FAILED check and triage: One rail across all nodes shows 15% lower bandwidth than
  the other 7. Triage: check whether that rail's switch ports all land on the same
  leaf/spine uplink group — a shared oversubscribed uplink, not 16 independently bad cables,
  is the likely cause, and pointing at "one leaf switch config" is a much faster fix than
  swapping optics node by node.

STAGE 4: STORAGE ACCEPTANCE

Why: Data pipeline can bottleneck GPUs before compute or network ever become the limiter.
     Acceptance here validates the storage tier can actually feed 128 GPUs, not just that
     a single client can hit peak throughput.

Checks:
  - Bandwidth testing: Aggregate sequential read/write from all nodes simultaneously (e.g.
    `fio` or vendor benchmark) meets the sustained throughput sized in Chapter 4 (≥100
    MB/sec/GPU aggregate)
  - IOPS testing: Random small-file read IOPS meets target for shuffled-dataset access
    patterns, not just large sequential reads
  - Metadata performance: `mdtest` or equivalent — file create/stat/delete rates matter as
    much as raw bandwidth when checkpoint directories contain thousands of shard files
  - Checkpoint I/O validation: Time a full 128-GPU checkpoint save/load at production model
    size; confirm it completes within the budget assumed in the operational MTTR targets

Evidence of pass: Aggregate bandwidth/IOPS numbers from a full-cluster concurrent test,
  compared against the Chapter 4 sizing target; one successful full-scale checkpoint
  save/restore cycle timed and logged.

Example FAILED check and triage: Aggregate bandwidth from all 16 nodes hits only 60% of the
  single-client benchmark number. Triage: check for a shared network bottleneck between
  compute and storage (undersized storage-facing switch uplinks) before assuming the storage
  array itself is underpowered — this is a topology problem far more often than a disk problem.

STAGE 5: CLUSTER ACCEPTANCE

Why: This is where physical, server, network, and storage acceptance get validated together
     under realistic load — the previous four stages can each pass individually while the
     cluster still fails as a system (e.g. under sustained thermal load, a marginal PSU that
     passed a 5-minute power-on test finally trips).

Checks:
  - HPL/Linpack burn-in: Run HPL (or an equivalent GPU-Linpack) across the full cluster;
    confirm sustained FLOPS is within expected range of theoretical peak, and that the run
    completes without a node dropping out
  - NCCL collective tests: `nccl-tests` (all_reduce_perf, all_gather_perf, etc.) at full
    scale, confirming busbw against baseline and no rank hangs
  - ClusterKit (or equivalent cluster-level diagnostic suite): NVIDIA's ClusterKit-class
    tooling exists to run coordinated, cluster-wide health and performance diagnostics
    (bandwidth, latency, and stress patterns across all nodes at once) so you're not
    inferring cluster health from single-node or single-pair tests alone — treat this as
    "the automated version of the manual bandwidth/latency matrix in Stage 3, run
    continuously as part of acceptance and later as periodic health checks." (If you're
    scripting this yourself rather than using vendor tooling, the goal is the same:
    orchestrate NCCL/IB tests across every node simultaneously and diff results against a
    known-good baseline.)
  - Sustained burn-in: 24–72 hour continuous load (real or synthetic training job) — this is
    what surfaces thermal throttling, marginal power delivery, and intermittent Xid errors
    that short tests miss
  - Full workload test: Run the actual customer/team's representative training job (or the
    closest available proxy) end-to-end, including checkpoint save/restore, to validate the
    system as the customer will actually use it — not just synthetic benchmarks

Evidence of pass: HPL result within expected % of theoretical peak; NCCL busbw report;
  burn-in log showing zero unplanned node drops over the full duration; one successful
  end-to-end representative workload run with checkpointing exercised.

Example FAILED check and triage: 48 hours into burn-in, one node throws an Xid 79 (GPU has
  fallen off the bus) and drops from the job. Triage: this is a hardware fault, not a flaky
  test — pull the node, run vendor diagnostics, and RMA if it recurs after reseating; do NOT
  just restart the job and call the cluster accepted, because an intermittent GPU failure
  under sustained load is exactly the failure mode acceptance testing exists to catch before
  a paying customer's 2-week training run hits it instead.

STAGE 6: OPERATIONAL ACCEPTANCE

Why: A cluster that performs well but that nobody can safely operate isn't actually ready —
     this stage validates the humans-and-process side of handoff, not just the hardware.

Checks:
  - Monitoring/alerting verification: Deliberately trigger each alert condition (e.g.
    simulate a GPU temp spike, kill a node) and confirm the alert fires and reaches on-call
  - Inventory reconciliation: Asset tags, serial numbers, and rack positions match the
    CMDB/inventory system exactly — this matters enormously for future RMA and warranty claims
  - Rollback procedure validation: Actually execute a rollback (e.g. revert a firmware
    update, fail a node out of the scheduler) end-to-end at least once; don't just document it
  - Maintenance window process: Confirm the drain/cordon procedure removes a node from
    active jobs cleanly and it can be reintroduced without a full cluster restart
  - Escalation package readiness: On-call rotation staffed, runbooks accessible outside the
    cluster's own monitoring stack (so they're reachable if monitoring itself is down),
    vendor support contract and case-opening process verified with a real (or test) ticket

Evidence of pass: Alert-fire test log (each alert type triggered and confirmed received);
  reconciled inventory report; one executed rollback with results recorded; signed-off
  runbook and on-call roster.

Example FAILED check and triage: The GPU-temperature alert never fires during the test.
  Triage: check the Prometheus scrape target and metric name first (a common root cause is
  exactly the kind of DCGM metric-name mismatch covered in Chapter 10 — the alert rule
  references a metric the exporter never emits) before assuming the GPU itself failed to
  heat up during the test.
```

**Interview answer — "How would you validate a newly built GPU cluster before handing it to a customer?"**

"I'd treat it as a staged acceptance, not a single smoke test. Physical first — power,
cooling, cabling, optics — because everything else assumes those are solid, and it's cheap
to verify while nothing depends on it yet. Then per-server acceptance: firmware baseline,
GPU inventory, PCIe/NVLink topology, NIC health — this is where I'd catch things like a
reseated node with GPUs in the wrong slots, which nvidia-smi alone won't tell you. Then
network acceptance under real multi-node traffic, because fabric problems only show up when
many nodes talk at once — a bandwidth matrix across every rail, not just an aggregate number.
Same idea for storage: aggregate throughput from all nodes concurrently, not a single client.
Then I'd bring it together at the cluster level — HPL for a compute sanity check, NCCL
collective tests for communication health, and critically a sustained 24-plus hour burn-in,
because intermittent GPU and power issues don't show up in a five-minute test. Finally,
operational acceptance — make sure monitoring actually alerts, rollback actually works, and
the on-call team can operate it — because a cluster that performs perfectly but that nobody
can safely run isn't actually done. At every stage I want evidence I can hand the customer,
not just a checklist I personally believe — a burn-in log, a bandwidth matrix, an alert-fire
test — because 'trust me, I checked' doesn't survive the first production incident."

### Operational Procedures

```yaml
DAILY OPERATIONS:

Pre-Training Checklist:
  1. Verify cluster health: `nvidia-smi` on all nodes shows all GPUs healthy
  2. Check network: `ibstat` shows all IB ports UP
  3. Verify storage: NAS mount point accessible, free space >50 TB
  4. Check power/cooling: PDU <80A, facility temp <25°C
  5. Review alerts: No GPU errors, no network errors in past 24 hours

Training Job Startup:
  1. Load training checkpoint (if resuming)
  2. Allocate 128 GPUs via job scheduler
  3. Launch training with torchrun (auto-sets RANK, WORLD_SIZE)
  4. Verify all ranks connected (check NCCL startup logs)
  5. Monitor first iteration: GPU utilization >90%, AllReduce <5ms

Monitoring During Training:
  - Throughput: Should be stable within ±2%
  - GPU utilization: >90%
  - GPU temperature: 60–70°C
  - AllReduce latency: 2–5 ms per iteration
  - Loss: Smooth convergence (no NaN or divergence)
  - Checkpoint: Save every 500 steps (~8 hours for Llama-70B)

Troubleshooting:
  - Low throughput (<80% of baseline): Check AllReduce latency, GPU clocks, network congestion
  - GPU thermal throttle: Reduce batch size, verify cooling
  - Failed checkpoint: Retry save to NAS, fallback to S3 if NAS down
  - Hanging job: NCCL timeout likely; kill job, investigate rank connectivity

Weekly:
  - Review GPU error logs, replace any with >10 error counts/week
  - Check data pipeline: Verify no I/O stalls, NAS performance >8 GB/sec
  - Validate backups: Confirm S3 checkpoint sync completed

MTTR Targets:
  GPU failure: 15 min to detect + kill job + restart
  Network link flap: 5 min to detect + reroute + retry AllReduce
  Checkpoint failure: 10 min to retry/failover to S3
  Power loss: <1 min (UPS covers brief outage)
```

---

## SUMMARY

A production 100-GPU training cluster requires:

1. **Hardware:** 128 H100s ($3.84M), NDR switch ($350K), liquid cooling, redundant power.
2. **Network:** Full-bisection interconnect (single-rack); AllReduce latency &lt;5ms.
3. **Monitoring:** Real-time GPU/network metrics; alert if ANY metric deviates >10% from baseline.
4. **Deployment:** 8-week process from bare metal to training (weeks 1-4 hardware, 5-6 software, 7-8 testing).
5. **Operations:** Daily health checks, weekly trend analysis, MTTR &lt;15 min for most failures.

**Cost:** $6.11M CAPEX + $0.6M OPEX/year = $8.91M over 3 years for a single-rack cluster.

**In Chapter 14:** Reference architecture for multi-region inference deployment.
