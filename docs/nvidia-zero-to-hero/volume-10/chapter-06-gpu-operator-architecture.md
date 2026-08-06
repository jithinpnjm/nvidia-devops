---
title: Chapter 06 — GPU Operator Architecture
description: Design the NVIDIA GPU Operator as a reconciled node-platform lifecycle, with explicit ownership, rollout, and failure boundaries.
sidebar_position: 7
tags: [gpu-operator, kubernetes, architecture]
---

# GPU Operator Architecture

A GPU node is not configured when a single installation command returns successfully. Its driver, container-runtime integration, device discovery, allocation, validation, and telemetry must continue to agree as nodes are added, rebooted, drained, patched, and replaced. NVIDIA GPU Operator expresses much of that lifecycle as Kubernetes-managed desired state.

That is powerful precisely because it is not a thin installer. A bad policy or incompatible version can be reconciled across an entire fleet with the same efficiency that a correct one can. Treat the operator as production infrastructure with an ownership model, a compatibility policy, and staged change control.

## Learning objectives

After this chapter, you will be able to:

- explain the control loop and the node-level operands it manages;
- identify the handoffs between platform, operating-system, and Kubernetes ownership;
- reason about readiness as an ordered set of evidence rather than a Pod phase; and
- build a rollout and diagnostic process that limits fleet-wide blast radius.

## Architecture: desired state becomes node-local work

```mermaid
flowchart TD
    Policy[ClusterPolicy and pinned release values] -->|"kubectl get clusterpolicy -o yaml"| Controller{Controller reconciles desired state?}
    Controller -->|"no: condition or controller error"| ControlFix[Inspect conditions, events, controller logs]
    Controller -->|yes| Operands[Create or update node operands]
    Operands --> Driver{Driver gate passes?}
    Driver -->|no: module or host error| DriverFix[Inspect driver Pod and kernel log]
    Driver -->|yes| Toolkit{Runtime gate passes?}
    Toolkit -->|no: fresh Pod sandbox fails| RuntimeFix[Inspect Toolkit, RuntimeClass, CDI, CRI]
    Toolkit -->|yes| Plugin{Resource gate passes?}
    Plugin -->|no: no allocatable GPU| PluginFix[Inspect device plugin and kubelet registration]
    Plugin -->|yes| Validate{Validator and telemetry pass?}
    Validate -->|no| ValidateFix[Inspect validator, exporter, scrape path]
    Validate -->|yes: representative workload succeeds| Accepted[Node enters production class]
```

**Figure 10.6.1 — Reconciliation is an evidence pipeline with explicit stop points.** A controller can create objects successfully while a host dependency fails. The first broken gate, not the last downstream Pod, defines the useful incident boundary.

The controller watches its declarative policy and reconciles the child resources needed to reach it. Most node-facing components run as DaemonSets because their work is tied to local hardware and the kubelet. A controller can converge Kubernetes objects, but it cannot make an unsupported kernel, a failed module load, or an unavailable registry safe. Those conditions remain operational dependencies.

## Responsibilities and boundaries

| Layer | Primary responsibility | Evidence of success |
|---|---|---|
| Platform engineering | supported configurations, values, rollout policy, node classes | reviewed configuration in source control |
| Operator controller | reconcile operands and surface component state | intended workloads created and progressing |
| Driver and toolkit operands | host driver and container runtime integration | usable driver and GPU-enabled container path |
| Discovery and device plugin | labels, health, and allocatable resources | expected labels and allocatable resource |
| Validation | test configured boundaries | defined checks pass on the node |
| Cluster operations | drains, kernels, images, registries, incident response | safe maintenance and recoverability |

The line between the first and second rows deserves special attention. The operator controls only the components it is configured to own. If the OS image pipeline installs the driver, do not also ask the operator to manage that driver. A hybrid model can be valid, but dual ownership of one host component turns reconciliation into conflict.

### Inspect desired state and observed state

**Purpose:** read the high-level policy conditions without treating a Helm release as proof.

```bash
kubectl get clusterpolicy cluster-policy -o json | jq '{generation:.metadata.generation,observed:.status.observedGeneration,state:.status.state,conditions:.status.conditions}'
```

**Representative output:**

```json
{
  "generation": 7,
  "observed": 7,
  "state": "ready",
  "conditions": [
    {
      "type": "Ready",
      "status": "True",
      "reason": "AllComponentsReady",
      "message": "All enabled operands are ready"
    }
  ]
}
```

`generation=7` and `observed=7` prove that the controller has processed the latest desired-state revision. `state=ready` and the condition summarize operand status. They do not prove a fresh CUDA Pod can start, because the controller reports Kubernetes object state, not application execution.

A stale reconciliation looks like this:

```json
{
  "generation": 8,
  "observed": 7,
  "state": "notReady",
  "conditions": [
    {
      "type": "Ready",
      "status": "False",
      "reason": "DriverNotReady",
      "message": "1 of 12 driver operands is not ready"
    }
  ]
}
```

