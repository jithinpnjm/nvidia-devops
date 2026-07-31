# Chapter 7 — System interaction and subprocess
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Run operating-system commands safely, capture evidence, enforce timeouts, and preserve exit semantics.

Infrastructure engineers often need to call existing tools. subprocess.run() is the normal high-level API. Pass arguments as a list rather than a shell string, use check=True when non-zero should become an exception, capture_output=True when you need output, text=True for decoded strings, and timeout= when a hung child process must not hang your automation forever.
```python
import subprocess
def kubectl_json(namespace: str) -> str:
    cmd = ["kubectl", "get", "pods", "-n", namespace, "-o", "json"]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=10)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"kubectl timed out after {exc.timeout}s") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise RuntimeError(f"kubectl failed rc={exc.returncode}: {stderr}") from exc
    return result.stdout
```
**Security rule:** Avoid shell=True with untrusted input. A shell parses metacharacters such as ;, |, $, and redirects. Passing an argument list bypasses shell interpretation and is safer by default.

➕ **The injection this rule prevents, made concrete (a real interview follow-up):**
```python
namespace = "default; rm -rf /"        # attacker-controlled input
subprocess.run(f"kubectl get pods -n {namespace}", shell=True)   # DANGEROUS — executes the rm too
subprocess.run(["kubectl", "get", "pods", "-n", namespace])       # SAFE — namespace is one literal arg,
                                                                    # even with semicolons in it, never parsed by a shell
```
This is the exact demo to have ready if asked "show me command injection" live.

➕ **`Popen` vs `run()` — when the high-level API isn't enough (worth knowing exists, even if `run()` covers 95% of cases):**
```python
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
for line in proc.stdout:            # stream output line-by-line as it's produced
    process(line)                    # `run()` waits for completion first — Popen lets you react live
proc.wait()
```
Reach for `Popen` when you need to stream a long-running command's output (e.g. tailing a `kubectl logs -f`) rather than wait for it to finish — `run()` blocks until the process exits.

## Work the scenario step by step
**Scenario:** A diagnostic command occasionally hangs because a kubeconfig credential plugin is blocked.
1. Add a timeout to the subprocess boundary.
2. Capture stderr because authentication/tool errors are often emitted there.
3. Return or raise a typed failure rather than returning empty output that looks valid.
4. Log command identity without logging secrets or sensitive arguments.
5. Consider using the Kubernetes API client directly when you need stronger typing and control than a CLI subprocess provides.

**Reasoned conclusion:** A subprocess is an external dependency. Treat its timeout, exit code, stdout, stderr, and environment as part of the API contract.

## Practice before moving on
1. Write a safe ping wrapper returning a dataclass with target, success, duration, and stderr.
2. Explain when you would use subprocess versus an SDK/API client.
3. Demonstrate why string interpolation plus shell=True can create command injection.

➕ 4. Convert `kubectl_json` to use `Popen` and stream-parse pod names as they're emitted (`kubectl get pods -o json --watch` never actually terminates) — this is the realistic version of "diagnostic tooling that has to run continuously," not a one-shot script.

## Targeted references
[Python subprocess documentation](https://docs.python.org/3/library/subprocess.html) - Exact semantics for run, timeouts, CompletedProcess, and exceptions.
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to subprocesses; Handling subprocess errors; Handling expired timeouts; System Health Checker with ping coding exercise.

---
# Chapter 8 — HTTP APIs, timeouts, retries and backoff
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Build clients that distinguish client errors, transient server errors, rate limiting, and network failure.

A reliable API client has policy. It does not retry everything. Authentication errors usually require corrected credentials, not ten more attempts. Validation errors are deterministic. A 429 may be retryable according to Retry-After. Many 5xx responses and network timeouts can be transient. The retry layer must understand idempotency: retrying GET is usually safe; retrying a POST that creates a resource may duplicate work unless the API provides an idempotency key or the operation is otherwise safe.

*(original Figure 3 — "retry is a policy branch after classification, not a loop around every exception" — preserved)*
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

---
# Chapter 9 — OOP that helps infrastructure code
*(original text preserved in full; ➕ marks additions)*

**After this chapter you should be able to:** Use objects to hold cohesive state and behavior; prefer composition over inheritance when components have different responsibilities.

Object-oriented design is useful when an automation has stateful collaborators: an API client, credential provider, retry policy, renderer, and command runner. Do not create classes merely to satisfy "use OOP." A class should represent a concept that owns state and operations. Composition lets you assemble behavior by giving one object another object to collaborate with.
```python
from dataclasses import dataclass
from typing import Protocol

class CommandRunner(Protocol):
    def run(self, args: list[str]) -> str: ...

@dataclass
class PodInspector:
    runner: CommandRunner
    namespace: str
    def raw_pods(self) -> str:
        return self.runner.run(["kubectl", "get", "pods", "-n", self.namespace, "-o", "json"])
```
PodInspector does not inherit from a generic KubernetesTool. It receives a runner. In tests, you can inject a fake runner. In production, inject a subprocess-backed runner. The Protocol describes the behavior needed without forcing a rigid class hierarchy.
```python
class FakeRunner:
    def __init__(self, output: str):
        self.output = output
        self.calls: list[list[str]] = []
    def run(self, args: list[str]) -> str:
        self.calls.append(args)
        return self.output
```
**Memory hook:** Inheritance says "is a specialized form of." Composition says "uses." Infrastructure tools are usually assemblies of clients, policies, parsers, and adapters, so "uses" is often the more natural relationship.

➕ **The test this pattern buys you, made concrete — this is *why* Protocol-based composition matters, not just a style preference:**
```python
def test_pod_inspector_calls_kubectl_with_correct_namespace():
    fake = FakeRunner(output='{"items": []}')
    inspector = PodInspector(runner=fake, namespace="prod")
    inspector.raw_pods()
    assert fake.calls == [["kubectl", "get", "pods", "-n", "prod", "-o", "json"]]
    # zero real kubectl calls, zero real cluster, zero network — pure, fast, deterministic
```
This is the direct payoff of Chapter 3's "functional core, imperative shell" idea, applied to classes: `PodInspector` is testable without a cluster because it depends on a `Protocol`, not a concrete `subprocess` call.

➕ **When inheritance genuinely is right (the chapter's Practice #2 asks you to explain this — here's the concrete answer):**
```python
class BaseExporter:
    def export(self, records: list[dict]) -> None:
        formatted = self._format(records)     # shared logic
        self._write(formatted)                  # shared logic
    def _format(self, records): raise NotImplementedError
    def _write(self, data): raise NotImplementedError

class JSONExporter(BaseExporter):
    def _format(self, records): return json.dumps(records)
    def _write(self, data): Path("out.json").write_text(data)
```
Inheritance fits here because `JSONExporter` genuinely **is a kind of** `Exporter` sharing a fixed algorithm shape (Template Method pattern) — different from `PodInspector`, which merely **uses** a runner. The test: "is this relationship 'is-a' with a shared invariant algorithm, or 'has-a collaborator with independent behavior'?" — the first is inheritance, the second is composition.

## Practice before moving on
1. Design an ApiClient that composes a RetryPolicy and AuthProvider.
2. Explain when inheritance would actually make sense.
3. Replace a class that only contains one stateless staticmethod with a normal function and explain why it is clearer.

➕ 4. Write the `FakeRunner`-based test above from memory, then extend `FakeRunner` to simulate a `CalledProcessError` on the second call — testing the Chapter 5 exception-handling path through a fake, without ever touching a real cluster.

## Targeted references
[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to classes; Class methods; Inheritance; Object-Oriented Deployment Manager coding exercise.
