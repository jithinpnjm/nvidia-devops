---
title: "Chapter 14 - Capstone: design a cluster diagnostics CLI"
slug: "chapter-14-capstone-design-a-cluster-diagnostics-cli"
sidebar_position: 15
description: "Chapter 14 - Capstone: design a cluster diagnostics CLI — Python for Production Infrastructure."
source_document: "Volume_02_Python_for_Production_Infrastructure(3).docx"
---
<!-- source-table:1 -->

> After this chapter you should be able to: Combine parsing, subprocess/API boundaries, data models, logging, retries, tests, and exit semantics.


The capstone is intentionally not a single giant script. Model it as adapters around a deterministic core. Kubernetes access can come from an SDK or kubectl adapter. The parser converts raw responses into typed domain values. Policy functions classify health. A renderer produces text or JSON. The CLI maps results to exit codes.

![](pathname:///img/generated/volume-02-06.png)

Figure 6. Use the same pipeline for the capstone: inputs become validated domain data, decisions drive actions, and every external edge is observable.


<!-- source-table:2 -->

```text
from dataclasses import dataclass

@dataclass(frozen=True)
class Finding:
    severity: str
    resource: str
    reason: str

def assess_pod(name: str, ready: bool, restarts: int) -> list[Finding]:
    findings: list[Finding] = []
    if not ready:
        findings.append(Finding("critical", name, "pod not ready"))
    if restarts >= 5:
        findings.append(Finding("warning", name, f"restarts={restarts}"))
    return findings
```


## Work the scenario step by step


<!-- source-table:3 -->

> Scenario The tool must diagnose 500 pods across multiple namespaces and be safe to run in CI.


**1\. Define the output contract first: human table, JSON option, and exit codes for healthy/warning/critical/tool-failure.**

2\. Separate Kubernetes collection from health policy so policy can be tested with fixtures.

3\. Use bounded concurrency only if collection latency justifies it.

4\. Add timeouts and retry only retryable API failures.

5\. Emit structured logs to stderr and report output to stdout so pipelines can consume JSON cleanly.

6\. Test malformed data, auth failure, timeout, partial pod failures, and classification edge cases.


<!-- source-table:4 -->

> Reasoned conclusion A production-quality infrastructure tool is a small system: clear contracts, controlled side effects, observable failure, and testable decisions.


## Field note: practitioner perspective


<!-- source-table:5 -->

> Vishakha Sadhwani: script vs system thinking Recent public material emphasizes that infrastructure work stops being “just a script” when retries, timeouts, observability, approvals, versioning, and failure handling become part of the design. Use that as the quality bar for this capstone: successful happy-path execution is only one requirement.


[Public source](https://www.linkedin.com/in/vsadhwani)
