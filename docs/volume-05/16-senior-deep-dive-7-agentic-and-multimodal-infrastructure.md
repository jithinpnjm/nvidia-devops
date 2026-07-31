---
title: "Senior Deep Dive 7 — Agentic and multimodal infrastructure"
slug: "senior-deep-dive-7-agentic-and-multimodal-infrastructure"
sidebar_position: 16
description: "Senior Deep Dive 7 — Agentic and multimodal infrastructure — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
Agentic workloads can turn one user request into many model calls, tool calls and retrieval steps. Capacity planning must reason about amplification: requests per user action, token distribution, tool latency, retry behavior and maximum loop depth. A service that is safe at 100 user requests/s can overwhelm model endpoints if each request fans out into ten model calls. Add budgets, concurrency controls and trace-level observability.
