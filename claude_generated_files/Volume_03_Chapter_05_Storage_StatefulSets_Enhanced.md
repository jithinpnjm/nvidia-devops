# Chapter 5 — Storage and StatefulSets
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Understand CSI provisioning/attach/mount, PVC binding modes, topology and StatefulSet identity.

CSI separates storage control-plane operations from Kubernetes core. A StorageClass can dynamically provision a PV for a PVC. WaitForFirstConsumer binding can delay provisioning/binding until Pod scheduling reveals topology. Attach/mount occurs later on the selected node. Distinguish these phases.

```
kubectl get pvc,pv -o wide
kubectl describe pvc <claim>
kubectl describe pod <pod> | sed -n '/Events:/,$p'
kubectl get storageclass -o yaml
```

➕ **The four distinct phases, drawn out — the source names them, this is what to say when asked to explain each in sequence:**
```
1. PROVISION   PVC created → CSI external-provisioner sidecar sees it →
               (if Immediate binding) calls CreateVolume on the storage backend
               NOW, before any Pod exists → volume created in SOME zone/topology
               chosen without knowledge of where the Pod will land.

               (if WaitForFirstConsumer) provisioning is DEFERRED — nothing
               happens yet. This is the fix for the "PV created in zone A,
               Pod scheduled to zone B, PV can never attach" failure mode.

2. BIND        PVC.spec.volumeName ↔ PV.spec.claimRef — a 1:1 claim, tracked
               as an API object relationship, independent of physical attach.

3. ATTACH      CSI controller plugin (attacher sidecar) calls ControllerPublishVolume
               — attaches the volume to the NODE the Pod was scheduled to.
               This is where a cross-zone PV/node mismatch actually surfaces
               as a hard failure, if WaitForFirstConsumer wasn't used.

4. MOUNT       CSI node plugin (runs as a DaemonSet on every node) calls
               NodeStageVolume + NodePublishVolume — filesystem-level mount
               into the Pod's volume path. This is the LAST step and the one
               kubelet is actually blocked on during "ContainerCreating."
```
➕ **Interview-ready line:** "WaitForFirstConsumer doesn't change *what* gets provisioned, it changes *when* — it defers provisioning until the scheduler has already picked a node, so the volume is created with topology that's guaranteed compatible with that node, instead of guessing first and hoping the scheduler agrees later."

➕ **Sample annotated output — proving which phase a stuck PVC is actually in:**
```
$ kubectl get pvc data-pg-0 -o wide
NAME        STATUS    VOLUME   CAPACITY   STORAGECLASS   AGE
data-pg-0   Pending   <none>   <none>     fast-ssd        3m    ← still phase 1, not even bound yet

$ kubectl describe pvc data-pg-0 | tail -5
Events:
  Type     Reason              Message
  ----     ------              -------
  Normal   WaitForFirstConsumer  waiting for first consumer to be created before binding
```
`VOLUME` column empty + `WaitForFirstConsumer` event = this is completely expected and not a fault — it's waiting on the Pod's scheduling decision, and will proceed the instant the Pod gets a `nodeName`. Contrast with:
```
$ kubectl describe pvc data-pg-0 | tail -5
Events:
  Type     Reason              Message
  ----     ------              -------
  Warning  ProvisioningFailed  failed to provision volume: rpc error: code = ResourceExhausted
           desc = zone us-east-1a has no capacity for volume type fast-ssd
```
This is phase 1 genuinely failing, not waiting — a real backend capacity problem, distinguishable by `Warning`/`ProvisioningFailed` vs `Normal`/`WaitForFirstConsumer`.

➕ **StatefulSet identity, spelled out — the piece the source states but doesn't diagram:** each StatefulSet replica gets a **stable name** (`pg-0`, `pg-1`, ...), a **stable network identity** (a per-Pod DNS entry via a headless Service, `pg-0.pg-headless.default.svc.cluster.local`), and a **stable PVC** (via `volumeClaimTemplates` — `pg-0` always rebinds to the *same* PVC, `data-pg-0`, even after being rescheduled or restarted, never a fresh one). This is precisely why StatefulSet Pods can't be treated like Deployment Pods for storage: `pg-0` restarting on a different node is fine identity-wise, but its PVC's *topology* still constrains which nodes it can land on.

## Worked scenario
**Situation:** A StatefulSet Pod stays Pending after a zone outage.

