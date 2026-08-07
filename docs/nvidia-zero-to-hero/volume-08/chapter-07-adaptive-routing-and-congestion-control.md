---
title: Chapter 07 — Adaptive Routing and Congestion Control
description: Understand how InfiniBand reacts to path imbalance, contention, and congestion in large AI fabrics.
sidebar_position: 8
tags: [infiniband, adaptive-routing, congestion-control]
---

# Adaptive Routing and Congestion Control

## Introduction

A lossless fabric can still be slow.

InfiniBand link-level flow control prevents ordinary packet loss caused by buffer exhaustion, but it does not create infinite capacity. When many senders target the same output path, queues grow, credits are consumed, backpressure propagates, and unrelated traffic may be delayed behind congested flows.

Adaptive routing and congestion-control mechanisms exist to reduce these effects. They are not magic switches. Their benefit depends on topology, traffic pattern, firmware, routing policy, telemetry, and correct tuning.

| Chapter field | Value |
|---|---|
| Volume | 08 — InfiniBand |
| Difficulty | Expert |
| Estimated reading time | 55–70 minutes |
| Primary focus | Dynamic path selection and congestion response |
| Previous | Routing, Topologies, and Oversubscription |
| Next | HDR, NDR, XDR, and Link Evolution |

## Story: No Packet Loss, Yet Every Job Slowed Down

A cluster runs three large distributed jobs simultaneously. No links are down. Error counters remain low. The fabric is described as lossless.

Step time nevertheless doubles.

Per-port telemetry shows a congestion tree: several destination-facing ports are saturated, upstream switches accumulate blocked traffic, and unrelated flows sharing the same virtual lane are delayed. Static routing concentrates too many collective segments onto the same paths.

The team enables the supported adaptive-routing and congestion features only after validating topology, firmware, and workload behavior. It also changes placement to reduce destination concentration. Performance stabilizes.

> Losslessness protects delivery. It does not guarantee fairness, low latency, or freedom from backpressure.

## Learning Objectives

After completing this chapter, you will be able to:

- explain credit-based flow control and backpressure;
- distinguish congestion from physical errors;
- describe congestion trees and head-of-line blocking;
- explain the purpose of adaptive routing;
- describe congestion marking and source reaction conceptually;
- identify tuning and interoperability risks;
- design observability for congestion incidents;
- troubleshoot low performance when links remain healthy.

## Big Picture

```mermaid
flowchart LR
    S1[Sender 1] --> L1[Leaf]
    S2[Sender 2] --> L1
    S3[Sender 3] --> L2[Leaf]
    L1 -->|"XmtWait climbing,<br/>SymbolErrors flat"| Spine[Spine]
    L2 -->|"XmtWait climbing,<br/>SymbolErrors flat"| Spine
    Spine --> Hot[Congested Destination Port]
    Spine -. "alternate path -- used only<br/>if adaptive routing enabled<br/>AND eligible" .-> Alt[Alternate Spine Path]

    Sym["Throughput drops under<br/>concurrent jobs, no errors"] --> Q1{"XmtWait rising on ports<br/>UPSTREAM of the hot port?"}
    Q1 -->|No| A1["Not congestion -- recheck<br/>physical layer (Ch.2)"]
    Q1 -->|Yes| Q2{"Do SymbolErrorCounter /<br/>LinkDownedCounter also rise?"}
    Q2 -->|Yes| A2["Physical fault compounding<br/>congestion -- fix the cable/port<br/>FIRST, congestion may clear on its own"]
    Q2 -->|"No, clean"| Q3{"Is adaptive routing enabled<br/>AND does topology offer a<br/>real alternate path here?"}
    Q3 -->|"No alternate path exists"| A3["Structural bottleneck --<br/>only placement or added<br/>capacity helps (Ch.6)"]
    Q3 -->|"Alternate exists, unused"| A4["Routing/placement problem --<br/>path diversity exists but traffic<br/>isn't using it"]
```

**Figure 8.7.1 — Congestion is a path and destination problem, and the decision tree is what separates "add capacity," "fix a cable," and "fix routing" — three fixes that look identical from the application's point of view (throughput dropped) but require completely different actions.** The critical first branch — congestion counters rising with physical counters flat — is the single fact that proves this chapter's opening claim: a lossless fabric with zero errors can still be the entire cause of a job slowing down.

