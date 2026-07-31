---
title: "Chapter 4 - Files, pathlib, regex, JSON and YAML"
slug: "chapter-4-files-pathlib-regex-json-and-yaml"
sidebar_position: 5
description: "Chapter 4 - Files, pathlib, regex, JSON and YAML — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Read infrastructure data safely, parse only what is unstructured, and preserve clear boundaries between text and structured data.


Prefer structured data over regex whenever the source already has structure. Parse JSON with json, YAML with a safe YAML loader, CSV with csv, and use regular expressions for text that is genuinely unstructured or semi-structured. A common failure is using one giant regex to parse data that the producer could emit as JSON.


<!-- source-table:2 -->

```text
from pathlib import Path
import json

def load_inventory(path: Path) -> list[dict]:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except FileNotFoundError as exc:
        raise RuntimeError(f"inventory not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid JSON at line {exc.lineno}") from exc

    if not isinstance(data, list):
        raise ValueError("inventory root must be a list")
    return data
```


**Use named groups when regex is producing a structured record**


<!-- source-table:3 -->

```text
import re

LOG = re.compile(
    r"^(?P<ts>\S+)\s+(?P<level>ERROR|CRITICAL|FATAL)\s+"
    r"service=(?P<service>[\w-]+)\s+message=(?P<message>.+)$"
)

def parse_error(line: str) -> dict[str, str] | None:
    match = LOG.search(line)
    return match.groupdict() if match else None
```


Named groups convert a cryptic regex into an extraction schema. Still, never make regex your first choice for Kubernetes API output: request JSON from the API or kubectl -o json and parse the JSON. This is more robust across spacing and formatting changes.


<!-- source-table:4 -->

```text
from pathlib import Path

log = Path("/var/log/myservice/events.log")
with log.open(encoding="utf-8") as handle:
    for line in handle:          # streaming, not read-all-at-once
        if event := parse_error(line):
            print(event)
```


<!-- source-table:5 -->

> Memory hook Use pathlib for “where is the file?”, format-specific parsers for “what data is inside?”, and regex only for “what pattern is hidden in raw text?”


## Work the scenario step by step


<!-- source-table:6 -->

> Scenario A 20 GB application log must be searched for ERROR/CRITICAL events without exhausting memory.


**1\. Do not call read\_text() or readlines() on the whole file.**

2\. Open the file and iterate line by line; the file object is already an iterator.

3\. Compile the regex once outside the loop.

4\. Yield matching events so downstream processing can remain lazy.

5\. Keep output bounded or stream it to a sink rather than accumulating millions of results.


<!-- source-table:7 -->

> Reasoned conclusion The core design is streaming I/O plus lazy transformation, not a bigger machine.


## Practice before moving on

1\. Parse a Kubernetes JSON pod list and return pods whose containerStatuses contain non-zero restart counts.

2\. Write a regex with named groups for timestamp, severity, request ID, and message.

3\. Create a config loader that accepts a Path and validates required top-level keys.

## Targeted references

[Python pathlib documentation](https://docs.python.org/3/library/pathlib.html) - Path-oriented filesystem operations.

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: The Path object; Regex: Introduction and essentials; Log Line Error Detector; JSON deserialization; Introduction to YAML operations; Log File Archiver.
