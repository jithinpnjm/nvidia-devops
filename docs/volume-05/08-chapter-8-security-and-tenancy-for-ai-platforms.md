---
title: "Chapter 8 - Security and tenancy for AI platforms"
slug: "chapter-8-security-and-tenancy-for-ai-platforms"
sidebar_position: 8
description: "Chapter 8 - Security and tenancy for AI platforms — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Apply familiar platform security controls to models, prompts, data, artifacts and shared GPUs.


AI infrastructure inherits cloud-native security requirements—identity, RBAC, network segmentation, secrets, image provenance, runtime hardening—and adds model/data supply chain concerns. Ask who can deploy models, pull artifacts, access prompts/data, call inference endpoints, use expensive GPU quota and read logs containing sensitive content.

GPU sharing also becomes a tenancy decision: cost-efficient packing is not enough if isolation requirements demand dedicated resources or hardware partitioning. Logging/telemetry must avoid leaking prompts, tokens or secrets by default.
