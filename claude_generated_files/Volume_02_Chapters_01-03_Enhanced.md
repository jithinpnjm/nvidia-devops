# Chapter 1 — How Python actually executes your infrastructure script
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Explain references, mutability, module execution, the main guard, and why state bugs appear in automation.

Python feels simple because the syntax hides machinery. For production automation, you need a correct mental model of that machinery: a variable name refers to an object; objects have types and identity; functions create local namespaces; importing a file executes its top-level statements; and mutable objects can be shared by several names. These facts explain many bugs that look mysterious when you only think in terms of "boxes holding values."

*(original Figure 1 — "two names can point at the same mutable object" — preserved)*

**Try it: aliasing a mutable list**
```python
pods = ["api-0", "api-1"]
copy = pods
copy.append("api-2")

print(pods)  # ['api-0', 'api-1', 'api-2']
print(copy)  # same object
print(id(pods) == id(copy))  # True
```
The important operation above is not assignment of list contents. The assignment `copy = pods` binds a second name to the existing list object. If you need an independent shallow copy, use `pods.copy()` or `list(pods)`. If nested mutable objects exist, a shallow copy still shares those nested objects; that is when `copy.deepcopy()` becomes relevant.

➕ **The trap this actually causes in production, with output:**
```python
def add_node(nodes, name, tags=None):
    if tags is None:
        tags = []
    tags.append(name)          # looks safe...
    nodes[name] = tags
    return tags

cluster = {}
shared_tags = ["gpu"]
add_node(cluster, "gpu-1", shared_tags)
add_node(cluster, "gpu-2", shared_tags)   # passed the SAME list both times
print(cluster)
# {'gpu-1': ['gpu', 'gpu-1', 'gpu-2'], 'gpu-2': ['gpu', 'gpu-1', 'gpu-2']}  ← both nodes share one list!
```
The caller passing the same mutable object to two calls is the real-world version of the aliasing bug — the function itself did nothing wrong. **Interview framing:** "the bug isn't in the function, it's in the assumption that passing a reference means passing a copy — Python never copies on assignment or on function call."

## Module execution and \_\_name\_\_
```python
# healthcheck.py
def check_disk() -> bool:
    print("checking disk")
    return True

def main() -> int:
    ok = check_disk()
    return 0 if ok else 2

if __name__ == "__main__":
    raise SystemExit(main())
```
When you run `python healthcheck.py`, Python sets `__name__` to `"__main__"` and executes `main()`. When another module imports `healthcheck`, Python sets `__name__` to the module name, so the CLI entry point does not run. This lets one file contain reusable functions and an executable command without causing side effects during import.

**Memory hook:** Think of import as "load the toolbox," and the main guard as "only start the machine when this file is the program, not when someone opens the toolbox."

➕ **Shortcut — prove it to yourself in 10 seconds:**
```bash
$ python -c "import healthcheck"    # prints nothing — check_disk() never ran
$ python healthcheck.py             # prints "checking disk" — main() ran
```
If your unit test suite ever prints unexpected output or makes real network calls the moment `import` runs (before any test function executes), this main-guard omission is the first thing to check — it's the single most common reason "importing a module for testing" accidentally executes production behavior.

## Work the scenario step by step
**Scenario:** A unit test imports your disk checker and unexpectedly starts calling real system commands before the test begins.

1. Ask what executes at import time. Look for function calls, network requests, argparse parsing, environment validation, or subprocess calls at module scope.
2. Move executable behavior into functions. Keep module scope for constants, type definitions, and function/class definitions.
3. Use a main() function and guard it with `if __name__ == "__main__"`.
4. Test the pure functions separately from the CLI adapter.

**Reasoned conclusion:** The bug is architectural: import should define reusable behavior, not launch production behavior.

## Practice before moving on
1. Predict the result when two variables reference the same dictionary and one changes a nested list.
2. Write a module with main() that exits 0 on success and 2 on a failed health check. Import it from another file and prove the health check does not run.
3. Explain the difference between == and is using an infrastructure example.

➕ 4. Fix the `add_node` bug above two ways: (a) create a new list inside the function instead of mutating the passed-in one, (b) have the caller pass `list(shared_tags)` at the call site. Explain which fix you'd actually ship and why (hint: defense should live at the boundary most likely to be reused carelessly).

## Targeted references
[Python documentation: Data model](https://docs.python.org/3/reference/datamodel.html) - Use this when you need exact behavior for identity, types, attributes, and special methods.
[Udemy - Python for DevOps: Mastering Real-World Automation](https://www.udemy.com/course/python-devops) - Relevant lessons: Writing and running Python files; Variables; Lists; Dictionaries; Introduction to functions.

---
# Chapter 2 — Choosing data structures by the problem, not by habit
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Select lists, tuples, sets, dictionaries, queues, and dataclasses based on access patterns and invariants.

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

---
# Chapter 3 — Functions: turn scripts into testable decisions
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Separate computation from side effects and design functions with explicit inputs, outputs, and failure semantics.

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

## Practice before moving on
1. Refactor a function that reads a file, parses it, decides health, and prints output into three functions: read, decide, render.
2. Explain why a function returning a structured dict is often easier to test than a function that only prints.
3. Write a guard clause that rejects an empty cluster name before an API call.

➕ 4. Write `classify_gpu`'s test suite: at minimum, one test per branch (xid>0, ecc>100, temp>85, all-healthy) — this branch-coverage instinct (one test per decision branch, not one test per function) is what interviewers are actually checking for in a live coding round.

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Defining functions and returning values; Parameters and arguments; Guard clauses; Docstrings; Enumerate and ZIP.
