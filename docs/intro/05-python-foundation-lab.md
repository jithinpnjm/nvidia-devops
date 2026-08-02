---
title: "Python foundation lab — from zero to a safe health check"
slug: "python-foundation-lab"
sidebar_position: 5
description: "A gentle, runnable Python path for infrastructure engineers before the production Python volume."
source_document: "Authored directly as the beginner-to-senior curriculum bridge."
---

# Python foundation lab

Volume 2 begins with Python's object model because that matters in production, but it is not the right first lesson if syntax, tracebacks, functions, and files are not yet comfortable. This lab builds one small health-check program in stages. Type the code yourself; do not only read it.

> **This is the hands-on companion** to [Volume 0, Chapter 9 — Python fundamentals](/curriculum/volume-00/9-python-fundamentals-before-the-labs), which explains the same concepts (variables, lists/dicts, conditionals, loops, functions, exceptions) with analogies and check-your-understanding questions before you touch a keyboard. Read that chapter first if any of this feels unfamiliar; use this lab to actually build something with it. Either one leads naturally into [Senior DevOps labs, Tier 1](/labs).

## Lab rules

- Use a disposable directory and Python 3.10 or newer.
- Run after every small change.
- Predict output before running.
- Read errors from the final traceback line first, then move upward to your code.
- Do not add concurrency, classes, APIs, or clever abstractions until the sequential version is clear.

Create a directory, enter it, and verify Python:

```bash
mkdir -p python-foundation-lab
cd python-foundation-lab
python3 --version
```

## Step 1 — values, names, and output

Create `health.py`:

```python
node_name = "gpu-node-01"
gpu_count = 8
temperature_c = 54.5
healthy = True

print(node_name)
print(gpu_count)
print(f"{node_name}: gpus={gpu_count} temperature={temperature_c} healthy={healthy}")
```

Run it:

```bash
python3 health.py
```

Expected final line:

```text
gpu-node-01: gpus=8 temperature=54.5 healthy=True
```

Python values have types. Inspect them:

```python
print(type(node_name))       # str
print(type(gpu_count))       # int
print(type(temperature_c))   # float
print(type(healthy))         # bool
```

**Break it deliberately:** replace `gpu_count = 8` with `gpu_count = "eight"`, then try `print(gpu_count + 1)`. The final traceback line explains that Python cannot add a string and integer. Fix the data at the boundary rather than hiding the error.

## Step 2 — decisions

A health check converts observed values into a decision:

```python
expected_gpus = 8
observed_gpus = 8
temperature_c = 54.5

if observed_gpus != expected_gpus:
    print("CRITICAL: unexpected GPU count")
elif temperature_c >= 85:
    print("CRITICAL: GPU temperature too high")
elif temperature_c >= 75:
    print("WARNING: GPU temperature elevated")
else:
    print("OK: node passed basic checks")
```

Change one input at a time and predict the selected branch. Order matters: Python evaluates from top to bottom and stops at the first true branch.

## Step 3 — collections and loops

A list holds an ordered collection. A dictionary maps keys to values:

```python
nodes = [
    {"name": "gpu-01", "gpus": 8, "temperature_c": 54},
    {"name": "gpu-02", "gpus": 7, "temperature_c": 61},
    {"name": "gpu-03", "gpus": 8, "temperature_c": 82},
]

for node in nodes:
    if node["gpus"] != 8:
        status = "CRITICAL"
    elif node["temperature_c"] >= 75:
        status = "WARNING"
    else:
        status = "OK"

    print(f'{node["name"]}: {status}')
```

Expected output:

```text
gpu-01: OK
gpu-02: CRITICAL
gpu-03: WARNING
```

**Break it:** remove the `temperature_c` key from one node. The `KeyError` tells you a required field is absent. Later you will validate input explicitly; for now, understand the failure.

## Step 4 — functions separate decisions from effects

Move the decision into a function:

