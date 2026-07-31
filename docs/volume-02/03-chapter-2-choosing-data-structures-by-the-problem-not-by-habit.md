---
title: "Chapter 2 - Choosing data structures by the problem, not by habit"
slug: "chapter-2-choosing-data-structures-by-the-problem-not-by-habit"
sidebar_position: 3
description: "Chapter 2 - Choosing data structures by the problem, not by habit — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Select lists, tuples, sets, dictionaries, queues, and dataclasses based on access patterns and invariants.

Infrastructure scripts spend much of their time transforming collections: pod lists, node inventories, labels, API objects, log lines, metrics, and desired-state configuration. The useful question is not "which collection do I remember?" but "what operation dominates this problem?"

| Need | Structure | Reason |
|---|---|---|
| Preserve ordered items, allow duplicates | list | Indexing, append, iteration; O(n) membership search |
| Fixed record-like sequence | tuple | Signals "do not mutate"; hashable when contents are hashable |
| Membership / de-duplication | set | Average O(1) membership and set algebra |
| Keyed lookup / structured object | dict | Average O(1) lookup by key; natural fit for JSON |

➕ **The complexity table, extended with what these volumes don't always spell out — the operations that are deceptively expensive:**
| Operation | list | dict | set |
|---|---|---|---|
| append/add | O(1) amortized | O(1) avg | O(1) avg |
| `x in collection` | **O(n)** ← the trap | O(1) avg | O(1) avg |
| `collection[i]` (index) | O(1) | O(1) by key | n/a |
| insert at front | O(n) — shifts everything | n/a | n/a |

The single most common performance bug in inventory-scanning scripts: `if pod_name in big_list:` inside a loop over another big list — that's O(n×m), and swapping `big_list` for a `set` turns it into O(n) total. This is exactly the reasoning the chapter's set-algebra example below demonstrates.

➕ **Diagram: set difference as the membership answer**
```
expected = {api, worker, scheduler}         running = {api, worker, debug-shell}

      expected                                   running
   ┌────────────┐                            ┌─────────────┐
   │ scheduler  │ ◀── missing ──┐             │ debug-shell │──▶ unexpected
   │    api     │═══════════════╪═════════════│     api     │
   │   worker   │═══════════════╪═════════════│   worker    │
   └────────────┘               │             └─────────────┘
                       missing    = expected - running = {scheduler}
                       unexpected = running - expected  = {debug-shell}
```
The `═` lines mark names present in both sets — set difference just subtracts them out, leaving each side's leftovers.

**Set algebra turns inventory comparison into a direct expression of intent**
```python
expected = {"api", "worker", "scheduler"}
running = {"api", "worker", "debug-shell"}

missing = expected - running
unexpected = running - expected

print("missing:", missing)      # {'scheduler'}
print("unexpected:", unexpected)  # {'debug-shell'}
```

```python
nodes = [
    {"name": "gpu-1", "zone": "a", "gpus": 8},
    {"name": "gpu-2", "zone": "b", "gpus": 8},
    {"name": "cpu-1", "zone": "a", "gpus": 0},
]

gpu_by_name = {n["name"]: n for n in nodes if n["gpus"] > 0}
print(gpu_by_name["gpu-2"]["zone"])
```
The comprehension builds an index once. If you need repeated lookups by node name, this is better than scanning the list each time. In interviews, explain the algorithmic reason: build O(n), then average O(1) lookup, instead of O(n) for every query.

➕ **`collections` module — the structures this chapter's table doesn't cover but a senior candidate should reach for:**
```python
from collections import defaultdict, Counter, deque

# defaultdict — eliminates the "if key not in dict: dict[key] = []" boilerplate
by_zone = defaultdict(list)
for n in nodes:
    by_zone[n["zone"]].append(n["name"])
# {'a': ['gpu-1', 'cpu-1'], 'b': ['gpu-2']}

# Counter — frequency counting in one line (e.g. "which error appears most in this log batch")
error_counts = Counter(log_line.split()[0] for log_line in error_lines)
print(error_counts.most_common(3))

# deque — O(1) append/pop from BOTH ends; a list is O(n) to pop from the front
recent_events = deque(maxlen=100)   # fixed-size ring buffer — perfect for "last N events" tailing
recent_events.append(new_event)     # oldest auto-evicted once full
```
`deque(maxlen=N)` specifically is worth knowing cold for any "keep the last N log lines / metric samples in memory" tooling question — it's the correct answer, not a manually-truncated list.

➕ **Diagram: `deque(maxlen=N)` as a ring buffer**
```
recent_events = deque(maxlen=4)

append(e1) → [e1]
append(e2) → [e1, e2]
append(e3) → [e1, e2, e3]
append(e4) → [e1, e2, e3, e4]          full
append(e5) → [e2, e3, e4, e5]          e1 auto-evicted from the LEFT
                ▲
                └── oldest silently dropped, O(1), no manual truncation needed
```

## Work the scenario step by step
**Scenario:** You receive 50,000 pod names from two clusters and need to report names present in cluster A but absent in B.

1. Recognize that the dominant operation is membership comparison, not ordered presentation.
2. Convert names to sets.
3. Use set difference A - B.
4. Sort only when producing human-readable output, because sorting is an output concern rather than a membership concern.

**Reasoned conclusion:** A set makes the algorithm both clearer and faster than nested loops.

➕ **Timed proof, worth running once so the complexity argument isn't just theoretical:**
```python
import time, random
a = [f"pod-{i}" for i in range(50000)]
b = [f"pod-{i}" for i in range(0, 50000, 2)]  # half overlap

start = time.perf_counter()
missing_slow = [x for x in a if x not in b]          # O(n*m) — list membership
print(f"list-based: {time.perf_counter()-start:.3f}s")

start = time.perf_counter()
missing_fast = set(a) - set(b)                        # O(n+m) — set difference
print(f"set-based:  {time.perf_counter()-start:.3f}s")
# list-based: ~4.200s   set-based: ~0.006s   — roughly 700x on this size
```

## Practice before moving on
1. Write a function that groups pods by namespace using dict[str, list[str]].
2. Find duplicate IP addresses in an inventory with a set.
3. Given a list of 100k log event IDs, explain when a list is acceptable and when a set is the right index.

➕ 4. Rewrite the namespace-grouping function from Practice #1 using `defaultdict(list)` instead of manual `if key not in dict` checks, and explain the readability/correctness tradeoff (fewer lines, but a `defaultdict` silently creates entries on any lookup — including typos — which can hide bugs a plain `dict.get()` would surface).

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to lists; Tuples; Set operations; Dictionaries; Server Inventory Reporter coding exercise.
