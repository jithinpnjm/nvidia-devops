---
title: "Chapter 3 - Kubelet, CRI and Pod lifecycle"
slug: "chapter-3-kubelet-cri-and-pod-lifecycle"
sidebar_position: 3
description: "Chapter 3 - Kubelet, CRI and Pod lifecycle — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
# Chapter 3 — Kubelet, CRI and Pod lifecycle
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Understand how an assigned Pod becomes namespaces, cgroups, volumes, network setup and running containers on a node.

The kubelet watches Pods assigned to its node, manages volumes/secrets/config, asks the container runtime through CRI to create sandboxes/containers, and reports status back to the API. CNI plugins handle network setup through the runtime integration path; CSI handles storage interactions. A Pod can therefore be scheduled correctly but fail during node-local preparation.

```
kubectl describe pod <pod>
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[*].state}'
journalctl -u kubelet --since '-20 min'
crictl ps -a
crictl inspectp <sandbox-id>
```

| Symptom | Likely stage |
|---|---|
| Pending, no nodeName | scheduler / admission / PVC binding |
| nodeName set, ContainerCreating | kubelet: image, CNI, CSI, mounts, sandbox |
| ImagePullBackOff | registry/auth/image pull |
| CrashLoopBackOff | container starts then exits repeatedly |
| Running but NotReady | readiness/dependency/application health |

➕ **The full node-local pipeline once a Pod is bound to a node** (the source names the actors; here is the sequence and where each symptom in the table actually originates):
```
API: Pod bound to node (nodeName set)
        │
        ▼
kubelet's Pod worker picks it up (SyncPod loop)
        │
        ├─▶ CRI: RunPodSandbox ──▶ creates network namespace, cgroup scaffold
        │        │                         │
        │        ▼                         ▼
        │   CNI plugin invoked        cgroup created (empty, no containers yet)
        │   (assigns Pod IP, sets     "ContainerCreating" if this step stalls —
        │    up veth/routes)           CNI plugin errors show up HERE
        │
        ├─▶ CSI: volume attach/mount steps for any PVCs — "ContainerCreating"
        │        if THIS stalls instead (different root cause, same symptom)
        │
        ├─▶ CRI: PullImage (per container) ── registry auth/network/quota
        │        failures here → ImagePullBackOff, NOT ContainerCreating forever
        │
        └─▶ CRI: CreateContainer + StartContainer (per container, in order)
                 │
                 ▼
            container process starts → exits immediately/crashes repeatedly
            → CrashLoopBackOff (kubelet backs off restart interval exponentially)
                 │
                 ▼
            container stays up → kubelet runs readiness probe
            → Running but NotReady if probe fails, independent of container health
```
➕ **Why this matters:** every row in the table above is a *different failure stage in this same pipeline* — the practical value of memorizing this sequence is that `ContainerCreating` alone is not a diagnosis, it's a stage that covers at least three independent subsystems (CNI, CSI, image pull ordering, sandbox creation). The fix is always "find which CRI call is stuck," not "restart the Pod."

➕ **Sample annotated output — pinpointing exactly which CRI call stalled:**
```
$ crictl inspectp <sandbox-id> | jq '.status'
{
  "state": "SANDBOX_READY",
  "network": {
    "ip": "",                     ← EMPTY. Sandbox exists but CNI never assigned an IP.
    "additionalIps": []
  }
}
$ journalctl -u kubelet --since '-5 min' | grep -i cni
kubelet[2140]: E0130 "Failed to setup network for sandbox" err="plugin type=\"calico\" failed (add): error getting ClusterInformation: connection refused"
```
This is the smoking gun: the sandbox itself is fine (`SANDBOX_READY`), but CNI failed to assign an IP because the CNI plugin's own health dependency (here, a Calico API datastore) is unreachable — this is a *cluster networking control-plane* problem masquerading as a single Pod stuck in `ContainerCreating`. If this is happening cluster-wide, escalate immediately rather than treating each Pod individually.

