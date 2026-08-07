---
title: Chapter 11 — Production Ethernet AI Troubleshooting
description: Diagnose physical, IP, QoS, RoCE, congestion, GPU-direct, and collective failures.
sidebar_position: 12
tags: [ethernet, troubleshooting, roce]
---

# Production Ethernet AI Troubleshooting

A failed collective has many plausible owners. The network team may see active links, the platform team may see healthy GPUs, and the application team may see a timeout. Productive incident response begins by preserving evidence and finding the first layer that diverges from a known-good baseline. It does not begin by changing PFC values or restarting every node.

| Chapter field | Value |
|---|---|
| Difficulty | Expert |
| Estimated reading time | 50–60 minutes |
| Primary focus | Layered isolation, evidence, and recovery verification |
| Prerequisites | Chapters 03–10 |

## Learning Objectives

You will be able to scope a failure, collect a support-ready evidence package, distinguish physical from congestion symptoms, and progress from link to application without treating ping or link-up as proof of RoCE health.

## Incident Method

```mermaid
flowchart TD
 S["Slow, failed, or uneven workload"] --> E["Preserve scope and timestamps"]
 E --> P{"Physical baseline healthy?\nevidence: FEC/error deltas\nvs known-good peer"}
 P -->|"yes"| I{"IP and MTU path healthy?\nevidence: route matches\nintended path, MTU\nconsistent every hop"}
 P -->|"no"| X["Repair physical layer first —\nstop, do not proceed downward"]
 I -->|"yes"| Q{"Class, queue, ECN/PFC correct?\nevidence: marked test traffic\nlands in expected queue"}
 I -->|"no"| XI["Fix routing/MTU —\nno RoCE test is meaningful yet"]
 Q -->|"yes"| R{"RoCE completions healthy?\nevidence: ib_write_bw\ncompletes, RTR/RTS succeed"}
 Q -->|"no"| XQ["Fix classification/PFC scope —\nChapter 06's trust-boundary check"]
 R -->|"yes"| G{"GPU/NIC path healthy?\nevidence: nvidia-smi topo -m\nshows expected PIX/NV"}
 R -->|"no"| XR["Fix GID/device/endpoint —\nnot yet a GPU or app question"]
 G -->|"yes"| C["Collective, rank, and workload analysis —\nonly reached once every lower\nlayer has its own evidence"]
 G -->|"no"| XG["Fix locality mapping —\ndon't blame the fabric for a PCIe hop"]
```

**Figure 9.11.1 — Move downward from the symptom only until the first diverging layer is found, and every gate now names the specific evidence that answers it, plus the corrective branch for a "no."** The habit this enforces: a "yes" at physical doesn't mean "physical is probably fine," it means a specific counter comparison was actually made — and a "no" at any gate stops the ladder there. Continuing to check collective behavior while the IP/MTU gate never got a clean "yes" is exactly the wasted-motion pattern this chapter's incident method exists to prevent.

### First ten minutes

1. Record job ID, node/rank set, topology, onset time, change events, and scope.
2. Stop destructive retries or configuration changes that erase the signal.
3. Compare an affected node/path with an equivalent healthy one.
4. Collect time-windowed counter deltas, not only cumulative totals.
5. Form one testable hypothesis and change one variable at a time.

## Evidence Package

| Layer | Preserve |
|---|---|
| Physical | peer ports, negotiated speed/FEC, lane/optic/cable state, error deltas |
| IP | addresses, VLAN, MTU, route/neighbor and intended path |
| QoS | DSCP/PCP, trust/rewrite, class/queue mapping, ECN/PFC/drop counters |
| RoCE | device/GID selection, completion errors, relevant NIC counters |
| GPU path | GPU/NIC topology and affinity, driver/runtime release, approved test result |
| Application | collective logs, rank placement, message size, timing and straggler evidence |
| Change history | host/NIC/switch/DPU release and policy revision, deployment timestamps |

Stable identifiers connect the evidence: host, GPU, NIC port, DPU if present, switch port, rack, rail, and job. “Port 17 has errors” is not actionable until it can be placed in that graph.

**Illustrative annotated output — what "Port 17 has errors" looks like once it's actually placed in that graph:**

```text
$ ethtool -S swp17 | egrep "fec_corrected|fec_uncorrected|rx_crc_errors"
     fec_corrected_blocks:    41200        <- normal at this rate; FEC correcting routine noise
     fec_uncorrected_blocks:  3             <- nonzero — these blocks were NOT recoverable
     rx_crc_errors:           3             <- matches the uncorrected count exactly

$ show inventory port swp17           # illustrative NOS source-of-truth query
  Peer: rack14-node07, NIC mlx5_1, rail 1, cable: DAC-2m, serial ABC123
  Job:  training-run-4471, ranks 48-55
```

