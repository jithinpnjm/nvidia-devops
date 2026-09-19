---
title: Chapter 08 — ConnectX Ethernet Adapters
description: Design, validate, and operate ConnectX Ethernet adapters as RoCE endpoints in AI clusters.
sidebar_position: 9
tags: [connectx, roce, ethernet]
---

# ConnectX Ethernet Adapters

## Introduction

The adapter is where GPU and host memory, PCIe, RDMA work queues, Ethernet frames, and congestion response meet. In an AI cluster, it is not reasonable to treat a ConnectX port as an interchangeable network interface: the port’s PCIe and GPU locality, configuration, firmware, and rail assignment determine whether the fabric can use its installed capacity.

ConnectX adapters can provide Ethernet and hardware-assisted RoCE functions, but the exact capability depends on the adapter generation, firmware, driver, operating mode, and platform. Use the qualified compatibility matrix for a deployment; this chapter teaches the stable reasoning model.

| Chapter field | Value |
|---|---|
| Difficulty | Advanced |
| Estimated reading time | 55–70 minutes |
| Prerequisites | Chapters 02–07 and basic PCIe/NUMA concepts |
| Primary focus | Endpoint data path, topology, lifecycle, and diagnosis |

## Story: Two Ports, One Effective Rail

A team adds a dual-port adapter to every GPU server and expects twice the network throughput. Link counters show both ports up, but large jobs use one port almost exclusively. The second port is attached to a different leaf, yet process placement and library interface selection favor the first NIC. When traffic finally uses both ports, a shared PCIe path becomes the next limit.

The adapters were not defective. The design had not proved that application, GPU, NIC, PCIe, and fabric paths aligned. Installed port capacity is an input; usable multi-rail capacity is an end-to-end result.

## Learning Objectives

After this chapter, you can:

- describe the adapter’s queue-based data path and RDMA responsibilities;
- evaluate PCIe, NUMA, and GPU-to-NIC locality before interpreting throughput;
- explain why multi-port and multi-rail designs require application-aware mapping;
- build a lifecycle and telemetry baseline for ConnectX endpoints;
- troubleshoot low bandwidth, imbalance, and RoCE endpoint failures with evidence.

## Big Picture

```mermaid
flowchart LR
    App["AI framework"] --> Lib["Collective / RDMA library"]
    Lib --> QP["Work queues and completions"]
    QP --> NIC["ConnectX adapter"]
    GPU["GPU memory"] <-->|"evidence: nvidia-smi topo -m\nshows PIX/NV, not SYS"| PCIe["PCIe fabric"]
    PCIe <--> NIC
    NIC <-->|"evidence: rdma link ACTIVE,\nport speed matches spec"| SW["Spectrum Ethernet fabric"]
    SW <--> RN["Remote adapter and memory"]
    RATE{"Measured rate vs\nexpected line rate?"}
    QP --> RATE
    RATE -->|"near line rate"| OK["Both sides proven —\nno further isolation needed"]
    RATE -->|"well below line rate,\nPCIe evidence shows SYS\nor narrow link width"| LOCAL["Host-side bottleneck:\nPCIe/NUMA locality"]
    RATE -->|"well below line rate,\nPCIe clean, fabric ECN/PFC\ncounters active"| FABRIC["Fabric-side bottleneck:\ncongestion, not the adapter"]
```

**Figure 9.8.1 — The adapter bridges local I/O topology and the Ethernet fabric, and the diagram now shows how a below-expected rate gets attributed to one side or the other.** A ConnectX port reporting "up" at full link speed proves nothing about achievable throughput on its own — the decision point forces the same evidence this chapter's story needed: PCIe/NUMA topology output to rule in or out the host side, fabric queue counters to rule in or out the network side, before concluding which "half" of the adapter's bridge is actually the constraint.

## What the Adapter Does