## Credit-Based Flow Control

InfiniBand receivers advertise available buffer credits. A sender transmits only when enough credit exists for the selected virtual lane.

This prevents buffer-overrun loss, but when a receiver or downstream link cannot drain traffic:

1. its available credits fall;
2. the upstream transmitter pauses;
3. upstream queues grow;
4. their credits become constrained;
5. backpressure can propagate through multiple switches.

```mermaid
sequenceDiagram
    participant A as Upstream Port A
    participant B as Switch Port B
    participant C as Congested Port C

    A->>B: Traffic
    B->>C: Traffic
    C-->>B: Credits exhausted
    B-->>A: Backpressure propagates
    Note over A,C: No packet loss is required for latency to rise
```

**Figure 8.7.2 — Backpressure can spread away from the original bottleneck.** This creates a congestion tree.

## Congestion Versus Physical Failure

| Indicator | Congestion | Physical/link fault |
|---|---|---|
| Link state | Usually active | May flap or degrade |
| Symbol/physical errors | Often normal | Often increasing |
| Wait or congestion counters | Elevated | May be secondary |
| Throughput | Variable or unfair | Reduced, unstable, or absent |
| Scope | Traffic-pattern dependent | Often tied to component/path |
| Resolution | Routing, placement, capacity, tuning | Repair cable, port, optics, adapter, firmware |

Do not replace cables because utilization is high. Do not tune congestion control while a link is physically unhealthy.

### Annotated evidence: telling the two apart from counters alone

```text
$ ibqueryerrors -s XmtWait,SymbolErrorCounter,LinkDownedCounter -k <switch-lid>
GUID 0x506b4b0300a1c210 port 3: [XmtWait == 998432] [SymbolErrorCounter == 0] [LinkDownedCounter == 0]
GUID 0x506b4b0300a1c210 port 4: [XmtWait == 2109] [SymbolErrorCounter == 41] [LinkDownedCounter == 2]
```

Port 3 has a large `XmtWait` (credit-stall time) with zero physical errors — the table's "congestion" column: usually active link, throughput variable, resolved by routing/placement/capacity. Port 4 has a small `XmtWait` but nonzero `SymbolErrorCounter` and `LinkDownedCounter` — the table's "physical/link fault" column: this port is intermittently recovering from real signal errors, which is a cable/optics/port problem, not a traffic-pattern problem. Reading both columns from the same query is what stops the classic mistake this section warns about: fixating on port 3's alarming wait number and missing that port 4's small-but-nonzero error counters are the actual hardware fault.

## Head-of-Line Blocking

Head-of-line blocking occurs when one blocked flow delays other traffic queued behind it. Virtual lanes and service levels can reduce interference by separating classes, but only if mappings are deliberate and deadlock-safe.

Poor class design can create:

- priority starvation;
- wasted buffer partitions;
- ineffective isolation;
- additional operational complexity;
- new deadlock risks.

## Adaptive Routing

Static routing assigns paths based on precomputed forwarding state. Adaptive routing can choose among eligible alternatives using current or recent path conditions.

Potential benefits include:

- avoiding transient hot links;
- improving utilization of path diversity;
- reducing sensitivity to static destination concentration;
- improving behavior under concurrent jobs.

Potential risks include:

- packet reordering considerations;
- topology-specific constraints;
- inconsistent switch configuration;
- difficult troubleshooting if path decisions are invisible;
- interaction with deterministic collective schedules;
- firmware compatibility requirements.

Adaptive routing works best when the topology actually provides multiple useful paths. It cannot create capacity across a fundamentally oversubscribed cut.

## Congestion Control

Congestion-control systems generally involve three ideas:

1. **Detection** — a switch or endpoint observes congestion.
2. **Notification or marking** — the condition is communicated.
3. **Reaction** — sources reduce or reshape injection until congestion clears.

The exact mechanism depends on fabric generation and implementation. Production documentation should state:

- which ports and traffic classes participate;
- how congestion is detected;
- which endpoints react;
- timing and rate parameters;
- expected counters;
- rollback behavior.

