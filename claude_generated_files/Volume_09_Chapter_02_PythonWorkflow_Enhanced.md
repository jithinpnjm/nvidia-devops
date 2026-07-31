# Chapter 2 — Python coding interview workflow
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Turn an infrastructure problem into algorithm, data structures, functions, tests and edge cases before production hardening.

**Problem →**
define input/output →
identify dominant operation →
choose data structure →
pseudocode →
implement smallest correct core →
test edge cases →
discuss complexity →
add production reliability

Example prompt: "Parse a large log and report ERROR/CRITICAL counts by service." Say: stream file line-by-line; regex or structured parser extracts severity/service; `Counter[str]` aggregates; skip/track malformed lines; O(n) time and O(k) memory where k is number of services, not number of lines.

```python
from collections import Counter
from collections.abc import Iterable
import re

EVENT = re.compile(r"level=(ERROR|CRITICAL).*service=([\w-]+)")

def count_errors(lines: Iterable[str]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for line in lines:
        match = EVENT.search(line)
        if match:
            counts[match.group(2)] += 1
    return counts
```

Then discuss malformed input, memory, testing, structured logs, and whether JSON output would be more reliable than regex when available. Do not start by inventing classes or concurrency before the core algorithm is correct.

---

## Original — Question set B: Python coding and production automation

Practice coding in small increments. State the data structure before code, make parsing and policy pure, then add effects. Typical tasks: parse multi-format logs, aggregate errors by service/node, implement bounded retry, query many endpoints concurrently, compare desired/actual state, build a CLI and test it.

**Practice explaining complexity, malformed input and memory strategy**

```python
# Interview task skeleton: summarize failures by node and error type
from collections import Counter, defaultdict
import re

PATTERN = re.compile(
    r"^(?P<ts>\S+)\s+(?P<node>\S+)\s+"
    r"(?P<level>ERROR|CRITICAL|FATAL)\s+(?P<msg>.+)$"
)

def summarize(lines: list[str]) -> dict[str, Counter[str]]:
    result: dict[str, Counter[str]] = defaultdict(Counter)
    for line in lines:
        m = PATTERN.match(line.strip())
        if not m:
            continue
        # In a real problem, classify msg into stable error categories.
        result[m['node']][m['level']] += 1
    return dict(result)
```

---

## ➕ Additions

➕ **The workflow as a decision flow (the "say this before you type anything" checklist):**
```
   Prompt lands
        │
        ▼
 ┌─────────────────────┐   "what exactly comes in,
 │ 1. Input/output      │    what exactly goes out —
 │    contract           │    say it before coding"
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐   "what happens N times —
 │ 2. Dominant operation│    membership check? lookup?
 │                       │    aggregation? ordering?"
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐   list/dict/set/deque/heap —
 │ 3. Data structure     │   pick from the operation,
 │                       │   not from habit
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐
 │ 4. Pseudocode (2-4    │   spoken or written, before
 │    lines, out loud)   │   any real syntax
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐
 │ 5. Smallest correct   │   no error handling yet,
 │    core                │   no classes, no CLI
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐
 │ 6. Edge cases + tests │   empty input, malformed
 │                       │   line, huge input, duplicate
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐
 │ 7. Complexity          │   state Big-O out loud,
 │                       │   unprompted
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐
 │ 8. Production harden  │   logging, retries, malformed-
 │                       │   input counters, streaming
 └─────────────────────┘
```
➕ **Memory hook:** *"IDDPS-ECP — I Don't Dive Prematurely, Structure/Edge/Complexity/Production."* Or simpler: **"contract → dominant op → structure → pseudocode → core → edges → Big-O → harden."** The two steps candidates skip under pressure are #1 (they start coding before agreeing what "input" even is) and #7 (they never state complexity unless asked) — both are free points if you just say them.

➕ **Interview-ready line to open ANY coding prompt with, verbatim:**
> "Before I write anything — what's the expected input size and is this a one-shot script or something that runs continuously against a live stream? That changes whether I optimize for peak memory or just correctness."
This single question also does double duty: it's a legitimate technical question (streaming vs batch materially changes the design) and it buys 10-15 seconds to actually think.

