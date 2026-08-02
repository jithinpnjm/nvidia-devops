---
title: "Chapter 4 - Kubernetes troubleshooting questions"
slug: "chapter-4-kubernetes-troubleshooting-questions"
sidebar_position: 4
description: "Chapter 4 - Kubernetes troubleshooting questions — JR2018680 Interview Preparation."
source_document: "Volume_09_JR2018680_Interview_Preparation(2).docx"
---
> Learning outcome Use object status/events to find the control-loop stage, then descend to node/Linux evidence.

| Symptom | First evidence |
| --- | --- |
| Pending | Pod events + scheduler constraints |
| ContainerCreating | kubelet/CNI/CSI/image/sandbox events |
| CrashLoopBackOff | previous termination reason/exit code + previous logs |
| NotReady | readiness probe/dependency/application evidence |
| Service unreachable | EndpointSlice -> DNS -> service dataplane -> CNI/policy |

## Worked scenario
**Situation:** Interviewer: "Pods are Pending despite cluster autoscaler enabled."

1. Read FailedScheduling reason.
2. Ask whether any node type the autoscaler can create would satisfy the Pod.
3. Check max size/resource limits/quota.
4. Check affinity/taints/PVC topology/GPU resource type that may prevent expansion from helping.
5. Only then investigate autoscaler implementation/logs.

**Conclusion:** Autoscaler is not a universal cure for unschedulable constraints.

## Worked explanation and practice

**Kubernetes symptom-to-layer decision tree:**
```mermaid
flowchart TD
    Sym[Pod/Service symptom]
    Pending{Pending?}
    Creating{ContainerCreating stuck?}
    Crash{CrashLoopBackOff?}
    NotReady{Running but NotReady?}
    Unreachable[Running+Ready but unreachable]

    Sym --> Pending
    Pending -->|yes| PendEv["kubectl describe pod - Events:<br/>Insufficient resource - capacity/quota/autoscaler<br/>node(s) had taint - affinity/toleration mismatch<br/>node(s) didn't match - nodeSelector/topology/PVC zone"]
    Pending -->|no| Creating
    Creating -->|yes| CreateEv["kubelet events: image pull, CNI, CSI mount, sandbox"]
    Creating -->|no| Crash
    Crash -->|yes| CrashEv["previous container's exit code + --previous logs<br/>137=SIGKILL(OOM/manual) 1=app error 143=SIGTERM"]
    Crash -->|no| NotReady
    NotReady -->|yes| ReadyEv["readiness probe result + app dependency check"]
    NotReady -->|no| Unreachable
    Unreachable --> Chain["EndpointSlice has IP? -> DNS resolves? -> kube-proxy/CNI dataplane -> NetworkPolicy"]
```

**Sample annotated output — GPU-specific Pending Pod, the exact evidence chain:**
```
$ kubectl describe pod bert-train-0 | tail -15
Events:
  Type     Reason            Age   From               Message
  ----     ------            ----  ----               -------
  Warning  FailedScheduling  38s   default-scheduler   0/12 nodes are available:
           8 Insufficient nvidia.com/gpu, 4 node(s) had untolerated taint
           {nvidia.com/gpu: present}.
```
Two distinct causes in one message: 8 nodes simply don't have enough free GPU allocatable (capacity question — will autoscaler help, or is the whole fleet saturated?), and 4 nodes are GPU nodes tainted to keep non-GPU workloads off them, and this Pod has no matching toleration (spec bug, not a capacity problem — adding nodes won't fix it). **Interview-ready line:** "One FailedScheduling message can bundle two unrelated root causes — I'd never add capacity before reading which specific nodes failed for which specific predicate."

## Practice
6. Deliberately create a Pod with a `nodeSelector` that matches zero nodes and one with a GPU resource request exceeding cluster capacity — compare the two `FailedScheduling` messages verbatim and explain in one sentence how you'd tell them apart without reading the message (hint: you can't reliably — always read the actual message).

**Visual model — Pending is a scheduler explanation, not one failure state:**
```mermaid
flowchart LR
    P[Pending Pod] --> R[read events]
    R -->|resources / topology| A[capacity or placement]
    R -->|taint / affinity| B[specification mismatch]
    R -->|PVC / volume| C[storage binding]
    R -->|admission / quota| D[policy boundary]
```
**Key takeaway:** *"The event names the predicate; do not guess from the phase."*
