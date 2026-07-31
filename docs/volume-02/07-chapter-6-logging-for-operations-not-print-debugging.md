---
title: "Chapter 6 - Logging for operations, not print-debugging"
slug: "chapter-6-logging-for-operations-not-print-debugging"
sidebar_position: 7
description: "Chapter 6 - Logging for operations, not print-debugging — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Create logs that answer what happened, to which resource, in which attempt, and with what outcome.


Operational logging is structured evidence. A useful record includes event type, resource identity, correlation or request ID, attempt count, duration, outcome, and exception information. Human prose alone is hard to aggregate; JSON fields can be indexed and queried.


<!-- source-table:2 -->

```text
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger("infra_doctor")

def log_event(event: str, **fields: object) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **fields,
    }
    logger.info(json.dumps(payload, default=str))
```


<!-- source-table:3 -->

```text
log_event(
    "api_request_completed",
    service="inventory",
    status=200,
    duration_ms=184,
    attempt=1,
)
```


In a larger system, use logging configuration and a JSON formatter instead of manually json.dumps() every message. The conceptual goal is the same: logs should be machine-queryable while remaining understandable during an incident.

![](pathname:///img/generated/volume-02-02.png)

Figure 2. Reliable automation makes input validation, action, observation, and failure behavior explicit.

## Work the scenario step by step


<!-- source-table:4 -->

> Scenario A script failed in CI three hours ago, but the only output is “request failed.”


**1\. Identify what context is missing: endpoint, resource, status code, attempt number, timeout, correlation ID, exception class.**

2\. Add structured fields rather than concatenating one giant string.

3\. Log once at the layer that owns the operational meaning; avoid logging the same exception at every layer.

4\. Ensure secrets and tokens are filtered before logs leave the process.


<!-- source-table:5 -->

> Reasoned conclusion Logging quality is part of program design because incidents happen after the original stack frame is gone.


## Practice before moving on

1\. Add duration\_ms to a context-manager-based operation timer.

2\. Create a logging.Filter that masks a token-like field.

3\. Define DEBUG/INFO/WARNING/ERROR usage for a retrying API client.

## Targeted references

[Python logging HOWTO](https://docs.python.org/3/howto/logging.html) - Core logging concepts and configuration.

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Why logging?; Log levels; Structured logging with JSON; Extra fields and exceptions in structured logging; Dynamic log configuration.
