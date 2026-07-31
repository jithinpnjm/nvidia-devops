---
title: "Senior Deep Dive 7 — Communicate at three levels"
slug: "senior-deep-dive-7-communicate-at-three-levels"
sidebar_position: 17
description: "Senior Deep Dive 7 — Communicate at three levels — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
With engineers, show data paths, failure modes and commands. With platform leaders, show operational ownership, SLOs, lifecycle and adoption. With executives, show business outcome, risk, cost and decision. The architecture is the same; the representation changes. A strong SA can move between these levels without contradicting the technical model.

## Senior addendum

➕ **Cross-reference:** this is Chapter 10's four-audience ladder (operator/platform lead/engineering director/executive) collapsed to three altitudes (engineer/platform leader/executive) — same mechanism, same "outcome → one mechanism layer → recommendation" structure, same consistency requirement. Re-read Chapter 10's worked MIG/ECC four-way example rather than re-deriving a three-way version here; the method doesn't change between 3 and 4 audience buckets, only the number of altitude stops.

➕ **Diagram: the same architecture fact, three altitudes:**
```
SAME underlying architecture fact, three altitudes:

Engineer          ──▶ data paths, failure modes, exact commands
Platform leader   ──▶ operational ownership, SLOs, lifecycle, adoption
Executive         ──▶ business outcome, risk, cost, decision

All three: outcome first → one altitude-appropriate mechanism layer →
recommendation. Zero contradictions allowed between altitudes — the
same consistency bar Chapter 10 sets for four audiences, applied to three.
```
