---
title: "Chapter 17 — Communicate at three levels"
slug: "senior-deep-dive-7-communicate-at-three-levels"
sidebar_position: 17
description: "Chapter 7 — Communicate at three levels — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
With engineers, show data paths, failure modes and commands. With platform leaders, show operational ownership, SLOs, lifecycle and adoption. With executives, show business outcome, risk, cost and decision. The architecture is the same; the representation changes. A strong SA can move between these levels without contradicting the technical model.

## Build from the normal path


**Diagram: the same architecture fact, three altitudes:**
```mermaid
flowchart LR
    A["SAME underlying architecture fact"] --> B["Engineer: data paths,\nfailure modes, exact commands"]
    A --> C["Platform leader: operational ownership,\nSLOs, lifecycle, adoption"]
    A --> D["Executive: business outcome,\nrisk, cost, decision"]
```
All three: outcome first, then one altitude-appropriate mechanism layer, then recommendation. Zero contradictions allowed between altitudes — the same consistency bar Chapter 10 sets for four audiences, applied to three.

### Worked example: recurring GPU-node failures

The shared fact is: two nodes produced repeated uncorrectable GPU errors after a driver rollout, jobs were rescheduled, and the canary policy prevented wider deployment.

- **Engineer:** “Xid and DCGM evidence is isolated to two canary nodes. Drain them, preserve diagnostics, compare firmware/driver state with a known-good node, then run the admission test before returning either node.”
- **Platform leader:** “The canary contained the blast radius, but the admission gate did not catch this error class. Pause the rollout, add the failing health signal to the gate, and track lost GPU-hours and recovery time.”
- **Executive:** “The staged rollout prevented a fleet-wide interruption. Delay the remaining deployment while engineering validates the compatibility issue; the cost is a short schedule slip rather than broad training downtime.”

The facts, uncertainty and recommendation stay consistent. Only the mechanism depth and decision horizon change. Before presenting, write one sentence each for evidence, user impact, uncertainty, recommendation and owner; derive every audience version from those five sentences.
