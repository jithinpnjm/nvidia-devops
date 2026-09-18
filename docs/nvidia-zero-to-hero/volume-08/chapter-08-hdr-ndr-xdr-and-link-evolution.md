---
title: Chapter 08 — HDR, NDR, XDR, and Link Evolution
description: Understand InfiniBand link generations, signaling, lane width, effective bandwidth, compatibility, and upgrade planning.
sidebar_position: 9
tags: [infiniband, hdr, ndr, xdr, link-speed]
---

# HDR, NDR, XDR, and Link Evolution

## Introduction

Fabric generations are often reduced to a single speed label. That is dangerous. Delivered performance depends on signaling rate, encoding overhead, lane width, cable quality, adapter capability, switch capability, PCIe attachment, message size, and software behavior.

HDR, NDR, and XDR describe successive InfiniBand generations, but architecture decisions should focus on usable end-to-end bandwidth and lifecycle compatibility rather than headline numbers.

| Chapter field | Value |
|---|---|
| Volume | 08 — InfiniBand |
| Difficulty | Advanced |
| Estimated reading time | 45–60 minutes |
| Primary focus | Link generations and upgrades |
| Previous | Adaptive Routing and Congestion Control |
| Next | Fabric Monitoring and Telemetry |

## Story: The 400-Gigabit Upgrade That Delivered Half the Expected Gain

A customer replaces HCAs and switches with a newer generation. Link status reports the expected rate. Application throughput improves only modestly.

The review finds three constraints:

- the host PCIe path cannot sustain the new injection rate;
- several links negotiated reduced width after recabling;
- the collective workload is limited by a cross-rack cut that was not upgraded.

The fabric generation changed, but the bottleneck moved elsewhere.

> A faster link improves only the path segment that was limiting performance.

## Learning Objectives

After completing this chapter, you will be able to:

- distinguish signaling rate from payload throughput;
- explain lane width and negotiated link state;
- compare HDR, NDR, and XDR as architectural generations;
- identify host and topology limits that mask link upgrades;
- plan mixed-generation interoperability;
- define upgrade validation and rollback;
- troubleshoot reduced rate or width;
- explain generation choices to customers without marketing language.

## Big Picture

```mermaid
flowchart LR
    HCA[HCA Port] -->|"lane 1"| L1[Lane 1]
    HCA -->|"lane 2"| L2[Lane 2]
    HCA -->|"lane 3"| L3[Lane 3]
    HCA -->|"lane 4"| L4[Lane 4]
    L1 & L2 & L3 & L4 --> SW[Switch Port]
    SW --> PCIe["Host PCIe path<br/>(separate ceiling)"]

    Sym["Upgraded generation,<br/>throughput barely moved"] --> Q1{"ibstat Rate matches new<br/>generation's designed value?"}
    Q1 -->|No| A1["Negotiation problem: cable/firmware<br/>not qualified for new rate"]
    Q1 -->|Yes| Q2{"iblinkinfo width == designed<br/>lane count (e.g. 4x)?"}
    Q2 -->|"Reduced, e.g. 2x"| A2["Lane qualification failure --<br/>half the physical lanes down"]
    Q2 -->|"Full width"| Q3{"Does host-memory ib_write_bw<br/>hit the new link's rate?"}
    Q3 -->|"No -- capped below link rate"| A3["Bottleneck moved to PCIe/NUMA/<br/>host injection -- link upgrade<br/>exposed a DIFFERENT ceiling"]
    Q3 -->|"Yes -- link-rate achieved"| A4["Link is fine -- bottleneck is<br/>topology/oversubscription (Ch.6)<br/>or the app's comm fraction"]
```

**Figure 8.8.0 — A "link generation" is really four independent ceilings stacked in series, and the diagram's decision path is the direct mechanism behind this chapter's opening story.** Rate, width, host injection (PCIe/NUMA), and topology are each a separate checkpoint that can silently cap delivered bandwidth even when every other checkpoint passed — which is exactly how a generation upgrade can pass every negotiation check and still deliver "only modestly" improved application throughput.

## Link Rate, Width, and Effective Throughput

A physical link combines one or more lanes. Effective throughput depends on:

```text
effective payload bandwidth
≈ signaling rate × active lanes × encoding efficiency × protocol efficiency
```

This is a conceptual relationship, not a substitute for platform-specific specifications.

A port can be:

- physically connected but down;
- active at a lower speed;
- active at reduced width;
- active and error-free but limited by PCIe;
- fully negotiated but congested elsewhere.

## Generational View

| Generation | Architectural significance | Validation focus |
|---|---|---|
| HDR | Higher aggregate link capacity and mature large-cluster deployment | lane state, cable support, host injection |
| NDR | Higher per-port bandwidth and denser fabrics | PCIe generation, switch radix, thermal and cable design |
| XDR | Further bandwidth scaling and next-generation fabric design | end-to-end platform qualification and lifecycle planning |

