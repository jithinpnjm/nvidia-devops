---
title: Chapter 07 — Spectrum Switches for AI
description: Design and operate NVIDIA Spectrum switching layers for predictable AI Ethernet fabrics.
sidebar_position: 8
tags: [spectrum, ethernet, switching]
---

# Spectrum Switches for AI

## Introduction

An AI Ethernet switch is not a passive collection of ports. It is the point at which many endpoint queues meet, traffic is classified, packets are buffered and scheduled, and congestion becomes either visible and controlled or widespread and mysterious. A fabric can show every link as up while a small number of oversubscribed egresses extend training steps for an entire job.

Spectrum switches provide the Ethernet forwarding, queueing, congestion, and telemetry layer commonly paired with ConnectX adapters. This chapter is about design decisions and operational evidence, not a substitute for the release-specific hardware installation guide or Network Operating System (NOS) documentation.

| Chapter field | Value |
|---|---|
| Difficulty | Advanced |
| Estimated reading time | 55–70 minutes |
| Prerequisites | Chapters 01–06; familiarity with leaf-spine routing |
| Primary focus | Switch behavior, topology, and operations for AI Ethernet |

## Story: The Fast Fabric with a Slow Rack

A 256-GPU cluster meets pairwise bandwidth expectations. Under two concurrent training jobs, one rack becomes a persistent straggler. Port status, optics, and host counters look healthy. Queue and ECN telemetry eventually show that a set of destination-facing uplinks carries a disproportionate share of traffic; the design had enough aggregate capacity but insufficient usable capacity for the placement and path distribution.

The correction is not a blind buffer increase. The team validates cabling and routing, corrects the path and workload placement imbalance, then records per-rack congestion baselines. The important lesson is that switch capacity must be evaluated as a topology and queueing system.

## Learning Objectives

After this chapter, you can:

- explain the switch responsibilities between a ConnectX endpoint and an AI workload;
- distinguish radix, port speed, buffering, and usable bisection bandwidth;
- design queue, ECN, PFC, and routing operations without treating them as independent features;
- build switch telemetry that separates physical faults from congestion;
- plan changes, failures, and upgrades with measurable acceptance criteria.

## Big Picture

```mermaid
flowchart LR
    A["GPU node"] --> CA["ConnectX"]
    B["GPU node"] --> CB["ConnectX"]
    CA -->|"evidence: port up,\nclean FEC/errors"| L1["Spectrum leaf"]
    CB -->|"evidence: port up,\nclean FEC/errors"| L1
    L1 -->|"evidence: uplink\nutilization + ECN rate"| S1["Spectrum spine"]
    S1 --> L2["Spectrum leaf"]
    L2 --> CC["ConnectX"]
    CC --> C["GPU node"]
    L1 -. "queue, ECN, PFC counters" .-> T["Telemetry"]
    S1 -. "utilization and drops" .-> T
    T --> J{"Which signature\ndoes the evidence show?"}
    J -->|"port errors/FEC climbing"| PHY["Physical fault —\nisolate cable/optic/port"]
    J -->|"clean physical, ECN marks\nrising, PFC flat"| HEALTHY["Congestion control working —\nnot an incident"]
    J -->|"clean physical, PFC pause\nsustained on one leaf"| HOT["Oversubscribed cut or\nbad placement — that leaf"]
    J -->|"clean physical, low\nutilization, still slow"| ROUTE["ECMP/rail imbalance —\ncheck path distribution"]
```

**Figure 9.7.1 — The switch is an active queueing and forwarding participant, and the diagram now routes the evidence to the specific fault it points at.** The four branches map directly to this chapter's troubleshooting scenarios: physical faults, healthy congestion control, an oversubscribed/hot leaf, and ECMP imbalance produce different, distinguishable counter signatures — treating "switch problem" as one bucket instead of these four wastes the first hour of an incident.

## Why Switch Design Changes for AI

Collectives can create synchronized bursts: many senders target a small set of destinations, then repeat the pattern at another stage. A switch must arbitrate between ingress traffic competing for an egress, apply the intended traffic class, and signal congestion early enough for endpoints to react. A high headline switching capacity does not guarantee a nonblocking cluster.

