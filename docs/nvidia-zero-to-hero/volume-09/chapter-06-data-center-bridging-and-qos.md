---
title: Chapter 06 — Data Center Bridging and QoS
description: Design traffic classification, queueing, ETS, and loss controls for mixed AI Ethernet fabrics.
sidebar_position: 7
tags: [dcb, qos, ethernet]
---

# Data Center Bridging and QoS

An Ethernet fabric is rarely pure RoCE traffic. GPU collectives, storage, Kubernetes control traffic, monitoring, image pulls, and operator access can all share physical links. If the fabric treats them as one undifferentiated stream, a congestion event in one workload becomes an incident for every workload. If it creates too many classes, buffer partitioning, policy drift, and troubleshooting complexity take over.

Data Center Bridging (DCB) and QoS provide the language for making that choice explicit: classify traffic, map it to a priority and queue, allocate service, mark queue pressure, and apply PFC only where the risk warrants it. The objective is controlled sharing with observable behavior—not a promise that every packet class is lossless.

| Chapter field | Value |
|---|---|
| Difficulty | Advanced |
| Estimated reading time | 45–55 minutes |
| Prerequisites | [ECN and DCQCN](./chapter-05-ecn-and-dcqcn) |
| Primary focus | End-to-end classification, queueing, ETS, and policy operations |
| Next | [Spectrum Switches for AI](./chapter-07-spectrum-switches-for-ai) |

## Learning Objectives

After completing this chapter, you will be able to:

- trace a packet from application marking to an egress queue;
- distinguish classification, scheduling, ETS, ECN, and PFC responsibilities;
- design a small, explainable class model for an AI Ethernet fabric;
- detect policy drift and queue-mapping mistakes;
- separate QoS protection from capacity planning and security isolation.

## Architecture Before Configuration

QoS begins with traffic intent. A policy may classify at the host, trust or rewrite at an access port, map to internal priority, select an egress queue, and then apply queue-specific scheduling and congestion policy. The packet can cross L2 and L3 boundaries, and any boundary can alter the marking or mapping.

```mermaid
flowchart LR
    A["Application or host"] --> M["DSCP or PCP marking"]
    M -->|"evidence: tcpdump shows\nexpected DSCP/PCP value"| N["NIC traffic class"]
    N --> I["Switch ingress classification"]
    I --> CHK{"Does ingress trust\nor rewrite this marking?"}
    CHK -->|"trusted — evidence: mlnx_qos\nshows expected priority"| Q["Egress queue\n(intended)"]
    CHK -->|"untrusted/rewritten —\nno matching source-of-truth entry"| WRONGQ["Egress queue (WRONG) —\nsilent misclassification"]
    Q --> S["Scheduler and ETS"]
    Q --> C["ECN and optional PFC"]
    WRONGQ -.->|"still forwards — ping/IP\nstill succeeds"| DRIFT["Drift: RDMA suffers,\nno alarm fires"]
    S --> L["Next link"]
    C --> L
```

**Figure 9.6.1 — Classification is an end-to-end contract, and the diagram now shows the specific failure this chapter is built around: a silent rewrite at ingress.** The dangerous branch isn't a dropped packet — it's the untrusted/rewritten path, where the frame is still forwarded (so ping and basic connectivity checks pass) but lands in the wrong queue with the wrong ECN/PFC treatment. That gap between "still reachable" and "in the intended queue" is exactly why Chapter 06's validation plan tests classification with known marked traffic instead of trusting a config export.

## What Each Control Does

| Control | Purpose | Typical question it answers | What it does not provide |
|---|---|---|---|
| DSCP/PCP marking | Express traffic intent | Which class should this packet use? | Guaranteed end-to-end behavior |
| Classification/mapping | Select internal priority and queue | Where is the packet queued? | Additional bandwidth |
| Scheduling | Choose service order | Which nonempty queue is served next? | Fairness unless configured for it |
| ETS | Allocate bandwidth among traffic classes | What minimum share is available under contention? | A fixed reservation under all conditions |
| ECN | Signal incipient queue pressure | Should endpoints reduce rate? | Local loss protection |
| PFC | Pause one priority at a local link | Can a loss-sensitive queue drain? | Flow-level isolation or capacity |

Enhanced Transmission Selection (ETS) is often described as bandwidth allocation. Treat that description carefully. The exact behavior depends on the device scheduler and configuration; a configured percentage should be validated as a service objective under contention, not presented as an immutable reservation. A high-priority queue also needs a starvation policy that is understood and tested.

## Build a Small Class Model

Start from workloads and failure domains, not from the maximum number of hardware priorities. A common conceptual model distinguishes:

