---
title: "Chapter 10 - Generators and decorators without magic"
slug: "chapter-10-generators-and-decorators-without-magic"
sidebar_position: 11
description: "Chapter 10 - Generators and decorators without magic — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Use generators for lazy streams and decorators for reusable cross-cutting behavior while preserving function semantics.

A generator is a function that can suspend its execution at yield and resume later. It is valuable when the data stream may be large or indefinite. Instead of returning one huge list of parsed log events, yield one event at a time and let the caller decide how far to consume the stream.
```python
from pathlib import Path
from collections.abc import Iterator

def error_lines(path: Path) -> Iterator[str]:
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if "ERROR" in line or "CRITICAL" in line:
                yield line.rstrip("\n")
```
**A decorator wraps a function but should preserve its metadata and return value**
```python
from functools import wraps
from time import perf_counter

def timed(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            elapsed = perf_counter() - start
            print(f"{func.__name__} took {elapsed:.3f}s")
    return wrapper
```
functools.wraps copies important metadata such as __name__ and __doc__. Without it, tooling and debugging may report the wrapper rather than the wrapped function. A production decorator should also preserve exceptions unless it has a deliberate policy for translating or retrying them.

➕ **Prove the `@wraps` point with actual output — this is a real "what does this print and why" interview question:**
```python
@timed
def check_disk(): """Checks disk health."""; return True

print(check_disk.__name__)   # with @wraps: "check_disk"    | without @wraps: "wrapper"
print(check_disk.__doc__)    # with @wraps: "Checks disk..." | without @wraps: None
```
Without `@wraps`, every function you decorate silently loses its identity to debuggers, `help()`, and any tooling that introspects `__name__` (including some test frameworks) — a subtle bug that's invisible until something downstream breaks mysteriously.

➕ **A decorator that composes with the retry logic from Chapter 8 — turning the whole retry loop into one reusable line:**
```python
from functools import wraps
import time, random

def retry(attempts=4, retryable=(TimeoutError, ConnectionError)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except retryable:
                    if attempt == attempts:
                        raise
                    delay = min(8.0, 0.5 * (2 ** (attempt - 1)))
                    time.sleep(delay + random.uniform(0, delay * 0.2))
        return wrapper
    return decorator

@retry(attempts=3, retryable=(requests.Timeout,))
def fetch_inventory(): ...
```
This is the exact "why do decorators matter" answer: Chapter 8's whole retry function body becomes a one-line annotation, reusable across every API call in the codebase instead of copy-pasted.

## Practice before moving on
1. Modify error_lines() to parse and yield structured events instead of raw strings.
2. Write a decorator that rejects calls when a required environment variable is absent.
3. Explain why a generator is usually preferable to returning a 10-million-element list.

➕ 4. Write the `@wraps` before/after demo above yourself and run it — this is exactly the kind of "predict the output" question asked live in coding interviews.

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Generator syntax; The yield statement; State in generators; Coding lazy pipelines; Introduction to decorators; functools.wraps; RBAC Decorator Factory exercise.

➕ **Visual model — generators pull; decorators wrap:**
```
source records ──next()──► generator ──yield one value──► consumer
                                  ▲                         │
                                  └──── next value only when needed

call ─► @decorator before ─► original function ─► @decorator after ─► result
```
**Memory hook:** *"`yield` pauses production; a decorator adds a boundary."* Both preserve a small, composable unit of work instead of materializing or duplicating the whole workflow.
