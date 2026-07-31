---
title: "Senior Deep Dive 3 — Capacity and TCO: convert SLO into resources"
slug: "senior-deep-dive-3-capacity-and-tco-convert-slo-into-resources"
sidebar_position: 13
description: "Senior Deep Dive 3 — Capacity and TCO: convert SLO into resources — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
Sizing begins with a measured throughput/latency point for a specific model, engine, precision, hardware and traffic distribution. Then account for peak load, headroom, failure capacity, maintenance, model replicas, load time and utilization. TCO includes GPU hours, CPU/RAM, storage, network, licenses, operator effort, idle capacity and cost of SLO misses. Avoid quoting theoretical GPU peak performance as application capacity.

For shared platforms, utilization is a portfolio problem. MIG, fractional scheduling, queueing, reservations, priorities and autoscaling change both efficiency and predictability. The customer conversation should make the trade explicit: highest utilization can conflict with deterministic latency or isolation.
