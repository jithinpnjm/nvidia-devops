---
title: "Foundation — what Python is and why infrastructure engineers use it"
slug: "foundation-what-python-is"
sidebar_position: 0
description: "A beginner orientation to Python, programs and safe automation before production Python concepts."
source_document: "Authored directly as the Volume 2 foundation chapter."
---

# Foundation — what Python is and why infrastructure engineers use it

## What this volume is trying to teach

Python is a programming language commonly used to turn operational decisions into repeatable tools. An infrastructure program may read inventory, call an API, run a diagnostic command, compare desired and observed state, or produce a report.

The goal is not clever code. The goal is software another engineer can understand, test, operate and trust when dependencies fail.

## Script, program and automation

- A **script** is usually a small program run directly to perform a task.
- A **program** is instructions plus data and defined behavior.
- **Automation** repeatedly applies a decision or procedure with controlled inputs, outputs and failure behavior.
- A **module** is a Python file that can expose reusable functions, classes and values.
- A **package** organizes related modules for reuse and installation.

A ten-line script can be valuable. It becomes risky when it changes production without validation, timeouts, useful errors, tests or a clear owner.

## The first mental model

| Part | Question |
|---|---|
| Input | Where does data come from, and can it be malformed or missing? |
| Decision | What rule transforms input into a result? |
| Effect | Does code read a file, call a service, execute a command or change infrastructure? |
| Output | What should a human or another program receive? |
| Failure contract | Which failures are expected, retriable, fatal or security-sensitive? |

Good infrastructure code separates decisions from effects. A function deciding whether a node is healthy can be tested with ordinary values. A separate adapter can collect real GPU or Kubernetes data. This lets tests validate policy without requiring a live cluster.

## Essential language

- A **value** is data such as `8`, `"gpu-01"` or `True`.
- A **variable/name** refers to a value or object.
- A **type** describes supported behavior, such as integer, string, list or dictionary.
- A **condition** selects behavior using `if`, `elif` and `else`.
- A **loop** repeats behavior over items.
- A **function** names reusable behavior with inputs and a return value.
- An **exception** represents a failure or exceptional condition that interrupts normal flow.
- A **traceback** shows the call path leading to an uncaught exception.
- An **exit code** tells the calling shell or pipeline whether a program succeeded.
- A **test** runs code with controlled inputs and checks expected behavior.

## A real-life example

Suppose you need to check 200 GPU nodes. Begin with a function that classifies one already-observed record. Then add JSON input. Then add a client with timeout and authentication. Then add bounded concurrency. Starting with 200 concurrent API calls mixes syntax, policy, networking and concurrency before any one part is understood.

## Build Python knowledge in one complete program

Start with a small node classifier:

```python
def classify_node(gpu_count: int, temperature_c: float) -> str:
    if gpu_count != 8:
        return "critical"
    if temperature_c >= 80:
        return "warning"
    return "healthy"


nodes = [
    {"name": "gpu-01", "gpu_count": 8, "temperature_c": 62.0},
    {"name": "gpu-02", "gpu_count": 7, "temperature_c": 55.0},
]

for node in nodes:
    status = classify_node(node["gpu_count"], node["temperature_c"])
    print(f'{node["name"]}: {status}')
```

Representative output:

```text
gpu-01: healthy
gpu-02: critical
```

This short program teaches several foundations:

- `def` creates a function; parameters are local names receiving input values.
- Type hints document expected value types but Python does not enforce them automatically.
- `if` selects a branch; `return` sends one result to the caller.
- A list preserves an ordered collection; each dictionary maps field names to values.
- A `for` loop processes each record.
- An f-string formats values into readable text.

## Data structures by operational purpose

| Type | Use it when | Infrastructure example |
|---|---|---|
| `str` | text is meaningful as text | hostname, URL, log message |
| `int`/`float` | arithmetic or numeric comparison is required | retry count, temperature |
| `bool` | exactly true/false state | dry-run enabled |
| `list` | ordered items, duplicates allowed | ordered probe results |
| `tuple` | fixed record/immutable sequence semantics are useful | coordinate/version parts |
| `set` | uniqueness and fast membership matter | failed node names |
| `dict` | lookup by key | node name to health record |
| `None` | explicit absence of a value | metric not reported |

Do not convert every value to a string because input arrived as text. Parse at the boundary so decision code operates on meaningful types.

## Assignment, mutation and the first subtle bug

```python
expected = ["gpu-01", "gpu-02"]
selected = expected
selected.append("gpu-03")
print(expected)
```

Output:

```text
['gpu-01', 'gpu-02', 'gpu-03']
```

Both names refer to the same mutable list. Assignment did not copy it. Use `expected.copy()` when a separate shallow list is intended, and understand that nested objects can still be shared.