`fec_uncorrected_blocks: 3` matching `rx_crc_errors: 3` exactly is the signature that ties a specific physical fault to specific lost data — FEC correcting most errors but failing on 3 blocks means 3 frames arrived corrupted enough that recovery wasn't possible, and those showed up as CRC errors passed up the stack. Joining that with the inventory query turns "port 17 has errors" into "rack14-node07's rail 1 DAC cable ABC123, currently carrying ranks 48-55 of training-run-4471, has 3 uncorrectable errors" — the second statement is what actually lets someone act (replace that cable, and know which job to watch for recovery).

## Escalation Data Flow

An incident should flow from symptom to evidence to a bounded owner, then back to verified service. The network is only one participant: a job scheduler can concentrate demand, a host change can select the wrong NIC, and a DPU policy can interrupt a healthy uplink. Preserve this causal chain in the incident record.

```mermaid
flowchart LR
 J[Job symptom] --> S[Scope and timeline]
 S --> H[Host/GPU evidence]
 S --> N[Fabric and queue evidence]
 S --> P[Policy and change history]
 H --> X[First divergent layer]
 N --> X
 P --> X
 X --> O[Named owner and safe correction]
 O --> V[Baseline-based verification]
```

The incident commander should state the current hypothesis, evidence that would falsify it, and the next safe observation or change. That discipline prevents a restart from being mistaken for a repair.

## Failure Patterns

### Link up, but errors grow

**Symptoms:** retry, corruption, link recovery, or FEC-related indicators grow; throughput may vary.

**Diagnosis:** compare negotiated capability and error deltas with a healthy peer; inspect supported cabling/media, temperature, lane state, and port history. Congestion counters can rise secondarily when a physical link degrades.

**Evidence in practice:** the `fec_uncorrected_blocks: 3` / `rx_crc_errors: 3` pair captured in the Evidence Package section above is this exact failure pattern — and the reason it's listed here as "congestion counters can rise secondarily" is worth showing concretely: retransmission at the RDMA layer caused by these lost frames adds real offered load back onto the same link, which can push `rx_ecn_marked_prio3` up on this port even though the root cause is physical, not a genuine capacity shortfall. Reading the ECN counter alone here would misdirect the investigation toward QoS tuning; the FEC/CRC pair is what correctly points at the cable.

**Resolution:** correct or replace the faulty component under the approved maintenance process, then re-baseline the physical path before tuning QoS.

### Ping works, RoCE fails

**Symptoms:** IP reachability succeeds while an RDMA application reports connection, completion, retry, or throughput failure.

**Diagnosis:** verify GID/interface selection, VLAN, route, end-to-end MTU, queue/class mapping, RDMA device state, and completion evidence. Ping does not exercise registered memory, queue pairs, RoCE priority, or the same packet size.

**Evidence in practice:**

```text
$ ping -c3 10.20.8.5
3 packets transmitted, 3 received, 0% packet loss     <- ICMP is completely healthy

$ ib_write_bw -d mlx5_0 10.20.8.5
Local address:  ... GID: 0000:0000:0000:0000:0000:ffff:0a14:040f
Remote address: ... GID: 0000:0000:0000:0000:0000:ffff:0a14:0805
Failed to modify QP to RTR
```

Ping's small ICMP packets travel a completely different code path than RDMA's queue-pair setup — they never touch memory registration, never negotiate a queue pair, and are typically far smaller than the MTU an RDMA transfer will actually use. Here, ICMP succeeds cleanly while the RDMA connection manager fails at the RTR (Ready-to-Receive) transition — a failure mode ping has no way to expose, because ping doesn't create a queue pair at all. This is the concrete reason this scenario's diagnosis list starts at GID/interface selection rather than treating the ping result as meaningful evidence about RoCE health.

**Resolution:** repair the first discrepancy, prove host-memory RoCE, then GPU-buffer traffic before retrying the application.

### PFC is persistent

**Symptoms:** pause counters or durations climb at a port and application tail increases without obvious loss.

**Diagnosis:** begin at the downstream congested egress and trace the class upstream. Correlate queue occupancy, utilization, ECN marks, sender response, destination speed, route distribution, and job placement.

**Resolution:** fix the bottleneck—receiver behavior, class mapping, route/placement, congestion feedback, or capacity. Blindly disabling PFC can exchange a stall for drops and retries.

### ECN marks rise but senders do not slow

**Diagnosis:** prove the packet is in the intended queue, that receiver notification reaches the sender, and that the deployed NIC profile is compatible with the qualified design. Check configuration consistency across endpoints and switches.

**Resolution:** restore the qualified end-to-end profile and validate with controlled incast before changing thresholds.

### RDMA is good; NCCL/collective performance is poor

**Diagnosis:** inspect GPU/NIC locality, interface and rail selection, rank mapping, route entropy, concurrent jobs, collective type/message size, and per-rank timeline. A point-to-point test does not represent synchronized all-to-all traffic.

**Resolution:** correct topology/rank placement or fabric contention, then compare the same collective matrix with the baseline.

### Only one rail is slow after maintenance

**Evidence:** the affected rail has lower utilization or higher tail time; peers may remain clean; topology and release inventory differ from the healthy rail.