Use the following distinction in design reviews:

| Term | What it answers | What it does not prove |
|---|---|---|
| Port speed | Rate available on one negotiated link | End-to-end payload or application rate |
| Radix | Number of usable ports on a switch design | Adequate uplinks or fault isolation |
| Aggregate capacity | Sum of relevant port capacities | Nonblocking bisection for a workload |
| Buffer/queue design | How contention is absorbed and managed | That congestion control is correctly configured |
| Telemetry capability | What evidence can be collected | That alerts and ownership exist |

The design target is predictable behavior during realistic contention, not a claim that congestion never occurs.

## The Forwarding and Queueing Path

At a conceptual level, an arriving frame is classified, assigned to a forwarding decision and egress queue, arbitrated for transmission, and counted. Exact pipeline order and counters depend on switch model and NOS, so use the platform documentation for implementation detail.

```mermaid
flowchart LR
    IN[Ingress frame] --> C[Classify DSCP, PCP, VLAN]
    C --> F[Forwarding and ECMP lookup]
    F --> Q[Selected egress queue]
    Q --> M{Congestion threshold?}
    M -->|yes| E[ECN mark / selected PFC action]
    M -->|no| S[Scheduler]
    E --> S
    S --> OUT[Transmit port]
```

**Figure 9.7.2 — Classification must remain consistent with the QoS policy defined in Chapter 06.** A frame in the wrong class can make otherwise correct ECN and PFC settings ineffective.

### Buffers are transient protection, not capacity

An egress buffer absorbs a mismatch between arrival and service rate. It cannot make a long-lived offered load fit through a smaller link. As occupancy grows, the intended response is normally ECN marking so RoCE endpoints reduce injection; PFC is a targeted, last-resort loss-protection mechanism for the chosen priority, not a general congestion solution. See Chapters 04–06 for the protocol behavior.

Poorly scoped PFC can propagate pause upstream and cause head-of-line blocking. Conversely, omitting the loss-control design where the deployed RoCE profile requires it can produce drops and retransmission behavior that is hard to attribute. Establish one reviewed policy per fabric class, then validate it hop by hop.

## Topology, Radix, and Failure Domains

A leaf-spine fabric gains path diversity only when the uplinks, spines, routing policy, and endpoint flow behavior can use it. Count capacity in normal and degraded states.

```text
effective available capacity = capacity of the relevant path cut
                               after topology, policy, and failure constraints
```

This is a planning model, not a performance prediction. Evaluate at least these cases:

- a node-to-node flow inside a rack;
- a representative cross-rack collective;
- concurrent jobs sharing a leaf or spine cut;
- one uplink unavailable;
- one switch unavailable, where the design intends to tolerate it;
- maintenance windows and growth increments.

| Choice | Benefit | Cost or risk |
|---|---|---|
| Higher-radix leaf | Fewer devices and cables | Larger blast radius and dense service event |
| More uplinks | More path diversity and degraded capacity | More optics, ports, and routing complexity |
| Intentional oversubscription | Lower initial cost | Must be justified by measured workload demand |
| Dedicated compute fabric | Predictable traffic class and operations | Additional infrastructure footprint |
| Shared converged fabric | Better utilization of common infrastructure | Stronger QoS and change-control requirements |

## Routing and Load Distribution

ECMP distributes eligible flows according to the switch and NOS policy. It is not a guarantee that a single flow, a small number of flows, or a communication library will spread evenly. In a multi-rail GPU design, endpoint interface selection and GPU affinity also determine whether the fabric can use available paths.

Before changing a hash field, adaptive-routing setting, or routing policy, capture:

1. topology and expected next hops;
2. interface-to-rail and GPU-to-NIC mappings;
3. per-link utilization under the affected workload;
4. queue, ECN, and PFC counter deltas;
5. the rollback configuration and success criteria.

Do not diagnose a physical failure as a routing issue, or a capacity problem as a hash problem. The evidence is different.

## Spectrum Operations and Telemetry

Telemetry should resolve a symptom from workload to port, peer, cable, configuration version, and traffic class. NVIDIA documents interface counters, buffer events, and What Just Happened (WJH) drop sampling as telemetry capabilities on supported Spectrum/NOS combinations; availability and syntax are release dependent.

