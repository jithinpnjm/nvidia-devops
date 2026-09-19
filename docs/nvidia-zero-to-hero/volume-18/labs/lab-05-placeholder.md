---
title: "Lab 5 - Validate GPU Sharing Isolation"
slug: "lab-05-validate-gpu-sharing-isolation"
sidebar_position: 5
description: "Verify MIG instances are truly isolated, quantify what MIG does and doesn't isolate, and detect time-slicing contention."
---

# Lab 5 — Validate GPU Sharing Isolation

**Objective:** Confirm MIG provides real compute/memory/cache isolation between instances, confirm the one channel it does NOT isolate (power/thermal), and contrast that with time-slicing's weaker isolation guarantees.

**Estimated time:** 75 minutes

**Prerequisites:**
- MIG-capable GPU (A100, H100, or similar) with driver and `nvidia-smi` installed
- `cuda-memtest` or equivalent GPU stress tool available
- Ability to run at least two concurrent GPU workloads (containers or bare processes)

This lab directly tests the claim corrected in Chapter 6: MIG closes the compute/memory-bandwidth/cache side channels that time-slicing leaves open, but it does NOT give every instance its own power/thermal domain. You will produce evidence for both halves of that claim rather than taking it on faith.

## Step 1: Create MIG Instances

```bash
# Enable MIG mode on GPU 0 (requires GPU reset)
$ nvidia-smi -i 0 -mig 1
Enabled MIG Mode for GPU 00000000:01:00.0
All done.

# List available MIG profiles
$ nvidia-smi mig -lgip
+-----------------------------------------------------------------------------+
| GPU instance profiles:                                                      |
| GPU   Name             ID    Instances   Memory     P2P    SM    DEC   ENC  |
|                              Free/Total   GiB                              |
|===============================================================================|
|   0  MIG 3g.20gb        9     3/3        19.50      No     42     3     0  |
+-----------------------------------------------------------------------------+

# Create two 3g.20gb instances
$ nvidia-smi mig -cgi 9,9 -C
Successfully created GPU instance ID  1 on GPU  0 using profile MIG 3g.20gb
Successfully created compute instance ID  0 on GPU  0 GPU instance ID  1
Successfully created GPU instance ID  2 on GPU  0 using profile MIG 3g.20gb
Successfully created compute instance ID  0 on GPU  0 GPU instance ID  2

# Confirm each instance has a distinct UUID (never a collision — this is
# the correct diagnostic baseline, not a UUID-duplication check)
$ nvidia-smi -L
GPU 0: NVIDIA A100-SXM4-80GB (UUID: GPU-a1b2c3d4-...)
  MIG 3g.20gb Device 0: (UUID: MIG-11111111-2222-3333-4444-555555555555)
  MIG 3g.20gb Device 1: (UUID: MIG-66666666-7777-8888-9999-000000000000)
```

## Step 2: Baseline — Confirm Compute/Memory Isolation Holds Under Load

```bash
# Terminal 1: stress MIG instance 0
$ CUDA_VISIBLE_DEVICES=MIG-11111111-2222-3333-4444-555555555555 \
  cuda-memtest --stress 1
CUDA Memory Bandwidth Test
Bandwidth: 1240 GB/s (steady)

# Terminal 2 (simultaneously): stress MIG instance 1
$ CUDA_VISIBLE_DEVICES=MIG-66666666-7777-8888-9999-000000000000 \
  cuda-memtest --stress 1
CUDA Memory Bandwidth Test
Bandwidth: 1235 GB/s (steady)

# Expected result: both instances report ~independent, steady bandwidth.
# Neither instance's throughput should degrade because the other is under load.
```

**Interpretation:** if both instances hold steady bandwidth regardless of what the other instance is doing, that's evidence MIG's compute/memory-bandwidth partitioning is working. If instance 1's throughput visibly drops when instance 0 starts its stress test, that's the actual signature of an isolation failure — not a UUID collision, which never happens by design.

## Step 3: Confirm Memory Isolation — Out-of-Bounds Access Should Fault, Not Succeed

```bash
# From instance 1's context, attempt to address memory outside its own
# partition (pseudo-code — use a small CUDA test harness that allocates
# a buffer near the instance's memory boundary and attempts a read/write
# past it)
$ CUDA_VISIBLE_DEVICES=MIG-66666666-... ./mig_boundary_test
Attempting out-of-partition memory access...
CUDA error: an illegal memory access was encountered
# Expected: a hardware fault, not a successful read of instance 0's data.
# A successful cross-instance read would be a genuine isolation failure.
```