## Adaptive Routing Versus Congestion Control

| Mechanism | Primary action | Best for | Cannot solve |
|---|---|---|---|
| Adaptive routing | Select a less congested eligible path | Imbalance with available path diversity | Insufficient total capacity |
| Congestion control | Reduce or regulate offered load | Persistent destination or path contention | Broken physical links |
| Placement | Change which endpoints communicate across cuts | Avoidable topology concentration | Fixed all-to-all demand at full scale |
| Capacity expansion | Add links or switches | Structural bottlenecks | Bad routing or faulty components |

These mechanisms complement one another.

## AI Workload Behavior

Distributed AI produces several challenging patterns:

- synchronized bursts from many ranks;
- incast toward aggregation points;
- all-to-all exchanges for expert parallelism;
- simultaneous checkpoint or storage traffic;
- repeated ring segments;
- multiple large jobs sharing the fabric.

A fabric that looks healthy under steady pairwise testing may congest under synchronized collectives. Validation must include representative concurrency.

## Multi-Tenancy

In a shared cluster, one tenant can affect another through shared links and buffers. Architecture should consider:

- admission control;
- job placement;
- bandwidth accounting;
- service-level mapping;
- rail allocation;
- maintenance and test traffic;
- tenant-specific baselines.

Do not promise strict isolation based only on logical partitions. P_Keys control membership, not guaranteed bandwidth.

## Production Design Checklist

Before enabling adaptive routing or congestion control:

- verify supported switch and HCA firmware;
- confirm topology suitability;
- standardize configuration across the fabric;
- establish healthy physical and routing baselines;
- define expected counters;
- test representative workloads;
- test multiple concurrent jobs;
- validate failure and rollback;
- document ownership and change windows.

## Observability

Collect:

- per-port transmit and receive utilization;
- transmit wait or credit-stall indicators;
- congestion marking and notification counters;
- virtual-lane utilization;
- route/path distribution;
- queue occupancy where available;
- endpoint injection rate;
- collective duration and tail behavior;
- topology and placement metadata.

Visualize congestion over time. A single counter snapshot cannot show whether the condition is transient, recurring, or propagating.

## Production Troubleshooting

### Scenario 1 — High wait counters on many upstream ports

**Symptoms**

- many links show waiting or blocked transmission;
- physical errors are low;
- one destination-facing region is highly utilized.

**Diagnosis**

Trace the counter gradient toward the likely root of the congestion tree. Correlate with destination nodes, job placement, and traffic class.

**Resolution**

Relieve the destination bottleneck, rebalance paths or placement, and verify that upstream wait counters return to baseline.

**Evidence.** Sampling `XmtWait` across an entire tier, sorted, shows the gradient pointing toward the root:

```text
$ for p in 1 2 3 4 5 6 7 8; do ibqueryerrors -s XmtWait -k <leaf-lid> | grep "port $p:"; done
GUID 0x50... port 1: [XmtWait == 340]
GUID 0x50... port 2: [XmtWait == 298]
GUID 0x50... port 3: [XmtWait == 51204]
GUID 0x50... port 4: [XmtWait == 47890]
GUID 0x50... port 5: [XmtWait == 312]
```

Ports 3 and 4 (both facing the same downstream leaf/rack) are two orders of magnitude above their siblings — that pair, not the whole tier, is the congestion tree's root. Tracing which destination sits behind ports 3-4 (via the topology inventory from Lab 01/03) turns "collective performance worsened under concurrency" into a specific rack to investigate for oversubscription or a synchronized-incast pattern.

### Scenario 2 — Adaptive routing enabled, but imbalance remains

**Likely causes**

- no useful alternate paths;
- feature not enabled consistently;
- routing policy restricts eligible paths;
- telemetry threshold not reached;
- workload has too few flows;
- one destination remains the true bottleneck.

**Resolution**

Verify feature state and topology. Do not assume enablement guarantees balanced traffic.

### Scenario 3 — Latency becomes unstable after tuning

**Symptoms**

- average bandwidth improves;
- tail latency worsens;
- results vary by message size.

**Diagnosis**

Review reaction timing, rate parameters, service-level mapping, and packet-order assumptions. Compare against a controlled baseline.