| Intent | Example contents | Design concern |
|---|---|---|
| Infrastructure/control | Routing, cluster control, monitoring | Must remain reachable during data-plane pressure |
| RoCE compute | Qualified RDMA data traffic | Consistent queue, ECN, and narrowly scoped PFC |
| Storage or service data | Checkpoint, data ingestion, platform services | Can create long-lived contention |
| Best effort | Bulk transfer and noncritical traffic | Must not silently occupy the RoCE class |

These are intents, not a universal priority-number prescription. The implementation must record the exact mapping by platform. Fewer classes are easier to observe and operate. More classes are justified only when there is a distinct behavior, owner, failure policy, and validation method for each one.

### Why trust boundaries matter

An endpoint may set DSCP or PCP incorrectly, accidentally or deliberately. Decide where markings are trusted, where they are normalized, and which traffic is allowed to enter a protected class. QoS classification is not an access-control system: it cannot authenticate a workload, prevent lateral movement, or replace network segmentation. It is nevertheless a security-relevant operational boundary because an untrusted workload placed in a protected class can affect shared service.

## Consistency and Drift Control

The fastest way to create a difficult RoCE incident is to change a single mapping in one place. The source marks a packet as intended, an access switch rewrites it, a spine maps it differently, and the destination sees an ordinary lossy queue. Ping and a basic IP test can still work while the RDMA workload suffers.

**Illustrative annotated output — proving the marking-to-queue contract end to end, hop by hop:**

```text
# 1. What the source actually puts on the wire
$ tcpdump -i eth0 -c1 -v host <peer-ip> and udp port 4791
IP (tos 0xb8, ttl 64, ...) 10.20.4.15.51422 > 10.20.8.5.4791: UDP, length 1200
```

`tos 0xb8` decodes to DSCP 46 (Expedited Forwarding, `0xb8 >> 2 = 46`) — the host is marking correctly.

```text
# 2. What the access (leaf) switch believes about this priority
$ mlnx_qos -i swp4
Priority trust state: dscp
DSCP to priority mapping:
        dscp    0-7  8-15  ...  40-47  48-55  56-63
        prio     0     0   ...    3      0      0
```

DSCP 46 falls in the `40-47` bucket, mapped to priority 3 (the RoCE class) — consistent so far.

```text
# 3. What the far-side (destination leaf) switch believes — the actual drift
$ mlnx_qos -i swp19
Priority trust state: pcp        <- DIFFERENT trust mode: this switch ignores DSCP entirely
PCP to priority mapping:
        pcp      0   1   2   3   4   5   6   7
        prio     0   0   0   0   0   0   0   0    <- untagged frames default to priority 0
```

This is the exact failure this section describes: `swp4` trusts DSCP and correctly classifies the RoCE packet into priority 3. `swp19`, on the destination side, is configured to trust PCP instead — and since this is a routed IP packet with no 802.1Q tag, it has no PCP value at all, so it falls through to priority 0 (best-effort). The packet is still forwarded — ping and TCP still work across this path — but from `swp19` onward it's sharing a lossy best-effort queue with everything else, with no PFC or ECN protection. Nothing in this drift trips an alarm on its own; it only shows up as unexplained RDMA retransmission or throughput loss, which is why Chapter 06 insists on testing the mapping with known marked traffic captured at every hop, not just reviewing each switch's configuration in isolation.

```mermaid
flowchart TB
    SoT[Versioned source of truth] --> H[Host/NIC profile]
    SoT --> L[Leaf policy]
    SoT --> S[Spine policy]
    SoT --> V[Validation tests]
    V --> E[Expected class, queue, and counters]
    Drift[Manual exception] -. mismatch .-> E
```

**Figure 9.6.2 — Configuration generation and continuous verification make QoS observable.** A static design document cannot detect a later per-port exception.

Maintain a machine-readable mapping table containing ingress marking, trust/rewrite behavior, internal priority, queue, PFC state, ECN policy, scheduler treatment, and counter names for every switch role and host profile. Generate configurations from that source where possible; regularly compare running configuration and observed counter behavior against it.

## Production Validation Plan

Validate the policy in layers:

1. **Classification:** send known marked test traffic and confirm the expected priority/queue at ingress and egress.
2. **Isolation:** create bounded RoCE-class congestion and prove that management/control traffic follows its own queue and remains usable.
3. **Service behavior:** run simultaneous classes to observe scheduler/ETS behavior, not just an idle fabric.
4. **Feedback:** confirm ECN marks, endpoint response, and PFC as appropriate to the selected class.
5. **Failure behavior:** test a link/routing change and verify policy persists on the alternate path.
6. **Application behavior:** correlate queue metrics with representative collective and storage load.

