---
title: "Chapter 2 - Python coding interview workflow"
slug: "chapter-2-python-coding-interview-workflow"
sidebar_position: 2
description: "Chapter 2 - Python coding interview workflow — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Turn an infrastructure problem into algorithm, data structures, functions, tests and edge cases before production hardening.


<!-- source-table:2 -->

```text
Problem
  -> define input/output
  -> identify dominant operation
  -> choose data structure
  -> pseudocode
  -> implement smallest correct core
  -> test edge cases
  -> discuss complexity
  -> add production reliability
```


Example prompt: “Parse a large log and report ERROR/CRITICAL counts by service.” Say: stream file line-by-line; regex or structured parser extracts severity/service; Counter\[str\] aggregates; skip/track malformed lines; O(n) time and O(k) memory where k is number of services, not number of lines.


<!-- source-table:3 -->

```text
from collections import Counter
from collections.abc import Iterable
import re

EVENT = re.compile(r"level=(ERROR|CRITICAL).*service=([\w-]+)")

def count_errors(lines: Iterable[str]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for line in lines:
        match = EVENT.search(line)
        if match:
            counts[match.group(2)] += 1
    return counts
```


Then discuss malformed input, memory, testing, structured logs, and whether JSON output would be more reliable than regex when available. Do not start by inventing classes or concurrency before the core algorithm is correct.
