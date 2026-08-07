# Batch 05 — Kubernetes for GPUs — Findings

(Summary will be added here once review is complete.)

## F-03 — Volume 03: Kubernetes and Platform Engineering

### 01-chapter-1-api-server-etcd-and-the-object-model.md
- [SEVERITY: low] No material issues found. Chapter is reworked to gold-standard depth (annotated resourceVersion/optimistic-concurrency example, level-vs-edge-triggered reconciliation, finalizer/Terminating-namespace worked scenario, GPU device-plugin ListAndWatch tie-in). Meets the "SRE who reads scheduler/controller source" bar.
  - Evidence: lines 314-458 (➕ additions): request pipeline diagram, resourceVersion conflict reproduction, finalizer triage one-liner.
  - Why it matters for JR2018680: this is the depth bar the rest of the batch should be checked against.
  - Suggested fix: none needed.

### 02-chapter-2-scheduler-mechanics-resources-and-topology.md
- [SEVERITY: low] `jq` filter uses single-quoted string literal inside an already single-quoted shell arg, which is invalid jq syntax and will error if copy-pasted.
  - Evidence: `kubectl get node gpu-a100-04 -o json | jq '.status.allocatable | with_entries(select(.key | contains('nvidia')))'` — jq requires double quotes for string literals (`contains("nvidia")`); as written the shell will also prematurely close the outer quote at `'nvidia'`, breaking the command.
  - Why it matters for JR2018680: candidates who rehearse commands from this book verbatim in a live technical round would hit an avoidable syntax error.
  - Suggested fix: change to `contains(\"nvidia\")` (or use `jq --arg` ) and requote the outer shell string.
- [SEVERITY: low] Several "sample annotated output" JSON blocks render keys/values with single quotes (e.g. `'nvidia.com/mig-1g.5gb': '7'`) rather than the double quotes real `kubectl`/`jq` JSON output would show.
  - Evidence: lines 128-131, and similarly in chapter 3 (`crictl inspectp` output block).
  - Why it matters for JR2018680: minor authenticity issue only — a candidate reciting exact output syntax from memory could describe JSON incorrectly, though the substance (MIG changes the resource name) is correct and well explained.
  - Suggested fix: use double quotes in all "annotated real output" code blocks for JSON-shaped content (mechanical fix, not content rewrite).
- Otherwise excellent: Filter/Score two-phase model, FailedScheduling multi-reason decomposition, device-plugin ListAndWatch → kubelet allocatable pipeline, and MIG resource-name-vs-quantity distinction are all accurate and at the right depth for GPU scheduling interview questions.

### 03-chapter-3-kubelet-cri-and-pod-lifecycle.md
- [SEVERITY: low] Same single-quoted-JSON-output style issue as chapter 2 in the `crictl inspectp`/`crictl inspect` annotated output blocks (lines 60-65, 76-79). Cosmetic only.
- No accuracy issues. CRI pipeline sequencing (RunPodSandbox → CNI → CSI → PullImage → CreateContainer/StartContainer), Pod phase vs. condition distinction (CrashLoopBackOff/NotReady as reasons layered on `Running`), and the device-plugin checkpoint / stale-checkpoint-after-restart GPU tie-in are all technically sound and interview-depth.

### 04-chapter-4-kubernetes-networking-from-service-to-cni.md
- [SEVERITY: low] `kubectl get netpol -n <src-ns> -n <dst-ns> -o yaml` in the "fastest 4-command triage" shortcut passes two `-n` flags in one invocation; kubectl only honors the last `-n`, so this does not actually query both namespaces as implied.
  - Evidence: line 168, `kubectl get netpol -n <src-ns> -n <dst-ns> -o yaml   # any policy scoped to one ns?`
  - Why it matters for JR2018680: a candidate reciting this triage command live would get only the destination namespace's policies and could misdiagnose a source-namespace NetworkPolicy issue as "no policy found."
  - Suggested fix: split into two separate `kubectl get netpol -n <src-ns>` / `-n <dst-ns>` commands.
- Otherwise excellent and at gold-standard depth: full north-south/east-west traffic-path diagram, dataplane-implementation-matching table (iptables/IPVS/eBPF), NetworkPolicy default-allow→default-deny silent-drop mechanism, and — notably strong for this role — the NCCL/RDMA-over-Multus worked scenario correctly identifies that GPU multi-node training traffic can bypass the standard Service/CNI/NetworkPolicy stack entirely via SR-IOV/secondary interfaces.

### 05-chapter-5-storage-and-statefulsets.md
- [SEVERITY: low] No material issues found. Provision/Bind/Attach/Mount phase breakdown, WaitForFirstConsumer rationale, StatefulSet's three stable identities, and the local-NVMe-vs-network-storage checkpoint durability tradeoff for GPU training are all accurate and interview-depth.

