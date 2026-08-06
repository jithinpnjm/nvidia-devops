---
title: Chapter 06 — NeMo Guardrails and Enterprise Controls
description: Place conversational controls, policies, validation, and observability around enterprise AI applications.
sidebar_position: 7
tags: [nemo-guardrails, security, governance]
---

# NeMo Guardrails and Enterprise Controls

An enterprise AI application must control more than model execution. It may need input policy, output policy, topic controls, tool-use restrictions, auditability, and failure behavior.

## Control Path

```mermaid
flowchart LR
    User[User]
    Input[Input Controls]
    Model[Model and Retrieval]
    Tools[Approved Tools]
    Output[Output Controls]
    Audit[Audit and Telemetry]

    User --> Input --> Model
    Model --> Tools
    Tools --> Model --> Output --> User
    Input --> Audit
    Model --> Audit
    Output --> Audit
```

## Engineering Trade-offs

Controls add latency, dependencies, and policy maintenance. They should be measurable, versioned, tested, and designed to fail safely.

## Security Boundary

Guardrails complement identity, authorization, data controls, network segmentation, and application security. They do not replace them.

## Troubleshooting

If safe requests are rejected, inspect policy version, context, classifier or rule outcome, downstream tool permissions, and trace data.
