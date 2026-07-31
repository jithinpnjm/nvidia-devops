---
title: "Senior Deep Dive 6 — Structured logs, metrics and correlation IDs"
slug: "senior-deep-dive-6-structured-logs-metrics-and-correlation-ids"
sidebar_position: 23
description: "Senior Deep Dive 6 — Structured logs, metrics and correlation IDs — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
A production tool should explain what it did without a debugger. Log events, not prose. Include stable fields such as operation, cluster, namespace, node, attempt, elapsed\_ms and correlation\_id. Do not put secrets or high-cardinality unbounded payloads into metrics labels. Logs answer “what happened”; metrics answer “how often/how much”; traces answer “where time went”.

**Minimal structured logger**

    import json, logging, time, uuid

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = &#123;
            "ts": time.time(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "correlation\_id": getattr(record, "correlation\_id", None),
            "node": getattr(record, "node", None),
        &#125;
        if record.exc\_info:
            payload\["exception"\] = self.formatException(record.exc\_info)
        return json.dumps(payload, separators=(",", ":"))

handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
log = logging.getLogger("fleetcheck")
log.addHandler(handler); log.setLevel(logging.INFO)

cid = str(uuid.uuid4())
log.info("gpu check started", extra=&#123;"correlation\_id": cid,
                                     "node": "gpu-node-07"&#125;)

## Senior addendum

➕ **Sample output from the `JsonFormatter` above, and why each field earns its place:**
```json
{"ts":1738245600.123,"level":"INFO","message":"gpu check started","logger":"fleetcheck","correlation_id":"a1b2c3d4-...","node":"gpu-node-07"}
```
Every field here answers a specific incident-review question: `ts` — when; `correlation_id` — which run, so you can grep every log line from one invocation across a distributed fan-out; `node` — which GPU host, so you're not grepping 200 nodes' worth of interleaved output by hand. **The logs/metrics/traces distinction from the text, memorized as one line:** "logs say what happened once, metrics say how often across everything, traces say where the time went within one request" — three different questions, three different tools, don't try to answer all three with one of them.

➕ **Visual model — correlation is the join key across evidence planes:**
```
one CLI run / request id
      ├── structured logs: exact event + node
      ├── metrics: rate / duration across fleet
      └── trace: ordered latency path
                 │
                 ▼
          one explainable incident narrative
```
**Memory hook:** *"Same ID, different questions."*