Record topology, firmware, software, profile version, workload, duration, and raw counters. A configuration that compiles but has never been tested under contention is not a production QoS policy.

## Operational Troubleshooting

### Scenario 1 — RoCE drops despite PFC being enabled

**Symptoms:** RDMA completion errors or retries rise; PFC appears configured; switches may show drops in a different queue.

**Diagnosis:** trace the packet marking and mapping hop by hop. Verify the selected RoCE priority is actually PFC-enabled in both receive and transmit directions where the implementation requires it. Check MTU, physical errors, ACLs, and endpoint configuration before assuming this is a buffer problem.

**Evidence in practice — this is precisely the trust-mode mismatch captured above:**

```text
$ ethtool -S swp19 | egrep "rx_prio0_discard|rx_pfc_prio3"
     rx_prio0_discard:        18420     <- drops on priority 0, not priority 3
     rx_pfc_prio3:            0         <- PFC on prio3 never even engages
```

PFC "appears configured" (it's enabled on priority 3 at every switch in the design), but the drops are showing up on priority 0 — because, as the `mlnx_qos -i swp19` capture above showed, this switch's PCP-trust mode silently reclassified the traffic into priority 0, which has no PFC protection at all. Checking PFC configuration alone would show everything correct; only tracing the actual queue the drops occur on reveals the packet never reached the protected class it was supposed to.

**Resolution:** correct the mapping or the independent fault. Re-run a bounded test and collect queue-specific rather than aggregate counters.

**Prevention:** deploy a post-change compliance test that asserts the intended class, queue, and congestion policy on all participating roles.

### Scenario 2 — Management becomes slow during a training burst

**Symptoms:** cluster control plane latency rises with RoCE pause or queue pressure.

**Diagnosis:** inspect markings, queue mapping, scheduler state, and pause counters. Find whether management shares the RoCE priority, is starved by a scheduling rule, or uses a physically saturated cut.

**Evidence in practice:**

```text
$ mlnx_qos -i swp4 | grep -A3 "tsa"
tc: 0 ratelimit: unlimited, tsa: dwrr, weight: 5
         priority:  0
tc: 1 ratelimit: unlimited, tsa: strict
         priority:  3
```

`tc: 1` (carrying priority 3, RoCE) is scheduled `strict` — strict-priority scheduling means this traffic class is always serviced before any `dwrr` (deficit-weighted round robin) class when both have queued packets. Management (`tc: 0`, priority 0) is on `dwrr` with only weight 5 — it gets a share of leftover bandwidth, but only after `tc: 1` has been fully serviced. During a sustained RoCE burst, `tc: 1` can legitimately keep the scheduler busy long enough that `tc: 0`'s round-robin turns become rare, which is starvation by design, not a fault — the scheduler is doing exactly what "strict priority for RoCE" was configured to do, at a cost nobody evaluated for the management class.

**Resolution:** restore class separation and validate that scheduler policy protects the control class. If the link is structurally full, add capacity or alter placement; QoS cannot make an exhausted link carry unlimited demand — in this case, moving management off strict-priority contention (its own class with an ETS-guaranteed minimum rather than leftover dwrr share) was the actual fix, not tuning weight 5 higher.

### Scenario 3 — Storage misses its expected share

**Symptoms:** storage throughput drops when compute begins, although ETS appears configured.

**Diagnosis:** test with simultaneous traffic and inspect the actual egress queue, scheduler, shaping, and any strict-priority classes. Confirm which device-specific semantics apply to the configured values.

**Resolution:** adjust the qualified scheduler policy or redesign workload scheduling. Do not advertise an ETS percentage as a guaranteed application bandwidth without evidence.

## Customer Architecture Discussion

A customer with a dedicated AI fabric can choose a small class model and tightly qualify every participating endpoint. A customer sharing network infrastructure across business units needs an ownership model for marking, exceptions, change review, and incident evidence. The latter may need stronger physical or logical isolation in addition to QoS.

Ask the customer to name the traffic that must remain operational during a worst-case training event, the owner who may request a protected class, and the measurement that proves the policy works. Those answers determine whether the design is supportable long after the original implementation team has moved on.

## Interview Preparation

**1. Why can a DSCP value be correct at the host and wrong at the egress queue?**

"Because DSCP being present and correct on the wire only proves the source did its job — every switch between the source and that egress queue still gets to decide independently whether to trust that marking, ignore it, or rewrite it. I've actually traced this: `tcpdump` at the source showed `tos 0xb8`, DSCP 46, correctly mapped to priority 3 at the first-hop leaf. But the destination-side leaf was configured to trust PCP instead of DSCP, and since this was a routed IP packet with no 802.1Q tag, it had no PCP value — so it fell through to priority 0, best-effort, with zero protection. The packet was still forwarded, ping still worked, and nothing alerted. That's the whole point of calling classification an end-to-end contract instead of a host setting — every hop is a place the contract can silently break."

**2. What is the difference between ETS and a hard bandwidth reservation?**

"ETS is a configured minimum-share objective under contention — when multiple classes are actively competing for the same egress, ETS decides how the scheduler splits the available bandwidth between them, roughly proportional to whatever percentages were configured. It is not a hard reservation, because if only one class has traffic to send, it can legitimately use the whole link — nothing is walled off and sitting idle waiting for a class that isn't sending. The distinction matters operationally: if someone tells a customer '30% ETS means storage always gets 30% of the link,' that's wrong — it means storage gets at least roughly 30% only when it's actually contending with other classes for that same link, and the exact behavior under contention is device-scheduler-specific, so I'd always validate it under real simultaneous load rather than trust the configured percentage."

**3. How do you prove PFC is not affecting management traffic?**

"I wouldn't just check that management is on a different priority in the config — I'd run a controlled test: saturate the RoCE class deliberately, enough to trigger PFC, and watch management's own priority-specific counters — `rx_pfc_prio0` in the scheme I've been using — throughout. If that counter stays at zero while `rx_pfc_prio3` is actively incrementing, that's proof, not just configuration review. I'd pair that with actual management-plane latency measurements during the same window, because a queue-mapping gap can exist even when the pause counters look clean — for example if management is technically isolated from PFC but sharing a scheduler class that gets starved by strict-priority RoCE traffic, which is a related but different failure mode."

**4. Why is QoS not a substitute for tenant isolation or capacity planning?**

"Because QoS answers 'which queue does this packet use and how is that queue treated,' and that's a completely different question from 'is this workload authorized to be here' or 'is there enough capacity for everyone's demand.' A misbehaving or malicious workload can still mark its own traffic to request a protected class — QoS classification trusts markings according to policy, it doesn't authenticate who's sending them, so it's not an access-control mechanism. And even a perfectly classified, perfectly isolated RoCE class can't manufacture bandwidth that doesn't exist — if the aggregate demand exceeds the link's capacity, QoS decides who waits, it doesn't make the wait go away. I'd tell a customer: QoS answers 'how is contention handled,' tenant isolation answers 'who's allowed to contend,' and capacity planning answers 'how much contention will actually happen' — you need all three, and QoS alone covers none of the other two."

## Key Takeaways

- QoS is an end-to-end classification and queueing contract, not a switch-local setting.
- ETS, scheduling, ECN, and PFC have distinct roles; none creates capacity.
- A small class model is easier to validate, operate, and troubleshoot.
- Trust boundaries and configuration drift determine whether a policy works in production.
- Measure simultaneous traffic and workload effects, not just configuration state.

## Architecture Summary

Classify intentionally, map consistently, isolate the small loss-sensitive class, and observe every queue that matters. Use scheduling to express service objectives, ECN/DCQCN to control offered rate, PFC only for the qualified class, and topology/capacity planning to solve the demand that policy alone cannot absorb.

## Quick Revision Sheet

| Term | Remember |
|---|---|
| PCP/DSCP | Packet markings that express class intent |
| Traffic class | Administrative behavior grouping, not an application identity |
| Queue | Device resource where contention is observed and controlled |
| ETS | Configurable sharing objective under contention |
| Drift | Deployed behavior no longer matches the approved mapping |

## Lab Checklist

- [ ] Publish the end-to-end marking-to-queue mapping table.
- [ ] Validate expected queues with known marked traffic.
- [ ] Test control, RoCE, storage, and best-effort traffic concurrently.
- [ ] Confirm ECN/PFC counters increment only on the intended class.
- [ ] Compare running device configuration against source of truth after a change.

## Further Reading

- [IEEE 802.1Qbb PFC overview](https://1.ieee802.org/dcb/802-1qbb/)
- [NVIDIA Cumulus Linux Quality of Service documentation](https://docs.nvidia.com/networking-ethernet-software/cumulus-linux-57/Layer-1-and-Switch-Ports/Quality-of-Service/)
- [RFC 3168: Explicit Congestion Notification](https://www.rfc-editor.org/info/rfc3168/)

## Cross References

- [Priority Flow Control](./chapter-04-priority-flow-control)
- [ECN and DCQCN](./chapter-05-ecn-and-dcqcn)
- [Spectrum Switches for AI](./chapter-07-spectrum-switches-for-ai)
