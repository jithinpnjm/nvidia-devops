# Chapter 1 — API server, etcd and the object model
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Trace reads/writes, resourceVersion, watches and declarative desired state through the API control plane.

*(original diagram: media/image1.png — preserved)*

Figure 1. Kubernetes components coordinate through API objects and watch/reconcile behavior.

## 1.1 API objects are records of desired/observed state

A Kubernetes object contains spec-like desired configuration plus metadata; controllers and node agents update status/conditions to describe observed state. The API server authenticates, authorizes, admits and validates requests before persistence. Most components interact through the API rather than directly modifying etcd.

```
kubectl get deploy api -o yaml
kubectl get deploy api -o jsonpath='{.metadata.resourceVersion}{"\n"}'
kubectl get events --sort-by=.lastTimestamp
```

➕ **The request pipeline, spelled out** (the source states "authenticates, authorizes, admits and validates" as a sequence — a Senior SA should be able to draw this without hesitation):

```
 Client (kubectl/controller/kubelet)
        │  HTTPS request, client cert or bearer token
        ▼
 ┌─────────────────┐
 │ Authentication   │  who are you? (cert CN, SA token, OIDC claims) → produces a user/group identity
 └────────┬─────────┘
          ▼
 ┌─────────────────┐
 │ Authorization    │  RBAC/ABAC/webhook: is THIS identity allowed to do THIS verb on THIS resource?
 └────────┬─────────┘
          ▼
 ┌─────────────────┐
 │ Admission        │  Mutating webhooks/plugins run first (can rewrite the object),
 │ (mutating→       │  then Validating webhooks/plugins/ValidatingAdmissionPolicy run
 │  validating)     │  (can only accept/reject, no more rewriting)
 └────────┬─────────┘
          ▼
 ┌─────────────────┐
 │ Schema/API       │  OpenAPI validation, defaulting, conversion between API versions
 │ validation       │
 └────────┬─────────┘
          ▼
 ┌─────────────────┐
 │ etcd write       │  optimistic concurrency check on resourceVersion, then persist,
 │ (via apiserver's │  bump resourceVersion, and fan the change out to all active watches
 │  storage layer)  │
 └─────────────────┘
```
➕ **Interview-ready line:** "Nothing in Kubernetes talks to etcd directly except the API server's storage layer — every controller, kubelet, and scheduler reasons only in terms of the API, which is exactly what makes the watch/resourceVersion model the single source of truth for 'did my write actually happen.'"

➕ **Sample annotated output — resourceVersion in practice:**
```
$ kubectl get deploy api -o jsonpath='{.metadata.resourceVersion}{"\n"}'
482913
$ kubectl scale deploy api --replicas=4
deployment.apps/api scaled
$ kubectl get deploy api -o jsonpath='{.metadata.resourceVersion}{"\n"}'
482917          ← bumped by the write; NOT by every reconcile, only by a persisted mutation
```
resourceVersion is opaque and cluster-scoped-per-resource-type in practice (treat it as an opaque string, never parse or compare it numerically across resource types) — it exists so a client can say "give me changes after the version I last saw" via a watch, and so a conditional update (`If-Match`-style semantics under the hood) can detect a lost race: if two clients GET the same object at rv=482913 and both PUT a modified copy, the second PUT is rejected with a 409 Conflict because the object's rv on the server has already moved to 482914+.

➕ **Reproducing an actual optimistic-concurrency conflict:**
```bash
kubectl get cm settings -o yaml > /tmp/a.yaml
kubectl get cm settings -o yaml > /tmp/b.yaml
# edit /tmp/a.yaml, apply it — succeeds, resourceVersion bumps
kubectl apply -f /tmp/a.yaml
# now try to apply the stale /tmp/b.yaml which still carries the OLD resourceVersion
kubectl replace -f /tmp/b.yaml
```
```
Error from server (Conflict): Operation cannot be fulfilled on configmaps "settings":
the object has been modified; please apply your changes to the latest version and try again
```
This is the API server protecting you from a silent last-writer-wins overwrite — the fix is always "re-GET, re-apply your delta," never "force it through," which is why `kubectl apply` (three-way merge) is generally safer for automation than `kubectl replace` (whole-object overwrite) in concurrent-writer environments like GitOps controllers reconciling alongside human kubectl use.

