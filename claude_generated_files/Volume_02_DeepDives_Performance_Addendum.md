# Volume 2 — Senior Deep Dives 1-8 + Performance: Addendum
*(the original Deep Dive code is already strong — real, runnable, correctly scoped. This addendum adds outputs, diagrams, and the couple of extensions that make each one interview-ready rather than just readable.)*

## Deep Dive 1 — Object model, mutability, interfaces
➕ **`slots=True` — the detail worth being able to explain, not just copy:**
```python
@dataclass(frozen=True, slots=True)
class Node:
    name: str
    labels: Mapping[str, str]
    allocatable_gpus: int
```
Without `slots=True`, every instance carries a `__dict__` (arbitrary attribute storage) — with it, Python allocates fixed slots instead, which is both faster to access and meaningfully smaller in memory. For a `FleetReport` holding thousands of `Node` objects (a real GPU fleet), `slots=True` is a genuine memory-and-speed win, not a style preference — worth naming the *why*, not just using it because the example does.

## Deep Dive 2 — Configuration as an API
➕ **The precedence chain, drawn out (the paragraph states it, this makes it checkable at a glance):**
```
defaults  <  config file  <  environment variables  <  explicit CLI flags
(lowest precedence)                                    (highest precedence)
```
`Settings.load()`'s `os.getenv("NAMESPACE", raw.get("namespace", "default"))` is this exact chain in one line, read right-to-left: try env var first, fall back to file value, fall back to hardcoded default. **Interview-ready line:** "the most specific, most recently-supplied source should always win — that's why CLI flags beat environment beats file beats code defaults, not the reverse."

## Deep Dive 3 — API clients that fail safely
*(original Figure B — "concurrency is chosen by the bottleneck, not fashion" — preserved)*

➕ **The budget math the paragraph mentions, worked with real numbers (this is the calculation a Senior SA is expected to do out loud):**
```
500 nodes, worst case: 4 attempts × 8s read timeout = 32s per node if every attempt times out
Sequential: 500 × 32s = 4.4 HOURS worst case  ← unacceptable, exactly as the text says
With ThreadPoolExecutor(max_workers=16): 500/16 ≈ 32 batches × 32s = ~17 minutes worst case
With a global deadline (e.g. 60s) that cancels remaining work: bounded regardless of per-node worst case
```
This is the actual arithmetic behind "senior engineers think about budgets" — being able to produce these three numbers live, from the retry policy's own parameters, is a stronger signal than reciting "use a thread pool."

## Deep Dive 4 — Async, threads, processes with backpressure
➕ **Backpressure, stated as the one-sentence definition worth having ready:** "backpressure is deliberately limiting how much work is in flight so the *producer* slows down to match what the *consumer* (or the target system) can actually handle" — `max_workers=16` in the fan-out example isn't a performance knob, it's backpressure: capping in-flight requests to 16 protects both this process (fd/memory limits) and the 200 remote nodes being queried from being hit by 200 simultaneous connections at once.

## Deep Dive 5 — Subprocess as a process API
➕ **This is the exact `nvidia-smi` wrapper the actual job needs — worth having memorized, not just read:**
```
$ nvidia-smi --query-gpu=index,uuid,temperature.gpu --format=csv,noheader,nounits
0, GPU-a1b2c3d4-..., 62
1, GPU-e5f6g7h8-..., 58
```
```python
def parse_nvidia_smi(csv_output: str) -> list[dict]:
    rows = []
    for line in csv_output.strip().splitlines():
        idx, uuid, temp = [x.strip() for x in line.split(",")]
        rows.append({"index": int(idx), "uuid": uuid, "temp_c": int(temp)})
    return rows
```
This pairs directly with the `run()` wrapper above it — `run(["nvidia-smi", "--query-gpu=...", "--format=csv,noheader,nounits"])` then `parse_nvidia_smi(result.stdout)` is a genuinely realistic 10-minute interview coding exercise for this specific role.

