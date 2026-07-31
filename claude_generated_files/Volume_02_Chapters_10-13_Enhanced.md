# Chapter 10 — Generators and decorators without magic
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Use generators for lazy streams and decorators for reusable cross-cutting behavior while preserving function semantics.

A generator is a function that can suspend its execution at yield and resume later. It is valuable when the data stream may be large or indefinite. Instead of returning one huge list of parsed log events, yield one event at a time and let the caller decide how far to consume the stream.
```python
from pathlib import Path
from collections.abc import Iterator

def error_lines(path: Path) -> Iterator[str]:
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if "ERROR" in line or "CRITICAL" in line:
                yield line.rstrip("\n")
```
**A decorator wraps a function but should preserve its metadata and return value**
```python
from functools import wraps
from time import perf_counter

def timed(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            elapsed = perf_counter() - start
            print(f"{func.__name__} took {elapsed:.3f}s")
    return wrapper
```
functools.wraps copies important metadata such as __name__ and __doc__. Without it, tooling and debugging may report the wrapper rather than the wrapped function. A production decorator should also preserve exceptions unless it has a deliberate policy for translating or retrying them.

➕ **Prove the `@wraps` point with actual output — this is a real "what does this print and why" interview question:**
```python
@timed
def check_disk(): """Checks disk health."""; return True

print(check_disk.__name__)   # with @wraps: "check_disk"    | without @wraps: "wrapper"
print(check_disk.__doc__)    # with @wraps: "Checks disk..." | without @wraps: None
```
Without `@wraps`, every function you decorate silently loses its identity to debuggers, `help()`, and any tooling that introspects `__name__` (including some test frameworks) — a subtle bug that's invisible until something downstream breaks mysteriously.

➕ **A decorator that composes with the retry logic from Chapter 8 — turning the whole retry loop into one reusable line:**
```python
from functools import wraps
import time, random

def retry(attempts=4, retryable=(TimeoutError, ConnectionError)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except retryable:
                    if attempt == attempts:
                        raise
                    delay = min(8.0, 0.5 * (2 ** (attempt - 1)))
                    time.sleep(delay + random.uniform(0, delay * 0.2))
        return wrapper
    return decorator

@retry(attempts=3, retryable=(requests.Timeout,))
def fetch_inventory(): ...
```
This is the exact "why do decorators matter" answer: Chapter 8's whole retry function body becomes a one-line annotation, reusable across every API call in the codebase instead of copy-pasted.

## Practice before moving on
1. Modify error_lines() to parse and yield structured events instead of raw strings.
2. Write a decorator that rejects calls when a required environment variable is absent.
3. Explain why a generator is usually preferable to returning a 10-million-element list.

➕ 4. Write the `@wraps` before/after demo above yourself and run it — this is exactly the kind of "predict the output" question asked live in coding interviews.

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Generator syntax; The yield statement; State in generators; Coding lazy pipelines; Introduction to decorators; functools.wraps; RBAC Decorator Factory exercise.

---
# Chapter 11 — Concurrency for infrastructure engineers
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Choose threads, asyncio, processes, or sequential execution by the bottleneck and operational complexity.

*(original Figure 4 — "concurrency is a bottleneck decision, not an advanced Python badge" — preserved)*

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

---
# Chapter 12 — Type hints and pytest: make changes safer
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Use static contracts and automated tests to protect decision logic and dependency boundaries.

Type hints improve the feedback loop before runtime; tests validate behavior at runtime. For infrastructure tools, the most valuable tests target parsing, validation, policy decisions, retries, and translation of dependency failures. The most valuable mocks sit at dependency boundaries, not inside every function.

*(original Figure 5 — testing pyramid: more tests near deterministic decision logic, fewer real-environment tests — preserved)*
```python
from dataclasses import dataclass

@dataclass(frozen=True)
class PodHealth:
    name: str
    restarts: int
    ready: bool

def unhealthy(pod: PodHealth) -> bool:
    return not pod.ready or pod.restarts >= 5
```
```python
import pytest

@pytest.mark.parametrize(
    ("pod", "expected"),
    [
        (PodHealth("api", 0, True), False),
        (PodHealth("worker", 7, True), True),
        (PodHealth("db", 0, False), True),
    ],
)
def test_unhealthy(pod: PodHealth, expected: bool) -> None:
    assert unhealthy(pod) is expected
```
**Mock the external HTTP boundary to test retry policy deterministically**
```python
def test_client_retries_503(mocker):
    fake_get = mocker.patch("mytool.client.requests.get")
    fake_get.side_effect = [FakeResponse(503), FakeResponse(200, {"ok": True})]
    assert get_json("https://api", "token")["ok"] is True
    assert fake_get.call_count == 2
```
Patch where the dependency is looked up by the code under test, not necessarily where the dependency was originally defined. This detail explains many "my mock did nothing" failures.

