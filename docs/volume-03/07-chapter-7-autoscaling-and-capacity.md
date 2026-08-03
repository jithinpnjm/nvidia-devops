---
title: "Chapter 7 - Autoscaling and capacity"
slug: "chapter-7-autoscaling-and-capacity"
sidebar_position: 7
description: "Chapter 7 - Autoscaling and capacity — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
# Chapter 7 — Autoscaling and capacity
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Understand HPA/VPA/KEDA signals, cluster autoscaler constraints and why application scaling and node scaling are different loops.

HPA adjusts workload replicas based on metrics; KEDA can translate event/external metrics; VPA recommends or adjusts resource requests depending on mode; cluster autoscaler changes node count when Pods are unschedulable due to capacity and an eligible node group can help. These loops interact through requests and scheduling.

```
kubectl get hpa -A
kubectl describe hpa <name>
kubectl get events --field-selector reason=FailedScheduling
```

➕ **Four independent control loops, drawn together — this is the diagram to reproduce cold in an interview:**
```mermaid
flowchart TD
    HPA["HPA<br/>metric: CPU%, custom, external via KEDA"]
    KEDA["KEDA (scale-to-zero, event sources)<br/>metric source: queue depth, Kafka lag, custom metric"]
    VPA["VPA (changes requests, NOT count)<br/>historical usage recommendation<br/>(separate loop -- can conflict with HPA if both target CPU)"]
    Adjust["adjusts replicas of a Deployment/StatefulSet"]
    NewPods["new Pods created, each carrying its OWN resource requests (unchanged by HPA -- HPA only changes replica COUNT, never the per-Pod request/limit)"]
    Sched["scheduler tries to place new Pods"]
    Failed["if unschedulable due to capacity -- FailedScheduling event"]
    CA["Cluster Autoscaler<br/>watches FailedScheduling + node group configs"]
    Nodes["adds/removes NODES (not Pods) -- only if an eligible node group expansion would actually help"]

    HPA --> Adjust
    KEDA --> Adjust
    Adjust --> NewPods --> Sched --> Failed --> CA --> Nodes
    VPA -.->|"changes per-Pod requests, separate loop"| NewPods
```
➕ **Interview-ready line:** "There are four loops here, not one — HPA changes replica count, VPA changes per-Pod requests, KEDA changes what triggers HPA, and cluster autoscaler changes node count. They only *look* like one system because they're chained through the scheduler; debugging any one of them by looking at another's metrics is the most common mistake I see."

➕ **The VPA/HPA conflict, made concrete — a known landmine worth naming unprompted:**
```mermaid
flowchart TD
    VPAStep["VPA in Auto mode recomputes and re-applies CPU/memory REQUESTS based on historical usage -- this changes the per-Pod resource footprint"]
    HPAStep["HPA targeting CPU UTILIZATION % computes against (usage / request)"]
    Drop["If VPA raises the request while usage stays flat, HPA's computed utilization % DROPS -- HPA may then scale replicas DOWN, even though nothing about actual load changed. The two loops are fighting over the same denominator without knowing about each other."]

    VPAStep --> HPAStep --> Drop
```
Mitigation named in K8s docs and worth stating directly: don't run VPA in `Auto`/`Recreate` update mode on CPU/memory simultaneously with HPA targeting CPU/memory utilization on the *same* workload — either let VPA drive requests and HPA target a custom/external metric instead, or pick one loop per resource dimension.

➕ **Sample annotated output — reading an HPA's actual decision math, not just its output replica count:**
```bash
$ kubectl describe hpa api -n prod
Reference: Deployment/api
Metrics: ( current / target )
resource cpu on pods (as a percentage of request): 78% (390m) / 70%
Min replicas: 5
Max replicas: 30
Current replicas: 12
Desired replicas: 14 ← 12 * (78/70) ≈ 13.4
rounds to 14
Conditions
Type Status Reason
AbleToScale True ReadyForNewScale
ScalingActive True ValidMetricFound
ScalingLimited False (would be True if pinned at Min or Max replicas)
```
The `Desired replicas` math is always `ceil(currentReplicas * currentMetric/targetMetric)`, clamped by a stabilization window (default 0s scale-up, 5 min scale-down in modern versions) to prevent flapping — worth being able to do this arithmetic live, since "why did it scale from 12 to 14 and not straight to 30" is a real question customers ask.

➕ **Diagram: cluster autoscaler's own decision loop, the piece that explains "why didn't it just add a node":**
```mermaid
flowchart TD
    Pending["Pod is Pending, FailedScheduling event fires"]
    Watch["Cluster autoscaler watches for unschedulable Pods (own controller loop, separate from the scheduler itself)"]
    Simulate{"For each configured node group: SIMULATE -- would a new node from this group's template actually satisfy this Pod's Filter constraints (resources, taints, affinity, GPU type)?"}
    CheckMax["Check that group's max size isn't already hit"]
    StillPending["Pod stays Pending -- this is the autoscaler correctly declining, not a bug"]
    ScaleUp["Scale up that node group -- new node joins -- scheduler retries the Pending Pod on the next cycle"]

    Pending --> Watch --> Simulate
    Simulate -->|"YES for >= 1 group"| CheckMax --> ScaleUp
    Simulate -->|"NO for every node group (wrong GPU type available, or every eligible group already at max size)"| StillPending
```

