# Chapter 4 — Files, pathlib, regex, JSON and YAML
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Read infrastructure data safely, parse only what is unstructured, and preserve clear boundaries between text and structured data.

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

---
# Chapter 5 — Exceptions and context managers
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Fail deliberately, preserve diagnostic context, and guarantee cleanup of external resources.

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

## Practice before moving on
1. Design exception classes for auth failure, retryable 503, invalid config, and remote command failure. Decide which ones should be retried.
2. Use a context manager to open a temporary workspace and prove it is removed after an exception.
3. Explain why except Exception: pass is dangerous in an automation that changes infrastructure.

➕ 4. Write `sync_inventory` above's test: assert it retries exactly `max_retries` times on `TemporaryAPIError` and re-raises immediately (zero retries) on `AuthenticationError` — this is a realistic interview coding exercise, not just a reading exercise.

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Thinking in exceptions; Defining custom exceptions; Adding context to custom exceptions; Context managers and the with statement; Advanced Retry Decorator with Exponential Backoff and Jitter exercise.

---
# Chapter 6 — Logging for operations, not print-debugging
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Create logs that answer what happened, to which resource, in which attempt, and with what outcome.

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

*(original Figure 2 — "input validation, action, observation, and failure behavior explicit" — preserved)*

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
