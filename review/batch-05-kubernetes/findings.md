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