The generation gap proves the current spec has not been fully observed. The message identifies scope—one of twelve nodes—so deleting all operands would be a disproportionate response.

**Purpose:** compare desired, current, and ready counts for node operands.

```bash
kubectl -n gpu-operator get ds \
  -o custom-columns='NAME:.metadata.name,DESIRED:.status.desiredNumberScheduled,CURRENT:.status.currentNumberScheduled,READY:.status.numberReady,AVAILABLE:.status.numberAvailable'
```

```text
NAME                                      DESIRED   CURRENT   READY   AVAILABLE
nvidia-driver-daemonset                   12        12        11      11
nvidia-container-toolkit-daemonset        12        12        12      12
nvidia-device-plugin-daemonset            12        12        12      12
gpu-feature-discovery                     12        12        12      12
nvidia-dcgm-exporter                      12        12        12      12
```

One driver Pod is not ready, while downstream operands are scheduled. This demonstrates why a DaemonSet list is not a strict serial installer. Find the one node and investigate the driver boundary before assuming twelve usable GPU nodes.

## Reconciliation is not a serial installer

It is useful to explain the dependency flow—driver before a meaningful CUDA validation, toolkit before a workload runtime path, plugin before allocation—but do not assume the Pods behave like a shell script. Controllers and DaemonSets independently retry. A component may be Running while it waits for a host condition, and a downstream component may report a more visible symptom than the upstream failure.

For operations, use an evidence chain instead:

1. The node is in the intended pool and can run the required operands.
2. The driver binds to the detected GPU.
3. The container runtime can create a GPU-enabled container.
4. The device plugin reports the expected healthy allocatable resources.
5. Discovery and acceptance labels match the service class.
6. Validation and telemetry complete successfully.

This is stronger than waiting for `NodeReady` or for every DaemonSet Pod to appear Running. The former proves basic Kubernetes reachability; the latter does not necessarily prove a workload can execute CUDA.

## Deployment models: choose one owner per layer

| Model | Best fit | Principal trade-off |
|---|---|---|
| Operator-managed driver and runtime | Kubernetes-centric fleets with controlled node OS compatibility | operator rollout must be coordinated with kernel lifecycle |
| Host-managed driver and runtime | immutable images or established OS configuration management | desired state and drift evidence partly live outside Kubernetes |
| Hybrid | a constrained enterprise boundary requires host ownership of selected layers | handoffs must be documented, tested, and monitored |

The choice should be decided before installation and encoded in release documentation. It affects image construction, privilege review, rollback, support boundaries, and who responds when a driver no longer loads after a node update. “It was already on the host” is not an ownership model.

### Worked blast-radius example

A policy targets 100 GPU nodes. A mistaken image reference causes every driver Pod to pull a nonexistent tag. If the policy applies cluster-wide, the controller creates 100 failing Pods. If rollout is constrained to a two-node canary pool first, the same error affects two nodes:

```text
cluster-wide blast radius: 100 / 100 = 100%
canary blast radius:        2 / 100 = 2%
```

Reconciliation speed is not itself safety. Scope and promotion gates convert fast convergence from a fleet-wide risk into an operational advantage.

## A release is a compatibility decision

Pin and review the operator chart or manifest source, its operand configuration, Kubernetes version, node operating-system and kernel channel, runtime, GPU fleet, and workload images as one release candidate. The goal is not to create an unmanageably large matrix; it is to prevent an unexamined change at one boundary from being treated as independent of the others.

A defensible promotion path uses a disposable environment or non-production pool, a production canary pool, then progressively wider pools. At each gate, confirm the evidence chain above and run a representative workload. Use a maintenance window and drain behavior that match the disruption tolerance of the workloads. Keep the prior known-good configuration and required images available for rollback, especially in restricted or disconnected environments.

## Production story: the policy that spread too far

A platform team changes a common value to update the driver path. The controller promptly updates all GPU-node operands. New nodes fail validation because their kernel channel differs from the nodes used in testing; existing nodes drain for unrelated maintenance and cannot return to service. The incident is not caused by Kubernetes reconciliation being unreliable. It is caused by treating cluster-wide desired state as if it were a canary.

The corrective design separates node pools by compatibility class, pins configuration in Git, applies it to a canary pool first, and permits production scheduling only after acceptance validation. It also defines the rollback trigger: loss of allocatable capacity or failed representative CUDA execution, not merely a controller log line.

## Security model

Several operands require elevated host access to load modules, configure a runtime, inspect devices, or expose telemetry. Put the operator and its operands in a tightly controlled namespace. Restrict who can modify the policy, DaemonSets, service accounts, and Node labels. Use approved registries and image provenance controls, and account for registry access during node recovery.

Privileged access is justified by host work, not by convenience. Review every operand’s permissions and host mounts as part of the platform threat model. The application namespace must not inherit the authority required to operate the node.

**Purpose:** verify that an ordinary tenant cannot mutate the ClusterPolicy.

