---
title: "Senior Deep Dive 4 — Async, threads and processes with backpressure"
slug: "senior-deep-dive-4-async-threads-and-processes-with-backpressure"
sidebar_position: 21
description: "Senior Deep Dive 4 — Async, threads and processes with backpressure — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
For infrastructure work, most concurrency is I/O concurrency: querying many APIs, reading many files or running remote checks. Threads are often the simplest option for blocking libraries; asyncio is powerful when the whole dependency chain is async; processes are appropriate for CPU-heavy pure Python work. The critical production feature is bounded concurrency. Launching 10,000 tasks simultaneously can exhaust file descriptors, memory or the remote service.

**Bounded fan-out for infrastructure checks**

from concurrent.futures import ThreadPoolExecutor, as\_completed

def inspect\_node(name: str) -> tuple\[str, dict\]:
    # bounded network/subprocess checks live here
    return name, &#123;"ok": True&#125;

nodes = \[f"gpu-node-&#123;i:03d&#125;" for i in range(200)\]
results: dict\[str, dict\] = &#123;&#125;
with ThreadPoolExecutor(max\_workers=16) as pool:
    futures = &#123;pool.submit(inspect\_node, n): n for n in nodes&#125;
    for future in as\_completed(futures):
        node = futures\[future\]
        try:
            name, report = future.result(timeout=20)
            results\[name\] = report
        except Exception as exc:
            results\[node\] = &#123;"ok": False, "error": str(exc)&#125;

## Senior addendum

➕ **Backpressure, stated as the one-sentence definition worth having ready:** "backpressure is deliberately limiting how much work is in flight so the *producer* slows down to match what the *consumer* (or the target system) can actually handle" — `max_workers=16` in the fan-out example isn't a performance knob, it's backpressure: capping in-flight requests to 16 protects both this process (fd/memory limits) and the 200 remote nodes being queried from being hit by 200 simultaneous connections at once.

➕ **Visual model — choose concurrency by the waiting shape:**
```mermaid
flowchart LR
    A[CPU-bound work] --> B["processes (parallel CPU)"] --> C[bounded worker count]
    D[blocking I/O] --> E["threads (hide waits)"] --> F[bounded pool]
    G[async I/O] --> H["event loop (many waits)"] --> I[semaphore + deadline]
```
**Memory hook:** *"CPU parallelizes; I/O overlaps."* The execution model follows the bottleneck, not fashion.
