---
title: "Chapter 8 - Operators, GitOps and platform engineering"
slug: "chapter-8-operators-gitops-and-platform-engineering"
sidebar_position: 8
description: "Chapter 8 - Operators, GitOps and platform engineering — Kubernetes and Platform Engineering."
source_document: "Volume_03_Kubernetes_and_Platform_Engineering(3).docx"
---
# Chapter 8 — Operators, GitOps and platform engineering
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Use reconciliation to package domain operations and expose safe self-service without hiding operational truth.

A CRD defines new API types; a controller reconciles them. The operator pattern is valuable when lifecycle logic belongs with a domain resource. GitOps uses a similar desired-state idea for cluster configuration: Git records desired configuration and a controller pulls/reconciles it. The value is auditability, drift detection and controlled automation—not simply "store YAML in Git."

```
# Useful Flux-style evidence
flux get kustomizations -A
flux get helmreleases -A
kubectl describe helmrelease <name> -n <ns>
```

Platform engineering adds product thinking: create paved roads that encode security, observability, ownership and lifecycle defaults while allowing escape hatches for workloads that need specialized GPU, network or storage behavior.

➕ **CRD + controller = the same reconcile loop as everything else in this volume, just with a domain-specific object instead of a built-in one:**
```
CRD registers a new type, e.g. "GPUClusterPolicy" or "ModelDeployment"
        │
        ▼
kubectl apply -f my-model-deployment.yaml   ← just an API write, same pipeline as Ch1
        │
        ▼
Operator's controller (running as a Deployment, watching this CRD via
informer — same watch/list mechanics as Deep Dive 1) sees the object,
compares desired spec to observed state of the REAL resources it owns
(Deployments, Services, ConfigMaps, cloud resources via a cloud-controller
pattern, etc.), and reconciles toward desired state — level-based, same
as Chapter 1's controller discussion, just operating on a custom Kind.
```
➕ **Interview-ready line:** "An operator isn't a new mechanism — it's the exact same watch-reconcile loop every built-in controller uses, pointed at a CRD instead of a Deployment. Anyone who's debugged a stuck Deployment already has the mental model for debugging a stuck custom resource; the only new step is finding which controller Pod owns that CRD."

➕ **Why "store YAML in Git" undersells GitOps — the actual value chain:**
| Property | What it actually buys you | Evidence command |
|---|---|---|
| Auditability | every change has a commit, author, PR review trail — not just "someone ran kubectl" | `git log -p -- path/to/manifest.yaml` |
| Drift detection | the GitOps controller continuously diffs live cluster state against Git and reports/corrects divergence | `flux get kustomizations -A` (Ready=False + a diff reason) |
| Controlled automation | promotion between environments is a Git merge, reviewable and revertible, not a manual `kubectl apply` run by whoever's on call | `flux get helmreleases -A` showing per-env revision pins |
| Reconciliation, not one-shot apply | if someone manually `kubectl edit`s a live object, the GitOps controller reverts it on the next sync — Git is authoritative, not just a backup | drift shows up as `Ready: False` or a revert event in controller logs |

➕ **Sample annotated output — catching drift, the exact evidence a customer would ask you to produce:**
```
$ flux get kustomizations -A
NAMESPACE     NAME              REVISION        SUSPENDED  READY   MESSAGE
platform      cluster-config    main@sha1:a3f9   False     True    Applied revision: main@sha1:a3f9
ml-platform   inference-svc     main@sha1:c71e   False     False   Applied revision: main@sha1:c71e
                                                                    kustomization/inference-svc:
                                                                    reconciliation in progress, or
                                                                    HelmRelease/model-router: install
                                                                    retries exhausted
```
`READY=False` on `inference-svc` is the signal to chase — `flux logs --level=error -n ml-platform` or `kubectl describe helmrelease model-router -n ml-platform` is the next command, following exactly the same "find the controller, read its status/conditions/events" instinct as every other chapter in this volume.

➕ **A manual drift, caught and reverted — the exact demo worth being able to narrate:**
```bash
kubectl edit deploy inference-api -n ml-platform   # manually bump replicas 3→10, save
sleep 30
kubectl get deploy inference-api -n ml-platform -o jsonpath='{.spec.replicas}'
```
```
3    ← GitOps controller reverted it on its next reconcile pass, because Git still says 3
```
This single demo is the fastest way to prove to a skeptical customer that GitOps isn't "just a deployment convenience" — it's an enforced desired-state contract, and it's worth having memorized as a live demo, not just a slide.

