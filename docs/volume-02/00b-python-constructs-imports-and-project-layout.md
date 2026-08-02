---
title: "Python field guide — functions, classes, imports, annotations and modules"
slug: "python-constructs-imports-and-project-layout"
sidebar_position: 0.1
description: "A plain-language field guide explaining the Python constructs used throughout the infrastructure automation volume and why each appears."
source_document: "Authored directly as a companion foundation chapter."
---

# Python field guide — functions, classes, imports, annotations and modules

This chapter exists because production-looking Python can feel like a wall of punctuation when you are learning it. The examples in this volume use `dataclass`, `Protocol`, annotations, imports, context managers, decorators, and classes because each solves a particular maintenance problem. None is required merely because it is fashionable. Learn the problem first, then the construct.

## The decision ladder: what should I write first?

Start with the smallest mechanism that expresses the behavior:

| Need | Start with | Why |
|---|---|---|
| One calculation used once | direct statements | no abstraction is cheaper than a needless abstraction |
| A decision used more than once or worth testing | function | input and output are visible; easy to test |
| A fixed record with named fields | dictionary, `TypedDict`, or dataclass | choose how much runtime structure and validation you need |
| Behavior that owns changing state | class | state and operations stay together |
| A set of related files | module/package | imports give each part a boundary and owner |
| A resource that must be cleaned up | `with` / context manager | cleanup runs on success and failure |
| Reusable cross-cutting behavior | decorator, sparingly | add logging/retry/measurement without copying wrapper code |

The first senior-level question is not “can I use a class?” It is “what state must survive between calls, who owns it, and how will I test it?”

## Direct code versus a function

This is understandable for a one-off probe:

```python
import shutil

free_bytes = shutil.disk_usage("/").free
print(f"free GiB: {free_bytes / 2**30:.1f}")
```

Move the decision into a function when it has a name, a contract, or a test:

```python
def disk_status(free_gib: float, minimum_gib: float = 20.0) -> str:
    return "healthy" if free_gib >= minimum_gib else "critical"


status = disk_status(free_bytes / 2**30)
```

The function is deliberately not reading the filesystem. That separation lets a test pass `5.0` or `50.0` without changing a real machine. The outer “imperative shell” collects facts; the inner “functional core” decides what they mean.

## Function parameters are an API

```python
def retry_delay(attempt: int, base_seconds: float = 1.0, cap_seconds: float = 30.0) -> float:
    return min(cap_seconds, base_seconds * 2 ** attempt)
```

`attempt` is required; the other values have defaults. A caller can use positional or named arguments, but named arguments make policy visible:

```python
retry_delay(attempt=2, cap_seconds=10.0)
```

Avoid hidden global configuration inside a decision function. Pass policy as an argument or an explicit object so a reviewer can see what controls the result.

## Why a class appears in our scripts

This is enough when there is no state:

```python
def classify_gpu(memory_used_mib: int, memory_total_mib: int) -> str:
    return "warning" if memory_used_mib / memory_total_mib > 0.9 else "healthy"
```

A class becomes justified when several calls share state and the state has one owner. An API client keeps a base URL, an authenticated session, timeout policy, and perhaps a connection pool:

```python
from dataclasses import dataclass
import requests


@dataclass(frozen=True)
class RetryPolicy:
    attempts: int = 3
    timeout_seconds: float = 5.0


class InventoryClient:
    def __init__(self, base_url: str, policy: RetryPolicy) -> None:
        self.base_url = base_url.rstrip("/")
        self.policy = policy
        self.session = requests.Session()

    def get_node(self, name: str) -> dict:
        response = self.session.get(
            f"{self.base_url}/nodes/{name}",
            timeout=self.policy.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()
```

`InventoryClient` is not a class because classes are “more professional.” It is a class because `base_url`, policy, and the reusable session belong together. A single stateless method would be clearer as a function. A class that only wraps one function adds ceremony and hides the real dependency.

### Class review questions

Before adding a class, answer:

1. What state does it own?
2. Must that state persist between calls?
3. Can two instances have different configuration at the same time?
4. Can a function plus explicit arguments express this more clearly?
5. How will a test replace its network, filesystem, or subprocess effect?

## Dataclass: a record with an explicit shape

A raw dictionary is flexible but typo-prone:

```python
sample = {"node": "gpu-01", "temperature_c": 65.0}
sample["temprature_c"]  # KeyError at runtime
```

Use a dataclass when the record is part of the program’s domain and you want named fields, a useful representation, and equality:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class GpuSample:
    node: str
    temperature_c: float
    healthy: bool
```

`frozen=True` prevents accidental mutation after the observation is created. It does not validate that a caller passed a float; annotations and dataclass fields are not automatic runtime validation. Validate untrusted JSON at the boundary before constructing the object.

Use a dictionary for genuinely variable keys, a `TypedDict` when JSON-shaped keys matter but a normal dictionary is desired, and a dataclass when the record has a stable domain meaning.

## Annotations: documentation plus tool input, not magic enforcement

```python
def parse_gpu_count(raw: str) -> int:
    return int(raw)
