---
title: "Chapter 5 - Exceptions and context managers"
slug: "chapter-5-exceptions-and-context-managers"
sidebar_position: 6
description: "Chapter 5 - Exceptions and context managers — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Fail deliberately, preserve diagnostic context, and guarantee cleanup of external resources.

Exceptions are not an alternative syntax for if/else. Use normal conditions for expected branches and exceptions for operations that could not fulfill their contract. A caller should be able to distinguish "resource absent," "authentication failed," "temporary timeout," and "input invalid" because the recovery policy differs for each.
```python
class InventoryError(Exception):
    """Base exception for inventory operations."""

class AuthenticationError(InventoryError):
    pass

class TemporaryAPIError(InventoryError):
    pass
```
**Exception chaining preserves the original cause**
```python
try:
    inventory = client.fetch_inventory()
except TimeoutError as exc:
    raise TemporaryAPIError("inventory API timed out") from exc
```
The "from exc" matters during troubleshooting because the traceback shows both the infrastructure-level meaning you added and the low-level cause. Do not catch Exception merely to print and continue; that often turns a real failure into silent data corruption.
```python
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

➕ **The exception hierarchy in action — this is exactly what lets a caller pick a retry policy per exception type, not per string-matching a message:**
```python
def sync_inventory(client, max_retries=3):
    for attempt in range(1, max_retries + 1):
        try:
            return client.fetch_inventory()
        except TemporaryAPIError:
            if attempt == max_retries:
                raise
            time.sleep(2 ** attempt)   # retry — this class is defined as retryable
        except AuthenticationError:
            raise   # never retry — retrying won't fix bad credentials, fail fast instead
```
**Interview line:** "the exception class *is* the retry policy — `except TemporaryAPIError: retry` vs `except AuthenticationError: fail-fast` reads as documentation, not just error handling."

➕ **Diagram: exception chaining up the call stack**
```
sync_inventory()
   │
   ▼
client.fetch_inventory()  ──raises──▶  TimeoutError
   │                                        │
   ▼                                        │ caught, wrapped
except TimeoutError as exc:                 │
   raise TemporaryAPIError(...) from exc ◀──┘

Traceback now shows BOTH:
  TemporaryAPIError: inventory API timed out      ← infra-level meaning you added
  ↑ "the above exception was the direct cause of the following exception"
  TimeoutError: ...                                ← original low-level cause
```
Without `from exc`, the traceback would show only the wrapped exception — during an incident, the original cause is exactly what you need and would otherwise lose.

➕ **`finally` vs context manager — when each is right (a distinction the chapter's example doesn't spell out):**
```python
# finally: fine for one-off cleanup, easy to forget, no reuse
f = open("data.txt")
try:
    process(f)
finally:
    f.close()

# context manager: reusable, composable, can't forget it — prefer this for anything used more than once
with open("data.txt") as f:
    process(f)
```

➕ **Diagram: context manager enter/exit, including the exception path**
```
with workspace() as path:                 @contextmanager
        │                                 def workspace():
        ▼                                     with TemporaryDirectory(...) as tmp:
  __enter__() runs                                 path = Path(tmp)
  (giving you `path`)      ◀──────────────────────  yield path   ← control enters your `with` block here
        │
        ▼
  body of the with block runs
        │
   ┌────┴─────┐
   │          │
 no error   raises
   │          │
   ▼          ▼
__exit__()  __exit__() still runs   ← cleanup happens on BOTH paths
(cleanup)   (cleanup), then the
            exception re-raises
```
This is why `TemporaryDirectory` cleans up "even when the caller raises," as the code comment above states — cleanup lives in `__exit__`, which Python guarantees runs whether the block succeeded or raised.

## Practice before moving on
1. Design exception classes for auth failure, retryable 503, invalid config, and remote command failure. Decide which ones should be retried.
2. Use a context manager to open a temporary workspace and prove it is removed after an exception.
3. Explain why except Exception: pass is dangerous in an automation that changes infrastructure.

➕ 4. Write `sync_inventory` above's test: assert it retries exactly `max_retries` times on `TemporaryAPIError` and re-raises immediately (zero retries) on `AuthenticationError` — this is a realistic interview coding exercise, not just a reading exercise.

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Thinking in exceptions; Defining custom exceptions; Adding context to custom exceptions; Context managers and the with statement; Advanced Retry Decorator with Exponential Backoff and Jitter exercise.