➕ **The "patch where it's looked up" rule, made concrete — this trips up almost everyone once:**
```python
# mytool/client.py
import requests
def get_json(url): return requests.get(url).json()

# WRONG in the test file:
mocker.patch("requests.get")              # patches the global requests module —
                                            # but client.py already has its OWN local reference to it

# RIGHT:
mocker.patch("mytool.client.requests.get") # patches requests.get as SEEN FROM mytool.client's namespace
```
Because `import requests` binds a name inside `mytool.client`'s namespace, patching the *original* `requests.get` doesn't affect the copy of the reference `client.py` already holds — you have to patch it where the code under test actually looks it up. This single paragraph resolves the majority of real "why isn't my mock working" confusion.

➕ **`mypy`/`pyright` in CI — closing the loop between type hints and this chapter's testing focus:**
```bash
mypy src/infra_doctor --strict
```
```
src/infra_doctor/parser.py:14: error: Argument 1 to "unhealthy" has incompatible
type "dict[str, Any]"; expected "PodHealth"  [arg-type]
```
This is the kind of error type hints catch *before* a test even runs — a caller passing a raw dict where a `PodHealth` dataclass was expected. Worth wiring `mypy --strict` into the Chapter 13 CI pipeline as a gate before tests even execute — cheaper failures fail faster.

## Practice before moving on
1. Write tests for 401 no-retry and 503 retry behavior.
2. Use a fixture to create a temporary config file.
3. Add mypy/pyright-friendly type hints to a JSON parsing function and decide where TypedDict or dataclass is appropriate.

➕ 4. Deliberately write the "wrong" patch target (`mocker.patch("requests.get")` instead of the module-qualified path) and confirm the test still calls the *real* `requests.get` — seeing the mock silently fail to intercept anything is the fastest way to make the "patch where it's looked up" rule permanent.

## Targeted references
[pytest documentation](https://docs.pytest.org/) - Assertions, fixtures, parametrization, monkeypatching and plugins.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to type hints; Hands-on: Test-driven implementation; Testing exceptions; Introduction to fixtures; Parametrization; Mocking fundamentals; Patch decorator and mocker fixture.

---
# Chapter 13 — Project structure, CLI and CI/CD
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Package automation so another engineer can install, test, invoke, and release it predictably.

**A small production-style src layout**
```
infra-doctor/
├── pyproject.toml
├── src/
│   └── infra_doctor/
│       ├── __init__.py
│       ├── cli.py
│       ├── model.py
│       ├── parser.py
│       └── kubernetes.py
└── tests/
    ├── test_parser.py
    └── test_policy.py
```
```toml
# pyproject.toml
[project]
name = "infra-doctor"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["requests>=2.32"]

[project.scripts]
infra-doctor = "infra_doctor.cli:main"
```
An entry point makes the tool executable after installation without asking users to know its package layout. CI should run formatting/lint checks, static analysis, tests, and build verification before publishing or packaging.
```yaml
# .github/workflows/ci.yml (core idea)
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e . pytest
      - run: pytest -q
```

➕ **Why `src/` layout specifically (a real interview question — "why not just put the package at the repo root?"):**
```
Without src/:  package/           WITH src/:  src/package/
               tests/                          tests/
```
Without `src/`, running `pytest` from the repo root can silently import the *local, uninstalled* copy of your package (because the current directory is on `sys.path`) even when a different (possibly stale) version is `pip install`ed — masking packaging bugs until a real install elsewhere fails. `src/` layout forces tests to run against the actually-installed package, catching packaging mistakes locally instead of in CI or production.

➕ **The full gate, extending the CI skeleton above to match Practice #3's ask (formatting, lint, types, security scan, tests, build):**
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-python@v5
    with: { python-version: "3.12" }
  - run: pip install -e ".[dev]"
  - run: ruff format --check .          # formatting
  - run: ruff check .                    # lint
  - run: mypy src/infra_doctor --strict  # types
  - run: pip-audit                       # dependency security scan
  - run: pytest -q --cov=infra_doctor    # tests + coverage
  - run: python -m build                 # build verification — does packaging even succeed?
```
This ordering matters: fast/cheap checks (formatting, lint) run before slow/expensive ones (tests, build) so a trivial formatting mistake fails in seconds, not after a multi-minute test suite runs — a real CI-design tradeoff worth naming if asked to design this pipeline live.

## Practice before moving on
1. Create a pyproject.toml with a console entry point.
2. Explain why imports are more predictable with a package than with a directory full of ad-hoc scripts.
3. Design a CI gate for formatting, lint, types, security scan, unit tests and build.

➕ 4. Deliberately remove `src/` (flatten the package to repo root), run `pytest` from the root, and see whether it's importing your editable-installed package or a same-named local file — reproduce the exact ambiguity `src/` layout exists to prevent.

## Targeted references
[Python Packaging User Guide](https://packaging.python.org/) - Modern packaging concepts and pyproject.toml.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Python modules; Python packages; pyproject.toml file; Adding tests to multi-file projects; CI/CD pipeline overview; Add static type and security checks; Pytest integration; Building the Python library.