An RDMA-capable adapter works with software that registers memory and posts work requests to queue resources. Hardware performs transport processing and DMA according to the configured transport and protection rules; completion events report progress to the software. NVIDIA’s RoCE documentation describes RoCE as RDMA over Ethernet, with transport and memory translation/placement handled in hardware for supported adapters.

```mermaid
sequenceDiagram
    participant A as Application
    participant L as Communication library
    participant N as ConnectX queue
    participant M as Registered memory
    participant F as Ethernet fabric
    A->>L: Submit transfer
    L->>N: Post work request
    N->>M: DMA read or write
    N->>F: Emit RoCE packets
    F-->>N: Data, ACK, or congestion signal
    N-->>L: Completion event
    L-->>A: Progress / completion
```

This model does not mean the CPU disappears from all data movement. Setup, memory registration, queue management, completion handling, and library progress remain software responsibilities. The implementation and tuning choices vary by stack.

## RoCE Endpoint Responsibilities

The NIC is one endpoint in the congestion-control loop described in Chapters 04 and 05. Switches may mark congestion; an endpoint configured for the relevant RoCE profile reacts according to its supported congestion-control behavior. The hosts send and receive RoCE packets—switch configuration enables the network behavior but does not replace endpoint configuration.

For a routed RoCEv2 design, verify the complete path: IP reachability, MTU, GID/addressing, QoS classification, ECN behavior, and the adapter/driver profile. RoCEv1 and RoCEv2 have different scope and encapsulation; do not generalize a configuration or troubleshooting step from one to the other.

| Validation area | Evidence to retain |
|---|---|
| PCIe | negotiated generation/width, topology, correctable-error trend |
| Locality | NUMA node, GPU-to-NIC affinity, CPU placement where relevant |
| Ethernet | speed, FEC, MTU, errors, peer switch port |
| RoCE | device/port state, GID/addressing, QP test result, relevant counters |
| Congestion | ECN/PFC deltas and per-rail utilization during load |
| Release state | adapter firmware, driver, RDMA userspace, GPU/collective stack |

## PCIe, NUMA, and GPUDirect Paths

A network link can advertise more capacity than the local I/O path sustains. PCIe generation and width, root-complex placement, switch topology, memory path, and GPU/NIC affinity can limit injection or receive rate. A dual-port adapter can also share an upstream PCIe link; sum of port line rates is not automatically a host capability.

```mermaid
flowchart TD
    G0[GPU group 0] <--> R0[PCIe root / NUMA 0]
    G1[GPU group 1] <--> R1[PCIe root / NUMA 1]
    R0 <--> N0[ConnectX rail 0]
    R1 <--> N1[ConnectX rail 1]
    N0 --> F0[Leaf fabric A]
    N1 --> F1[Leaf fabric B]
```

**Figure 9.8.2 — A multi-rail topology only helps when the workload can use local GPU-to-NIC paths and independent fabric rails.** Cross-socket paths may be valid but deserve measurement.

**Illustrative annotated output — proving (or disproving) that a "200Gb" port can actually sustain that rate from the host:**

```text
$ lspci -s 41:00.0 -vv | egrep "LnkCap|LnkSta"
LnkCap: Port #0, Speed 32GT/s, Width x16      <- what the slot/card is CAPABLE of
LnkSta: Speed 16GT/s (downgraded), Width x8   <- what actually NEGOTIATED
```

`LnkCap` shows PCIe Gen5 x16 capability, but `LnkSta` (the negotiated state) shows only Gen4 speed at half the lane width — this single adapter is running at roughly a quarter of its designed PCIe bandwidth, most likely because it's seated in a slot that physically only wires x8 lanes, or a riser/bifurcation setting halved it. A 200Gb Ethernet port needs roughly 25GB/s of PCIe bandwidth to sustain line rate in both directions; Gen4 x8 tops out around 16GB/s — this adapter cannot reach its advertised Ethernet line rate no matter how healthy the fabric is, and no switch-side telemetry would ever reveal this, because the bottleneck never leaves the host.

