---
title: "Senior Deep Dive 5 — Inference observability: TTFT, ITL/TPOT and saturation"
slug: "senior-deep-dive-5-inference-observability-ttft-itl-tpot-and-saturation"
sidebar_position: 16
description: "Senior Deep Dive 5 — Inference observability: TTFT, ITL/TPOT and saturation — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
![](pathname:///img/generated/volume-07-03.png)

_Figure B. End-to-end latency hides several different scaling pressures._

NVIDIA NIM benchmarking documentation defines TTFT as request submission to first received token. TTFT includes queueing, prefill and network components. ITL/TPOT focuses on the decode token cadence. A system can have excellent average tokens/s but unacceptable TTFT because queueing is saturated. Report distributions and workload shape, not only averages.


<!-- source-table:1 -->

| Symptom | Likely bottleneck families | Evidence |
| --- | --- | --- |
| TTFT rises, ITL stable | queue/prefill/model load/router | queue depth, input length, prefill workers, cache hit |
| ITL worsens with concurrency | decode/KV/memory bandwidth | active sequences, KV usage, GPU memory BW proxies |
| Both worsen on selected nodes | GPU/fabric/CPU/storage node issue | DCGM, topology, CPU PSI, RDMA counters |
| Latency fine, cost/token high | low batching/utilization/oversizing | tokens/s/GPU, batch occupancy, request mix |