```python
def classify_node(observed_gpus: int, temperature_c: float) -> str:
    """Return a status without printing or changing external state."""
    if observed_gpus != 8:
        return "CRITICAL"
    if temperature_c >= 75:
        return "WARNING"
    return "OK"


nodes = [
    {"name": "gpu-01", "gpus": 8, "temperature_c": 54},
    {"name": "gpu-02", "gpus": 7, "temperature_c": 61},
]

for node in nodes:
    status = classify_node(node["gpus"], node["temperature_c"])
    print(f'{node["name"]}: {status}')
```

The function receives inputs and returns a result. Printing is kept outside. That separation makes the decision easy to test and reuse.

## Step 5 — read JSON as untrusted input

Create `nodes.json`:

```json
[
  {"name": "gpu-01", "gpus": 8, "temperature_c": 54},
  {"name": "gpu-02", "gpus": 7, "temperature_c": 61}
]
```

Replace the in-code list with:

```python
import json
from pathlib import Path


def load_nodes(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("top-level JSON value must be a list")
    return data


nodes = load_nodes(Path("nodes.json"))
```

There are now distinct failure boundaries: file not found, permission denied, invalid JSON, wrong top-level type, or missing/wrong fields. Do not catch every exception with `except Exception: pass`; that destroys the reason the program failed.

## Step 6 — make the program operational

Command-line tools communicate success or failure through exit codes. Restructure the full program:

```python
import json
from pathlib import Path


def load_nodes(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("top-level JSON value must be a list")
    return data


def classify_node(observed_gpus: int, temperature_c: float) -> str:
    if observed_gpus != 8:
        return "CRITICAL"
    if temperature_c >= 75:
        return "WARNING"
    return "OK"


def main() -> int:
    try:
        nodes = load_nodes(Path("nodes.json"))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: cannot load inventory: {error}")
        return 2

    critical = False
    for node in nodes:
        try:
            status = classify_node(node["gpus"], node["temperature_c"])
            print(f'{node["name"]}: {status}')
            critical = critical or status == "CRITICAL"
        except (KeyError, TypeError) as error:
            print(f"ERROR: invalid node record {node!r}: {error}")
            critical = True

    return 1 if critical else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Run and inspect the shell exit code:

```bash
python3 health.py
echo $?
```

Use a simple contract:

- `0`: checks completed and no critical nodes were found;
- `1`: checks completed and at least one critical node was found;
- `2`: the tool itself could not operate or input was invalid.

The exact codes are your interface; document them and keep them stable.

## Step 7 — test the decision without touching files

Create `test_health.py`:

```python
from health import classify_node


def test_healthy_node() -> None:
    assert classify_node(8, 54) == "OK"


def test_missing_gpu_is_critical() -> None:
    assert classify_node(7, 54) == "CRITICAL"


def test_hot_node_is_warning() -> None:
    assert classify_node(8, 80) == "WARNING"
```

After installing pytest in a virtual environment, run:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install pytest
python -m pytest -q
```

Expected result:

```text
3 passed
```

Change `>= 75` to `> 75`, add a test for exactly `75`, and decide which behavior the requirement actually needs. Tests reveal ambiguity; they do not decide the requirement for you.

## What you built

```text
JSON file → loader/effect → validated Python values → pure decision
                                               ↓
                                      formatted result + exit code
                                               ↓
                                           unit tests
```

This small shape scales to APIs, subprocesses, BMC inventories, Kubernetes objects, and GPU health data. Later Volume 2 chapters add logging, timeouts, retries, types, packaging, concurrency, and richer tests around the same boundaries.

## Readiness gate for Volume 2

Continue when you can:

- explain strings, numbers, booleans, lists, and dictionaries;
- predict an `if` branch and a loop's output;
- write and call a function with a return value;
- read a traceback and locate your failing line;
- read JSON from a file and distinguish input failure from health failure;
- explain the main guard and exit codes;
- run the tests and add one edge case yourself.

If that is not yet comfortable, rebuild the program without copying it. Repetition here is cheaper than struggling through concurrency or API clients later.

