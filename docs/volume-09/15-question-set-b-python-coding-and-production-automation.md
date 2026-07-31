---
title: "Question set B — Python coding and production automation"
slug: "question-set-b-python-coding-and-production-automation"
sidebar_position: 15
description: "Question set B — Python coding and production automation — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
Practice coding in small increments. State the data structure before code, make parsing and policy pure, then add effects. Typical tasks: parse multi-format logs, aggregate errors by service/node, implement bounded retry, query many endpoints concurrently, compare desired/actual state, build a CLI and test it.

**Practice explaining complexity, malformed input and memory strategy**

\# Interview task skeleton: summarize failures by node and error type
from collections import Counter, defaultdict
    import re

PATTERN = re.compile(
    r"^(?P&lt;ts>\\S+)\\s+(?P&lt;node>\\S+)\\s+"
    r"(?P&lt;level>ERROR|CRITICAL|FATAL)\\s+(?P&lt;msg>.+)$"
)

def summarize(lines: list\[str\]) -> dict\[str, Counter\[str\]\]:
    result: dict\[str, Counter\[str\]\] = defaultdict(Counter)
    for line in lines:
        m = PATTERN.match(line.strip())
        if not m:
            continue
        # In a real problem, classify msg into stable error categories.
        result\[m\['node'\]\]\[m\['level'\]\] += 1
    return dict(result)
