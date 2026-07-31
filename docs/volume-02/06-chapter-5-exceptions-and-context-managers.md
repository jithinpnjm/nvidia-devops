---
title: "Chapter 5 - Exceptions and context managers"
slug: "chapter-5-exceptions-and-context-managers"
sidebar_position: 6
description: "Chapter 5 - Exceptions and context managers — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Fail deliberately, preserve diagnostic context, and guarantee cleanup of external resources.


Exceptions are not an alternative syntax for if/else. Use normal conditions for expected branches and exceptions for operations that could not fulfill their contract. A caller should be able to distinguish “resource absent,” “authentication failed,” “temporary timeout,” and “input invalid” because the recovery policy differs for each.


<!-- source-table:2 -->

```text
class InventoryError(Exception):
    """Base exception for inventory operations."""

class AuthenticationError(InventoryError):
    pass

class TemporaryAPIError(InventoryError):
    pass
```


**Exception chaining preserves the original cause**


<!-- source-table:3 -->

```text
try:
    inventory = client.fetch_inventory()
except TimeoutError as exc:
    raise TemporaryAPIError("inventory API timed out") from exc
```


The “from exc” matters during troubleshooting because the traceback shows both the infrastructure-level meaning you added and the low-level cause. Do not catch Exception merely to print and continue; that often turns a real failure into silent data corruption.


<!-- source-table:4 -->

```text
from contextlib import contextmanager
from tempfile import TemporaryDirectory
from pathlib import Path

@contextmanager
def workspace():
    with TemporaryDirectory(prefix="infra-") as tmp:
        path = Path(tmp)
        yield path
        # TemporaryDirectory cleans up even when the caller raises.
```


## Practice before moving on

1\. Design exception classes for auth failure, retryable 503, invalid config, and remote command failure. Decide which ones should be retried.

2\. Use a context manager to open a temporary workspace and prove it is removed after an exception.

3\. Explain why except Exception: pass is dangerous in an automation that changes infrastructure.

## Targeted references

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Thinking in exceptions; Defining custom exceptions; Adding context to custom exceptions; Context managers and the with statement; Advanced Retry Decorator with Exponential Backoff and Jitter exercise.