**Resolution**

Rollback to the last validated policy, then retune one parameter at a time.

**Evidence.** A paired latency-percentile comparison, before and after enabling the feature, shows exactly what "average improves, tail worsens" means in numbers:

```text
                   p50      p95      p99      max
Before tuning:    3.1us    4.8us    7.2us    9.1us
After tuning:     2.4us    5.9us   38.6us   112.4us
```

`p50` genuinely improved (3.1us to 2.4us — the average bandwidth gain is real). But `p99` grew more than 5x, and `max` more than 12x — a small fraction of operations are now taking dramatically longer, consistent with reordering or reaction-timing side effects mentioned in this section. Reporting only the mean or p50 here would call this change a clear win; reading p99/max is what actually catches the regression this scenario describes.

### Scenario 4 — One tenant slows another

**Diagnosis**

Compare tenant placement, shared uplinks, service levels, link utilization, and synchronized traffic windows.

**Resolution**

Use placement, scheduling, traffic-class policy, or capacity allocation to reduce shared bottlenecks.

## Customer Scenario

A customer asks whether enabling adaptive routing guarantees linear scaling.

The architect explains that scaling depends on compute balance, topology, bisection bandwidth, endpoint injection, collective algorithms, and application synchronization. Adaptive routing can reduce path imbalance when alternatives exist, but it does not eliminate structural oversubscription or destination bottlenecks.

## Interview Preparation

### Knowledge Questions

1. Why can a lossless fabric congest?
   **Model answer:** "Losslessness is achieved through credit-based backpressure, not infinite buffering — when a receiver's credits run low, the sender pauses rather than dropping. That prevents loss, but it doesn't create capacity out of nowhere. If enough senders target the same destination, queueing and stalling still happen; the fabric just expresses it as delay instead of drops."

2. What is backpressure?
   **Model answer:** "It's what happens when a downstream port can't drain traffic fast enough: its available credits fall, so it stops advertising room, the upstream sender pauses, that sender's own queue then grows, and its credits toward its upstream senders fall too. It's a mechanical chain reaction, not a policy decision, and it can propagate several hops away from the actual bottleneck."

3. What is a congestion tree?
   **Model answer:** "The shape backpressure takes when it propagates — one congested destination port at the root, and multiple upstream switches and ports showing elevated wait counters that all trace back to that single root. The diagnostic trick is that the counter magnitude tends to be highest closest to the root and decays as you move away from it, which is how you trace the gradient back to the actual source."

4. How does adaptive routing differ from static routing?
   **Model answer:** "Static routing computes forwarding decisions once and doesn't change them based on live conditions. Adaptive routing can select among eligible alternate paths based on current or recent path state, aiming to route around transient hot spots. The catch is it only helps when real path diversity exists — it can't invent capacity across a fundamentally oversubscribed cut, and it introduces its own risks like reordering that need validation."

5. Why are P_Keys not bandwidth isolation?
   **Model answer:** "P_Keys control who is allowed to address whom — membership — not how much of the shared link and buffer capacity each member gets. Two tenants in completely separate, correctly-configured partitions can still contend for the same physical uplinks and virtual lanes and slow each other down. Bandwidth isolation needs scheduling, capacity allocation, or traffic-class policy on top of partitioning, not instead of it."

### Architecture Questions

1. Design congestion observability for a 1,000-node fabric.
   **Model answer:** "Per-port wait/credit-stall counters collected continuously, not just polled during incidents, joined with topology so a hot port maps immediately to a rack and destination. I'd alert on sustained deviation from baseline rather than any nonzero reading, and I'd specifically build a view that ranks ports by wait counter within a tier, because that ranking is what turns 'the fabric feels slow' into 'ports 3 and 4 on leaf 7 are the root' in one query."

2. Explain how virtual lanes can reduce interference.
   **Model answer:** "By giving different traffic classes separate buffering and credit accounting on the same physical link, so that one class's backpressure doesn't directly starve another's buffer space. The caveat I'd give a customer: this only works if the SL-to-VL mapping is consistent and deadlock-safe across every hop — a mapping that's correct on one switch and different on the next hop doesn't give you the isolation the design intended."