```text
$ nvidia-smi topo -m | grep -E "GPU0|NIC0"
        GPU0    NIC0    ...
GPU0     X      PIX     ...
NIC0    PIX      X
```

Here the locality is fine (`PIX`, no NUMA crossing) — this second check would be the one to run if `lspci` had come back clean, confirming the two checks are independent and both required before declaring the local I/O path healthy.

Before accepting a node, inventory PCI bus address, negotiated PCIe state, NUMA node, nearby GPU identifiers, port-to-switch mapping, and expected rail. Treat this as production telemetry context, not an installation-time artifact.

## Multi-Port and Multi-Rail Design

Several ports can improve capacity and fault tolerance, but the design must make their independence real:

| Design question | Reasoning |
|---|---|
| Does software select all intended NICs? | A link-up second port can remain unused by the workload. |
| Are rails attached to distinct relevant failure domains? | Two ports on one failed leaf do not provide fabric resilience. |
| Is the PCIe path sufficient for aggregate use? | Shared local bandwidth can cap multiple ports. |
| Are GPU/NIC mappings documented? | Mapping determines remote versus local I/O paths. |
| Is traffic distribution observable by rail? | It is the evidence that the design works in production. |

Generic host bonding can be appropriate for conventional service traffic. It may conceal topology from a collective library, however, so use the application and platform guidance before applying it to an AI data path. Prefer an explicit, tested rail mapping over an assumption that hashing will balance a collective.

## Offloads, Virtualization, and Boundaries

ConnectX capabilities can include DMA, packet-processing offloads, virtualization resources, RDMA transport support, hardware counters, and QoS-related behavior. Enable a small, qualified feature set that serves a named workload; every enabled capability adds observability and lifecycle obligations.

| Capability class | Potential value | Operational question |
|---|---|---|
| RDMA transport | Efficient queue-based remote-memory data movement | Is the end-to-end RoCE profile consistent? |
| Packet offloads | Reduces selected host processing | How will the hardware path be observed and debugged? |
| Virtualization/steering | Resource partitioning or directed flows | Who owns resource limits and policy? |
| Hardware counters | Endpoint-specific evidence | Are counters exported with port, rail, and workload context? |

Avoid claiming that an offload automatically improves training. Measure the workload result and keep the comparison environment fixed.

## Production Lifecycle

Firmware, kernel driver, RDMA userspace, GPU driver, collective library, switch NOS, and congestion/QoS configuration form a compatibility surface. Manage them as a release set, not as unrelated tickets.

### Node acceptance ladder

1. Confirm approved adapter, optic/cable, firmware, driver, and PCIe state.
2. Confirm host IP/RoCE addressing, MTU, and QoS mapping to the intended traffic class.
3. Run a controlled host-memory RDMA test between known peers.
4. Run the approved GPU-buffer and collective validation for the rail design.
5. Capture physical, RoCE, congestion, and application evidence under load.
6. Repeat after a selected failure or maintenance-path test, where supported by the environment.

Preserve before-and-after configuration and a rollback plan. A successful driver load or link-up test is necessary, but it does not prove GPU locality, congestion response, or collective behavior.

## Troubleshooting

### Scenario 1 — One rail is nearly idle

**Symptoms:** both ports are active, but one rail has little workload traffic and aggregate throughput is below expectation.

**Diagnosis:** verify collector coverage first, then compare application interface selection, rank/GPU placement, route state, port-to-leaf mapping, and library configuration. Check whether the desired test actually creates enough concurrent work to use both rails.

**Evidence in practice:**

