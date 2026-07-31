---
title: "Chapter 9 - Incident playbook: Pending Pods, CrashLoops and OOM"
slug: "chapter-9-incident-playbook-pending-pods-crashloops-and-oom"
sidebar_position: 9
description: "Chapter 9 - Incident playbook: Pending Pods, CrashLoops and OOM — Observability, Reliability and Troubleshooting."
source_document: "Volume_07_Observability,_Reliability_and_Troubleshooting(2).docx"
---
<!-- source-table:1 -->

> Learning outcome Use object/event evidence before host-level investigation, then descend the stack.


## Worked scenario


<!-- source-table:2 -->

> Situation A production Pod is Pending for 15 minutes.


**1\. kubectl describe Pod and read scheduling events: resource, taint, affinity, PVC, topology or admission reason.**

2\. Check eligible nodes and allocatable/requested resources.

3\. Check PVC binding/topology and quota if referenced.

4\. Check autoscaler ability/limits only if adding a node could satisfy the Pod.

5\. Make one change that directly addresses the proven constraint.


<!-- source-table:3 -->

> Conclusion Pending is a desired placement problem; start with scheduler evidence, not container logs.


## Worked scenario


<!-- source-table:4 -->

> Situation A Pod alternates Running and CrashLoopBackOff.


**1\. Read current/previous container termination reason and exit code.**

2\. Read previous logs (kubectl logs -p) because the last process instance may already be gone.

3\. Separate application exit, OOM, probe-triggered restart and external eviction/node failure.

4\. Reproduce with the same config/secret/env if safe; do not simply increase restart backoff.


<!-- source-table:5 -->

> Conclusion CrashLoopBackOff is a retry state, not the root cause.
