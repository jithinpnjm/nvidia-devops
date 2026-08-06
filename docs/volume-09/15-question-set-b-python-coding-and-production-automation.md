---
title: "Question set B — Python coding and production automation"
slug: "question-set-b-python-coding-and-production-automation"
sidebar_position: 15
description: "Question set B — Python coding and production automation — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
Practice coding in small increments. State the data structure before code, make parsing and policy pure, then add effects. Typical tasks: parse multi-format logs, aggregate errors by service/node, implement bounded retry, query many endpoints concurrently, compare desired/actual state, build a CLI and test it.

**Practice explaining complexity, malformed input and memory strategy**

```python
# Interview task skeleton: summarize failures by node and error type
from collections import Counter, defaultdict
import re

PATTERN = re.compile(
    r"^(?P<ts>\S+)\s+(?P<node>\S+)\s+"
    r"(?P<level>ERROR|CRITICAL|FATAL)\s+(?P<msg>.+)$"
)

def summarize(lines: list[str]) -> dict[str, Counter[str]]:
    result: dict[str, Counter[str]] = defaultdict(Counter)
    for line in lines:
        m = PATTERN.match(line.strip())
        if not m:
            continue
        # In a real problem, classify msg into stable error categories.
        result[m['node']][m['level']] += 1
    return dict(result)
```

## ➕ Additions

➕ **Diagram: the increment ladder this question set expects (say the shape before typing anything):**
```mermaid
flowchart TD
  Prompt["Interview prompt lands (parse logs / aggregate / retry / poll / diff state / CLI)"]
  Prompt --> Structure["1. State the data structure BEFORE code —\nCounter, dict, set, deque, heap — chosen from\nthe dominant operation, not habit"]
  Structure --> Pure["2. Write the PURE parsing/policy function —\nno I/O, no side effects, so it's trivially\ntestable in isolation"]
  Pure --> Test["3. Test the pure function against edge cases —\nmalformed line, empty input, duplicate keys"]
  Test --> Effects["4. Add effects at the boundary — file I/O,\nnetwork calls, bounded retry — kept OUTSIDE\nthe pure core"]
  Effects --> CLI["5. Wrap in a CLI and test the CLI itself,\nnot just the function it calls"]
```
The recurring mistake this diagram guards against: mixing parsing/policy logic with I/O/effects from the first line, which makes the core untestable and the interviewer unable to see your algorithm separately from your plumbing.