➕ **GPU-specific version of the same pipeline — device plugin allocation happens inside CRI's CreateContainer step, not before:**
```bash
crictl inspect <container-id> | jq '.info.runtimeSpec.linux.resources.devices'
```
```
[
  {"allow": true, "type": "c", "major": 195, "minor": 0, "access": "rwm"},   ← /dev/nvidia0
  {"allow": true, "type": "c", "major": 195, "minor": 255, "access": "rwm"}  ← /dev/nvidiactl
]
```
If a Pod's requested `nvidia.com/gpu` device never shows up in this list, but the Pod passed scheduling and is `Running`, look at the NVIDIA device plugin's `Allocate()` gRPC response and the kubelet's device manager checkpoint (`/var/lib/kubelet/device-plugins/kubelet_internal_checkpoint`) — a stale checkpoint after a device plugin restart is a known cause of a container starting with zero actual GPU device nodes bind-mounted despite the Pod object claiming the resource.

➕ **Diagram: Pod phase state machine — where the table's symptoms actually sit on it:**
```
   Pending ──(bound to node)──▶ ContainerCreating ──(all containers started)──▶ Running
      │                                │                                          │
      │                                │                                readiness probe fails
      │                          image/CNI/CSI/                                   │
      │                          sandbox stalls                                   ▼
      │                          (stays here,                             Running, NotReady
      │                           no phase change)                        (still counted Running —
      │                                                                    NotReady is a condition,
      ▼                                                                    not a phase)
  never scheduled                                              container exits ──▶ CrashLoopBackOff
  (admission/scheduler                                          repeatedly          (kubelet backs off
   evidence, Ch1/Ch2)                                                                restart interval,
                                                                                      phase stays Running
                                                                                      or goes Failed
                                                                                      depending on restartPolicy)
```
`kubectl get pods` only ever shows you the phase — CrashLoopBackOff and NotReady are reasons/conditions layered on top of `Running`, which is exactly why the symptom table above needs a second axis (kubelet/CRI evidence) to actually diagnose anything.

## Worked scenario
**Situation:** A GPU training Pod is stuck `ContainerCreating` for 8 minutes. `kubectl describe pod` shows only "waiting" with no explicit error.

1. `journalctl -u kubelet --since '-15 min' | grep <pod-uid>` — kubelet logs almost always have more detail than the Pod's Events, which throttle/deduplicate.
2. `crictl ps -a | grep <pod-uid>` — is there even a sandbox/container attempt, or is nothing being created at all (points further upstream, e.g. runtime itself unhealthy)?
3. `crictl inspectp <sandbox-id>` — check `network.ip`; empty means CNI stalled (see above).
4. If IP is assigned but still stuck, check CSI: `kubectl describe pvc` for the Pod's volumes, and `journalctl -u kubelet | grep -i mount`.
5. If image pull is large (common for GPU/ML images, often multi-GB with CUDA base layers), confirm it isn't just a slow pull: `crictl images` and `crictl pull <image>` timing manually, versus an actual auth/network failure.

**Conclusion:** the correct branch depends on which CRI/CNI/CSI call is stuck — "ContainerCreating" by itself never tells you which of the three.

➕ **Shortcut — a single command to see the whole node-local state for one Pod:**
```bash
POD_UID=$(kubectl get pod <pod> -o jsonpath='{.metadata.uid}')
crictl pods --id "$POD_UID" -v 2>/dev/null; crictl ps -a --pod "$(crictl pods -q --name <pod>)"
```
➕ **Mnemonic:** *"Sandbox, network, volumes, image, start — in that order."* Walking the pipeline in that exact order, top to bottom, always lands on the actual stuck stage faster than reading kubelet logs top-to-bottom looking for "the error."

## Practice
1. Given a Pod stuck in ContainerCreating with no error in `kubectl describe`, name the three subsystems it could be stuck in and the command that distinguishes them.
2. Explain why CrashLoopBackOff and Running-but-NotReady are different failure classes even though both look "unhealthy" from `kubectl get pods`.
3. Trace a GPU device from device-plugin advertisement through to a bind-mounted `/dev/nvidia0` inside a running container.

➕ 4. Using `crictl inspectp` on a healthy Pod's sandbox, note the baseline `network.ip` and `state` fields, then deliberately break CNI (e.g. stop the CNI daemon/Pod on a lab node) and create a new Pod — confirm you can name exactly which pipeline stage failed using only `crictl` and `journalctl`, without touching `kubectl describe`.
➕ 5. Explain what a stale kubelet device-plugin checkpoint is, why a device plugin restart can produce one, and what evidence (`crictl inspect` device list vs Pod's claimed `nvidia.com/gpu` request) would prove a container is Running with zero actual GPU devices attached.