**Diagnosis:** compare negotiated link state, cable/peer mapping, route membership, NIC/firmware/driver revision, QoS policy, and GPU/NIC affinity rail by rail. Do not average rails into one healthy aggregate.

**Resolution and verification:** repair the first difference, rerun a per-rail pairwise test and a multi-rail collective, and confirm balance returns under the same workload.

### The problem begins immediately after a policy change

**Evidence:** timestamps align with a QoS, DPU, driver, or switch deployment; only the changed population is affected.

**Diagnosis:** compare actual running policy and release state with the approved revision. Verify class-to-queue mapping using evidence, not just intended configuration.

**Resolution and prevention:** use the prepared rollback or controlled reconciliation procedure; canary future policy changes with an end-to-end RoCE and collective gate.

## Recovery and Prevention

Every incident should produce a verification statement: the exact test, topology, workload, counters, and time window that demonstrate recovery. “The job succeeded once” is inadequate. Update the runbook with the discriminating evidence, alert on the earliest useful signal, and add the failure to canary validation where practical.

Use staged upgrades for host drivers, NIC firmware, switch software, DPU images, and QoS profiles. A release matrix plus a tested rollback is more valuable than a collection of individually supported versions.

## Customer Architecture Discussion

Supportability is an architecture feature. Customers should establish one incident owner who can assemble fabric, endpoint, and workload evidence; change ownership for each layer; and a stated escalation boundary for hardware, network operating system, driver, DPU, and application components. Without that model, a multi-team incident becomes a handoff loop.

The operating model has a cost: topology inventory, telemetry retention, test capacity, release management, and on-call expertise. It also prevents expensive prolonged outages. A customer unable to operate PFC/ECN and endpoint versioning consistently should reduce architecture complexity or invest in the ownership model before growing the cluster.

## Interview Preparation

1. Why is an active Ethernet link insufficient evidence for a healthy RoCE job?
2. How do you distinguish congestion from a physical fault?
3. What is the first action when PFC is continuous?
4. Which evidence would you attach to a vendor support case?

## Key Takeaways

- Preserve scope, time, and counter deltas before changing the system.
- Diagnose from physical through QoS, RoCE, GPU path, and collectives.
- Persistent PFC and ECN are congestion evidence that requires a root-cause path analysis.
- Verify recovery against a baseline and turn the finding into a validation control.

## Quick Revision Sheet

| Symptom | First discriminating evidence |
|---|---|
| Link errors | peer capability, FEC/lane/cable error deltas |
| Ping only | GID, MTU, QP/completion and QoS path |
| PFC | downstream queue and upstream propagation |
| ECN | mark, notification, sender rate, queue timeline |
| Slow collective | rank, rail, route, locality, concurrency |

## Interview and Lab Materials

**Architecture prompt:** design the telemetry and ownership path that lets an on-call engineer distinguish an optic issue from a pause tree within one incident window.

**Scenario prompt:** a canary rack is slow only under all-to-all traffic. Explain the evidence sequence before changing ECN thresholds.

**Lab checklist:**

- [ ] Capture a healthy evidence bundle for a known job and topology.
- [ ] Inject one safe, reversible failure in a test environment and practice the decision tree.
- [ ] Compare a healthy and affected rail without aggregating counters.
- [ ] Verify rollback restores both configuration revision and workload baseline.

## Incident Communication Template

State facts separately from hypotheses. For example: “Ranks 8–15 show increased collective tail from 10:14 UTC; leaf B queue 3 ECN deltas rose; no physical error delta is observed.” Then state the hypothesis: “The affected rank placement concentrates demand on leaf B’s uplinks.” This prevents a suspicion from becoming incident history.

| Update field | Required content |
|---|---|
| Scope | affected jobs, nodes, rails, customer impact, start time |
| Evidence | comparison baseline, counter windows, release/policy differences |
| Hypothesis | one testable root cause and its falsifying observation |
| Action | safe diagnostic/change owner and rollback point |
| Verification | exact workload and evidence required to close |

### Common anti-patterns

- Resetting endpoints before collecting completion and counter evidence.
- Changing PFC, ECN, routing, and firmware in one maintenance window.
- Treating an aggregated fabric graph as evidence that every rail is healthy.
- Closing an incident because connectivity returned without repeating the affected workload.

## Further Reading

- [RFC 3168: Explicit Congestion Notification](https://www.rfc-editor.org/info/rfc3168/)
- [NVIDIA networking documentation](https://docs.nvidia.com/networking/)

## Further Reading

- [NVIDIA RoCE documentation](https://docs.nvidia.com/networking-ethernet-software/cumulus-linux-44/Layer-1-and-Switch-Ports/Quality-of-Service/RDMA-over-Converged-Ethernet-RoCE/)
- [Volume 07 collective paths](../volume-07/chapter-09-multi-node-collectives-and-nccl-paths)

## Cross References

- [ECN and DCQCN](./chapter-05-ecn-and-dcqcn)
- [Fabric Validation and Capacity Planning](./chapter-10-fabric-validation-and-capacity-planning)
- [Volume 09 Summary](./chapter-12-volume-09-summary)
