---
title: Chapter 06 — Comparing MIG, Time-Slicing, and vGPU
description: Select a GPU sharing model by isolation, workload, platform, and lifecycle requirements.
sidebar_position: 7
tags: [mig, time-slicing, vgpu]
---

# Comparing MIG, Time-Slicing, and vGPU

The correct sharing model emerges from requirements, not product preference.

| Dimension | MIG | Time-slicing | vGPU |
|---|---|---|---|
| Primary boundary | Hardware partition | Process access scheduling | Virtual machine |
| Memory isolation | Stronger, profile-defined | Shared | Profile and virtualization dependent |
| Performance predictability | Higher | Lower | Profile and platform dependent |
| Kubernetes fit | Strong | Strong for best-effort access | Usually through virtualization layer |
| Reconfiguration | Profile layout change | Replica configuration | VM/profile lifecycle |
| Best fit | Predictable partitions | Bursty best-effort workloads | VM-centric enterprise environments |

## Decision Process

1. Define the tenant trust boundary.
2. Define latency and throughput SLOs.
3. Measure memory and compute demand.
4. Identify the infrastructure control plane.
5. Determine upgrade and support ownership.
6. Benchmark under realistic concurrency.

## Anti-Pattern

Using one mechanism cluster-wide simplifies documentation but often produces poor outcomes. A mature platform commonly uses several pools with different guarantees.

## Customer Scenario

A university needs many student notebooks, a research team needs predictable medium-size inference, and a regulated department requires VM isolation. The correct architecture may combine time-slicing, MIG, and vGPU instead of forcing one model onto all users.

## Interview Questions

- Which model provides the strongest device-level partitioning?
- Why is time-slicing not equivalent to MIG?
- When is whole-GPU allocation still the correct answer?
