# Batch 11 — Security — Findings

Volume: ZTH-18 (`docs/nvidia-zero-to-hero/volume-18/`)

## index.md

- [SEVERITY: low] Index lists only 4 labs ("Lab 1" through "Lab 4") under **Labs**, but the `labs/` directory actually contains 10 lab files (lab-01 through lab-10).
  - Evidence: index.md lines 36-41 list Labs 1-4 only; `labs/` dir has lab-01 through lab-10-placeholder.md.
  - Why it matters for JR2018680: minor, but an inconsistent TOC undermines confidence in the volume's completeness during self-study/review.
  - Suggested fix: update the Labs list in index.md to include all 10 labs with correct titles.

## chapter-01-placeholder.md — Threat Modeling for AI Infrastructure

Solid, gold-standard-level chapter: real trust-boundary reasoning, concrete evidence commands, first-person interview answer, five-step reusable threat-model template. No accuracy issues found.

- [SEVERITY: low] Cross-reference mismatch: "Related: Chapter 5 — Kubernetes RBAC and Pod Security" (line 252), but per the volume's own TOC (index.md) Chapter 4 is "Kubernetes RBAC" and Chapter 5 is "Pod Security & Network Policies" — no single chapter titled "Kubernetes RBAC and Pod Security".
  - Evidence: `chapter-01-placeholder.md:252` vs `index.md` table rows 4-5.
  - Why it matters for JR2018680: cosmetic only; doesn't affect technical content.
  - Suggested fix: split into two related links (Chapter 4 — Kubernetes RBAC; Chapter 5 — Pod Security & Network Policies) or fix the label.

## chapter-02-placeholder.md — Hardware and Firmware Trust

Strong chapter with correct Secure Boot / module-signing / TPM PCR mechanics and good troubleshooting table.

- [SEVERITY: medium] Section 2.7 states flatly "Unlike the CPU, GPUs lack built-in attestation. There is no equivalent to TPM for GPU firmware" and section 2.4 says "current GPUs lack cryptographic verification" / "Many data-center GPUs do not validate firmware signatures in hardware." This is true for pre-Hopper GPUs but is stated as a general, undated fact with no forward pointer, and is in tension with Chapter 9 (Confidential Computing), which should cover H100's hardware root of trust and NVIDIA Remote Attestation Service (device-level SPDM attestation, RIM-based firmware measurement) — a real GPU attestation capability introduced with Hopper CC mode.
  - Evidence: `chapter-02-placeholder.md:190-193, 247`.
  - Why it matters for JR2018680: NVIDIA interviewers will expect precision here — H100/H200 in confidential-computing mode DO support hardware attestation (device identity certs + firmware measurement via the NVIDIA Attestation Service), so an unqualified "GPUs have no attestation" is exactly the kind of imprecision a technical loop would probe. The chapter should say "outside of Hopper+ confidential computing mode" or forward-reference Chapter 9 explicitly.
  - Suggested fix: add a one-line caveat/forward-reference to Chapter 9 clarifying this applies to non-CC-mode GPUs (verify Chapter 9 resolves this when reviewed).
