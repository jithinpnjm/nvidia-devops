---
title: "Chapter 5 - Autoscaling inference"
slug: "chapter-5-autoscaling-inference"
sidebar_position: 5
description: "Chapter 5 - Autoscaling inference — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Choose signals that represent demand and saturation, then account for model-load time, GPU granularity and cold capacity.


CPU utilization is often weakly correlated with GPU inference demand. Candidate scaling inputs include request concurrency, queue depth/duration, TTFT/latency, requests/s and tokens/s. GPU utilization/memory help determine whether a replica can safely take more load and whether memory is the limiting resource. The correct signal depends on the server and SLO.

## Practitioner lens


<!-- source-table:2 -->

> Sagar Desai: hardware metrics and service metrics answer different questions A public post contrasts DCGM metrics (hardware behavior/health) with model-server traffic/queue metrics for scaling decisions. Use that split as a diagnostic framework: demand is not the same thing as device busy percentage.


[Public source](https://www.linkedin.com/posts/sagar-s-desai_kubernetes-gpu-nvidia-activity-7413160079337684992-fOZI)

## Worked scenario


<!-- source-table:3 -->

> Situation GPU utilization sits at 95%, but P95 latency is within SLO and queue depth is near zero.


**1\. Do not scale solely because device utilization looks high.**

2\. Check concurrency, queue duration, TTFT/TPOT and error rate to determine service saturation.

3\. Check headroom for traffic bursts/failures and memory capacity.

4\. If unit economics matter, high utilization with healthy SLO may be desirable.

5\. Scale when the chosen saturation/demand signal predicts SLO risk, not on a universal utilization threshold.


<!-- source-table:4 -->

> Conclusion A busy GPU can be an efficient GPU; saturation is defined relative to service outcomes.