Collect these families, retaining counter deltas rather than only lifetime totals:

| Layer | Evidence | Why it matters |
|---|---|---|
| Physical | link state, negotiated speed, FEC, errors, transceiver state | Separates a faulty path from contention |
| Forwarding | route/next-hop state, ECMP membership, port utilization | Explains path concentration |
| Queue | occupancy where available, queue drops, scheduler statistics | Identifies the congested egress |
| Congestion | ECN marks, PFC transmit/receive, pause duration | Validates the control loop |
| Change | NOS, configuration, optics/cable, firmware inventory | Makes regressions explainable |
| Workload | job/rack/rail placement and collective duration | Connects fabric evidence to impact |

Alert on unexpected rate of change, sustained asymmetry, and deviation from a known-good baseline. A nonzero cumulative counter is not automatically an active incident.

**Illustrative annotated output — WJH drop sampling, the specific tool that tells you *why* a packet was dropped instead of just that it was:**

```text
# Illustrative What Just Happened (WJH) drop report — syntax is NOS/release specific
$ show what-just-happened drop-reason all
REASON                    SRC-IP        DST-IP        COUNT   LAST-SEEN
L2 table miss              -             -               0     -
Router ingress miss        10.20.4.15   10.20.9.99       0     -
Tail drop (queue full)     10.20.4.15   10.20.9.99    18402    2s ago
ACL deny                    -            -                0     -
```

The `Tail drop (queue full)` row with a nonzero count and a `LAST-SEEN` of two seconds ago is qualitatively different evidence than an interface `discard` counter: it tells you the specific *reason* class — the egress queue toward `10.20.9.99` was genuinely full when these packets arrived, not an ACL, not a routing miss, not a corrupted frame. That distinction directly answers the decision point in Figure 9.7.1 — clean physical counters plus a WJH tail-drop signature toward one destination is the "oversubscribed cut or bad placement" branch, not the physical-fault branch, even before checking a single ECN or PFC counter.

## Production Deployment Pattern

Treat switch configuration as a tested release artifact, with templates generated from a source of truth. The artifact should include port roles, breakout and optic expectations, MTU, routing, QoS classification, ECN/PFC profile, management access, telemetry export, and rollback instructions.

### Acceptance ladder

1. Confirm inventory, cable/optic identity, port role, and negotiated physical state.
2. Verify L2/L3 reachability, MTU, and routing from representative hosts.
3. Validate the end-to-end QoS mapping and intended counter visibility.
4. Run host-memory RDMA tests, then GPU-buffer and collective tests.
5. Repeat under expected concurrency and at least one planned degraded state.
6. Record topology, software versions, counters, and workload results as the baseline.

### Upgrade discipline

NOS changes can alter command behavior, telemetry availability, supported features, or queue behavior. Qualify a representative rack first; compare the same workload and evidence set before and after; use a maintenance plan that preserves a rollback path. Do not infer an upgrade is safe because links return to `up`.

## Troubleshooting

### Scenario 1 — One rack is slow, but links are healthy

**Symptoms:** a recurring job has longer step time only when scheduled in one rack; port state and basic error counters are normal.

**Diagnosis:** compare the rack’s uplink utilization, ECN marking rate, PFC deltas, route membership, and workload placement with a healthy rack. Trace the evidence to a shared egress or an imbalanced path before changing thresholds.

**Evidence in practice:**

```text
# Slow rack's leaf uplinks
$ show what-just-happened drop-reason all | grep -i tail
Tail drop (queue full)      10.20.5.20   10.20.9.99    52100    1s ago

# Healthy rack's leaf uplinks, same job, same window
$ show what-just-happened drop-reason all | grep -i tail
Tail drop (queue full)       -            -               0     -
```

Same job, same collective, run at the same time — the slow rack's uplink toward the same destination shows an actively growing tail-drop count while a healthy rack's uplink shows none. Both racks have identical port state and error counters, which is exactly why "links are healthy" is true and irrelevant: the fault is queue-level contention on one specific uplink cut, not anything the physical layer would surface.

