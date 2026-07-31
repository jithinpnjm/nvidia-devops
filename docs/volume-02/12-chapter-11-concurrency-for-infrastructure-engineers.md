---
title: "Chapter 11 - Concurrency for infrastructure engineers"
slug: "chapter-11-concurrency-for-infrastructure-engineers"
sidebar_position: 12
description: "Chapter 11 - Concurrency for infrastructure engineers — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Choose threads, asyncio, processes, or sequential execution by the bottleneck and operational complexity.

![](pathname:///img/generated/volume-02-04.png)

Figure 4. Concurrency is a bottleneck decision, not an "advanced Python" badge.

Most infrastructure concurrency is I/O-bound: hundreds of HTTP calls, SSH sessions, DNS lookups, or file reads. Threads can overlap blocking I/O with familiar synchronous libraries. asyncio can scale to very high I/O concurrency when the entire call path uses async-compatible libraries. Multiprocessing is useful for CPU-heavy work because separate processes have separate Python interpreters and can execute Python bytecode in parallel.
```python
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
The max_workers limit is operational backpressure. Unbounded concurrency can overload your own machine, the dependency, DNS, ephemeral ports, or rate limits. Senior reasoning includes deciding concurrency limits and failure aggregation, not merely knowing ThreadPoolExecutor syntax.

➕ **The GIL — the concept this whole chapter's threads-vs-processes choice hinges on, stated precisely:**
```
Threads:    ONE Python interpreter, GIL means only one thread executes Python bytecode at a time
            → useless for CPU-bound work, GREAT for I/O-bound (GIL released during I/O wait)
Processes:  MULTIPLE interpreters, real parallelism, no shared GIL
            → correct for CPU-bound work, but pay serialization cost to pass data between processes
Asyncio:    ONE thread, ONE interpreter, cooperative — no GIL contention at all because there's
            only ever one thing running, just very efficient at switching during I/O waits
```
**The interview one-liner:** "threads are for waiting, processes are for computing — the GIL means threads don't actually parallelize Python code, they parallelize *waiting* for I/O." This single sentence answers "why not just use threads for everything" correctly and completely.

➕ **Why multiprocessing is wrong for 2,000 HTTP requests (Practice #2, worked out):** each process has fixed startup overhead (new interpreter, re-importing modules) and the actual work (waiting on network I/O) never touches the GIL restriction in the first place — you'd pay heavy process-spawn cost to parallelize something that was never CPU-bound. `ThreadPoolExecutor` or `asyncio` both sidestep the GIL problem correctly here because it was never a GIL problem — it's an I/O-wait problem.

➕ **asyncio version of the same health-check, for comparison (Practice #1):**
```python
import asyncio, aiohttp

async def health(session, url):
    async with session.get(url, timeout=3) as resp:
        return url, resp.status

async def check_all(urls):
    async with aiohttp.ClientSession() as session:
        results = await asyncio.gather(*(health(session, u) for u in urls), return_exceptions=True)
    return results
```
Note `return_exceptions=True` — without it, one failed request cancels the entire `gather()` batch, exactly the "collect partial failures without canceling successful results" requirement from the worked scenario below.

## Work the scenario step by step
**Scenario:** You need to check 2,000 HTTP endpoints every five minutes.
1. Estimate latency and service rate limits before picking a concurrency model.
2. If using requests, a bounded thread pool is straightforward. If scaling to much higher concurrency and async clients are acceptable, asyncio may reduce thread overhead.
3. Bound concurrency. Add per-request timeouts.
4. Collect partial failures without canceling successful results.
5. Emit metrics for total, success, failure, timeout, and duration distribution.

**Reasoned conclusion:** The architecture is "bounded concurrent I/O with observable partial failure," not simply "use async."

## Practice before moving on
1. Rewrite the endpoint checker with asyncio and an async HTTP client if available in your environment.
2. Explain why multiprocessing is a poor default for 2,000 HTTP requests.
3. Design a concurrency limit when the upstream API permits 50 requests/second.

➕ 4. Add an `asyncio.Semaphore(50)` around the `health()` calls in the asyncio version above to implement the rate limit from Practice #3 — this is the concrete, working answer to "how do you actually bound async concurrency," not just the concept.

➕ **Visual model — concurrency needs a gate and a deadline:**
```
200 targets ─► work queue ─► semaphore (50 permits) ─► in-flight I/O ─► results
                    │                  │                     │
                    │                  └── protects target and local fds/memory
                    └── cancellation / global deadline ──────┘
```
**Memory hook:** *"More tasks is not more throughput once the downstream system is saturated."* The semaphore is a safety control, not merely a performance setting.