Exact capabilities vary by product and implementation. Always verify the current platform documentation.

## Lane Width

A nominally high-speed port may use multiple lanes. If one or more lanes fail qualification, the link may negotiate a narrower width or fail to become active.

```mermaid
flowchart LR
    HCA[HCA Port]
    L1[Lane 1]
    L2[Lane 2]
    L3[Lane 3]
    L4[Lane 4]
    SW[Switch Port]

    HCA --> L1 --> SW
    HCA --> L2 --> SW
    HCA --> L3 --> SW
    HCA --> L4 --> SW
```

**Figure 8.8.1 — A logical link may depend on several physical lanes.** Reduced width preserves reachability in some cases while lowering capacity.

### Annotated `iblinkinfo`: reading rate and width together, with a worked number

```text
$ iblinkinfo -S <switch-guid>
   Switch: 0x506b4b0300a1c210:
       3    1[  ] ==( 4X   400 Gbps Active/  LinkUp)==>       12    1[  ] "node-a hca" ( )
       4    1[  ] ==( 2X   400 Gbps Active/  LinkUp)==>       15    1[  ] "node-b hca" ( )
```

Port 3 shows `4X 400 Gbps` — full designed width and rate, meaning all four lanes qualified and negotiated at the target signaling rate. Port 4 shows `2X 400 Gbps` — the *rate label* is unchanged, but width has collapsed from 4 lanes to 2. Naively reading "400 Gbps" from both lines suggests both ports are identical; they are not. Effective throughput on port 4 is proportional to active lane count, so approximately: `400 Gbps (per-lane-scaled label) × (2 active lanes / 4 designed lanes) ≈ half the designed payload bandwidth of port 3`, even though both report `Active` and the same headline rate string. This is precisely why the chapter's `effective payload bandwidth ≈ signaling rate × active lanes × encoding efficiency × protocol efficiency` formula requires reading width as a first-class field, not a footnote to rate.

## Encoding and Protocol Overhead

Wire rate is not application payload rate. Capacity is consumed by:

- line encoding;
- link and transport headers;
- integrity checks;
- acknowledgments and control traffic;
- idle or flow-control behavior;
- message segmentation;
- software and DMA overhead.

Benchmark results should therefore be compared with realistic efficiency ranges, not the raw signaling number.

## Host Injection Limits

The HCA reaches memory through the host I/O topology. A faster fabric link can expose limitations in:

- PCIe generation and width;
- CPU root-complex placement;
- NUMA locality;
- GPU-to-HCA peer path;
- memory registration and buffer reuse;
- HCA queue configuration;
- CPU progress or polling capacity.

```mermaid
flowchart LR
    GPU[GPU HBM] <--> PCIE[PCIe Fabric] <--> HCA[InfiniBand HCA] <--> IB[IB Link]
```

The end-to-end path cannot exceed its narrowest sustained segment.

## Switch Radix and Fabric Density

Higher-speed generations may also change switch radix, port density, cable choices, and rack design. Architecture trade-offs include:

- fewer switches versus larger failure domains;
- fewer cables versus higher per-port concentration;
- power and cooling density;
- serviceability;
- spare strategy;
- growth increments.

## Mixed-Generation Fabrics

Mixed generations may interoperate at a mutually supported rate, depending on product and cable support. Operational risks include:

- silent down-negotiation;
- asymmetric endpoint capability;
- inconsistent firmware;
- unexpected route preference;
- reduced-width fallback;
- confusing inventory.

Document expected negotiated state for every link class.

## Upgrade Planning

A safe upgrade plan includes:

1. baseline current application and component performance;
2. verify hardware and firmware compatibility;
3. model host and topology bottlenecks;
4. stage a representative pilot path;
5. test link negotiation and error counters;
6. run host-memory and GPU-memory benchmarks;
7. test collectives under concurrency;
8. validate failure and rollback;
9. update inventory and monitoring thresholds;
10. expand in controlled phases.

## Cabling and Signal Integrity

As link rates increase, cable and connector quality become more demanding. Track:

- cable type and supported reach;
- part number and serial number;
- bend radius and routing;
- transceiver temperature;
- port and lane error counters;
- replacement history.

A cable that worked at an older generation may not qualify at a newer rate.

## Production Troubleshooting

### Scenario 1 — Link active at lower speed

**Symptoms**

- port is active;
- negotiated rate is below design;
- application bandwidth is reduced.

**Diagnosis**

Compare both endpoints, cable support, firmware, configured rate, and physical counters.

**Resolution**

Restore a supported endpoint/cable/firmware combination and verify stable negotiation.

**Evidence.** `ibstat` and `iblinkinfo` compared side by side, plus the arithmetic consequence:

```text
$ ibstat mlx5_1 | grep -E 'State|Rate'
        State: Active
        Rate: 200
```