```bash
kubectl auth can-i patch clusterpolicy --as=system:serviceaccount:tenant-a:default
kubectl auth can-i patch clusterpolicy --as=system:serviceaccount:platform-admin:gpu-platform-controller
```

```text
no
yes
```

The result proves RBAC authorization at query time. It does not prove that the privileged service account is used safely; audit logs, workload identity, and change approval remain required.

## Troubleshooting: find the first broken contract

| Observation | Likely boundary to inspect first |
|---|---|
| Operand absent from an intended node | selectors, taints, tolerations, image pull, policy configuration |
| Driver operand unhealthy | host kernel, module load, secure-boot and signing policy, node logs |
| No allocatable GPU | driver health, device plugin, kubelet registration |
| Pod starts without CUDA access | toolkit/runtime integration and allocation path |
| Validation fails after a change | the changed layer and its declared compatibility assumptions |

### Evidence row 1: operand absent because the node is outside policy scope

```bash
kubectl -n gpu-operator get ds nvidia-driver-daemonset -o json | jq '.spec.template.spec.nodeSelector'
kubectl get node gpu-node-12 -o json | jq '.metadata.labels | {deploy_driver:."nvidia.com/gpu.deploy.driver",pool:."gpu.platform.example/pool"}'
```

```text
{
  "nvidia.com/gpu.deploy.driver": "true"
}
{
  "deploy_driver": "false",
  "pool": "gpu-canary"
}
```

The DaemonSet is behaving correctly: the node explicitly opts out. Determine whether the label represents intentional host-managed driver ownership or stale maintenance state before changing it.

### Evidence row 2: image pull failure blocks one operand

```bash
kubectl -n gpu-operator describe pod nvidia-driver-daemonset-k8rxm | sed -n '/Events:/,$p'
```

```text
Events:
  Warning  Failed     28s  kubelet  Failed to pull image "registry.internal/gpu/driver:qualified":
  rpc error: code = Unknown desc = failed to resolve reference: unexpected status 401 Unauthorized
  Warning  Failed     28s  kubelet  Error: ErrImagePull
```

The failure is registry authentication, not kernel compatibility. Verify the image-pull secret and mirror availability before reading module logs that cannot yet exist.

### Evidence row 3: controller ready but workload validation fails

```bash
kubectl get clusterpolicy cluster-policy -o jsonpath='{.status.state}{"\n"}'
kubectl logs gpu-validator-gpu-node-09 --tail=20
```

```text
ready
validation: runtime=PASS
validation: resource=PASS
validation: cuda=FAIL
error: CUDA initialization failed: system has unsupported display driver / cuda driver combination
```

The policy summary says operands reconciled. The validator narrows the failure to CUDA initialization after runtime and resource gates passed. Compare the validation image and driver capability; do not interpret `ready` as workload acceptance.

## Customer architecture discussion

The operator is most valuable when it establishes a repeatable node contract. It should sit behind a platform interface: documented GPU classes, controlled configuration, acceptance gates, and an upgrade path. It does not remove customer choices about kernel governance, disconnected operations, security controls, or workload maintenance windows; it makes those choices observable and enforceable in the cluster.

## Interview preparation

**Why is a controller better than a configuration script for GPU nodes?**

> “A controller continuously compares desired and observed state, recreates missing operands, and exposes status as nodes join or change. A script performs a point-in-time mutation and usually has no built-in drift model. I would still qualify kernels, drivers, runtimes, and images because reconciliation cannot make an unsupported combination safe. The controller improves repeatability and evidence; it does not replace compatibility engineering.”

**What is the biggest risk of operator-managed infrastructure?**

> “The controller can distribute a bad configuration as reliably as a good one. I contain that risk with node-pool scope, a representative canary, explicit acceptance gates, pinned artifacts, and a coherent rollback. I also separate controller readiness from workload acceptance, because all Kubernetes objects can be healthy while a fresh CUDA process still fails.”

**How do you decide whether the operator or node-image pipeline owns the driver?**

> “I choose one authoritative reconciler based on the organization’s kernel, image, security, and support model. If the image pipeline owns the driver, I disable operator driver management and export driver evidence back to the platform. If the operator owns it, I qualify the kernel channel and drain behavior with the operator release. I avoid dual ownership because two systems rewriting the same host layer makes rollback and incident attribution ambiguous.”

## Key takeaways

- GPU Operator manages a lifecycle of related operands, not a single package.
- Configure one clear owner for every host layer.
- Validate an evidence chain from hardware to CUDA execution.
- Reconciliation reduces drift but increases the need for controlled rollout scope.
- Start incident analysis at the first failed contract, not the most visible downstream Pod.

## Cross references and further reading

- [Node and GPU Feature Discovery](./chapter-05-node-and-gpu-feature-discovery)
- [Driver Containers and Node Operands](./chapter-07-driver-containers-and-node-operands)
- [Upgrades and Production Troubleshooting](./chapter-11-upgrades-and-production-troubleshooting)
- [NVIDIA GPU Operator documentation](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/)
- [Kubernetes controller pattern](https://kubernetes.io/docs/concepts/architecture/controller/)