## 1.2 Watches and reconciliation

Controllers commonly watch API changes, enqueue work, compare desired and actual state, and issue idempotent API updates. Reconciliation is level-based: the controller should make progress toward the desired state even if it misses an individual event, because the current object state remains authoritative.

➕ **Level-based vs edge-based, with the diagram that makes it click:**
```
Edge-triggered (fragile):  "replicas went from 3→4" event MUST be received and processed,
                            or the controller never learns it needs to add a Pod.
Level-triggered (K8s way): controller wakes up (for ANY reason — a watch event, a resync
                            timer, a restart) and asks "what does spec say NOW vs what
                            do I observe NOW?" — the delta is recomputed fresh every time,
                            so a missed event just means a slightly later reconcile, not a
                            permanently wrong state.
```
➕ **Why this matters concretely:** every controller has a periodic full resync (commonly every 30s–10min depending on controller) *in addition to* watch events — this is not redundancy for its own sake, it's the safety net for exactly the "watch connection dropped and a relist missed something transient" case Senior Deep Dive 1 calls out. If you're ever asked "what happens if a controller's watch connection drops for 2 minutes," the correct answer is "nothing catastrophic — it relists on reconnect and/or catches up on the next resync, because reconciliation is level-based, not a message queue that can silently lose a required event."

➕ **Watching it happen, with real output:**
```bash
kubectl get pods -w --output-watch-events -o json | jq -c '{type, name: .object.metadata.name, rv: .object.metadata.resourceVersion, phase: .object.status.phase}'
```
```
{"type":"ADDED","name":"api-7d9f-x2k1","rv":"482920","phase":"Pending"}
{"type":"MODIFIED","name":"api-7d9f-x2k1","rv":"482924","phase":"Running"}   ← same object, watch delivers the delta
{"type":"MODIFIED","name":"api-7d9f-x2k1","rv":"482930","phase":"Running"}   ← e.g. a status condition changed
{"type":"DELETED","name":"api-old-9f2a","rv":"482931","phase":"Running"}
```
Note `--output-watch-events` — without it `kubectl get -w` hides the ADDED/MODIFIED/DELETED envelope and just shows you object snapshots, which is enough for humans but hides the actual wire protocol a controller's informer is consuming.

➕ **GPU/AI infra tie-in — why this matters for device plugins specifically:** the NVIDIA device plugin advertises `nvidia.com/gpu` capacity via periodic `ListAndWatch` gRPC streaming to the kubelet, and the kubelet in turn updates the Node object's `status.allocatable`. If that stream is momentarily interrupted (device plugin Pod restart, node CNI hiccup), the *level-based* recovery pattern is identical: on reconnect, the device plugin does a fresh `ListAndWatch` and re-asserts current device state rather than replaying a missed "GPU 3 became unhealthy" event — which is exactly why a device-plugin restart briefly shows `nvidia.com/gpu` capacity as absent/zero on `kubectl describe node`, then correct again seconds later, rather than a stuck/wrong count.

## Worked scenario
**Situation:** A Deployment object exists with replicas=3 but no Pods appear.

1. Check Deployment conditions and whether a ReplicaSet exists. This asks whether the Deployment controller reconciled.
2. If no ReplicaSet exists, inspect controller-manager health/events/admission and selector/template validity.
3. If a ReplicaSet exists but no Pods exist, inspect ReplicaSet status/events and admission failures.
4. If Pods exist but are Pending, move to the scheduler branch rather than continuing controller logs.

**Conclusion:** Find which controller/agent should have produced the next object/action.