➕ **Annotated sample transcript — talking through the `count_errors` function from the original chapter, as if live-coding:**

> "The input is an iterable of log lines — I'll type it as `Iterable[str]`, not `list[str]`, specifically so this works against a generator reading a file line-by-line without loading it all into memory." *(← states WHY the type hint choice matters — this is the "production reliability" step arriving early, not bolted on)*
>
> "The dominant operation is 'extract two fields, then count' — that's a `Counter` keyed by service, O(1) increment per line, so the whole thing is O(n) in lines and O(k) in memory where k is distinct services — that's the part worth saying out loud before anyone asks." *(← unprompted complexity statement)*
>
> "I'll use `search` not `match` because the level/service tokens can appear anywhere in the line, not just at the start — that's a small but real correctness detail." *(← a subtle regex-API distinction that shows real familiarity, not memorized boilerplate)*
>
> "Edge cases: a line with no match — right now it's silently skipped, which is a decision I should flag, not hide. In production I'd want a `malformed_count` so silent data loss doesn't happen invisibly." *(← names a real production gap, and proposes the fix instead of just admitting the gap)*

➕ **Extra worked scenario (new, beyond the original) — bounded concurrent API polling, a realistic NVIDIA-SA-relevant task:**
> **Prompt:** "You have 200 GPU node hostnames. Query each node's `/metrics` health endpoint over HTTP with a 2-second timeout, and return a dict of hostname → status ('ok'/'timeout'/'error'). Don't take 200×2s to finish."
> **Model answer, following the workflow:**
> - **Input/output:** `list[str]` hostnames in, `dict[str, str]` status out.
> - **Dominant operation:** many independent I/O-bound calls — this is a concurrency problem, not an algorithmic one.
> - **Data structure:** plain dict for results; a bounded semaphore or thread/async pool to cap concurrency (querying 200 nodes with unbounded concurrency can itself DoS a monitoring endpoint).
> ```python
> import asyncio
> import httpx
>
> async def check_node(client: httpx.AsyncClient, host: str, sem: asyncio.Semaphore) -> tuple[str, str]:
>     async with sem:
>         try:
>             resp = await client.get(f"http://{host}/metrics", timeout=2.0)
>             return host, "ok" if resp.status_code == 200 else "error"
>         except httpx.TimeoutException:
>             return host, "timeout"
>         except httpx.HTTPError:
>             return host, "error"
>
> async def check_all(hosts: list[str], max_concurrency: int = 20) -> dict[str, str]:
>     sem = asyncio.Semaphore(max_concurrency)
>     async with httpx.AsyncClient() as client:
>         results = await asyncio.gather(*(check_node(client, h, sem) for h in hosts))
>     return dict(results)
> ```
> - **Edge cases:** duplicate hostnames (dict naturally collapses them — flag this explicitly rather than let it be silent), DNS failure vs connection refused vs timeout (distinguished by exception type, not lumped into one "error"), empty host list.
> - **Complexity:** wall-clock roughly `ceil(200/20) × 2s` worst case ≈ 20s instead of a naive serial 400s — this is the number to say out loud, because it's the actual point of the exercise.
> - **Production hardening:** exponential backoff + one retry for `timeout` specifically (transient), structured logging of which hosts failed and why, and a circuit-breaker if failure rate crosses a threshold (stop hammering a node that's clearly down).
> **Interview-ready line:** "The algorithmic complexity here is trivial — the actual engineering question is concurrency bound and failure-mode granularity, and that's what I'd spend the remaining time discussing."

## Practice
➕ 3. Rewrite `summarize()` so that instead of silently `continue`-ing on a non-matching line, it also returns a count of malformed lines, without changing the function's primary return type (hint: use a mutable counter object passed in, or return a tuple/small dataclass — discuss the tradeoff between the two out loud).
➕ 4. Take the concurrent-polling scenario above and add a hard 30-second overall deadline across all 200 hosts regardless of individual timeouts — explain how `asyncio.wait_for` around the whole `gather` changes the failure semantics for hosts that were still in-flight when the deadline hit.
