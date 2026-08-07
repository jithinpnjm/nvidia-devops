# Batch 08 — AI Platform & Storage — Findings

(Summary to be filled in at the top once review is complete.)

## Volume 14 — NVIDIA AI Enterprise

### index.md
No findings. Overview and chapter/lab listing are consistent with actual files.

### chapter-01-why-nvidia-ai-enterprise-exists.md
- [SEVERITY: medium] `nvidia-dcgm dmon` is not a real command; the DCGM CLI tool is invoked as `dcgmi dmon` (or `dcgmi discovery`, etc.), and `nvidia-dcgm` is not a binary on the system.
  - Evidence: line 143: `- gpu_state: "nvidia-smi; nvidia-dcgm dmon"`. Same invalid command form recurs in chapter-05, chapter-09 (as `device_plugin_monitor` label, which is fine there), and chapter-11.
  - Why it matters for JR2018680: DCGM diagnostics are explicitly called out as an interview-probe area; a candidate who repeats this exact wrong invocation in an interview would be corrected immediately.
  - Suggested fix: replace `nvidia-dcgm dmon` with `dcgmi dmon` throughout the volume.
- Otherwise strong: real incident narrative, responsibility table, YAML evidence structure, first-person interview answers. Matches Volume 1 depth bar.

### chapter-02-platform-architecture-and-support-boundary.md
No findings. Support-boundary decision tree, responsibility map, and worked scenario are accurate and interview-usable.

### chapter-03-nvidia-nim-architecture.md
No findings. Health-model separation (liveness/readiness/app-correctness) is technically correct and well-illustrated with real vs. failing log traces.

### chapter-04-deploying-and-operating-nim-services.md
- [SEVERITY: low] Example Prometheus alert expression is malformed/non-functional PromQL.
  - Evidence: line 226: `expr: histogram_quantile(0.95, nim_request_latency_p95) > 250ms` — `histogram_quantile` must be applied to a `_bucket` histogram metric with `rate(...[5m])`, not to a metric already named `..._p95`, and `250ms` is not valid PromQL syntax (must be `0.25` seconds or similar).
  - Why it matters for JR2018680: minor, since the surrounding YAML example a few lines above uses correct `histogram_quantile(0.95, rate(...bucket[5m]))` syntax — this is just a follow-on illustrative snippet that contradicts it.
  - Suggested fix: align the alert rule's `expr` with the correct PromQL pattern shown earlier in the same chapter.

### chapter-05-nemo-framework-and-model-customization.md
- [SEVERITY: medium] All-reduce bandwidth figure for 8x A100 via NVLink appears fabricated/unsupported.
  - Evidence: line 167: `# Expected: close to max link speed (e.g., 1.4TB/s for 8x A100 via NVLink)`. A100 third-generation NVLink provides 600 GB/s bidirectional per-GPU bandwidth; DGX A100 NVSwitch fabric bisection bandwidth is commonly cited as 4.8 TB/s (aggregate across 8 GPUs via 6 NVSwitches), not 1.4 TB/s. The 1.4TB/s number doesn't match either the per-GPU or aggregate-system figures typically cited for A100.
  - Why it matters for JR2018680: NVLink topology bandwidth math is explicitly named as an interview-probe area; an inaccurate number here could get memorized and repeated incorrectly.
  - Suggested fix: verify against NVIDIA's DGX A100 datasheet and correct to either the per-GPU (600 GB/s) or system bisection (4.8 TB/s) figure with clear labeling of which one is being cited.
- [SEVERITY: medium] Same `nvidia-dcgm dmon` invalid-command issue as chapter-01 (lines 143, 182).

### chapter-06-nemo-guardrails-and-enterprise-controls.md
No findings. Latency-budget breakdown and policy YAML are concrete and consistent.

### chapter-07-ngc-catalog-containers-and-artifacts.md
No findings. Digest-pinning and mirroring guidance is accurate and matches real NGC/Docker workflows.

### chapter-08-licensing-and-entitlement-operations.md
No findings of note. Entitlement/rotation operational design is solid and realistic.

### chapter-09-lifecycle-compatibility-and-upgrades.md
- [SEVERITY: high] Broken MDX: unclosed YAML code fence swallowed the following header and mermaid diagram, corrupting rendering for the rest of the chapter.
  - Evidence: fence opened at line 16 (` ```yaml `) was never closed before the `## Upgrade Workflow` header and the next ` ```mermaid ` block began — verified via fence count (9 total backtick-fences in the file, an odd/mismatched sequence before the fix).
  - Why it matters for JR2018680: not an interview-content issue, but a build-breaking bug that would make the deployed doc site render this chapter's back half incorrectly (or fail Docusaurus MDX compilation).
  - Suggested fix applied inline: added the missing closing ` ``` ` after the `production_baseline.yaml` block (before `## Upgrade Workflow`).

### chapter-10-kubernetes-and-virtualization-integration.md
- [SEVERITY: low] Illustrative vGPU profile name `NVIDIA-A100-40-4MIG` does not match real NVIDIA vGPU profile naming conventions (e.g., `A100-4C`, `A100D-40C`), and conflates vGPU time-slicing profile naming with MIG partition naming in one string.
  - Evidence: line 77: `vgpu_profile: "NVIDIA-A100-40-4MIG"`.
  - Why it matters for JR2018680: MIG vs. vGPU is a real distinction interviewers probe (spatial partitioning vs. hypervisor-level time-slicing); a fabricated profile string could reinforce a blurred mental model.
  - Suggested fix: use a real-style profile name and briefly note that MIG and vGPU are different (though combinable) mechanisms.

### chapter-11-customer-architecture-and-troubleshooting.md
- [SEVERITY: medium] Same `nvidia-dcgm` invalid-command reference (line 166, inside a mermaid node label — lower practical impact since it's not a runnable snippet, but still models the wrong tool name).

### chapter-12-volume-14-summary.md
- [SEVERITY: low] Leftover placeholder text in the "Related Volumes" section.
  - Evidence: line 155: `- **Volume 15:** Next chapter in the ZTH series (specific specialization or advanced topic — TBD)`. Volume 15 (AI Storage) already exists and its topic is well known within this same curriculum.
  - Why it matters for JR2018680: cosmetic only, but reads as an unfinished draft artifact.
  - Suggested fix: replace with the actual Volume 15 title/topic (AI Storage).

### labs/lab-01-inspect-an-ngc-and-nim-deployment-plan.md
- [SEVERITY: low] Internal arithmetic inconsistency in the sizing example.
  - Evidence: lines 77-78: `requests_per_gpu: 100  # Expected throughput` immediately followed by `total_replicas_needed: 2  # 100 req/sec / 50 req/gpu` — the comment divides by 50, not the stated 100.
  - Why it matters for JR2018680: minor, but a candidate using this as a mental template for capacity-planning math should not internalize an inconsistent worked example.
  - Suggested fix: make `requests_per_gpu` and the comment's divisor match (both 50 or both 100).

### labs/lab-02-deploy-and-validate-a-nim-service.md
No findings. Strong end-to-end validation lab with real failure injection and rollback steps.

### labs/lab-03-build-a-nemo-customization-workflow.md
No findings. Lineage/hash-tracking pattern is realistic and reinforces reproducibility theme from the chapters.

### labs/lab-04-troubleshoot-entitlement-and-runtime-failures.md
No findings. Ordered-diagnosis structure (lowest layer first) is a genuinely good interview-answer template.
