---
title: "Chapter 12 - Type hints and pytest: make changes safer"
slug: "chapter-12-type-hints-and-pytest-make-changes-safer"
sidebar_position: 13
description: "Chapter 12 - Type hints and pytest: make changes safer — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Use static contracts and automated tests to protect decision logic and dependency boundaries.

Type hints improve the feedback loop before runtime; tests validate behavior at runtime. For infrastructure tools, the most valuable tests target parsing, validation, policy decisions, retries, and translation of dependency failures. The most valuable mocks sit at dependency boundaries, not inside every function.

![](pathname:///img/generated/volume-02-05.png)

Figure 5. Keep most tests close to deterministic decision logic; use fewer real-environment tests for integration confidence.
```python
from dataclasses import dataclass

@dataclass(frozen=True)
class PodHealth:
    name: str
    restarts: int
    ready: bool

def unhealthy(pod: PodHealth) -> bool:
    return not pod.ready or pod.restarts >= 5
```
```python
import pytest

@pytest.mark.parametrize(
    ("pod", "expected"),
    [
        (PodHealth("api", 0, True), False),
        (PodHealth("worker", 7, True), True),
        (PodHealth("db", 0, False), True),
    ],
)
def test_unhealthy(pod: PodHealth, expected: bool) -> None:
    assert unhealthy(pod) is expected
```
**Mock the external HTTP boundary to test retry policy deterministically**
```python
def test_client_retries_503(mocker):
    fake_get = mocker.patch("mytool.client.requests.get")
    fake_get.side_effect = [FakeResponse(503), FakeResponse(200, {"ok": True})]
    assert get_json("https://api", "token")["ok"] is True
    assert fake_get.call_count == 2
```
Patch where the dependency is looked up by the code under test, not necessarily where the dependency was originally defined. This detail explains many "my mock did nothing" failures.

➕ **The "patch where it's looked up" rule, made concrete — this trips up almost everyone once:**
```python
# mytool/client.py
import requests
def get_json(url): return requests.get(url).json()

# WRONG in the test file:
mocker.patch("requests.get")              # patches the global requests module —
                                            # but client.py already has its OWN local reference to it

# RIGHT:
mocker.patch("mytool.client.requests.get") # patches requests.get as SEEN FROM mytool.client's namespace
```
Because `import requests` binds a name inside `mytool.client`'s namespace, patching the *original* `requests.get` doesn't affect the copy of the reference `client.py` already holds — you have to patch it where the code under test actually looks it up. This single paragraph resolves the majority of real "why isn't my mock working" confusion.

➕ **`mypy`/`pyright` in CI — closing the loop between type hints and this chapter's testing focus:**
```bash
mypy src/infra_doctor --strict
```
```
src/infra_doctor/parser.py:14: error: Argument 1 to "unhealthy" has incompatible
type "dict[str, Any]"; expected "PodHealth"  [arg-type]
```
This is the kind of error type hints catch *before* a test even runs — a caller passing a raw dict where a `PodHealth` dataclass was expected. Worth wiring `mypy --strict` into the Chapter 13 CI pipeline as a gate before tests even execute — cheaper failures fail faster.

## Practice before moving on
1. Write tests for 401 no-retry and 503 retry behavior.
2. Use a fixture to create a temporary config file.
3. Add mypy/pyright-friendly type hints to a JSON parsing function and decide where TypedDict or dataclass is appropriate.

➕ 4. Deliberately write the "wrong" patch target (`mocker.patch("requests.get")` instead of the module-qualified path) and confirm the test still calls the *real* `requests.get` — seeing the mock silently fail to intercept anything is the fastest way to make the "patch where it's looked up" rule permanent.

## Targeted references
[pytest documentation](https://docs.pytest.org/) - Assertions, fixtures, parametrization, monkeypatching and plugins.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to type hints; Hands-on: Test-driven implementation; Testing exceptions; Introduction to fixtures; Parametrization; Mocking fundamentals; Patch decorator and mocker fixture.

➕ **Visual model — move uncertainty to the edges:**
```
external API / filesystem / shell
              │ fake or fixture at boundary
              ▼
typed adapter ──► pure decision ──► expected result
      │                │                 │
      └── integration   └── unit test     └── assertion
```
**Memory hook:** *"Type the contract; test the decision; fake the effect."* Tests become fast and meaningful when they prove policy without requiring a live cluster.
