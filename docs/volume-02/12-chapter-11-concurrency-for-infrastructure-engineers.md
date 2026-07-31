---
title: "Chapter 11 - Concurrency for infrastructure engineers"
slug: "chapter-11-concurrency-for-infrastructure-engineers"
sidebar_position: 12
description: "Chapter 11 - Concurrency for infrastructure engineers — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Choose threads, asyncio, processes, or sequential execution by the bottleneck and operational complexity.


![](pathname:///img/generated/volume-02-04.png)

Figure 4. Concurrency is a bottleneck decision, not an “advanced Python” badge.

Most infrastructure concurrency is I/O-bound: hundreds of HTTP calls, SSH sessions, DNS lookups, or file reads. Threads can overlap blocking I/O with familiar synchronous libraries. asyncio can scale to very high I/O concurrency when the entire call path uses async-compatible libraries. Multiprocessing is useful for CPU-heavy work because separate processes have separate Python interpreters and can execute Python bytecode in parallel.


<!-- source-table:2 -->

```text
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

def health(url: str) -> tuple[str, int]:
    response = requests.get(url, timeout=3)
    return url, response.status_code

urls = [f"https://service-{i}.example/health" for i in range(20)]
with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(health, url) for url in urls]
    for future in as_completed(futures):
        try:
            print(future.result())
        except requests.RequestException as exc:
            print("failed:", exc)
```


The max\_workers limit is operational backpressure. Unbounded concurrency can overload your own machine, the dependency, DNS, ephemeral ports, or rate limits. Senior reasoning includes deciding concurrency limits and failure aggregation, not merely knowing ThreadPoolExecutor syntax.

## Work the scenario step by step


<!-- source-table:3 -->

> Scenario You need to check 2,000 HTTP endpoints every five minutes.


**1\. Estimate latency and service rate limits before picking a concurrency model.**

2\. If using requests, a bounded thread pool is straightforward. If scaling to much higher concurrency and async clients are acceptable, asyncio may reduce thread overhead.

3\. Bound concurrency. Add per-request timeouts.

4\. Collect partial failures without canceling successful results.

5\. Emit metrics for total, success, failure, timeout, and duration distribution.


<!-- source-table:4 -->

> Reasoned conclusion The architecture is “bounded concurrent I/O with observable partial failure,” not simply “use async.”


## Practice before moving on

1\. Rewrite the endpoint checker with asyncio and an async HTTP client if available in your environment.

2\. Explain why multiprocessing is a poor default for 2,000 HTTP requests.

3\. Design a concurrency limit when the upstream API permits 50 requests/second.