### 06-chapter-6-security-authentication-rbac-workload-identity-and-pod-hardening.md
- [SEVERITY: medium] The Pod Security Admission "audit before enforce" shortcut is technically imprecise: PSA audit/warn modes only evaluate Pods at admission time (create/update), so labeling a namespace with `pod-security.kubernetes.io/audit=restricted` — and especially doing so via `--dry-run=server`, which persists nothing — does not retroactively evaluate already-running Pods in that namespace. The suggested workflow would not actually surface violations from existing workloads the way the text implies.
  - Evidence: lines 141-145, "`kubectl label ns team-a pod-security.kubernetes.io/audit=restricted --dry-run=server` ... `audit=` (not `enforce=`) lets you see *what would break* under a stricter policy without actually blocking anything."
  - Why it matters for JR2018680: PSA admission-time-only semantics (vs. continuous/retroactive policy evaluation) is exactly the kind of "sounds right but is subtly wrong" detail a K8s-internals interview would probe; stating it as shown could cost credibility in a live security discussion.
  - Suggested fix: clarify that the audit label only affects future admissions, and that checking existing Pods against a stricter policy requires either a policy-as-code tool (e.g. `kubectl-validate`/`pss` checkers, Kyverno/OPA dry-run policies) or triggering a rolling restart under audit mode to force re-admission.
- Otherwise strong: RBAC vs. cloud IAM trust-domain separation, the purely-additive RBAC decision model, and the GPU/HPC `privileged: true` vs. narrow-capability (`IPC_LOCK` for RDMA) alternative are accurate and at the right depth.

### 07-chapter-7-autoscaling-and-capacity.md
- [SEVERITY: low] No material issues found. HPA/VPA/KEDA/cluster-autoscaler four-loop model, the VPA/HPA CPU-utilization-denominator conflict, HPA desired-replica arithmetic, and the GPU-specific custom-metrics-pipeline (DCGM→Prometheus→adapter) failure surface plus node pre-warming tradeoff are accurate and at gold-standard depth for GPU infra interview questions.

### 08-chapter-8-operators-gitops-and-platform-engineering.md
- [SEVERITY: low] No material issues found. Operator-as-controller framing, GitOps drift-detection/revert demo, and the GPU Operator `ClusterPolicy` status-first triage (with the OS-kernel-patch-breaks-driver-DaemonSet worked scenario) are accurate and at gold-standard depth.

### 09-chapter-9-upgrades-reliability-and-cluster-operations.md
- [SEVERITY: medium] The version-skew direction looks reversed. Text states current kubelet skew is "up to 2 minor versions BEHIND apiserver (older skew policies allowed up to 3)". In reality Kubernetes changed the kubelet skew policy from n-2 to n-3 starting at v1.28 (kubelet may now lag the apiserver by up to 3 minor versions, loosened from the previous 2), i.e. the opposite direction from what's stated.
  - Evidence: lines 27-29, "kubelet: may be up to 2 minor versions BEHIND apiserver (older skew policies allowed up to 3 — always check the policy for the specific release you're on, it has changed over time)".
  - Why it matters for JR2018680: version-skew policy is a textbook K8s-internals interview question; stating the direction of a documented policy change backwards is exactly the kind of error a hiring manager doing a deep technical round would catch.
  - Suggested fix: verify current upstream skew policy for the target K8s version and correct the direction of the "older policy allowed X" claim (should read: older policy allowed 2, current/1.28+ allows up to 3).
- Otherwise strong: control-plane-first upgrade ordering, `/readyz?verbose` decomposition, PDB `allowedDisruptions` arithmetic gating drain concurrency, and the GPU-node-upgrade validation gate (kubelet Ready is necessary but not sufficient — driver DaemonSet/device-plugin/allocatable/smoke-test) are accurate and interview-depth.

### 10-senior-deep-dive-1-api-machinery-resourceversion-watches-finalizers-and-owners.md
- [SEVERITY: low] No material issues found. Cleanly cross-references Chapter 1 rather than duplicating it; finalizer two-phase-delete vs. OwnerReferences-cascading-GC distinction (opposite temporal direction) is a genuinely useful, accurate contrast.

### 11-senior-deep-dive-2-etcd-quorum-control-plane-failure-and-recovery-boundaries.md
- [SEVERITY: low] No material issues found. Quorum math table (including the even-vs-odd member count point: 4 members buys zero extra fault tolerance over 3) and the "control plane down / workloads still serving" split are accurate and address a genuinely common interview misconception well.