## Deep Dive 6 — Structured logs, metrics, correlation IDs
➕ **Sample output from the `JsonFormatter` above, and why each field earns its place:**
```json
{"ts":1738245600.123,"level":"INFO","message":"gpu check started","logger":"fleetcheck","correlation_id":"a1b2c3d4-...","node":"gpu-node-07"}
```
Every field here answers a specific incident-review question: `ts` — when; `correlation_id` — which run, so you can grep every log line from one invocation across a distributed fan-out; `node` — which GPU host, so you're not grepping 200 nodes' worth of interleaved output by hand. **The logs/metrics/traces distinction from the text, memorized as one line:** "logs say what happened once, metrics say how often across everything, traces say where the time went within one request" — three different questions, three different tools, don't try to answer all three with one of them.

## Deep Dive 7 — Testing infrastructure code
➕ **Why `should_retry` is tested in complete isolation from `requests` — this is the payoff of every "functional core" pattern from earlier chapters landing in one place:**
```python
@pytest.mark.parametrize("status,expected", [
    (200, False), (400, False), (404, False), (429, True), (500, True), (503, True),
])
def test_status_classification(status, expected):
    assert should_retry(status, None) is expected
```
Zero network calls, zero mocking library needed, runs in milliseconds, and — critically — **this test would catch a bug where someone changes `500 <= status < 600` to `500 <= status <= 600` and accidentally includes 600** as retryable. That's the actual value of testing decisions instead of testing "does my mock get called" — it tests the *policy*, which is where real bugs hide.

## Deep Dive 8 — Complete project: GPU fleet health CLI
➕ **`UNKNOWN is not HEALTHY` — this is the single most important line in this entire volume for the actual job, worth its own callout:**
```python
def classify_gpu(s: GpuSample) -> Health:
    if s.xid_errors is None or s.temperature_c is None:
        return Health.UNKNOWN     # missing telemetry — NOT the same claim as "healthy"
    if s.xid_errors > 0:
        return Health.FAILED
    if s.temperature_c >= 85:
        return Health.DEGRADED
    return Health.HEALTHY
```
A monitoring tool that defaults missing data to "healthy" (because the code just falls through an if-chain without an explicit check) will silently hide a fleet of nodes whose telemetry agent crashed — those nodes look green in every dashboard while being completely unobserved. **This exact bug class — "absence of bad news presented as good news" — is one of the most realistic production incidents to bring up unprompted in an SA interview about monitoring design**, and this code is the textbook correct pattern to defend against it: a fourth explicit state (`UNKNOWN`) that can never be silently conflated with `HEALTHY`.

## Performance and profiling for operational Python
➕ **The profiling decision tree, made explicit (the text names four tools — here's when to reach for each):**
```
Slow, don't know why yet →  py-spy top --pid <PID>       (low-overhead, safe on production, no restart)
Slow, know it's CPU-bound →  cProfile -s cumulative        (function-level breakdown, needs a restart)
Slow, suspect one hot function →  line_profiler             (line-by-line, needs @profile decorator)
Memory growing over time →  tracemalloc -X tracemalloc=25   (allocation-site tracking, growth diffing)
```
**py-spy is the one worth remembering first** for this role specifically — it attaches to a running process without needing to modify code or restart anything, which is exactly the constraint you're under when triaging a live, expensive, GPU-attached production job that you cannot afford to restart just to profile it.

➕ **Sample `cProfile` output and the one column to actually look at first:**
```
$ python -m cProfile -s cumulative -m fleetcheck.cli report
   ncalls  tottime  percall  cumtime  percall filename:lineno(function)
      500    0.012    0.000   18.240    0.036 kubernetes.py:14(get_pods)
      500   17.980    0.036   17.980    0.036 {built-in method time.sleep}
```
`cumtime` (cumulative time including calls made *by* this function) vs `tottime` (time in this function alone) is the distinction that matters: here, `get_pods` itself is fast (`tottime` 0.012s) but its `cumtime` is dominated by `time.sleep` calls nested inside it (retry backoff) — the profile is telling you the bottleneck is retry waiting, not the parsing/request logic itself. Reading `tottime` alone here would send you optimizing the wrong function entirely.

## Targeted references and reinforcement
*(preserved as-is)*
**Udemy — Python for DevOps: Mastering Real-World Automation:** https://www.udemy.com/course/python-devops
**Vishakha Sadhwani — scripts versus systems:** https://www.linkedin.com/in/vsadhwani
**Python documentation:** https://docs.python.org/3/
