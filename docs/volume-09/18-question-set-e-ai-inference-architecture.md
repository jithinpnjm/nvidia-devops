---
title: "Question set E — AI inference architecture"
slug: "question-set-e-ai-inference-architecture"
sidebar_position: 18
description: "Question set E — AI inference architecture — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

| Prompt | Expected reasoning |
| --- | --- |
| TTFT high, ITL normal | queue/prefill/input length/model load/cache routing |
| ITL high under concurrency | decode/KV/memory pressure/batching |
| When disaggregate prefill/decode? | different resource shapes + fast KV transfer + measured benefit |
| Round-robin vs KV-aware routing | cache reuse/load balance/worker state/failure complexity |
| Scale on what metric? | queue/tokens/SLO/engine state, warmup/model load, GPU scarcity |
