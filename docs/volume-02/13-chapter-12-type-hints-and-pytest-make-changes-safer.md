---
title: "Chapter 12 - Type hints and pytest: make changes safer"
slug: "chapter-12-type-hints-and-pytest-make-changes-safer"
sidebar_position: 13
description: "Chapter 12 - Type hints and pytest: make changes safer — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Use static contracts and automated tests to protect decision logic and dependency boundaries.


Type hints improve the feedback loop before runtime; tests validate behavior at runtime. For infrastructure tools, the most valuable tests target parsing, validation, policy decisions, retries, and translation of dependency failures. The most valuable mocks sit at dependency boundaries, not inside every function.

![](pathname:///img/generated/volume-02-05.png)

Figure 5. Keep most tests close to deterministic decision logic; use fewer real-environment tests for integration confidence.


<!-- source-table:2 -->

```text
from dataclasses import dataclass

@dataclass(frozen=True)
class PodHealth:
    name: str
    restarts: int
    ready: bool

def unhealthy(pod: PodHealth) -> bool:
    return not pod.ready or pod.restarts >= 5
```


<!-- source-table:3 -->

```text
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


<!-- source-table:4 -->

```text
def test_client_retries_503(mocker):
    fake_get = mocker.patch("mytool.client.requests.get")
    fake_get.side_effect = [
        FakeResponse(503),
        FakeResponse(200, {"ok": True}),
    ]
    assert get_json("https://api", "token")["ok"] is True
    assert fake_get.call_count == 2
```


Patch where the dependency is looked up by the code under test, not necessarily where the dependency was originally defined. This detail explains many “my mock did nothing” failures.

## Practice before moving on

1\. Write tests for 401 no-retry and 503 retry behavior.

2\. Use a fixture to create a temporary config file.

3\. Add mypy/pyright-friendly type hints to a JSON parsing function and decide where TypedDict or dataclass is appropriate.

## Targeted references

[pytest documentation](https://docs.pytest.org/) - Assertions, fixtures, parametrization, monkeypatching and plugins.

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to type hints; Hands-on: Test-driven implementation; Testing exceptions; Introduction to fixtures; Parametrization; Mocking fundamentals; Patch decorator and mocker fixture.
