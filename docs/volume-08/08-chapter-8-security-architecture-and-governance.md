---
title: "Chapter 8 - Security architecture and governance"
slug: "chapter-8-security-architecture-and-governance"
sidebar_position: 8
description: "Chapter 8 - Security architecture and governance — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Map identities, trust boundaries, data/model flows and administrative planes.


Start with identities: human admin, developer, CI/CD, workload, model-serving client. Map what each can access: Kubernetes API, cloud APIs, registries, model artifacts, prompts/data, GPUs and observability. Separate control-plane and data-plane network paths. Define secrets, image/model provenance and audit requirements.

For shared GPUs, tenancy and data isolation requirements may change resource-sharing strategy. For AI services, logs/traces may contain prompts or retrieved data, so observability design is part of privacy/security architecture.
