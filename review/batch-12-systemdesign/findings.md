# Batch 12 System Design and Interview Prep Review Notes

Volumes reviewed: F-08 (System Design), F-09 (Interview Prep), ZTH-23 (Interview Masterclass: GPU Systems Engineering)

Summary line will be added to the top of this file once the full pass is complete.

---

## Volume F-08 — Senior Solutions Architecture Practice

### 01-chapter-1-discovery-that-changes-the-architecture.md
No issues found. Strong depth: discovery-elimination framework, worked transcript, math check on 70B FP16 (140GB) is correct.

### 02-chapter-2-architecture-from-data-and-control-paths.md
No issues found. Control-plane/data-plane classification is accurate (including the RoCE/NCCL-is-data-plane point, and the "control plane down doesn't kill already-running data plane traffic" point, both correct).

### 03-chapter-3-trade-off-matrices-with-weighted-requirements.md
No issues found. Worked matrix arithmetic verified: weights sum to 1.00, K8s total 4.20 and Slurm total 3.30 both recompute correctly from the stated weights/ratings.

### 04-chapter-4-kubernetes-versus-slurm-decision-workshop.md
- [SEVERITY: low] Arithmetic error in the worked batch-training trade-off matrix: the K8s weighted total is stated as 2.55 but recomputes to 2.50 (0.25×3=0.75, 0.30×1=0.30, 0.20×3=0.60, 0.15×5=0.75, 0.10×1=0.10; sum=2.50, not 2.55).
  - Evidence: "TOTAL 1.00 4.35 2.55" in the "Sample annotated scoring for this exact scenario" block.
  - Why it matters for JR2018680: this chapter explicitly frames the worked matrix as "the arithmetic that survives a follow-up why" — a candidate who rehearses this exact table and gets asked to walk through the math live would visibly fail to reproduce the stated total.
  - Suggested fix: correct 2.55 to 2.50 (does not change the conclusion — Slurm 4.35 still wins).

### 05-chapter-5-gpu-sharing-and-capacity-recommendation.md
No issues found. KV-cache capacity worksheet arithmetic verified: 0.5MB × 4096 × 32 = 64GB; total 26+64+8=98GB; correctly concludes single 80GB H100 doesn't fit.

### 06-chapter-6-poc-design-test-uncertainty-not-product-demos.md
No issues found.

### 07-chapter-7-tco-and-capacity-conversations.md
No issues found. TCO worked example arithmetic verified: 12000×0.55×0.92=6072 tokens/sec; 6072×3600=21,859,200 tokens/hr; $35.70/21.8592=$1.63/1M tokens; naive $28/43.2=$0.65/1M tokens; ratio ~2.5x — all check out.

### 08-chapter-8-security-architecture-and-governance.md
No issues found.

### 09-chapter-9-migration-and-adoption-strategy.md
No issues found.

### 10-chapter-10-customer-communication-and-executive-explanation.md
No issues found. "About 12%" for 1-of-8-nodes capacity loss (12.5%) is a reasonable rounding.

### 11-senior-deep-dive-1-workload-characterization-before-architecture.md
No issues found.

### 12-senior-deep-dive-2-ai-factory-layered-architecture.md
No issues found.

### 13-senior-deep-dive-3-capacity-and-tco-convert-slo-into-resources.md
No issues found.
