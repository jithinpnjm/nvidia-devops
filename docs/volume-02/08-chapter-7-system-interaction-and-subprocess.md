---
title: "Chapter 7 - System interaction and subprocess"
slug: "chapter-7-system-interaction-and-subprocess"
sidebar_position: 8
description: "Chapter 7 - System interaction and subprocess — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Run operating-system commands safely, capture evidence, enforce timeouts, and preserve exit semantics.

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

➕ **Visual model — keep the process boundary explicit:**
```
typed input
    │ validate / allow-list
    ▼
argv list: ["kubectl", "get", "nodes"]   ← no shell interpolation
    │ timeout + captured stdout/stderr
    ▼
child process ── exit code ──► typed result / typed error ──► policy + logs
```
**Memory hook:** *"Arguments, deadline, result."* `subprocess` is a process API, not a string-to-shell shortcut; an exit code is evidence that policy must interpret.
