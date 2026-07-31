---
title: "Chapter 8 - HTTP APIs, timeouts, retries and backoff"
slug: "chapter-8-http-apis-timeouts-retries-and-backoff"
sidebar_position: 9
description: "Chapter 8 - HTTP APIs, timeouts, retries and backoff — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Build clients that distinguish client errors, transient server errors, rate limiting, and network failure.


A reliable API client has policy. It does not retry everything. Authentication errors usually require corrected credentials, not ten more attempts. Validation errors are deterministic. A 429 may be retryable according to Retry-After. Many 5xx responses and network timeouts can be transient. The retry layer must understand idempotency: retrying GET is usually safe; retrying a POST that creates a resource may duplicate work unless the API provides an idempotency key or the operation is otherwise safe.

![](pathname:///img/generated/volume-02-03.png)

Figure 3. Retry is a policy branch after classification, not a loop around every exception.


<!-- source-table:2 -->

```text
import random
import time
import requests

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

## Work the scenario step by step


<!-- source-table:3 -->

> Scenario A cloud API returns 503 to 500 CI jobs at the same time.


**1\. Do not have every job retry at the same fixed one-second interval; that creates synchronized load spikes.**

2\. Use exponential backoff so request rate drops while the dependency recovers.

3\. Add jitter so clients spread their retries across time.

4\. Respect server guidance such as Retry-After when present.

5\. Cap attempts and total time; an automation that retries forever is not reliable.


<!-- source-table:4 -->

> Reasoned conclusion Retry behavior must reduce pressure on a failing dependency, not amplify it.


## Practice before moving on

1\. Classify 400, 401, 403, 404, 409, 429, 500, 503 into retry/no-retry decisions and justify each.

2\. Add a Retry-After branch to the sample client.

3\. Implement pagination for an API returning next-page tokens.

## Targeted references

[Requests documentation](https://requests.readthedocs.io/) - HTTP client API and exceptions.

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: GET requests; HTTP status codes; Token-based authentication; Handling timeouts; Retries: Simple strategy; Retries: Exponential backoff with jitter.