3. Compare adaptive routing, congestion control, and added capacity.
   **Model answer:** "Adaptive routing redistributes existing traffic across existing alternate paths — it needs diversity to already exist. Congestion control regulates how much load sources inject in the first place — it addresses persistent contention but can't fix a broken cable. Added capacity is the only one of the three that actually increases the ceiling — it's the right answer when the other two have been tried and the fabric is still structurally short of what the workload needs at the same time everywhere."

### Scenario Questions

1. Physical counters are clean, but collectives slow under concurrency. What do you inspect?
   **Model answer:** "Wait and credit-stall counters specifically, not error counters — clean physical telemetry rules out cable/optics faults but says nothing about congestion. I'd sample wait counters across the tiers the collective's traffic crosses, during the actual concurrent-job window, and look for a gradient pointing at one destination or rack."

2. One destination causes wait counters across several tiers. How do you isolate it?
   **Model answer:** "Sample every port in the suspect tiers and look for the magnitude gradient — the port closest to the actual bottleneck will show the highest wait value, and it decays moving upstream. Once I've found the port with the highest reading, I map it to a destination through the topology inventory and check whether that destination itself is overloaded, misconfigured, or simply the target of a synchronized incast."

3. Adaptive routing worsens tail latency. What is your rollback plan?
   **Model answer:** "Revert to the last validated static routing policy immediately — don't try to retune live while a production workload is degraded. Then, in a controlled window, retune one parameter at a time against a p50/p95/p99/max baseline comparison, because this exact chapter's evidence shows average bandwidth can improve while p99 gets dramatically worse — I need percentile data, not a single throughput number, to know if a retuned parameter actually fixed it."

### Whiteboard Question

Draw a congestion tree from three source leaves to one destination port. Show where credits disappear and where alternate paths could help.

**What I'd actually say while drawing:** "Three source leaves feeding up into a spine, all converging on one destination-facing port at the bottom right — that's the root. I'll mark credits disappearing right there, at the destination port, because that's where the actual drain rate falls behind the combined offered rate. Then I'll draw the backpressure propagating upward — dotted arrows from that root back through the spine and into each source leaf, getting fainter as they go, to show the gradient. Where would alternate paths help? Only if I can redraw one of these three source-to-spine links going through a *different* spine that isn't also congested — if all three sources are forced through the same spine toward the same destination, adaptive routing has nothing to route around, because there's no second path in this specific picture. That's the point I'd make explicit: the diagram only has a fix if I actually draw a second spine."

## Summary

InfiniBand prevents ordinary buffer-overrun loss through credit-based flow control, but contention still produces queueing and backpressure. Adaptive routing uses available path diversity; congestion control reduces offered load; placement and capacity address structural causes.

The correct production approach is to distinguish physical faults from congestion, establish baselines, enable supported features deliberately, and observe behavior under representative concurrent workloads.

## Key Takeaways

- Lossless does not mean congestion-free.
- Backpressure can propagate far from the bottleneck.
- Adaptive routing needs real path diversity.
- Congestion control regulates load; it does not repair topology.
- Multi-tenant isolation requires scheduling and capacity policy.
- Tail latency and fairness matter alongside average bandwidth.

## Quick Revision Sheet

| Concept | Remember |
|---|---|
| Credit flow control | Sender waits for receiver buffer credit |
| Backpressure | Congestion propagates upstream |
| Congestion tree | Many blocked paths rooted at one bottleneck |
| Adaptive routing | Chooses among eligible alternate paths |
| Congestion control | Signals sources to reduce offered load |
| Head-of-line blocking | Blocked traffic delays unrelated queued traffic |

## Cross References

- Previous: [Routing, Topologies, and Oversubscription](./chapter-06-routing-topologies-and-oversubscription)
- Next: [HDR, NDR, XDR, and Link Evolution](./chapter-08-hdr-ndr-xdr-and-link-evolution)
- Related lab: [Inspect Subnet Routing and Counters](./labs/lab-03-inspect-subnet-routing-and-counters)

## Further Reading

Use current vendor documentation for the deployed switch ASIC, HCA, firmware, and fabric-management release. Adaptive-routing and congestion-control capabilities are generation- and topology-specific.