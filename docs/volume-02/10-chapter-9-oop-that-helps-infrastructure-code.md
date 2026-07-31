---
title: "Chapter 9 - OOP that helps infrastructure code"
slug: "chapter-9-oop-that-helps-infrastructure-code"
sidebar_position: 10
description: "Chapter 9 - OOP that helps infrastructure code — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Use objects to hold cohesive state and behavior; prefer composition over inheritance when components have different responsibilities.


Object-oriented design is useful when an automation has stateful collaborators: an API client, credential provider, retry policy, renderer, and command runner. Do not create classes merely to satisfy “use OOP.” A class should represent a concept that owns state and operations. Composition lets you assemble behavior by giving one object another object to collaborate with.


<!-- source-table:2 -->

```text
from dataclasses import dataclass
from typing import Protocol

class CommandRunner(Protocol):
    def run(self, args: list[str]) -> str: ...

@dataclass
class PodInspector:
    runner: CommandRunner
    namespace: str

    def raw_pods(self) -> str:
        return self.runner.run([
            "kubectl", "get", "pods",
            "-n", self.namespace, "-o", "json"
        ])
```


PodInspector does not inherit from a generic KubernetesTool. It receives a runner. In tests, you can inject a fake runner. In production, inject a subprocess-backed runner. The Protocol describes the behavior needed without forcing a rigid class hierarchy.


<!-- source-table:3 -->

```text
class FakeRunner:
    def __init__(self, output: str):
        self.output = output
        self.calls: list[list[str]] = []

    def run(self, args: list[str]) -> str:
        self.calls.append(args)
        return self.output
```


<!-- source-table:4 -->

> Memory hook Inheritance says “is a specialized form of.” Composition says “uses.” Infrastructure tools are usually assemblies of clients, policies, parsers, and adapters, so “uses” is often the more natural relationship.


## Practice before moving on

1\. Design an ApiClient that composes a RetryPolicy and AuthProvider.

2\. Explain when inheritance would actually make sense.

3\. Replace a class that only contains one stateless staticmethod with a normal function and explain why it is clearer.

## Targeted references

[Udemy - Python for DevOps](https://www.udemy.com/course/python-devops) - Relevant lessons: Introduction to classes; Class methods; Inheritance; Object-Oriented Deployment Manager coding exercise.
