---
title: "Senior Deep Dive 3 — Build API clients that fail safely"
slug: "senior-deep-dive-3-build-api-clients-that-fail-safely"
sidebar_position: 20
description: "Senior Deep Dive 3 — Build API clients that fail safely — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
![](pathname:///img/generated/volume-02-08.png)

_Figure B. Concurrency is chosen by the bottleneck, not because async is fashionable._

Remote APIs fail in several distinct ways: DNS/connect timeout, TLS failure, read timeout, 4xx client error, 429 rate limit, 5xx server error, truncated response, incompatible schema and success responses containing semantically invalid data. A retry policy must classify these failures. Retrying a validation error only amplifies load; retrying a non-idempotent POST can duplicate side effects.

**Resilient GET client: bounded retries, timeout tuple and full jitter**

from \_\_future\_\_ import annotations
    import random, time
from dataclasses import dataclass
    import requests

@dataclass(frozen=True)
class RetryPolicy:
    attempts: int = 4
    base\_delay\_s: float = 0.25
    max\_delay\_s: float = 4.0

class JsonApi:
    def \_\_init\_\_(self, base\_url: str, token: str, policy: RetryPolicy):
        self.base\_url = base\_url.rstrip("/")
        self.policy = policy
        self.session = requests.Session()
        self.session.headers.update(&#123;"Authorization": f"Bearer &#123;token&#125;"&#125;)

    def get(self, path: str) -> dict:
        last\_error: Exception | None = None
        for attempt in range(self.policy.attempts):
            try:
                r = self.session.get(
                    self.base\_url + path,
                    timeout=(2.0, 8.0),
                )
                if r.status\_code == 429 or 500 &lt;= r.status\_code &lt; 600:
                    raise requests.HTTPError(f"retryable &#123;r.status\_code&#125;", response=r)
                r.raise\_for\_status()
                payload = r.json()
                if not isinstance(payload, dict):
                    raise ValueError("expected JSON object")
                return payload
            except (requests.Timeout, requests.ConnectionError,
                    requests.HTTPError) as exc:
                last\_error = exc
                if attempt == self.policy.attempts - 1:
                    break
                cap = min(self.policy.max\_delay\_s,
                          self.policy.base\_delay\_s \* 2\*\*attempt)
                time.sleep(random.uniform(0, cap))
        raise RuntimeError("API request exhausted retries") from last\_error

A senior engineer also thinks about budgets. If a CLI checks 500 nodes and each call can wait 8 seconds with four retries, the worst-case runtime is unacceptable. Bound concurrency, set a global deadline, cache immutable responses when appropriate, and expose retry counts and latency in logs/metrics.