`Rate: 200` on a port designed and licensed for a 400Gb/s-class generation is a clean, unambiguous negotiation shortfall — not a width issue (that would show full rate label at reduced lane count in `iblinkinfo` instead). At 200Gb/s versus a 400Gb/s design target, a 2MiB RDMA write that should take roughly 2MiB × 8 / 400Gb/s ≈ 42us now takes roughly 2MiB × 8 / 200Gb/s ≈ 84us — a 2x latency-per-message cost that compounds across every message a synchronized job sends on this path.

### Scenario 2 — Correct speed, reduced width

**Symptoms**

- speed label appears correct;
- width is narrower;
- throughput is proportionally lower.

**Likely cause**

One or more lanes failed qualification.

**Resolution**

Isolate cable, connector, port, or adapter by controlled substitution and counter comparison.

**Evidence.** This is precisely the `iblinkinfo` `2X 400 Gbps` example above — the rate label reads correctly while width silently halves. The confirming step is a host-memory `ib_write_bw` result compared against a full-width sibling port: if the reduced-width port's `BW average` lands at roughly half of the full-width port's, that's arithmetic confirmation, not just a suspicion, that lane count — not routing or congestion — is the limiting factor.

### Scenario 3 — Microbenchmark improves, application does not

**Diagnosis**

Check collective topology, PCIe, GPU locality, oversubscription, storage traffic, and synchronization.

**Root cause**

The upgraded link was not the application bottleneck.

### Scenario 4 — Mixed-generation rack behaves inconsistently

**Diagnosis**

Inventory negotiated rate and width for every link. Compare route placement and endpoint capabilities.

## Customer Scenario

A customer asks whether moving from NDR to XDR will double training throughput.

The architect explains that the answer depends on the communication fraction of step time, current link utilization, host injection, collective efficiency, and fabric cuts. A benchmark and scaling model are required before predicting business value.

## Interview Preparation

1. Why is wire rate higher than payload throughput?
   **Model answer:** "The signaling rate is what the wire physically carries, but line encoding, transport and link headers, integrity checks, acknowledgments, and flow-control overhead all consume part of that capacity before application payload ever gets counted. I always treat the headline generation number as a ceiling, not a promise — realistic payload throughput is meaningfully below it, and benchmark results should be read against that realistic range, not the raw signaling figure."

2. How can a link be active but degraded?
   **Model answer:** "`Active` only proves the port passed physical negotiation and subnet-manager admission — it doesn't say the negotiated rate or width matches the design. I've seen `ibstat` show `Active` at half the designed rate, and `iblinkinfo` show `Active` at half the designed lane width, with the rate label itself looking correct in the second case. Both are fully 'active' by the state field alone."

3. What host limits can hide a fabric upgrade?
   **Model answer:** "PCIe generation and width on the HCA's slot, CPU root-complex and NUMA placement, the GPU-to-HCA peer path if it's a GPU-heavy workload, and even memory registration/buffer-reuse patterns in the application. A 400G-class HCA sitting in a PCIe Gen4 x8 slot is capped well below its wire-rate potential regardless of what the fabric side negotiates — the upgrade doesn't fail, it just stops being the bottleneck and hands that role to something you didn't upgrade."

4. How would you validate a mixed-generation fabric?
   **Model answer:** "I'd inventory every link's expected negotiated state by generation class first, then verify actual state against that expectation port by port rather than sampling. Mixed generations interoperate at the lower mutually-supported rate, which is fine if intentional and documented, but a silent down-negotiation on a link everyone assumed was full-generation is exactly the kind of drift that only shows up if you check systematically."

5. Why should application scaling be measured before buying faster links?
   **Model answer:** "Because a faster link only helps the specific segment of the path that was actually the bottleneck. If the real limiter is host injection, topology oversubscription, or the workload's communication fraction is just small relative to compute, a generation upgrade can pass every negotiation check and still deliver a disappointing throughput gain — which is exactly this chapter's opening story. I'd want a scaling model and a baseline benchmark before recommending spend on a faster fabric generation, not after."

## Summary

InfiniBand generations increase available link capacity, but delivered value depends on lane health, encoding efficiency, host injection, topology, and workload communication behavior.

Treat generation upgrades as end-to-end architecture changes. Baseline, pilot, validate, observe, and roll out in phases.

## Key Takeaways

- Speed and width must both be verified.
- Wire rate is not payload rate.
- Faster links can expose PCIe and topology bottlenecks.
- Mixed generations require explicit expected-state inventory.
- Cable qualification becomes more important at higher rates.
- Application improvement must be measured, not assumed.

## Cross References

- Previous: [Adaptive Routing and Congestion Control](./chapter-07-adaptive-routing-and-congestion-control)
- Next: [Fabric Monitoring and Telemetry](./chapter-09-fabric-monitoring-and-telemetry)
- Related lab: [Benchmark InfiniBand Bandwidth and Latency](./labs/lab-02-benchmark-infiniband-bandwidth-and-latency)

## Further Reading

Use current product specifications and compatibility matrices for the exact HCA, switch, cable, firmware, and platform generation under evaluation.