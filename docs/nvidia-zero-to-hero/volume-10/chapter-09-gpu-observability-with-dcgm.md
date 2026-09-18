---
title: Chapter 09 — GPU Observability with DCGM
description: Build Kubernetes monitoring around DCGM, DCGM Exporter, Prometheus, events, and workload context.
sidebar_position: 10
tags: [dcgm, prometheus, kubernetes]
---

# GPU Observability with DCGM

A Kubernetes Pod can be `Running` while its assigned GPU is reset, thermally constrained, waiting on input, or producing errors that have not yet reached the application. Conversely, a low-utilization GPU is not necessarily waste: an online inference service may be deliberately provisioned for latency. The operating question is therefore not “what is GPU utilization?” It is “which layer is limiting this workload, and is that condition actionable?”

NVIDIA Data Center GPU Manager (DCGM) supplies the device-side evidence Kubernetes lacks. DCGM Exporter makes selected DCGM fields available to Prometheus. Together with Kubernetes object state, kubelet and runtime logs, and application signals, they let an operator distinguish capacity, health, and performance incidents.

## Learning objectives

After this chapter, you should be able to design a telemetry path that preserves device identity, correlate a GPU with its allocated workload, choose alert conditions that lead to an action, and recognize when the monitoring system itself is the failed component.

## Start with an operational question

Consider a training team reporting that step time doubled overnight. A dashboard showing 40 percent GPU utilization is not an explanation. The operator needs a time-aligned view of the job, GPU UUID, node, allocated CPU and NUMA locality, input-pipeline behavior, recent node changes, and hardware events. That evidence can separate a data-loader stall from a power limit, a topology regression, a driver event, or ordinary variation in the workload.

This is why telemetry design begins with decisions. Page only when somebody must interrupt their work: loss of a schedulable GPU, an actionable hardware or driver event, sustained throttling with service impact, or loss of monitoring coverage. Use dashboards and capacity reports for utilization, utilization trends, and potential right-sizing. A page for “GPU utilization is low” usually trains responders to ignore the alert.

## The evidence path

```mermaid
flowchart LR
    GPU[GPU and driver] -->|"evidence: DCGM field IDs populate,<br/>e.g. DCGM_FI_DEV_GPU_UTIL"| DCGM[DCGM fields]
    DCGM -->|"evidence: /metrics endpoint<br/>returns non-empty scrape"| Exporter[DCGM Exporter]
    Exporter -->|"evidence: Prometheus target State=up,<br/>scrape_samples_scraped > 0"| Prom[Prometheus]
    K8s[Kubernetes state and events] --> Prom
    App[Application metrics and logs] --> Prom
    Prom --> Fresh{"Scrape fresh AND<br/>Pod/UUID join resolves?"}
    Fresh -->|"No — stale scrape or broken join"| Blind["Telemetry-blind: dashboard shows old or\nunlabeled data — fix observability BEFORE\ntrusting any health conclusion"]
    Fresh -->|"Yes"| Alert[Dashboards, recording rules, alerts]
    Alert --> Runbook[Incident runbook and workload owner]
```

**Figure 10.9.1 — GPU metrics become useful only when they can be joined with workload and platform evidence, and that join can itself silently fail.** The exporter is one observation point, not a complete diagnosis system. The decision diamond exists because a green Grafana panel with stale data looks identical to a green panel with fresh data unless someone checks scrape freshness explicitly — this is the "Failure patterns that mislead operators" section's first entry, made mechanical here instead of stated only in prose.

The GPU UUID is the durable join key for device evidence. Device indexes are convenient for a local command but can change after a reboot, reset, or inventory change. Preserve node and UUID labels; add Pod, namespace, and container context only where the exporter and platform integration can establish that mapping correctly. Do not manufacture a workload association from a sampled process list and treat it as allocation truth.

**The exporter's own output, annotated.** DCGM Exporter serves Prometheus-format metrics on `:9400/metrics`; a representative scrape for one GPU looks like:

```text
$ curl -s localhost:9400/metrics | grep -E 'DCGM_FI_DEV_(GPU_UTIL|MEM_COPY_UTIL|POWER_USAGE|GPU_TEMP|XID_ERRORS)' | grep -v '^#'
DCGM_FI_DEV_GPU_UTIL{gpu="0",UUID="GPU-3a1e9f2b-...",Hostname="gpu-node-07",pod="train-worker-2",namespace="ml-training"} 91
DCGM_FI_DEV_MEM_COPY_UTIL{gpu="0",UUID="GPU-3a1e9f2b-...",Hostname="gpu-node-07",pod="train-worker-2",namespace="ml-training"} 74
DCGM_FI_DEV_POWER_USAGE{gpu="0",UUID="GPU-3a1e9f2b-...",Hostname="gpu-node-07",pod="train-worker-2",namespace="ml-training"} 312.4
DCGM_FI_DEV_GPU_TEMP{gpu="0",UUID="GPU-3a1e9f2b-...",Hostname="gpu-node-07",pod="train-worker-2",namespace="ml-training"} 61
DCGM_FI_DEV_XID_ERRORS{gpu="0",UUID="GPU-3a1e9f2b-...",Hostname="gpu-node-07",pod="train-worker-2",namespace="ml-training"} 0
```
Every line carries `UUID` alongside the more convenient `gpu="0"` index — the index is what a human reads at a glance, but `UUID` is the field a recording rule or join should key on, because `gpu="0"` on this node after a reboot is not guaranteed to be the same physical card. `pod`/`namespace` labels are present here because this cluster's exporter integration can resolve that mapping; the chapter's warning above applies precisely to deployments where that integration is absent and those labels would otherwise be fabricated from a process scan. `DCGM_FI_DEV_XID_ERRORS` at `0` is the reliability signal from the table below — nonzero here, even briefly, is the row's actionable condition.

## Metrics with an owner and a response

| Evidence domain | What it can establish | Typical response |
|---|---|---|
| Availability | A device or node is no longer available to the platform | Quarantine or drain the node, protect capacity, investigate the first failed layer |
| Reliability | Error counters, XID evidence, and memory-health indicators changed | Correlate with driver and workload failures; follow the hardware-support procedure when required |
| Thermal and power | The device is operating under a limit or throttle condition | Check cooling, power policy, clocks, and workload impact before changing limits |
| Utilization and memory | The device is active, idle, or near memory capacity | Diagnose workload behavior and plan capacity; do not page from a single sample |
| Fabric and topology | Interconnect state or counters indicate a possible path issue | Compare with peer topology and collective-job symptoms |
| Telemetry pipeline | Exporter, scrape, or series freshness is failing | Restore observability first; mark health conclusions as uncertain until coverage returns |

Metric names and available fields vary with the DCGM Exporter version and hardware. Build recording rules from the field list actually deployed, and keep the selected metrics under version control with the platform configuration. This avoids an alert rule silently becoming meaningless after an image or configuration change.

**Evidence for the Reliability row.** A rising `DCGM_FI_DEV_XID_ERRORS` counter, cross-referenced against the kernel log on the same node, converts "an alert fired" into a specific fault class:

```text
$ curl -s localhost:9400/metrics | grep DCGM_FI_DEV_XID_ERRORS | grep -v '^#'
DCGM_FI_DEV_XID_ERRORS{gpu="1",UUID="GPU-9c31...",Hostname="gpu-node-14"} 1

$ ssh gpu-node-14 dmesg -T | grep -i xid
[Wed Aug  5 03:12:44 2026] NVRM: Xid (PCI:0000:65:00): 79, pid=48213, name=python3, GPU has fallen off the bus
```
`Xid 79` ("GPU has fallen off the bus") is one of the small set of Xid codes that means the device itself needs escalation, not a workload retry — pairing the Prometheus counter (which tells you *that* something happened and on which UUID) with the kernel log (which tells you *what* happened) is what turns a page into an actionable next step instead of a guess.

**Evidence for the Telemetry pipeline row.** `up{job="dcgm-exporter"}` and `scrape_samples_scraped` distinguish "the GPU is idle" from "the exporter stopped reporting":

```text
$ curl -s 'http://prometheus:9090/api/v1/query?query=up{job="dcgm-exporter"}' | jq -r '.data.result[] | "\(.metric.instance) \(.value[1])"'
gpu-node-07:9400 1
gpu-node-14:9400 0
```
`gpu-node-14:9400` reporting `0` means Prometheus cannot even reach that exporter — every DCGM-derived panel for that node is stale or absent, and the correct response is "restore the scrape target," not "investigate why the GPU looks idle." This is the exact failure this chapter's Big Picture diagram routes to the `Blind` branch: check `up` before trusting any utilization number from that node.

## Build a monitoring contract

A production GPU pool needs a small, explicit contract:

1. **Coverage:** every accepted GPU node is scraped, and the platform alerts when expected targets disappear or their data becomes stale.
2. **Identity:** dashboards can pivot from a workload to its node and GPU UUID, then to node events and driver evidence.
3. **Semantics:** each alert states the triggering condition, likely blast radius, owner, first checks, and safe mitigation.
4. **Retention:** raw data is retained long enough to compare a workload regression with the relevant deployment or maintenance window; aggregate trends serve longer-term capacity work.
5. **Cost control:** labels are bounded. Per-process, per-container, or highly dynamic labels can turn a useful GPU dashboard into an expensive and unreliable Prometheus workload.

The same contract applies to multi-tenant clusters. Tenant-facing views should expose the capacity and service signals they need without leaking other tenants’ Pod names, namespaces, or detailed hardware inventory.

## Correlation during an incident