**Resolution:** correct the route, placement, cabling, or capacity condition that created the concentration. Re-run the same workload and verify that queue/congestion asymmetry and step-time tail return to baseline — concretely, the WJH tail-drop count on the previously slow rack's uplink should return to zero under the same load.

**Prevention:** include rack-level congestion and rail-balance views in acceptance and admission reviews.

### Scenario 2 — PFC counters rise across multiple leaves

**Symptoms:** pause frames increase at several hops and unrelated traffic experiences latency.

**Diagnosis:** find the traffic priority and trace the pause direction toward the congested egress. Validate that all hops use the same classification and that PFC is enabled only for the intended priority. Review ECN marking and endpoint reaction rather than assuming PFC is the root cause.

**Evidence in practice:**

```text
$ for sw in leaf03 leaf07 leaf12; do echo "== $sw =="; ssh $sw "ethtool -S swp1 | grep rx_pfc_prio3"; done
== leaf03 ==
     rx_pfc_prio3:            210500       <- most-downstream, highest count: likely origin
== leaf07 ==
     rx_pfc_prio3:            198200       <- propagated from leaf03's direction
== leaf12 ==
     rx_pfc_prio3:            41100        <- smaller, further from the source
```

Walking the pause direction across three leaves in one query confirms `leaf03` as the origin — it has the highest count and is closest to the congested destination, and the counts decrease moving upstream, which is the expected signature of a single congestion source causing a pause tree rather than three independent problems. This rules out "misclassification at each leaf independently" (which would show unrelated, uncorrelated counts) in favor of one destination-side bottleneck whose pause is propagating.

**Resolution:** remove the underlying oversubscription or misclassification; restore the approved ECN/PFC policy; confirm pause counters no longer grow during the test window — across all three leaves, not just the origin.

**Prevention:** deploy QoS from a single source of truth and test congestion scenarios before production rollout.

### Scenario 3 — A port runs below the expected rate

**Evidence:** negotiated speed/FEC, error deltas, peer-port state, cable or transceiver identity, and recent changes.

**Likely causes:** unsupported or degraded media, a configuration mismatch, a peer limitation, or a physical fault.

**Resolution and verification:** isolate by controlled substitution using approved components, then confirm expected negotiation and stable error deltas under load. Do not close the incident based on administrative state alone.

## Customer Architecture Discussion

The right switch design begins with workload communication and operations, not a port-count quote. Establish three explicit criteria before choosing a topology: the number and communication pattern of concurrent jobs that must meet a step-time objective; the capacity and latency behavior permitted after a defined uplink, leaf, or maintenance loss; and the named team that owns NOS, optics, configuration automation, telemetry, and incident evidence.

Full bisection is a cost and resilience choice. Measured oversubscription can be appropriate when workload locality and concurrency measurements support it. The architecture decision should document normal and degraded service expectations, the evidence used to accept them, and the escalation owner—not only aggregate switch capacity.

## Interview Preparation

**1. Why does a switch with sufficient aggregate bandwidth still permit slow collectives?**

"Because aggregate bandwidth is a sum across every port, and a collective doesn't spread its demand evenly across every port — it converges on specific egresses at specific moments. I've seen a 256-GPU cluster with plenty of aggregate capacity where one rack was still a persistent straggler, because WJH drop sampling showed sustained tail drops on that rack's specific uplink toward a specific destination, while a healthy rack showed zero on the identical query. The aggregate number simply doesn't capture that concentration — it's the wrong denominator for the question 'will this collective's actual traffic pattern fit.'"

**2. How do ECN, PFC, egress queues, and endpoint congestion control relate?**

"The egress queue is the physical thing under pressure. ECN is the switch's early warning — mark packets before the queue is full so the sender has a chance to react before anything worse happens. Endpoint congestion control, DCQCN in this stack, is what actually turns that ECN mark into a reduced injection rate — the switch marking is useless without an endpoint that responds to it. PFC is the last-resort local safety net if that whole loop doesn't relieve pressure in time — it stops transmission for one priority on one link rather than letting the queue overflow and drop. I'd draw it as a chain: queue pressure triggers ECN, ECN should trigger endpoint response, and PFC only fires if that chain didn't work fast enough."

**3. What evidence distinguishes a congested path from a failing optical link?**

