---
title: "Chapter 3 - Functions: turn scripts into testable decisions"
slug: "chapter-3-functions-turn-scripts-into-testable-decisions"
sidebar_position: 4
description: "Chapter 3 - Functions: turn scripts into testable decisions — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Separate computation from side effects and design functions with explicit inputs, outputs, and failure semantics.


A production script becomes maintainable when the decision logic can be executed without the production environment. The easiest route is to separate pure computation from side effects such as reading files, calling APIs, printing, mutating remote systems, and executing subprocesses.

**Pure decision function: easy to reason about and easy to test**


<!-- source-table:2 -->

```text
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


<!-- source-table:3 -->

```text
def report(nodes: list[NodeUsage]) -> dict[str, list[str]]:
    result = {"healthy": [], "warning": [], "critical": []}
    for node in nodes:
        result[classify_node(node)].append(node.name)
    return result
```


Notice that report() does not call kubectl or the cloud API. Another adapter can obtain raw data, convert it to NodeUsage values, call report(), then format output. The core logic is deterministic. This design directly improves unit testing and incident confidence.


<!-- source-table:4 -->

> Common production bug Avoid mutable default arguments such as def add_tag(tag, tags=[]). That list is created once when the function is defined and reused across calls. Use None and create a fresh object inside the function.


<!-- source-table:5 -->

```text
def add_tag(tag: str, tags: list[str] | None = None) -> list[str]:
    if tags is None:
        tags = []
    tags.append(tag)
    return tags
```


## Practice before moving on

1\. Refactor a function that reads a file, parses it, decides health, and prints output into three functions: read, decide, render.

2\. Explain why a function returning a structured dict is often easier to test than a function that only prints.

3\. Write a guard clause that rejects an empty cluster name before an API call.

## Targeted references

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Defining functions and returning values; Parameters and arguments; Guard clauses; Docstrings; Enumerate and ZIP.
