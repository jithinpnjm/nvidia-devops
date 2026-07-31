---
title: "Chapter 6 - Logging for operations, not print-debugging"
slug: "chapter-6-logging-for-operations-not-print-debugging"
sidebar_position: 7
description: "Chapter 6 - Logging for operations, not print-debugging — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Create logs that answer what happened, to which resource, in which attempt, and with what outcome.

Operational logging is structured evidence. A useful record includes event type, resource identity, correlation or request ID, attempt count, duration, outcome, and exception information. Human prose alone is hard to aggregate; JSON fields can be indexed and queried.
```python
import json, logging
from datetime import datetime, timezone

logger = logging.getLogger("infra_doctor")

def log_event(event: str, **fields: object) -> None:
    payload = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **fields}
    logger.info(json.dumps(payload, default=str))
```
```python
log_event("api_request_completed", service="inventory", status=200, duration_ms=184, attempt=1)
```
In a larger system, use logging configuration and a JSON formatter instead of manually json.dumps() every message. The conceptual goal is the same: logs should be machine-queryable while remaining understandable during an incident.

![](pathname:///img/generated/volume-02-02.png)

Figure 2. Reliable automation makes input validation, action, observation, and failure behavior explicit.

➕ **Correlation IDs across a distributed call chain — the piece that turns per-service logs into one traceable story:**
```python
import contextvars
request_id_var = contextvars.ContextVar("request_id", default=None)

def log_event(event: str, **fields):
    payload = {"ts": ..., "event": event, "request_id": request_id_var.get(), **fields}
    logger.info(json.dumps(payload, default=str))

# at the entry point of a request:
request_id_var.set(str(uuid.uuid4()))
```
`contextvars` (not a plain global variable — that breaks under `asyncio`/threading) lets every log line inside one logical request automatically carry the same ID without threading it through every function signature manually. This is the exact mechanism behind "correlation ID" logging in real systems, and it's a natural bridge into Deep Dive 6 (structured logs/correlation IDs) later in this volume.

➕ **Diagram: one correlation ID threaded through a call chain**
```
entry point: request_id_var.set(uuid4())     request_id = "a1b2..."
        │
        ▼
  fetch_inventory()  ─▶ log_event("api_call")         {"request_id":"a1b2...", "event":"api_call"}
        │
        ▼
  classify()          ─▶ log_event("classified")      {"request_id":"a1b2...", "event":"classified"}
        │
        ▼
  write_report()       ─▶ log_event("report_written") {"request_id":"a1b2...", "event":"report_written"}
```
Every line carries the SAME request_id without it being passed as a parameter — `contextvars` carries it implicitly through the call chain, and safely across threads/asyncio tasks.

➕ **Secret redaction — the chapter names it, here's the actual filter:**
```python
import logging, re
class RedactSecrets(logging.Filter):
    PATTERN = re.compile(r'(token|password|api[_-]?key)=([^\s&]+)', re.IGNORECASE)
    def filter(self, record):
        record.msg = self.PATTERN.sub(r'\1=***REDACTED***', str(record.msg))
        return True

logger.addFilter(RedactSecrets())
```
This is the exact `logging.Filter` the Practice section below asks you to write — worth having built once before an interview asks for it live.

➕ **Diagram: where redaction sits in the logging pipeline**
```
logger.info("token=abc123 login ok")
        │
        ▼
  RedactSecrets.filter(record)     ← runs BEFORE the line leaves the process
        │  regex finds "token=abc123"
        ▼
record.msg = "token=***REDACTED***  login ok"
        │
        ▼
  StreamHandler / JSON formatter ──▶ stdout / log sink   (secret never reaches here)
```

## Work the scenario step by step
**Scenario:** A script failed in CI three hours ago, but the only output is "request failed."
1. Identify what context is missing: endpoint, resource, status code, attempt number, timeout, correlation ID, exception class.
2. Add structured fields rather than concatenating one giant string.
3. Log once at the layer that owns the operational meaning; avoid logging the same exception at every layer.
4. Ensure secrets and tokens are filtered before logs leave the process.

**Reasoned conclusion:** Logging quality is part of program design because incidents happen after the original stack frame is gone.

## Practice before moving on
1. Add duration_ms to a context-manager-based operation timer.
2. Create a logging.Filter that masks a token-like field.
3. Define DEBUG/INFO/WARNING/ERROR usage for a retrying API client.

➕ 4. Add `request_id` propagation to the `sync_inventory` function from Chapter 5 so every retry attempt's log line carries the same correlation ID — this ties Ch5's retry logic to Ch6's logging in the way a real incident investigation actually needs both together.

## Targeted references
[Python logging HOWTO](https://docs.python.org/3/howto/logging.html) - Core logging concepts and configuration.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Why logging?; Log levels; Structured logging with JSON; Extra fields and exceptions in structured logging; Dynamic log configuration.
