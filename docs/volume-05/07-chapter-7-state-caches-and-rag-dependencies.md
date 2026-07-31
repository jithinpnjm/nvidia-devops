---
title: "Chapter 7 - State, caches and RAG dependencies"
slug: "chapter-7-state-caches-and-rag-dependencies"
sidebar_position: 7
description: "Chapter 7 - State, caches and RAG dependencies — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Classify durable state, request state, model artifacts, vector data and caches so replicas can scale safely.


Keep application compute stateless when practical, but do not confuse “stateless service” with “no state in the system.” Conversation history, vector indexes, model artifacts, prompt/result caches and KV-cache have different durability/locality requirements. Make each explicit.

## Practitioner lens


<!-- source-table:2 -->

> Sagar Desai: decouple conversational state from Pod lifetime A public architecture example argues against relying on local in-process history/sticky sessions for horizontally scaled Kubernetes LLM services. The general lesson is to externalize durable session state while treating local caches as disposable acceleration.


[Public source](https://www.linkedin.com/posts/sagar-s-desai_systemdesign-llm-kubernetes-activity-7414861928189370368-hiHp)


<!-- source-table:3 -->

| State | Typical property |
| --- | --- |
| Model artifact | versioned, large, read-mostly; startup distribution matters |
| Conversation/session | durable across replica changes; low-latency access |
| Vector index | persistent/search optimized; update/query behavior |
| KV cache | request/runtime-local performance state; large GPU memory footprint |
| Prompt/result cache | optional performance/cost optimization with invalidation/privacy concerns |
