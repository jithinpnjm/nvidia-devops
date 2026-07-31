---
title: "Chapter 2 - Choosing data structures by the problem, not by habit"
slug: "chapter-2-choosing-data-structures-by-the-problem-not-by-habit"
sidebar_position: 3
description: "Chapter 2 - Choosing data structures by the problem, not by habit — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Select lists, tuples, sets, dictionaries, queues, and dataclasses based on access patterns and invariants.


Infrastructure scripts spend much of their time transforming collections: pod lists, node inventories, labels, API objects, log lines, metrics, and desired-state configuration. The useful question is not “which collection do I remember?” but “what operation dominates this problem?”


<!-- source-table:2 -->

| Need | Structure | Reason |
| --- | --- | --- |
| Preserve ordered items, allow duplicates | list | Indexing, append, iteration; O(n) membership search |
| Fixed record-like sequence | tuple | Signals “do not mutate”; hashable when contents are hashable |
| Membership / de-duplication | set | Average O(1) membership and set algebra |
| Keyed lookup / structured object | dict | Average O(1) lookup by key; natural fit for JSON |


**Set algebra turns inventory comparison into a direct expression of intent**


<!-- source-table:3 -->

```text
expected = {"api", "worker", "scheduler"}
running = {"api", "worker", "debug-shell"}

missing = expected - running
unexpected = running - expected

print("missing:", missing)          # {'scheduler'}
print("unexpected:", unexpected)   # {'debug-shell'}
```


<!-- source-table:4 -->

```text
nodes = [
    {"name": "gpu-1", "zone": "a", "gpus": 8},
    {"name": "gpu-2", "zone": "b", "gpus": 8},
    {"name": "cpu-1", "zone": "a", "gpus": 0},
]

gpu_by_name = {n["name"]: n for n in nodes if n["gpus"] > 0}
print(gpu_by_name["gpu-2"]["zone"])
```


The comprehension builds an index once. If you need repeated lookups by node name, this is better than scanning the list each time. In interviews, explain the algorithmic reason: build O(n), then average O(1) lookup, instead of O(n) for every query.

## Work the scenario step by step


<!-- source-table:5 -->

> Scenario You receive 50,000 pod names from two clusters and need to report names present in cluster A but absent in B.


**1\. Recognize that the dominant operation is membership comparison, not ordered presentation.**

2\. Convert names to sets.

3\. Use set difference A - B.

4\. Sort only when producing human-readable output, because sorting is an output concern rather than a membership concern.


<!-- source-table:6 -->

> Reasoned conclusion A set makes the algorithm both clearer and faster than nested loops.


## Practice before moving on

1\. Write a function that groups pods by namespace using dict\[str, list\[str\]\].

2\. Find duplicate IP addresses in an inventory with a set.

3\. Given a list of 100k log event IDs, explain when a list is acceptable and when a set is the right index.

## Targeted references

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to lists; Tuples; Set operations; Dictionaries; Server Inventory Reporter coding exercise.