## Files and JSON: make the boundary visible

```python
import json
from pathlib import Path


def load_nodes(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8")
    value = json.loads(raw)
    if not isinstance(value, list):
        raise ValueError("inventory must contain a JSON list")
    return value
```

Separate possible failures:

- `FileNotFoundError`: path does not exist;
- `PermissionError`: process cannot read it;
- `json.JSONDecodeError`: bytes were read but are not valid JSON;
- `ValueError`: JSON is valid but violates this program's expected top-level shape;
- missing/wrong fields: individual records require further validation.

Avoid `except Exception: pass`. It converts actionable failure into misleading success.

## Tracebacks: read from the bottom

```text
Traceback (most recent call last):
  File "health.py", line 18, in <module>
    print(node["temperature_c"])
KeyError: 'temperature_c'
```

Start with `KeyError: 'temperature_c'`: a dictionary lookup requested a missing key. Then move upward to your code line and call path. A traceback is diagnostic evidence, not noise to hide.

## External effects need contracts

When Python calls an HTTP API or subprocess, define:

- timeout;
- accepted result/status codes;
- expected error types;
- retry eligibility and maximum attempts;
- idempotency of the operation;
- sensitive values that must not enter logs;
- output/exit-code contract.

Safe subprocess shape:

```python
import subprocess

result = subprocess.run(
    ["nvidia-smi", "--query-gpu=index,name", "--format=csv,noheader"],
    text=True,
    capture_output=True,
    timeout=10,
    check=False,
)

if result.returncode != 0:
    raise RuntimeError(f"nvidia-smi failed: {result.stderr.strip()}")
```

Passing an argument list avoids unnecessary shell parsing. A timeout bounds waiting. Return code, stdout and stderr remain distinct evidence.

## Test the decision separately

```python
def test_missing_gpu_is_critical() -> None:
    assert classify_node(7, 55.0) == "critical"


def test_exact_temperature_boundary() -> None:
    assert classify_node(8, 80.0) == "warning"
```

Because `classify_node` has no file, API or subprocess effect, tests are fast and deterministic. Test adapters separately with temporary files, fakes or mocks at the boundary.

## Virtual environments and reproducibility

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install pytest
python -m pytest -q
```

A virtual environment isolates project packages from the base interpreter environment. It does not by itself lock exact versions; record project dependencies and use an appropriate lock/reproducible build process.

## Guided progression from script to tool

1. hard-coded values and pure decision;
2. JSON/file input with validation;
3. clear errors and exit codes;
4. structured logging;
5. one HTTP/subprocess adapter with timeout;
6. unit tests around decisions and boundary tests around effects;
7. CLI arguments and project packaging;
8. bounded concurrency only after the sequential path works;
9. CI checks and artifact/version release.

The local SRE repository contains useful progressive exercises in `interview-prep/hands-on-labs/python/`; the Staff guide's `scripting-python_consolidated.md` provides broader operational patterns. Use them as practice after the mechanism is understood.

## Common beginner mistakes

- copying code before predicting what each line returns;
- using a class when a function and dictionary are sufficient;
- catching every exception and continuing with incomplete state;
- retrying non-idempotent operations blindly;
- using `shell=True` for ordinary executable arguments;
- adding concurrency before timeout and sequential error handling;
- testing only the happy path;

If a later chapter uses a construct that still feels abrupt, pause here and read the companion [Python field guide — functions, classes, imports, annotations and modules](./python-constructs-imports-and-project-layout). It explains why the construct was selected before asking you to modify it.
- logging tokens, credentials or full sensitive API payloads.

## Official references

- [Python tutorial](https://docs.python.org/3/tutorial/)
- [Python data structures](https://docs.python.org/3/tutorial/datastructures.html)
- [Python errors and exceptions](https://docs.python.org/3/tutorial/errors.html)
- [Python modules](https://docs.python.org/3/tutorial/modules.html)
- [Python virtual environments and packages](https://docs.python.org/3/tutorial/venv.html)
- [Python `subprocess`](https://docs.python.org/3/library/subprocess.html)

## Recommended order

1. Complete the [Python foundation lab](../intro/05-python-foundation-lab.md).
2. Study Chapters 1–4 for the execution/data model.
3. Study Chapters 5–8 for errors, logging, processes and APIs.
4. Study design, concurrency, typing and packaging only after the sequential program is comfortable.
5. Build the capstone, then use the senior deep dives.

## Readiness check

Before the production chapters, you should be able to write a small function, read a traceback, load JSON, distinguish decision logic from external effects, and explain exit code `0` versus non-zero. If not, the foundation lab is the intended starting point—not remedial punishment.