Use a stable order. First establish scope: one Pod, one GPU, one node pool, or the fleet. Then determine whether Kubernetes has allocated the device and whether the application can initialize CUDA. Only then interpret utilization, memory, clocks, power, and reliability signals. An error event close to a workload failure is evidence, not automatically root cause; compare it with a healthy node and the change timeline.

For a workload that is slow but healthy, compare allocated GPU model, peer topology, CPU placement, NIC locality, input rate, and batch behavior before declaring a GPU fault. The scheduler can make a valid allocation that is still a poor fit for a topology-sensitive job. [GPU Scheduling and Topology](./chapter-08-gpu-scheduling-and-topology) develops that placement boundary.

## Failure patterns that mislead operators

**No GPU metrics.** Start at the exporter Pod and work outward: scheduling, container logs, host-device access, DCGM connectivity, ServiceMonitor or scrape configuration, target health, and network policy. A green Grafana panel with no recent samples is not proof of a healthy GPU.

**Metrics have no workload context.** Confirm what association mechanism is enabled and what it promises. Cross-check a known allocated Pod against the device-plugin allocation and the exporter labels. If the mapping is unavailable, make the dashboard explicitly node- and UUID-oriented rather than implying Pod-level precision it does not have.

**A reliability alert follows a reset.** Protect workloads first: stop new placement or cordon the affected node according to the runbook. Capture node events, driver logs, relevant DCGM evidence, and the workload timeline before a reboot or replacement removes useful state. Then decide whether recovery, a node drain, or hardware escalation is warranted.

**A utilization alert says every GPU is idle.** Treat this as a possible telemetry failure until scrape freshness, label selection, and time range are confirmed. If the data is real, ask whether the service has traffic, whether jobs are pending for another constraint, and whether capacity policy intentionally keeps headroom.

## Production design review

The observability stack must cross the same boundaries as the GPU platform: privileged host access for collection, network access for scraping, and permissions to discover Kubernetes context. Review those boundaries along with the operator deployment. Restrict metrics endpoints appropriately, mirror approved images where required, and test the behavior when Prometheus, the exporter, or a node is unavailable.

Acceptance testing should prove more than that an endpoint responds. Schedule a representative GPU Pod, identify its node and UUID, verify recent metrics and workload context, and exercise the alert routing path with a safe test condition. The acceptance gates in [Production Installation and Configuration](./chapter-10-production-installation-and-configuration) should make this a release requirement.

## Senior-level design questions

**Why is a utilization threshold a poor primary paging signal?**

**Model answer:** "Utilization by itself has no failure semantics attached to it — 20% could be a legitimately low-traffic inference service, a data-loader stall, or a broken scrape target reporting stale zeros, and 95% could be a perfectly healthy training job. If I page on 'utilization below X%,' I train the on-call rotation to snooze the alert within a week because most pages turn out to be nothing actionable. I'd rather page on conditions with a defined responder action — lost schedulable capacity, an Xid event, sustained throttling with a measured service impact, or lost monitoring coverage — and push utilization into dashboards and weekly capacity review instead."

**What makes GPU telemetry trustworthy?**

**Model answer:** "Six things, and I'd check all of them before trusting a dashboard during an incident: full coverage so a missing node doesn't look like a healthy one, a stable join key — GPU UUID, not device index, because indexes can renumber after a reboot — documented field semantics so I know what a metric actually measures, bounded label cardinality so Prometheus itself doesn't fall over, active freshness monitoring so a stale scrape doesn't masquerade as current data, and a demonstrated, tested link back to Kubernetes Pod and application context. Miss any one of those and what I'm looking at is a visualization, not something I'd bet an incident response on."

**Walk through how you'd distinguish 'the GPU is genuinely idle' from 'the exporter died' during an incident.**

**Model answer:** "First move, before I look at the utilization number at all, is `up{job=\"dcgm-exporter\"}` for that instance in Prometheus. If that's `0`, I already have my answer — the exporter or the scrape path is down, and every panel for that node is stale, full stop, don't reason about GPU state from it. If `up` is `1`, I'd check `scrape_samples_scraped` and the sample timestamp to confirm the data is actually recent and not just a target that responds but stopped updating internally. Only once both of those check out do I trust the utilization number itself, and even then a real zero needs a second question behind it — does this service have traffic right now, and is anything actually queued waiting for it."

## Key takeaways

- DCGM supplies device evidence; it does not replace Kubernetes, runtime, or application observability.
- Preserve GPU UUID and node identity, then add workload context only when it is accurate.
- Alerts need an owner and a safe action; trends belong in dashboards and capacity reviews.
- Monitor exporter and scrape health as carefully as GPU health.

## Cross references

- [GPU Scheduling and Topology](./chapter-08-gpu-scheduling-and-topology)
- [Production Installation and Configuration](./chapter-10-production-installation-and-configuration)
- [Upgrades and Production Troubleshooting](./chapter-11-upgrades-and-production-troubleshooting)
