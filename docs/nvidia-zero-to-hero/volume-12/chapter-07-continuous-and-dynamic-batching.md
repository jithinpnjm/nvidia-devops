---
title: Chapter 07 — Continuous and Dynamic Batching
description: Balance queue delay, batch efficiency, fairness, and tail latency in production inference.
sidebar_position: 8
tags: [batching, scheduling, inference]
---

# Continuous and Dynamic Batching

Batching combines requests so the GPU performs more useful work per launch. The gain comes with queue delay and fairness decisions.

## Dynamic Batching

Dynamic batching waits briefly for compatible requests, forms a batch, and executes it. It is effective for models with similar-shaped requests and bounded latency budgets.

## Continuous Batching

Continuous batching admits and retires sequences over time rather than waiting for an entire static batch to finish. This is valuable for LLM requests with variable output lengths.

## Trade-off Curve

```mermaid
flowchart LR
    Low[Low queue delay]
    Medium[Moderate batching]
    High[Large batches]
    Latency[Higher tail latency]
    Throughput[Higher throughput]

    Low --> Medium --> High
    Medium --> Throughput
    High --> Latency
```

## Fairness

Long prompts or generations can monopolize memory and scheduler attention. Production systems need admission limits, request classes, and cancellation behavior.

## Troubleshooting

**Symptom:** throughput rises while p99 latency worsens.

**Resolution:** reduce maximum queue delay, separate request classes, cap context or output length, and tune concurrency against memory.
