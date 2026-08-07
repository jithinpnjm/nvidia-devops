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
