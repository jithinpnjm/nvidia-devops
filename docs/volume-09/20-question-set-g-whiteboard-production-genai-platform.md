---
title: "Chapter 20 — Production GenAI platform whiteboard"
slug: "question-set-g-whiteboard-production-genai-platform"
sidebar_position: 20
description: "Chapter 20 — Production GenAI platform whiteboard — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
Whiteboard from requirements outward: client/gateway -> auth/rate limits -> model routing -> serving runtime -> GPU scheduling -> compute topology -> network/storage -> observability -> lifecycle/CI/CD -> failure domains. Ask about model count, prompt/output distribution, concurrency, data residency, availability and cost. Then choose components. A diagram that begins with "NIM" or "Kubernetes" before requirements is backwards.

## Worked explanation and practice

**Diagram: this question set's build order in box form (draw left to right, live, in this sequence):**
```mermaid
flowchart LR
  %% Converted from the original ASCII diagram; source wording is preserved.
  n0["DISCOVER: model count · prompt/output distribution · concurrency ·"]
  n1["data residency · availability · cost"]
  n2["client/gateway"]
  n3["auth/rate limits"]
  n4["model routing"]
  n5["serving runtime"]
  n6["GPU scheduling"]
  n7["compute topology"]
  n8["network/storage"]
  n9["observability"]
  n10["lifecycle/CI-CD"]
  n11["failure domains"]
  n12["COMPARE 2-3 options on weighted dimensions"]
  n13["RECOMMEND"]
  n14["define"]
  n15["the PoC that must validate it before commit"]
  n2 --> n3
  n3 --> n4
  n4 --> n5
  n6 --> n7
  n7 --> n8
  n9 --> n10
  n10 --> n11
  n12 --> n13
  n13 --> n14
```
A diagram that starts with "NIM" or "Kubernetes" instead of the DISCOVER row above is exactly the anti-pattern this question set warns against.

**Extra worked scenario (new) — the whiteboard method applied to Question set G's production GenAI platform, end-to-end:**
> **Prompt:** "Whiteboard a production GenAI platform serving 3 different model sizes to external customers."
> 1. **Discover:** how many distinct models, expected prompt/output token distribution per model, expected concurrency, any data residency requirement (customer data must stay in-region?), required availability (single-region ok, or multi-region failover?), cost sensitivity.
> 2. **Draw left to right:** client → API gateway (auth, per-customer rate limits) → model router (which model does this request need — by explicit selection or classification) → serving runtime (NIM/Triton/vLLM per model, chosen only now, after the shape is clear) → GPU scheduling layer (Kubernetes with device plugin/MIG, sized per Chapter 6's formula) → compute topology (does the largest model need multi-GPU tensor parallelism, hence NVLink locality) → network/storage (model weight storage/loading path, KV-cache/session state if any) → observability (per-model TTFT/ITL dashboards, GPU util/Xid alerting) → lifecycle/CI-CD (model version rollout without downtime — canary a new model version behind the router) → failure domains (one model's GPU pool failing shouldn't take down the other two).
> 3. **Compare options** on 2-3 weighted dimensions relevant to what discovery revealed — e.g., if data residency is strict, self-hosted NIM/Triton beats a hosted API regardless of other factors; state that dimension as the deciding one explicitly.
> 4. **Recommend + validate:** name the recommendation, then state the PoC: load-test each model's serving path independently at expected peak concurrency, and validate the router's failure isolation by deliberately failing one model's pool and confirming the other two are unaffected.
> **Interview-ready line:** "The requirements determine whether this ends up being three separate small deployments or one shared router in front of a multi-model serving layer — I wouldn't draw the router box until I know whether these models actually need to share infrastructure or just share a brand."