1. Inspect PVC/PV topology and node affinity on the volume.
2. Check whether the volume can attach in another zone or is intrinsically zonal.
3. Review StorageClass replication/failure-domain behavior and StatefulSet disruption expectations.
4. Do not delete claims blindly; stateful recovery must preserve data semantics.

**Conclusion:** Stateful scheduling is constrained by both compute and data locality/failure-domain design.

➕ **Sample annotated output — the topology evidence for exactly this scenario:**
```
$ kubectl get pv pvc-8a21 -o jsonpath='{.spec.nodeAffinity}' | jq
{
  "required": {
    "nodeSelectorTerms": [{
      "matchExpressions": [{
        "key": "topology.kubernetes.io/zone",
        "operator": "In",
        "values": ["us-east-1a"]       ← the PV is PINNED to this zone, physically
      }]
    }]
  }
}
```
If `us-east-1a` is the zone that just went down, this PV is **not** a Kubernetes scheduling problem to work around — it's a physical fact. No affinity change, no toleration, no priority boost fixes it; the volume genuinely cannot attach outside that zone because the underlying block storage doesn't exist elsewhere. The only real remedies are: wait for the zone to recover, or restore from backup/replica into a new PV in a healthy zone (a data-recovery operation, not a scheduling fix) — which is exactly why the original conclusion says "do not delete claims blindly."

➕ **Second worked scenario — GPU checkpoint storage and StatefulSet-adjacent training jobs:**
> **Situation:** A large model training job uses a StatefulSet-like pattern (stable pod identity per shard, `worker-0..worker-7`) writing checkpoints to per-worker PVCs on a fast NVMe-backed StorageClass. After a node failure, `worker-3` is rescheduled but stays Pending for 12 minutes.
> 1. `kubectl get pvc data-worker-3 -o wide` → still `Bound`, but `kubectl describe pod worker-3` shows a scheduling/attach delay, not a provisioning failure — the PV already exists.
> 2. Check the PV's `nodeAffinity` (as above) — if the StorageClass provisions node-local NVMe (common for training checkpoint performance — local NVMe massively outperforms network-attached storage for checkpoint write bursts), the PV is pinned to the *specific failed node*, not just a zone.
> 3. **This is the tradeoff to name explicitly in an interview:** local NVMe StorageClasses give the best checkpoint I/O throughput but make the Pod's storage — and therefore the Pod itself — exactly as available as that one physical node. Network-attached storage (e.g. a distributed filesystem, or cloud block storage with multi-attach/zone-replication) trades some checkpoint write latency for actual failure-domain independence.
> 4. The fix here is architectural, decided ahead of the incident: either accept that a node failure means restoring `worker-3` from its last checkpoint on a *different* PV (data-recovery flow, requires the training framework's checkpoint restore logic to be wired up and tested), or don't use node-local storage for checkpoints in the first place if node-level failure tolerance matters more than raw I/O.
> **Conclusion:** the "attach constrained by failure domain" mechanism from the zone-outage scenario applies at node granularity too, and for GPU training specifically the StorageClass choice is a deliberate durability-vs-throughput tradeoff made at design time, not something to debug after the fact.

➕ **Shortcut — one-liner to find every PV in a cluster pinned to a specific unavailable zone/node before you even get a ticket about it:**
```bash
kubectl get pv -o json | jq -r '.items[] | select(.spec.nodeAffinity != null) | "\(.metadata.name): \(.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values)"'
```
➕ **Mnemonic:** *"Provision, Bind, Attach, Mount — P-B-A-M."* — and the failure domain question to always ask about a StorageClass before it becomes an incident: "if this specific node/zone disappears, does this volume come back somewhere else, or is it gone until that hardware returns?"

## Practice
1. Explain the difference between Immediate and WaitForFirstConsumer binding using a cross-zone example.
2. Given a PVC stuck Pending, determine from Events alone whether it's waiting on scheduling or failing provisioning.
3. Explain what makes a StatefulSet Pod's identity "stable" across the three dimensions (name, network, storage).

➕ 4. Given the `nodeAffinity` JSON shape shown above, write the one-liner that lists every PV in a cluster pinned to a zone, and use it to audit whether a StatefulSet's StorageClass choice creates a single-zone blast radius the team hasn't consciously accepted.
➕ 5. Argue both sides of local-NVMe-backed checkpoint storage vs. network-attached storage for a multi-node training job, and state which one you'd default to recommending as a Solutions Architect for a customer who has not yet defined their node-failure tolerance requirements — and what question you'd ask them first before recommending either.
