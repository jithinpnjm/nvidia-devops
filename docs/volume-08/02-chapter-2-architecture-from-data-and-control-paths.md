---
title: "Chapter 2 - Architecture from data and control paths"
slug: "chapter-2-architecture-from-data-and-control-paths"
sidebar_position: 2
description: "Chapter 2 - Architecture from data and control paths — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Draw what moves, what controls it, where state lives and where failure can occur before choosing products.


For an AI platform, draw at least: user/API request path, model/artifact path, training dataset/checkpoint path, GPU scheduling/control path, observability path and identity/security boundaries. This exposes dependencies that a product-box diagram hides.

A control plane tells systems what should happen; a data plane carries workload traffic/data. Kubernetes API/controller behavior is control plane; inference requests and model data are data plane. Keeping this distinction clear helps with security, scaling and failure-domain reasoning.
