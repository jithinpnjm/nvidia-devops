---
title: "Chapter 7 - Traces and distributed latency"
slug: "chapter-7-traces-and-distributed-latency"
sidebar_position: 7
description: "Chapter 7 - Traces and distributed latency — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Use spans to decompose request latency across gateway, queue, model server and dependencies.


A trace connects causal work across services. For inference, spans can separate gateway/auth, queueing, retrieval, model prefill/decode, external tool calls and state-store latency. Tracing is most valuable when services propagate context consistently and span attributes are bounded/meaningful.
