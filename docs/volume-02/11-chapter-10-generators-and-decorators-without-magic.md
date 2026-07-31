---
title: "Chapter 10 - Generators and decorators without magic"
slug: "chapter-10-generators-and-decorators-without-magic"
sidebar_position: 11
description: "Chapter 10 - Generators and decorators without magic — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Use generators for lazy streams and decorators for reusable cross-cutting behavior while preserving function semantics.


A generator is a function that can suspend its execution at yield and resume later. It is valuable when the data stream may be large or indefinite. Instead of returning one huge list of parsed log events, yield one event at a time and let the caller decide how far to consume the stream.


<!-- source-table:2 -->

```text
from pathlib import Path
from collections.abc import Iterator

def error_lines(path: Path) -> Iterator[str]:
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if "ERROR" in line or "CRITICAL" in line:
                yield line.rstrip("\n")
```


**A decorator wraps a function but should preserve its metadata and return value**


<!-- source-table:3 -->

```text
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


functools.wraps copies important metadata such as \_\_name\_\_ and \_\_doc\_\_. Without it, tooling and debugging may report the wrapper rather than the wrapped function. A production decorator should also preserve exceptions unless it has a deliberate policy for translating or retrying them.

## Practice before moving on

1\. Modify error\_lines() to parse and yield structured events instead of raw strings.

2\. Write a decorator that rejects calls when a required environment variable is absent.

3\. Explain why a generator is usually preferable to returning a 10-million-element list.

## Targeted references

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Generator syntax; The yield statement; State in generators; Coding lazy pipelines; Introduction to decorators; functools.wraps; RBAC Decorator Factory exercise.