## Worked scenario
**Situation:** HPA increases replicas from 5 to 20, but 12 Pods remain Pending and cluster autoscaler does not add nodes.

1. Read FailedScheduling reasons. Autoscaler only helps if a node group expansion could make the Pod schedulable.
2. Check node-group max size and cluster resource limits/quotas.
3. Check affinity/taints/topology/PVC/GPU constraints that a new generic node would not solve.
4. Check autoscaler logs/events for "max limit reached" or "no expansion options."
5. Review whether the HPA metric and resource requests produce a feasible scaling model.

**Conclusion:** Application autoscaling can create desired Pods that capacity/autoscaler constraints cannot satisfy.

➕ **Sample annotated output — the specific autoscaler log line that answers step 4 definitively:**
```
$ kubectl -n kube-system logs deploy/cluster-autoscaler --tail=50 | grep -i "api-gpu"
I0130 status: node group gpu-pool-a100 already at max size (8), cannot scale up
I0130 pod api-gpu-7f9x is unschedulable and cannot be helped by scale-up of any
      existing node group: no node group can accommodate the pod's GPU request
      (nvidia.com/gpu: 1) — no GPU node group has available headroom under max size
```
This is the definitive "the autoscaler looked, and correctly declined" evidence — the fix is either raising `gpu-pool-a100`'s max size (a capacity/cost decision, escalate it as such, not as a bug) or admitting the workload genuinely can't scale further on current hardware allocation.

➕ **Second worked scenario — GPU-specific autoscaling deadlock (a very common real pattern in AI infra):**
> **Situation:** An inference service's HPA is configured on a custom metric (GPU utilization via DCGM exporter + Prometheus adapter). Under load, GPU utilization per Pod is pinned at 95%+, but HPA isn't scaling up at all.
> 1. `kubectl describe hpa` shows `metric.status: unknown` or a stale value — the first thing to check with any *custom* metric HPA is whether the metrics pipeline (DCGM exporter → Prometheus → prometheus-adapter → custom metrics API) is actually delivering fresh values, because unlike built-in CPU/memory metrics (always available from the metrics-server), a custom metric pipeline has multiple independent points of failure.
> 2. `kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/prod/pods/*/gpu_utilization"` — query the custom metrics API directly, bypassing the HPA controller, to isolate whether the pipeline itself is broken vs. the HPA object's configuration.
> 3. Even once metrics flow correctly, if new replicas need `nvidia.com/gpu: 1` and every GPU node group is already at its configured max, the HPA doing its job correctly (desired replicas: 20) simply produces more Pending Pods — the actual bottleneck is capacity, exactly as in the first scenario, just reached via a GPU-native metric instead of CPU.
> 4. The genuinely hard, senior-level part of this conversation: GPU nodes are expensive and slow to provision (driver install, GPU Operator reconciliation, sometimes minutes) compared to CPU nodes — recommend pre-warming a small buffer of idle GPU capacity or using node overprovisioning patterns (e.g. low-priority placeholder Pods that get preempted) rather than relying on reactive scale-up alone for latency-sensitive inference.
> **Conclusion:** GPU-metric HPA has an extra failure surface (the custom metrics pipeline itself) on top of every constraint from the first scenario — verify the metric pipeline independently before assuming the autoscaling logic is at fault.

➕ **Shortcut — the fast triage for "HPA scaled but Pods are stuck":**
```bash
kubectl get hpa <name> -n <ns> -o json | jq '.status.conditions'
kubectl get events -n <ns> --field-selector reason=FailedScheduling --sort-by=.lastTimestamp | tail -5
kubectl -n kube-system logs deploy/cluster-autoscaler --tail=30 | grep -i "$(kubectl get hpa <name> -o jsonpath='{.spec.scaleTargetRef.name}')"
```
➕ **Mnemonic:** *"HPA asks, scheduler judges, autoscaler only helps if judgment can change."* — a scale-up request is a wish; the scheduler's Filter phase (Chapter 2) is the actual arbiter of whether more replicas or more nodes solves anything.

## Practice
1. Explain HPA vs cluster autoscaler to a customer using two separate control loops.
2. Given an HPA's `Metrics` block showing current/target percentages, compute the desired replica count by hand.
3. Explain the VPA/HPA conflict when both target CPU on the same workload, and name the two ways to avoid it.

➕ 4. Diagnose a stuck custom-metric HPA (GPU utilization via DCGM/Prometheus) by querying the custom metrics API directly, independent of the HPA object — explain why this isolates "metrics pipeline broken" from "HPA logic broken."
➕ 5. Propose a concrete node-overprovisioning or pre-warming strategy for a latency-sensitive GPU inference service where reactive cluster-autoscaler scale-up (minutes, due to driver/GPU-Operator readiness) is too slow for the traffic pattern — name the tradeoff (idle GPU cost vs. latency risk) explicitly.
