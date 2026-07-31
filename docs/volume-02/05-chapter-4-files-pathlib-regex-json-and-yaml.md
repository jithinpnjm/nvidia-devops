---
title: "Chapter 4 - Files, pathlib, regex, JSON and YAML"
slug: "chapter-4-files-pathlib-regex-json-and-yaml"
sidebar_position: 5
description: "Chapter 4 - Files, pathlib, regex, JSON and YAML — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Read infrastructure data safely, parse only what is unstructured, and preserve clear boundaries between text and structured data.

Prefer structured data over regex whenever the source already has structure. Parse JSON with json, YAML with a safe YAML loader, CSV with csv, and use regular expressions for text that is genuinely unstructured or semi-structured. A common failure is using one giant regex to parse data that the producer could emit as JSON.
```python
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
```python
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
```python
from pathlib import Path
log = Path("/var/log/myservice/events.log")
with log.open(encoding="utf-8") as handle:
    for line in handle:  # streaming, not read-all-at-once
        if event := parse_error(line):
            print(event)
```
**Memory hook:** Use pathlib for "where is the file?", format-specific parsers for "what data is inside?", and regex only for "what pattern is hidden in raw text?"

➕ **Diagram: which parser, decided by what the source already is**
```
producer emits data
        │
        ▼
Is it already JSON/YAML/CSV? ──yes──▶ json.loads / yaml.safe_load / csv.reader
        │no (genuinely unstructured text)
        ▼
  compile a regex with named groups ──▶ match.groupdict()
```
The chapter's warning about "one giant regex parsing data the producer could emit as JSON" is exactly this decision point skipped — regex is the fallback, not the default.

➕ **Diagram: streaming line-by-line vs loading the whole file**
```
read_text() / readlines()                for line in handle:   (streaming)
┌──────────────────────────┐             ┌────┐
│ entire 20GB file in RAM  │  ✗ OOM      │ L1 │─▶ process ─▶ discard
└──────────────────────────┘             ├────┤
                                          │ L2 │─▶ process ─▶ discard
                                          ├────┤
                                          │ .. │   only ONE line in memory at a time
                                          └────┘
```

➕ **YAML's specific footgun this chapter's title mentions but doesn't demo — never use `yaml.load()` unqualified:**
```python
import yaml
config = yaml.safe_load(open("config.yaml"))   # correct — restricted to basic types
# yaml.load(open("config.yaml"))  # DANGEROUS without Loader= — can execute arbitrary Python objects
```
`yaml.safe_load` vs bare `yaml.load` is a real, concrete security question worth having a one-sentence answer for: untrusted YAML parsed with the unsafe loader is a known code-execution vector (`!!python/object` tags), which is exactly why every linter flags bare `yaml.load()`.

➕ **The 20GB-log streaming pattern generalized to `jq`-style JSON streaming (since K8s API output is often huge):**
```python
import ijson  # streaming JSON parser — doesn't load the whole document into memory
with open("huge_pod_list.json", "rb") as f:
    for pod in ijson.items(f, "items.item"):
        if pod["status"]["phase"] == "Failed":
            print(pod["metadata"]["name"])
```
`json.load()` on a multi-GB `kubectl get pods -A -o json` dump from a large cluster is the JSON equivalent of the chapter's log-file memory trap — `ijson` (or paginating the API call itself) is the fix.

## Work the scenario step by step
**Scenario:** A 20 GB application log must be searched for ERROR/CRITICAL events without exhausting memory.
1. Do not call read_text() or readlines() on the whole file.
2. Open the file and iterate line by line; the file object is already an iterator.
3. Compile the regex once outside the loop.
4. Yield matching events so downstream processing can remain lazy.
5. Keep output bounded or stream it to a sink rather than accumulating millions of results.

**Reasoned conclusion:** The core design is streaming I/O plus lazy transformation, not a bigger machine.

## Practice before moving on
1. Parse a Kubernetes JSON pod list and return pods whose containerStatuses contain non-zero restart counts.
2. Write a regex with named groups for timestamp, severity, request ID, and message.
3. Create a config loader that accepts a Path and validates required top-level keys.

➕ 4. Convert the log-parsing generator (`parse_error`) into one that also yields progress every 1M lines processed — this "make long-running streaming jobs observable" instinct is what separates a script from production tooling.

## Targeted references
[Python pathlib documentation](https://docs.python.org/3/library/pathlib.html) - Path-oriented filesystem operations.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: The Path object; Regex: Introduction and essentials; Log Line Error Detector; JSON deserialization; Introduction to YAML operations; Log File Archiver.