➕ **Diagram: the GitOps reconciliation loop, and exactly where a manual `kubectl edit` gets reverted:**
```
        ┌─────────────────────────────────────────────────┐
        │                                                   │
        ▼                                                   │
   Git repo (desired state,                                 │
   the source of truth)                                     │
        │                                                   │
        ▼  poll or webhook trigger                          │
   GitOps controller pulls latest commit                    │
        │                                                   │
        ▼                                                   │
   Diff: Git desired state  vs.  live cluster state          │
        │                                                   │
   ┌────┴────┐                                               │
   ▼         ▼                                               │
  match    drift found (someone ran `kubectl edit`,          │
  (no-op)   or a controller/human changed a live object)     │
             │                                               │
             ▼                                               │
       apply Git's version over the live object ─────────────┘
       (Ready flips False→True once synced; the manual edit
        is gone on the next reconcile pass, by design)
```
This loop is why "just `kubectl edit` it to fix it quickly" doesn't stick on a GitOps-managed resource — the fix has to land in Git, or the very next reconcile pass reverts it.

## Practitioner lens
**Vishakha Sadhwani: learn the platform structurally**
Her "11 practical steps" Kubernetes post moves from foundations through workloads, storage/config, networking/security, autoscaling/resources, operators, AI/ML, observability, GitOps and production concerns. This volume turns those layers into mechanisms and troubleshooting paths.

[Public source](https://www.linkedin.com/posts/vsadhwani_heres-a-breakdown-of-learning-kubernetes-activity-7421960722793967616-RBUe)

➕ **Worked scenario (added — the source didn't include one for this chapter, so this fills the gap the pattern requires):**
> **Situation:** The GPU Operator's `ClusterPolicy` object shows `state: notReady`, and NVIDIA driver DaemonSet Pods are stuck `CrashLoopBackOff` on three of twenty GPU nodes after a routine node OS patch.
> 1. `kubectl get clusterpolicy -o yaml` — check `.status.conditions` and `.status.state` per component (driver, toolkit, device-plugin, dcgm-exporter) — the GPU Operator's status surface is itself a reconciliation report, same pattern as any controller.
> 2. `kubectl -n gpu-operator get pods -o wide | grep -v Running` — find exactly which DaemonSet Pods are unhealthy and on which nodes; this narrows from "the operator" to "the driver container on 3 specific nodes."
> 3. `kubectl -n gpu-operator logs -l app=nvidia-driver-daemonset --tail=50 -c nvidia-driver-ctr` on one of the failing nodes — a routine OS kernel patch changing the running kernel version out from under a driver container expecting to build/load a matching kernel module is one of the most common real GPU-operator incidents; the log line to look for is a kernel-header/module-build mismatch.
> 4. The fix is node-scoped, not operator-scoped: cordon/drain the affected nodes, ensure kernel headers matching the new running kernel are available (or pin/rollback the OS patch), let the driver DaemonSet re-reconcile, then uncordon — validated with a known-good `nvidia-smi`/small CUDA workload before returning to service (Senior Deep Dive 8's exact guidance).
> **Conclusion:** treat the GPU Operator exactly like any other controller — read its own status object first, then narrow to the specific DaemonSet/node evidence — "the operator is broken" is almost never the right framing; "one component's reconciliation is stuck on specific nodes for a specific reason" usually is.

➕ **Shortcut — one-liner platform health check across operators and GitOps in one pass:**
```bash
flux get kustomizations,helmreleases -A | grep -v " True "
kubectl get clusterpolicy -o jsonpath='{.items[0].status.state}'
kubectl get crds | grep -Ei 'nvidia|gpu' | xargs -I{} kubectl get {} -A 2>/dev/null
```
➕ **Mnemonic:** *"An operator is just a controller with a domain-specific noun; GitOps is just reconciliation pointed at Git instead of a user's live edit."* — both concepts in this chapter reduce to the exact same watch/reconcile primitive taught in Chapter 1; the platform-engineering value is in what desired-state contract you choose to encode, not a new mechanism.

## Practice
1. Explain why "GitOps" means more than storing manifests in a Git repository — name the drift-detection and revert behavior specifically.
2. Given a `flux get kustomizations -A` output with one `Ready=False` row, write the next three commands you'd run to isolate the cause.
3. Explain the paved-road concept in platform engineering and name one escape hatch a GPU workload might legitimately need.

➕ 4. Demo manual drift-and-revert: change a GitOps-managed Deployment's replica count directly with `kubectl edit`, and time how long it takes the GitOps controller to revert it — explain what determines that interval (reconciliation/sync period) and how to tune it.
➕ 5. Using the GPU Operator scenario above, explain why "read the operator's own status object first" generalizes to any operator (not just NVIDIA's) — name the equivalent status object you'd check for a database operator, a certificate-manager operator, and a service-mesh operator.
