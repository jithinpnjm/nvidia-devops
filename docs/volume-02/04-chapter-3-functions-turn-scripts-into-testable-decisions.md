---
title: "Chapter 3 - Functions: turn scripts into testable decisions"
slug: "chapter-3-functions-turn-scripts-into-testable-decisions"
sidebar_position: 4
description: "Chapter 3 - Functions: turn scripts into testable decisions — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Separate computation from side effects and design functions with explicit inputs, outputs, and failure semantics.

A production script becomes maintainable when the decision logic can be executed without the production environment. The easiest route is to separate pure computation from side effects such as reading files, calling APIs, printing, mutating remote systems, and executing subprocesses.

**Pure decision function: easy to reason about and easy to test**
```python
from dataclasses import dataclass

@dataclass(frozen=True)
class NodeUsage:
    name: str
    cpu_pct: float
    memory_pct: float

def classify_node(usage: NodeUsage) -> str:
    if usage.memory_pct >= 95:
        return "critical"
    if usage.cpu_pct >= 85 or usage.memory_pct >= 85:
        return "warning"
    return "healthy"
```
```python
def report(nodes: list[NodeUsage]) -> dict[str, list[str]]:
    result = {"healthy": [], "warning": [], "critical": []}
    for node in nodes:
        result[classify_node(node)].append(node.name)
    return result
```
Notice that report() does not call kubectl or the cloud API. Another adapter can obtain raw data, convert it to NodeUsage values, call report(), then format output. The core logic is deterministic. This design directly improves unit testing and incident confidence.

**Common production bug:** Avoid mutable default arguments such as `def add_tag(tag, tags=[])`. That list is created once when the function is defined and reused across calls. Use None and create a fresh object inside the function.
```python
def add_tag(tag: str, tags: list[str] | None = None) -> list[str]:
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```

➕ **This architecture pattern has a name — "functional core, imperative shell" — worth citing by name in an interview:** pure functions (`classify_node`, `report`) form the "core" — deterministic, trivially unit-testable, no mocks needed. The "shell" (the part that calls `kubectl`/cloud APIs, prints, writes files) wraps the core and is thin enough that it barely needs testing at all, or gets tested with integration/smoke tests instead of unit tests. This is the same idea Chapter 9 (OOP) and the testing Deep Dive will build on — worth recognizing it as one repeated architectural principle, not three unrelated chapters.

➕ **Diagram: functional core, imperative shell**
```
                 ┌────────────────────────────────┐
   IMPERATIVE    │  kubectl / cloud API calls      │  ← thin, barely tested,
     SHELL       │  print(), file writes           │    integration/smoke tests
   (adapters)    │  argument parsing                │    instead of unit tests
                 └────────────────┬─────────────────┘
                                  │ calls
                                  ▼
                 ┌────────────────────────────────┐
    FUNCTIONAL   │  classify_node() / report()     │  ← pure, deterministic,
       CORE      │  classify_gpu()                  │    exhaustively unit-tested,
   (decisions)   │  no I/O, no mocks needed          │    zero mocking required
                 └────────────────────────────────┘
```

➕ **A GPU-fleet-specific version of the same pattern, to make it concrete for this role:**
```python
@dataclass(frozen=True)
class GPUHealth:
    node: str
    xid_errors: int
    ecc_errors: int
    temp_c: float

def classify_gpu(h: GPUHealth) -> str:
    if h.xid_errors > 0:
        return "needs_drain"        # Xid errors are frequently unrecoverable — pull the node
    if h.ecc_errors > 100 or h.temp_c > 85:
        return "degraded"
    return "healthy"
```
The `classify_gpu` function needs zero GPU hardware, zero `nvidia-smi` calls, and zero mocking to unit-test exhaustively — you just construct `GPUHealth` objects with the values you want to test. This is exactly the shape of function you'd be expected to write live in a coding interview for this role.

➕ **Diagram: `classify_gpu`'s three branches, one test per branch**
```
GPUHealth(xid_errors, ecc_errors, temp_c)
        │
        ▼
  xid_errors > 0? ──yes──▶ "needs_drain"
        │no
        ▼
  ecc_errors > 100 or temp_c > 85? ──yes──▶ "degraded"
        │no
        ▼
     "healthy"
```
Practice #4 asks for one test per branch — this is the branch diagram that test suite is exhaustively covering.

## Practice before moving on
1. Refactor a function that reads a file, parses it, decides health, and prints output into three functions: read, decide, render.
2. Explain why a function returning a structured dict is often easier to test than a function that only prints.
3. Write a guard clause that rejects an empty cluster name before an API call.

➕ 4. Write `classify_gpu`'s test suite: at minimum, one test per branch (xid>0, ecc>100, temp>85, all-healthy) — this branch-coverage instinct (one test per decision branch, not one test per function) is what interviewers are actually checking for in a live coding round.

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Defining functions and returning values; Parameters and arguments; Guard clauses; Docstrings; Enumerate and ZIP.