## Step 4: The Channel MIG Does NOT Close — Power and Thermal

```bash
# Monitor power and thermal readings for the PHYSICAL GPU (not per-instance —
# MIG does not expose per-instance power/thermal telemetry, because there is
# no per-instance power/thermal domain)
$ nvidia-smi dmon -s pcm -c 20 -i 0
# GPU Pwr Gtemp Mtemp Sm Mem Enc Dec
0   180   58    48   20  15   0   0   # Only instance 0 active
0   182   58    48   19  15   0   0
0   340   68    56   95  90   0   0  # <- Instance 1 starts heavy load
0   338   69    57   94  89   0   0
0   180   58    48   20  15   0   0  # <- Instance 1 stops; power/temp drop
```

**Interpretation:** GPU package power and temperature rose when instance 1 alone started a heavy compute job — a process running only in instance 0 could, in principle, observe this shared power/thermal signal and infer something about instance 1's activity (a coarse-grained side channel). This is the concrete, measurable confirmation of the Chapter 6 correction: MIG's hardware partitioning does not extend to power or thermal domains. There is no `nvidia-smi` MIG-instance-scoped power query, because the physical GPU package has exactly one power domain regardless of how many MIG instances it's split into.

## Step 5: Contrast with Time-Slicing — Weaker Isolation, By Design

```bash
# Configure GPU 0 for time-slicing (no MIG) instead
$ nvidia-smi -i 0 -mig 0
$ # (configure time-slicing via device plugin config, not shown here)

# Run the same two-workload stress test WITHOUT MIG
$ cuda-memtest --stress 1 &  # Workload A
$ cuda-memtest --stress 1 &  # Workload B (same physical GPU, time-sliced)
Bandwidth: 620 GB/s   # Workload A — throughput HALVED vs. MIG baseline
Bandwidth: 615 GB/s   # Workload B — throughput HALVED vs. MIG baseline

# Unlike MIG, both workloads visibly compete for the same SMs, L2 cache, and
# memory bandwidth — the throughput drop itself is expected (that's what
# "temporal isolation only" means), but it also means cache-timing and
# memory-bandwidth side channels ARE possible here, unlike under MIG.
```

## Step 6: Produce the Isolation Comparison Table

| Channel | MIG | Time-slicing |
|---|---|---|
| Compute (SMs) | Hardware-partitioned, isolated (Step 2) | Shared, temporally multiplexed |
| Memory bandwidth | Hardware-partitioned, isolated (Step 2) | Shared, contended (Step 5) |
| Memory address space | Isolated; out-of-bounds access faults (Step 3) | Isolated at the driver/context level, but same physical bandwidth pool |
| L2 cache | Partitioned slices | Shared — cache-timing side channel possible |
| Power domain | Shared — NOT isolated (Step 4) | Shared — NOT isolated |
| Thermal domain | Shared — NOT isolated (Step 4) | Shared — NOT isolated |

## Deliverable

Document your findings:

```
GPU: <model>
MIG PROFILE USED: 3g.20gb x2

COMPUTE/MEMORY ISOLATION (MIG):
  - Concurrent stress test, both instances steady bandwidth: YES/NO
  - Out-of-bounds cross-instance access faults correctly: YES/NO

POWER/THERMAL ISOLATION (MIG):
  - Power/temp visibly correlated with OTHER instance's load: YES/NO
  - Conclusion: MIG isolates compute/memory/cache; does NOT isolate power/thermal

TIME-SLICING COMPARISON:
  - Throughput degradation under concurrent load: <measured %>
  - Side-channel exposure: cache + memory-bandwidth (unlike MIG)

INTERVIEW-READY STATEMENT:
"MIG gives hardware-level isolation for compute, memory bandwidth, and cache —
verified by concurrent stress testing showing no cross-instance throughput
interference. It does not isolate power or thermal domains, which I confirmed
by watching GPU package power/temperature move in lockstep with the other
instance's load. Time-slicing isolates none of these except at the temporal
scheduling level."
```

## Next Steps

Wire the power/thermal monitoring from Step 4 into your production alerting (see Chapter 6, section 6.5) so any GPU-sharing mode — MIG or time-sliced — has continuous side-channel visibility rather than a one-time lab check.