➕ **Second worked scenario — a Terminating namespace that never finishes, tied to Senior Deep Dive 1's finalizer mechanism:**
> **Situation:** `kubectl delete ns team-a-gpu` has been running for 40 minutes. `kubectl get ns team-a-gpu` shows `Status: Terminating`. Nobody has force-deleted anything yet — good, because that would be the wrong move.
> 1. `kubectl get ns team-a-gpu -o json | jq '.spec.finalizers, .status.conditions'` — look for a finalizer that hasn't been cleared and a condition explaining why (commonly `NamespaceFinalizersRemaining` or a specific API group that failed to respond).
> 2. `kubectl api-resources --verbs=list --namespaced -o name | xargs -I{} kubectl -n team-a-gpu get {} 2>/dev/null` — find what's actually still in the namespace; a custom resource (e.g. a GPU ResourceClaim or an old CRD instance) whose owning controller/CRD was already deleted is the classic cause — the finalizer's owning controller no longer exists to remove the finalizer key.
> 3. If the CRD/controller is genuinely gone and will never come back, the correct fix is to patch the specific finalizer array (`kubectl patch <resource> -p '{"metadata":{"finalizers":[]}}' --type=merge`) on the *stuck object*, not to force-delete the namespace — the namespace finalizer is just reflecting the fact that a child object still has one.
> 4. Force-deleting the namespace via the apiserver's `/finalize` subresource without understanding *why* it was stuck can leave orphaned cloud resources (e.g. a PV, an LB, a cloud IAM binding created by a controller) with no controller left to clean them up — this is the exact "force-delete first" anti-pattern the original chapter's finalizer discussion is warning against.
> **Conclusion:** a stuck Terminating object is a controller-availability question first, and a "which finalizer, whose responsibility" question second — never a "just force it" question.

➕ **Shortcut — the one-liner to triage any stuck-deleting object fast:**
```bash
kubectl get <kind> <name> -o json | jq '{finalizers: .metadata.finalizers, deletionTimestamp: .metadata.deletionTimestamp, ownerRefs: .metadata.ownerReferences}'
```
If `finalizers` is non-empty and `deletionTimestamp` is set, something registered a finalizer and hasn't finished cleanup — go find that controller's health before touching the object.

## Practice
1. Explain the request pipeline (authn → authz → admission → etcd write → watch fan-out) using a concrete `kubectl scale` example.
2. Reproduce a resourceVersion conflict deliberately using two stale local copies of the same object.
3. Trace why a Deployment with replicas=3 might show zero Pods, branching correctly between controller-manager, ReplicaSet and scheduler evidence.

➕ 4. Explain, without looking it up, why a controller's watch connection dropping for two minutes is not an outage — name the two independent recovery mechanisms (relist-on-reconnect, periodic full resync) that make reconciliation safe against missed events.
➕ 5. Deliberately create a namespace stuck in Terminating (create a CRD instance with a finalizer, delete the CRD before removing the instance, then delete the namespace) and walk through the finalizer-diagnosis one-liner above to unstick it correctly — without force-deleting.

---
## ➕ Going deeper

### etcd storage encoding and what actually gets written
The API server serializes objects (typically protobuf internally between apiserver↔etcd, JSON/YAML at the client boundary) under keys shaped like `/registry/<group>/<resource>/<namespace>/<name>`. You will rarely touch etcd directly in a healthy cluster, but knowing the key layout matters for the one time you do need `etcdctl` in a break-fix:
```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  get /registry/deployments/default/api --prefix
```
This is a read-only diagnostic move in almost every real scenario — writing to etcd directly bypasses admission, validation and watch fan-out consistency and is essentially never the right operational answer; it's mentioned here only so you can recognize the key structure if you see it in a runbook.

### API discovery — the other thing the API server serves
```bash
kubectl api-resources | grep -i gpu     # any CRDs a GPU operator/DRA has registered
kubectl api-versions | grep resource.k8s.io   # DRA's API group, when present
```
`kubectl explain <kind>.spec` walks the same OpenAPI schema the apiserver uses for validation — worth reaching for live in an interview instead of guessing a field name.