"Physical layer evidence — FEC correction rate, error counters, transceiver diagnostics — should be clean on a congested-but-otherwise-healthy path; a failing optic shows those climbing regardless of load. Congestion, on the other hand, shows up in queue and priority-specific counters — WJH tail-drop reasons, ECN marks, PFC pause — while the physical counters stay flat. I've used exactly that split to close an incident fast: same job, same destination, one rack showing active WJH tail-drops with zero FEC/error deltas — that's unambiguously a queueing problem, not a cable or optic, and it told the team not to waste time swapping hardware."

**4. Why can ECMP leave a multi-rail cluster imbalanced?**

"ECMP hashes flows across equal-cost paths using a limited set of header fields — source/destination address and port, typically — which works well statistically across thousands of unrelated flows but can concentrate a small number of large, long-lived flows onto the same path purely by hash coincidence. A multi-rail GPU workload often has exactly that shape — a handful of big, sustained collective flows rather than thousands of small ones — so it's more exposed to this than typical enterprise traffic. On top of that, ECMP has no idea which NIC a GPU is actually attached to, so even perfect hash distribution can send traffic down a path that crosses a NUMA boundary the application never needed to cross. I always check per-rail utilization directly rather than assuming ECMP produced the balance the topology diagram implies."

**5. What must be tested before a switch NOS upgrade?**

"The same evidence set as the original acceptance ladder, on a representative rack, before and after — physical state, QoS mapping, host-memory RDMA, GPU-buffer tests, and at least one representative collective under concurrency. NOS upgrades can silently change command syntax, telemetry availability, or even queue scheduling behavior, so 'links came back up' proves almost nothing. I'd insist on comparing the actual counter and workload evidence pre- and post-upgrade on a canary rack, with a tested rollback path, before it touches anything else — an upgrade that looks clean on link state alone has told you nothing about whether the congestion-control loop still behaves the same way."

## Architecture Summary

Spectrum switches provide the forwarding, queueing, telemetry, and congestion-signaling layer of an AI Ethernet fabric. Their value comes from a coherent topology, QoS policy, endpoint behavior, and operational release process. Buffers absorb brief mismatch; they do not replace capacity. Telemetry and baselines turn an opaque performance complaint into a path-specific engineering decision.

## Key Takeaways

- Evaluate switch capacity at the relevant traffic cut, including concurrent jobs and degraded states.
- Use ECN, PFC, queues, and endpoint behavior as one reviewed control system.
- Prove routing and rail balance with workload and counter evidence, not port-up state.
- Assign lifecycle and incident ownership for NOS, optics, automation, and telemetry before deployment.

## Quick Revision Sheet

- Validate usable path capacity in normal and degraded states.
- Keep classification, ECN, and PFC policies consistent end to end.
- Use queue and congestion counter *deltas*, joined with topology and workload data.
- Treat routing changes and NOS upgrades as workload-validated releases.
- Diagnose physical faults and congestion with different evidence.

## Lab Checklist

- [ ] Inventory leaf/spine ports, peers, optics, negotiated state, and expected speed.
- [ ] Capture route membership and per-link utilization for a representative workload.
- [ ] Record ECN/PFC/queue counter deltas before and after a controlled load test.
- [ ] Save a configuration and telemetry baseline with the change record.

## Cross References

- Previous: [Data Center Bridging and QoS](./chapter-06-data-center-bridging-and-qos)
- Next: [ConnectX Ethernet Adapters](./chapter-08-connectx-ethernet-adapters)
- Related: [Fabric Validation and Capacity Planning](./chapter-10-fabric-validation-and-capacity-planning)

## Further Reading

- [NVIDIA Spectrum telemetry documentation](https://docs.nvidia.com/networking/display/neov27/telemetry)
- [Historical/reference NVIDIA WJH configuration documentation](https://docs.nvidia.com/networking/display/onyxv3102002/configure%2Bwhat%2Bjust%2Bhappened%2B%28wjh%29%2Busing%2Bcli) — use the current NOS documentation for supported syntax and availability.
- [NVIDIA RoCE overview](https://docs.nvidia.com/networking-ethernet-software/cumulus-linux-40/Network-Solutions/RDMA-over-Converged-Ethernet-RoCE/)
