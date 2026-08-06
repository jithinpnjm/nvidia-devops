---
title: Chapter 07 — NGC Catalog, Containers, and Artifacts
description: Govern NGC images, models, Helm charts, signatures, mirrors, and supply-chain controls.
sidebar_position: 8
tags: [ngc, containers, supply-chain]
---

# NGC Catalog, Containers, and Artifacts

NGC distributes containers, models, charts, and related artifacts. Production use requires artifact governance.

## Artifact Lifecycle

```mermaid
flowchart LR
    Catalog[NGC Catalog]
    Approve[Security and License Review]
    Mirror[Enterprise Registry or Cache]
    Pin[Digest and Version Pinning]
    Scan[Scanning and Attestation]
    Deploy[Controlled Deployment]
    Retain[Retention and Rollback]

    Catalog --> Approve --> Mirror --> Pin --> Scan --> Deploy --> Retain
```

## Production Principles

- never rely on a mutable tag alone;
- mirror critical artifacts for availability;
- record digest and provenance;
- scan within enterprise policy;
- preserve rollback versions;
- control credentials and egress;
- document model and container licenses.

## Troubleshooting

Image-pull or model-download failures may come from entitlement, expired credentials, proxy policy, registry trust, DNS, storage, or rate limits. Preserve the exact artifact reference and error.
