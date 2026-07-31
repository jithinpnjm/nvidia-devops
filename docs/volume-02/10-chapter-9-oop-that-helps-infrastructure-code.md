---
title: "Chapter 9 - OOP that helps infrastructure code"
slug: "chapter-9-oop-that-helps-infrastructure-code"
sidebar_position: 10
description: "Chapter 9 - OOP that helps infrastructure code — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---

*(original text preserved in full; ➕ marks additions)*

> After this chapter you should be able to: Use objects to hold cohesive state and behavior; prefer composition over inheritance when components have different responsibilities.

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

➕ **Visual model — dependency injection creates the test seam:**
```
                ┌──────────────────┐
input ─────────►│ FleetHealthPolicy │──► decision / report
                └────────┬─────────┘
                         │ depends on a small interface
              ┌──────────┴──────────┐
              ▼                     ▼
        RealRunner             FakeRunner
        subprocess/API         deterministic test evidence
```
**Memory hook:** *"Objects own policy; adapters own effects."* If a class both decides and runs shell commands, it has hidden dependencies and no cheap test seam.
