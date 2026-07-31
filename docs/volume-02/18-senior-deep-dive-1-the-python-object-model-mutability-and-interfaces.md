---
title: "Senior Deep Dive 1 — The Python object model, mutability and interfaces"
slug: "senior-deep-dive-1-the-python-object-model-mutability-and-interfaces"
sidebar_position: 18
description: "Senior Deep Dive 1 — The Python object model, mutability and interfaces — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
Senior Python does not mean clever syntax. It means predictable behavior under change. Names refer to objects; mutation changes an object in place; assignment changes a binding; default arguments are evaluated once; iterators are stateful; exceptions are part of the API contract. These details matter because infrastructure tools often manipulate shared configuration, cached API responses and mutable state across many functions.

**Use immutable value objects where accidental mutation would be dangerous**

from dataclasses import dataclass, field
from typing import Mapping

@dataclass(frozen=True, slots=True)
class Node:
    name: str
    labels: Mapping\[str, str\]
    allocatable\_gpus: int

@dataclass(slots=True)
class FleetReport:
    nodes: list\[Node\] = field(default\_factory=list)

    @property
    def total\_gpus(self) -> int:
        return sum(n.allocatable\_gpus for n in self.nodes)

Dataclasses are useful when a tool has domain objects such as Node, GPU, Incident or Deployment. Composition usually produces clearer infrastructure code than deep inheritance: an ApiClient owns a RetryPolicy and AuthProvider; a ClusterInspector owns clients for Kubernetes, Prometheus and DCGM. Each piece can be replaced in a test.