```text
$ ethtool -S ens1f0 | grep rx_bytes_phy; ethtool -S ens1f1 | grep rx_bytes_phy
     rx_bytes_phy:            892481200384     (rail 0 — heavily used)
$ sleep 60 && ethtool -S ens1f0 | grep rx_bytes_phy; ethtool -S ens1f1 | grep rx_bytes_phy
     rx_bytes_phy:            981204882176     (rail 0, +88.7 GB in 60s)
     rx_bytes_phy:            412992             (rail 1, +~0 GB in 60s — essentially idle)

$ NCCL_DEBUG=INFO python train.py 2>&1 | grep "NCCL INFO NET"
node05:2201 [0] NCCL INFO NET/IB : Using [0]mlx5_0:1/RoCE ; OOB ens1f0
node05:2201 [1] NCCL INFO NET/IB : Using [0]mlx5_0:1/RoCE ; OOB ens1f0    <- both ranks selected the SAME device
```

The 60-second byte-counter delta makes "little workload traffic" concrete: rail 0 moved ~89GB while rail 1 moved essentially nothing. The NCCL log confirms why — both local ranks selected `mlx5_0` (rail 0's device); nothing in the launch configuration told rank 1 to prefer `mlx5_1`. Both ports show "active" in link state the whole time, which is why port status alone never would have caught this.

**Resolution:** correct the explicit interface or affinity mapping; do not change switch QoS until endpoint selection is proven. Verify per-rail byte deltas and workload throughput together — after the fix, both `rx_bytes_phy` deltas should be comparable over the same 60-second window under the same job.

**Prevention:** make the GPU-to-NIC and NIC-to-rail map part of node inventory and admission testing.

### Scenario 2 — RoCE test fails while IP works

**Symptoms:** basic IP reachability succeeds but the RDMA/RoCE test cannot establish or sustain the expected path.

**Diagnosis:** inspect the selected RDMA device/port, RoCE GID/addressing, MTU, traffic-class mapping, endpoint state, and switch ECN/PFC evidence. Compare every item with a known-good peer. IP success alone does not prove RoCE configuration.

**Resolution:** restore the approved end-to-end profile, then validate at the RDMA layer before repeating GPU-buffer or collective tests.

**Prevention:** version-control the host and fabric profile and continuously check drift.

### Scenario 3 — Pairwise bandwidth is good; collective bandwidth is poor

**Diagnosis:** inspect PCIe/GPU locality, rail distribution, collective/rank placement, shared-fabric congestion, and topology cuts. Pairwise testing exercises only a small fraction of the communication pattern.

**Verification:** re-run the same collective with captured per-rail utilization and queue/congestion counter deltas. Accept improvement only when the evidence agrees.

## Customer Architecture Discussion

Adapter selection is a platform decision. Begin with desired GPU count per node, PCIe topology, target rail count, switch and optic design, workload communication pattern, and operations maturity. More port speed can be valuable, but it cannot fix a narrow PCIe path, remote GPU affinity, or an oversubscribed fabric cut.

Offer customers performance expectations as measured acceptance ranges for a defined configuration, not as universal line-rate promises. State what changes invalidate the baseline: firmware, drivers, topology, collective library, or workload shape.

## Interview Preparation

**1. Why can two active adapter ports fail to double application throughput?**

"'Active' just means link-up — it says nothing about whether software is actually driving traffic through both, or whether the local I/O path can sustain both at once. I've traced this exact failure: two ports both reporting up, but a 60-second byte-counter delta showed one port moved ~89GB while the other moved almost nothing, because both local ranks had selected the same RDMA device — nothing in the launch config told the second rank to prefer the second port. And even with correct selection, a dual-port adapter can share an upstream PCIe link, so the sum of the two ports' line rates can simply exceed what the host's PCIe path can move at once. Active ports are a necessary condition for double throughput, not a sufficient one."

**2. What differs between proving IP reachability and proving a RoCE path?**

"IP reachability — ping, basic TCP — only exercises the kernel's routing and a socket. It never touches the RDMA-capable adapter's queue pairs, memory registration, GID selection, or the priority/QoS mapping the fabric applies to that traffic. I've seen basic connectivity succeed completely while an RDMA test failed at the QP setup stage, because the RoCE path depends on layers ping never reaches. Proving RoCE specifically means running a host-memory RDMA test — `ib_write_bw` or equivalent — and confirming it completes with the expected device and GID, not just that the process exits successfully."

**3. How would you detect a GPU-to-NIC locality issue?**

"`nvidia-smi topo -m` first — it tells me directly whether a given GPU-NIC pair shares a PCIe switch (`PIX`) or crosses a NUMA boundary (`SYS`). Then I'd corroborate with `lspci -vv` on the NIC to confirm the negotiated PCIe link speed and width match what the hardware is capable of — I've caught adapters running at a quarter of their designed bandwidth because of a downgraded link, invisible from the network side entirely. If the topology output says `PIX` and the link negotiated at full speed and width, locality is not the bottleneck; if the workload assigns GPU0 to a NIC that topology shows as `SYS` from it, that assignment is the first thing I'd fix, before looking at the fabric at all."

**4. When can bonding be counterproductive for an AI data path?**

"Conventional NIC bonding is built around the assumption that the application doesn't care which physical port a flow uses — bonding hashes flows across members transparently. A GPU collective library, though, often wants explicit control over which NIC maps to which GPU and which fabric rail, because that mapping is what makes multi-rail parallelism actually independent. If bonding hides that topology from the collective library, you can lose the deliberate rail separation the design was counting on, and end up with a library making suboptimal path choices it doesn't even know it's making. My default for an AI data path is explicit, tested rail mapping — bonding is fine for conventional service traffic where I don't need that control."

**5. Which components belong in an adapter compatibility release set?**

"Adapter firmware, the host kernel driver, the RDMA userspace stack, the GPU driver, the collective communication library, the switch NOS, and the QoS/congestion configuration profile — all of them qualified together, as one tested combination, not as independent tickets. I've seen incidents where a driver update alone, done without re-validating against the rest of the stack, silently changed default RoCE behavior. The release-set discipline exists specifically to prevent 'this one piece looked fine in isolation' from becoming a production surprise."

## Architecture Summary

ConnectX adapters are active RoCE endpoints and local I/O devices, not just high-speed Ethernet ports. Their delivered performance depends on queueing, PCIe and GPU locality, rail-aware software, fabric behavior, and a qualified lifecycle. Observe and accept the complete path from application to remote memory.

## Key Takeaways

- Treat a ConnectX port as an RDMA endpoint attached to a specific local I/O topology.
- Validate RoCE resource selection, route, MTU, and traffic treatment together.
- Prove multi-rail behavior with per-rail workload evidence; active ports alone are insufficient.
- Qualify adapter firmware and drivers with the host, collective stack, and fabric release set.

## Quick Revision Sheet

- Link rate is not usable application rate.
- Validate PCIe and GPU/NIC locality before blaming the fabric.
- Multi-rail needs explicit endpoint and workload mapping.
- IP success does not prove the RoCE data path.
- Baseline firmware, driver, NOS, and workload together.

## Lab Checklist

- [ ] Record PCIe, NUMA, GPU affinity, port, rail, and peer-switch inventory.
- [ ] Validate the approved RoCE path before a GPU-buffer test.
- [ ] Compare host-memory, GPU-buffer, and collective results.
- [ ] Capture per-rail utilization and congestion counter deltas during the same run.

## Cross References

- Previous: [Spectrum Switches for AI](./chapter-07-spectrum-switches-for-ai)
- Next: [BlueField DPUs and DOCA](./chapter-09-bluefield-dpus-and-doca)
- Related: [Fabric Validation and Capacity Planning](./chapter-10-fabric-validation-and-capacity-planning)

## Further Reading

- [NVIDIA RoCE documentation](https://docs.nvidia.com/networking-ethernet-software/cumulus-linux-40/Network-Solutions/RDMA-over-Converged-Ethernet-RoCE/)
- [NVIDIA networking documentation](https://docs.nvidia.com/networking/)
- [Volume 07: ConnectX and GPU Network Adapters](../volume-07/chapter-07-connectx-and-gpu-network-adapters)