```

`raw: str` describes the expected argument and `-> int` describes the intended result. Python normally does not reject a caller that passes the wrong type. A type checker such as mypy or pyright, an IDE, and a reviewer can use the information before production runs.

Common annotations in this repository:

| Annotation | Meaning in plain language | Example use |
|---|---|---|
| `list[str]` | ordered list of strings | host names |
| `dict[str, int]` | string keys and integer values | GPU counts by node |
| `str | None` | string or explicit absence | optional API field |
| `tuple[str, str]` | fixed two-item result | `(name, status)` |
| `Mapping[str, object]` | read-only mapping-like input | parsed configuration |
| `TypedDict` | expected dictionary keys | JSON record boundary |
| `Protocol` | required behavior, not inheritance | injectable command runner |
| `Annotated[T, metadata]` | type plus tool-specific metadata | validation frameworks |

Do not annotate every expression mechanically. Annotate public functions, boundaries, domain records, and places where a wrong type would cause an expensive incident. Treat annotations as a reviewable contract; use a checker in CI when the project is ready.

## Modules, packages, and imports

A **module** is one `.py` file with its own namespace. A **package** is a directory of related modules imported under a name. Splitting a 600-line diagnostic script makes ownership and testing visible:

```text
gpu_health/
  __init__.py       # package boundary (can be minimal)
  model.py          # GpuSample and pure classification
  collect.py        # nvidia-smi/subprocess adapter
  report.py         # text/JSON rendering
  cli.py            # argparse and exit-code boundary
```

Use imports to load a toolbox or a specific tool:

```python
import json
from pathlib import Path
from gpu_health.model import classify
```

`import json` keeps the qualified name `json.loads`, which makes the owner obvious. `from pathlib import Path` brings one name into the local module. Avoid `from package import *`: it hides where names came from and can overwrite an existing name. Use absolute imports in application entry points; use relative imports inside a package only when they make the local relationship clearer.

Imports execute module top-level initialization once per interpreter session. Therefore module scope should define constants, functions, and classes—not start a production command, make a network call, or parse command-line arguments. Put execution behind:

```python
def main() -> int:
    ...
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

This is why the capstone has `model.py`, `kubernetes.py`, and `cli.py`: importing the model for a unit test must not invoke `kubectl`.

## The modules used repeatedly in this course

| Module | What it provides | Typical infrastructure use |
|---|---|---|
| `pathlib` | path objects and file operations | read config, enumerate logs |
| `json` / `csv` | structured text parsing | API responses, inventory exports |
| `yaml` (third-party) | YAML parsing | human-authored config; use `safe_load` for untrusted input |
| `subprocess` | start existing OS tools | `kubectl`, `nvidia-smi`, `ip`, `systemctl` |
| `argparse` | command-line interface | flags, help text, exit behavior |
| `logging` | severity, handlers, structured context | incident evidence without `print` noise |
| `datetime` / `time` | timestamps and bounded waits | deadlines, retry backoff |
| `re` | regular expressions | carefully extracting stable log patterns |
| `collections` | specialized containers | `Counter`, `defaultdict`, `deque` |
| `concurrent.futures` | bounded thread/process pools | parallel network probes with backpressure |
| `contextlib` | cleanup abstractions | temporary directories, lock/resource scopes |
| `dataclasses` | explicit data records | immutable observations and policies |
| `typing` / `collections.abc` | static contracts | readable interfaces and checker support |
| `pytest` (third-party) | test discovery and assertions | fast policy tests and controlled fakes |
| `requests`/`httpx` (third-party) | HTTP clients | APIs; always configure timeouts |

The import tells you the dependency; the call tells you the reason. When reading an unfamiliar script, build a two-column map: “import” → “effect in this script.” Remove imports that do not earn their place.

## Decorators and context managers without mystery

`@dataclass` and `@retry(...)` are decorators: functions that receive a function or class and return a modified/replaced version. They are useful for cross-cutting behavior, but they can hide control flow. Read the undecorated object first, then ask what the decorator adds.

```python
from contextlib import closing

with closing(open("report.txt", encoding="utf-8")) as report:
    first_line = report.readline()
```

The `with` block guarantees cleanup when the block exits normally or raises. Use it for files, locks, temporary resources, and network sessions. Do not use a context manager just to make a short block look sophisticated.

## A practical reading method for every code block

For each unfamiliar example, annotate it yourself:

1. What enters this line?
2. What type and value leave it?
3. Is it a decision, a record, or an external effect?
4. What fails, and does the caller see the failure?
5. Could the code be tested without a live cluster?

Then run the smallest example locally, change one input, and predict the output before executing it. This turns syntax into a mental model.

## References

- [Python modules and packages](https://docs.python.org/3/tutorial/modules.html)
- [Python type hints](https://docs.python.org/3/library/typing.html)
- [Python classes](https://docs.python.org/3/tutorial/classes.html)
- [Python context managers](https://docs.python.org/3/reference/compound_stmts.html#the-with-statement)
- [Python standard library](https://docs.python.org/3/library/)
