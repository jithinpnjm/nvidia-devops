---
title: "Question set C — Kubernetes platform depth"
slug: "question-set-c-kubernetes-platform-depth"
sidebar_position: 16
description: "Question set C — Kubernetes platform depth — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

| Prompt | Expected reasoning |
| --- | --- |
| Pod Pending on GPU cluster | scheduler event -> requests/DRA -> affinity/taint -> topology -> capacity/autoscaler |
| Service reachable from some Pods only | EndpointSlice, DNS, policy, CNI route, node-specific dataplane |
| Node Ready but GPU unavailable | host driver -> operator operands -> device plugin/DRA -> allocatable -> runtime injection |
| Deployment rollout stuck | new ReplicaSet, readiness/startup, capacity, PDB/maxSurge, image/config, events |
| Control plane writes slow | apiserver latency, admission webhooks/policies, etcd latency/quorum |