### 12-senior-deep-dive-3-scheduling-framework-preemption-gang-topology-and-dra.md
- [SEVERITY: low] Minor internal inconsistency: the chapter states DRA's "Core DRA APIs graduated to GA in Kubernetes 1.34" but the accompanying sample `kubectl api-resources` output still shows `resource.k8s.io/v1beta1` as the group/version for `resourceclaims`/`deviceclasses`. GA APIs conventionally ship as `v1`, not `v1beta1`, so the sample output contradicts the GA claim stated two paragraphs earlier.
  - Evidence: line 14 ("Core DRA APIs graduated to GA in Kubernetes 1.34") vs. lines 89-90 (`resource.k8s.io/v1beta1`).
  - Why it matters for JR2018680: DRA is called out explicitly as squarely in-scope for this JD's "advanced" bar; a candidate who memorizes the sample output's API version as canonical would state a stale/inconsistent fact if asked live.
  - Suggested fix: confirm the actual GA group/version for the target K8s release and align the sample output (or soften the GA claim to name the specific version if it's still beta at time of writing).
- Otherwise excellent: preemption's two-gate decision sequence (PDB minAvailable, then re-check Filter predicates) correctly explains why preemption is not a capacity strategy, and the device-plugin-vs-DRA structured-claims contrast (ResourceClaim/DeviceClass/ResourceClaimTemplate, NVLink-topology-aware allocation) is accurate and squarely relevant to GPU scheduling interview questions.

### 13-senior-deep-dive-4-kubelet-cri-pod-sandbox-and-node-pressure.md
- [SEVERITY: low] No material issues found. Node-pressure eviction vs. scheduler preemption comparison table (notably: node-pressure eviction is NOT subject to PDB) and the host-memory-pressure-vs-GPU-HBM-pressure blind spot (kubelet eviction signals have zero visibility into `CUDA_ERROR_OUT_OF_MEMORY`) are accurate and high-value for interview prep.

### 14-senior-deep-dive-5-networking-service-abstraction-cni-dataplane-dns-and-gatewa.md
- [SEVERITY: low] No material issues found. Gateway API role-split model (GatewayClass/Gateway/HTTPRoute) and the Gateway API Inference Extension rationale (KV-cache locality, variable per-request GPU cost, queue-depth-aware routing for LLM serving) are accurate, current, and directly relevant to GPU/AI-infra interview questions.

### 15-senior-deep-dive-6-admission-policy-and-multi-tenant-guardrails.md
- [SEVERITY: low] No material issues found. Correctly reinforces (with explicit evidence) that PSA `audit`/`warn` labels are visibility-only and only `enforce` blocks — this directly corroborates the concern flagged in Chapter 6 about the audit-mode shortcut implying retroactive blocking. Mutating-before-validating admission ordering and the sidecar-injection-breaks-PSA-after-mutation trap are accurate and well-diagrammed. ValidatingAdmissionPolicy vs. webhook tradeoff table is accurate.

### 16-senior-deep-dive-7-platform-patterns-from-the-staff-engineer-guide.md
- [SEVERITY: low] No material issues found. The GPU bulkhead isolation-tier spectrum (shared/time-sliced → MIG-partitioned → dedicated node pool → dedicated GPU pool, cost vs. blast radius) is accurate and a genuinely useful, reusable interview answer.

### 17-senior-deep-dive-8-gpu-platform-operations-node-pools-operators-and-resource-i.md
- [SEVERITY: low] No material issues found; cleanly cross-references rather than duplicates Chapters 8/9. Notably cites a real source (kubernetes.io blog, Sept 2025) for the DRA v1.34 GA claim used earlier in Deep Dive 3 — reinforces that claim's currency, though the `v1beta1` API-version mismatch flagged in Deep Dive 3's sample output is still worth reconciling.

**F-03 (Volume 03) review complete — 17/17 files reviewed.**

## ZTH-10 — Volume 10: Kubernetes GPU Platform

### index.md
- [SEVERITY: low] No issues found. Gold-standard framing (allocation path vs. execution path as two independently-failing chains) sets up the whole volume well.

### chapter-01-why-kubernetes-needs-a-gpu-platform-layer.md
- [SEVERITY: low] No issues found. The fragmentation worked example (32-GPU pool, taint-isolated pools, "24/32 idle but unreachable" framing) is an excellent, concrete answer to a common customer-facing utilization-reporting trap.

### chapter-02-gpu-software-lifecycle-in-kubernetes.md
- [SEVERITY: low] No issues found. Compatibility-matrix combinatorics worked example (3 kernels x 2 drivers x 4 image families = 24, collapsing to 2 profiles x 4 families = 8) is accurate and a strong interview answer for "why not just test everything."

### chapter-03-container-toolkit-runtimeclass-and-cdi.md
- [SEVERITY: low] No issues found. RuntimeClass-vs-CDI-vs-Toolkit three-mechanism table and the crictl-inspect-vs-in-container-nvidia-smi two-halves-of-evidence distinction are accurate and precisely scoped.

### chapter-04-device-plugin-and-kubernetes-resource-model.md
- [SEVERITY: low] No issues found. ListAndWatch/Register sequence diagram, capacity-vs-allocatable-vs-allocated distinction, and the underspecified-request probability worked example (15/40 = 37.5% chance of landing on a non-NVLink node) are accurate and at gold-standard depth, consistent with F-03 Chapter 2's device-plugin coverage (complementary, not redundant — this volume goes deeper on the ListAndWatch health-reporting mechanics).

### chapter-05-node-and-gpu-feature-discovery.md
- [SEVERITY: low] No issues found. NFD/GFD facts-vs-assertions-vs-classes taxonomy and the SKU-affinity fragmentation worked example (80-node fleet, hard-coded product label vs. service class on a hardware refresh) are accurate and directly reusable interview material.

### chapter-06-gpu-operator-architecture.md
- [SEVERITY: low] No issues found. `ClusterPolicy.status.state: ready` vs. per-operand DaemonSet health distinction, and the canary-vs-fleet-wide blast-radius arithmetic (58% vs. 5% of capacity) are accurate and well-quantified.

### chapter-07-driver-containers-and-node-operands.md
- [SEVERITY: low] No issues found. Five-gate readiness sequence (infrastructure/driver/runtime/Kubernetes/acceptance), the "Driver/library version mismatch" vs. "Unknown Error"-from-inside-container distinction, and the maxUnavailable-vs-GPUs-offline sizing arithmetic are accurate and precisely scoped.

### chapter-08-gpu-scheduling-and-topology.md
- [SEVERITY: low] No issues found. Four-placement-questions framework (capacity/eligibility/locality/coordination), the `FilterOK` vs. `AllocOK` failure-class distinction (Pending vs. stuck-in-ContainerCreating race), and the PHB-vs-NV4 topology evidence example are accurate and at gold-standard depth for topology-aware GPU scheduling interview questions.

### chapter-09-gpu-observability-with-dcgm.md
- [SEVERITY: low] No issues found. GPU-UUID-as-durable-join-key (vs. device index renumbering after reboot), the Xid 79 ("GPU has fallen off the bus") worked example, and the `up{job="dcgm-exporter"}`-before-trusting-utilization discipline are accurate and precisely the kind of DCGM diagnostic depth this JD calls for.

### chapter-10-production-installation-and-configuration.md
- [SEVERITY: low] No issues found. The `helm install STATUS: deployed` vs. `clusterpolicy notReady` gap, and the seven-item acceptance checklist (allocatable-is-a-kubelet-claim-not-a-driver-claim distinction) are accurate and precisely address the "install looked fine" failure mode this JD would probe.

### chapter-11-upgrades-and-production-troubleshooting.md
- [SEVERITY: low] No issues found. Canary/batch sizing arithmetic (8-node canary, doubling batches, 192/960 GPU blast-radius framing) and the chart-rollback-does-not-revert-host-state distinction are accurate and directly reusable for a live troubleshooting-design interview question.

### chapter-12-volume-10-summary.md
- [SEVERITY: low] No issues found. Clean, accurate consolidation; the "It does not prove" column in the component-responsibility table is a strong, reusable interview framing.

**ZTH-10 (Volume 10) chapters 1-12 + index complete — 13/17 files reviewed; labs 1-4 remaining.**

### labs/lab-01-inspect-a-kubernetes-gpu-node.md
- [SEVERITY: low] No issues found. Capacity-vs-Allocatable evidence collection and the UUID-as-join-key discipline (host `nvidia-smi -L` vs. in-container output) are accurate and well-sequenced.

### labs/lab-02-install-and-validate-gpu-operator.md
- [SEVERITY: low] No issues found. `helm status: deployed` vs. `clusterpolicy: ready` vs. per-DaemonSet READY-count layering is accurate; the FailedScheduling-on-the-driver-DaemonSet-itself (untolerated taint) evidence example is a realistic and well-chosen failure mode.

### labs/lab-03-diagnose-a-missing-allocatable-gpu.md
- [SEVERITY: low] No issues found. The ordered evidence chain (PCI → driver → plugin → kubelet registration) with two clearly-differentiated real failure signatures (NVML load failure vs. gRPC socket dial timeout) is exactly the "SRE who reads scheduler/device-plugin source" depth this batch's brief calls for.

### labs/lab-04-perform-a-controlled-gpu-platform-upgrade.md
- [SEVERITY: low] No issues found. The `helm rollback` "success" with `ALLOCATABLE` still `0` scenario is an excellent, realistic demonstration of chart-rollback-does-not-revert-host-state, directly reinforcing Chapter 11's core lesson with lab evidence.

**ZTH-10 (Volume 10) review complete — 17/17 files reviewed. No accuracy issues found across the entire volume; consistently at gold-standard depth.**
