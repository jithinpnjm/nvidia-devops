---
title: "Chapter 8 - HTTP APIs, timeouts, retries and backoff"
slug: "chapter-8-http-apis-timeouts-retries-and-backoff"
sidebar_position: 9
description: "Chapter 8 - HTTP APIs, timeouts, retries and backoff — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Build clients that distinguish client errors, transient server errors, rate limiting, and network failure.

A reliable API client has policy. It does not retry everything. Authentication errors usually require corrected credentials, not ten more attempts. Validation errors are deterministic. A 429 may be retryable according to Retry-After. Many 5xx responses and network timeouts can be transient. The retry layer must understand idempotency: retrying GET is usually safe; retrying a POST that creates a resource may duplicate work unless the API provides an idempotency key or the operation is otherwise safe.

![](pathname:///img/generated/volume-02-03.png)

Figure 3. Retry is a policy branch after classification, not a loop around every exception.
```python
import random, time, requests
RETRYABLE = {429, 500, 502, 503, 504}

def get_json(url: str, token: str, attempts: int = 4) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(url, headers=headers, timeout=(2, 8))
            if response.status_code not in RETRYABLE:
                response.raise_for_status()
                return response.json()
        except (requests.Timeout, requests.ConnectionError):
            if attempt == attempts:
                raise
        else:
            if attempt == attempts:
                response.raise_for_status()
        delay = min(8.0, 0.5 * (2 ** (attempt - 1)))
        time.sleep(delay + random.uniform(0, delay * 0.2))
    raise AssertionError("unreachable")
```
The timeout tuple above separates connect timeout from read timeout. Jitter prevents many clients from retrying in lockstep after a shared outage. In mature systems, prefer a tested retry library or HTTP adapter configuration, but first understand the policy you expect the library to implement.

➕ **Backoff sequence, with real numbers, so "exponential with jitter" isn't just a phrase:**
```
attempt 1: base delay 0.5s  → sleep 0.5-0.6s
attempt 2: base delay 1.0s  → sleep 1.0-1.2s
attempt 3: base delay 2.0s  → sleep 2.0-2.4s
attempt 4: base delay 4.0s  → sleep 4.0-4.8s   (capped at 8.0s max in this implementation)
```
Without jitter (the `random.uniform` term), every client that started retrying at the same moment (e.g. all hit the outage simultaneously) retries in perfect lockstep — turning a brief blip into a repeating thundering herd. Jitter is what actually spreads the retry storm out — worth being able to draw this timeline from memory.

➕ **The Retry-After header — the one thing the chapter's Practice #2 asks you to add, worked out:**
```python
if response.status_code == 429 and "Retry-After" in response.headers:
    delay = float(response.headers["Retry-After"])   # server told you exactly how long — trust it
else:
    delay = min(8.0, 0.5 * (2 ** (attempt - 1))) + random.uniform(0, 0.2)   # fall back to your own backoff
```
**Interview framing:** "if the server tells you how long to wait, that's better information than your own guess — always prefer explicit server guidance over client-side backoff math when it's available."

## Work the scenario step by step
**Scenario:** A cloud API returns 503 to 500 CI jobs at the same time.
1. Do not have every job retry at the same fixed one-second interval; that creates synchronized load spikes.
2. Use exponential backoff so request rate drops while the dependency recovers.
3. Add jitter so clients spread their retries across time.
4. Respect server guidance such as Retry-After when present.
5. Cap attempts and total time; an automation that retries forever is not reliable.

**Reasoned conclusion:** Retry behavior must reduce pressure on a failing dependency, not amplify it.

## Practice before moving on
1. Classify 400, 401, 403, 404, 409, 429, 500, 503 into retry/no-retry decisions and justify each.
2. Add a Retry-After branch to the sample client.
3. Implement pagination for an API returning next-page tokens.

➕ 4. Sketch (pseudocode is fine) a circuit breaker on top of this retry client: after N consecutive failures to one host, stop even attempting requests for a cooldown window rather than retrying every single call — this is the pattern that protects a *dependency* from being hammered, one level above per-call retry/backoff, and a natural "what would you add for production" follow-up.

## Targeted references
[Requests documentation](https://requests.readthedocs.io/) - HTTP client API and exceptions.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: GET requests; HTTP status codes; Token-based authentication; Handling timeouts; Retries: Simple strategy; Retries: Exponential backoff with jitter.

➕ **Visual model — a retry is a bounded state machine, not a loop:**
```
request ─► response?
             │
   ┌─────────┼────────────────────────┐
   │ 2xx     │ retryable 5xx/timeout   │ non-retryable 4xx
   ▼         ▼                         ▼
success   backoff + jitter ─► deadline?  fail with context
              │                 │
              └── next attempt   └── fail; stop spending budget
```
**Memory hook:** *"Retry the condition, cap the time, add randomness."* A retry budget is part of the caller's latency budget, so no attempt can be evaluated in isolation.
