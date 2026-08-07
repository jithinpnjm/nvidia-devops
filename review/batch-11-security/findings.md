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

## chapter-03-placeholder.md — Containers and Supply Chain Security

Strong, accurate coverage of Cosign/Sigstore signing, SBOM/SPDX, tag-reuse attacks, and Trivy scanning. Good interview answer.

- [SEVERITY: medium] Section 3.4 (NGC verification) includes a fabricated/non-existent command: `nvcr io-getdown nvcr.io/nvidia/pytorch:24.07-py3`. This is not a real NGC CLI or crane/docker command — it appears to be a typo/placeholder that was never replaced with a working command (likely intended: `docker manifest inspect`, `crane digest`, or `ngc registry image info`).
  - Evidence: `chapter-03-placeholder.md:269`.
  - Why it matters for JR2018680: an interview candidate who memorizes this "command" would visibly fumble a live technical demo; NVIDIA's own NGC workflows are exactly the kind of practical thing this interview loop probes.
  - Suggested fix: replace with a real digest-retrieval command, e.g. `docker manifest inspect nvcr.io/nvidia/pytorch:24.07-py3` or `crane digest nvcr.io/nvidia/pytorch:24.07-py3`.

## chapter-04-placeholder.md — Kubernetes RBAC and Access Control

Accurate core RBAC mechanics (Role/ClusterRole/RoleBinding/ClusterRoleBinding, resourceNames scoping, audit log structure). Good multi-tenant interview answer.

- [SEVERITY: medium] Section 4.5 verification example uses a non-existent kubectl flag: `kubectl auth can-i get secrets ... --subresource="" --resource-name=model-repo-creds` (line 287-289). `kubectl auth can-i` does not have a `--resource-name` flag; the resource name is passed as a positional argument (`kubectl auth can-i get secrets model-repo-creds --namespace ...`), and only on newer kubectl versions.
  - Evidence: `chapter-04-placeholder.md:287-289`.
  - Why it matters for JR2018680: this is exactly the kind of command-line precision a hands-on K8s interview would catch; the chapter otherwise correctly uses positional syntax for `--as`/`--namespace`.
  - Suggested fix: correct to positional resource-name syntax and verify against current kubectl version behavior.

## chapter-05-placeholder.md — Pod Security and Network Policies

Solid, accurate PSS/NetworkPolicy/seccomp mechanics with working `kubectl` examples.

- [SEVERITY: medium] Interview answer claims "RuntimeDefault blocks dangerous syscalls like init_module and socket" (line 358). This is inaccurate: the RuntimeDefault seccomp profile does block `init_module`, but it does **not** block the generic `socket()` syscall — basic TCP/UDP socket creation is allowed (and required for virtually every networked container, including the inference server this chapter is designing for). What RuntimeDefault restricts around sockets is narrower (e.g., raw sockets require `CAP_NET_RAW`, which is capability-gated, not seccomp-blocked). As written, this would mislead a candidate into overstating what seccomp does.
  - Evidence: `chapter-05-placeholder.md:358`; contrast with the profile excerpt in section 5.5 (lines 297-306) which itself lists `bind`, `accept`, `recvfrom` etc. as allowed.
  - Why it matters for JR2018680: precision about what seccomp actually restricts (syscalls) vs. what capabilities restrict (privileged operations) is a common K8s security interview distinction.
  - Suggested fix: change "socket" to "raw sockets (via capability restriction, not seccomp)" or remove the claim.

- [SEVERITY: medium] Interview-readiness gap: this chapter covers Pod Security Standards and NetworkPolicy generically but never connects them to the GPU-specific trust boundary the batch's review focus calls out — the NVIDIA device plugin DaemonSet and nvidia-container-toolkit typically require elevated host access (hostPID, access to `/dev/nvidia*`, sometimes privileged mode) to expose GPUs to pods, which is a meaningfully different trust boundary than a generic restricted-PSS web app pod. No chapter in this volume (checked all 12) substantively discusses the device-plugin trust boundary, nor whether GPU workload pods can realistically run under the "Restricted" PSS profile.
  - Evidence: absence — searched all chapters for "device plugin"/"device-plugin"/"privileged"; only chapter-01 has a passing unrelated mention and chapter-09 mentions "privileged attackers" in the confidential-computing sense, not privileged containers.
  - Why it matters for JR2018680: the review brief explicitly flags this as core GPU/K8s interview territory (privileged containers, device plugin trust boundary); a candidate relying solely on this volume would be unprepared for "how do you reconcile Pod Security Standards with GPU device access requirements?"
  - Suggested fix: add a subsection to Chapter 5 or 6 covering NVIDIA device plugin / nvidia-container-toolkit privilege requirements and how to scope them (e.g., device plugin runs privileged cluster-wide but workload pods use `resources.limits: nvidia.com/gpu` without needing privileged themselves).

## chapter-06-placeholder.md — GPU Sharing Security

This is the volume's most important chapter for the review's GPU-isolation focus, and it has a real accuracy problem.

- [SEVERITY: high] The chapter repeatedly overstates MIG's side-channel isolation guarantee, stating flatly that MIG gives "so no side-channel is possible" (line 263) and diagrams MIG as having zero risk beyond "Low (hard isolation)" (line 39), contrasted only against time-slicing's "Medium" risk. This contradicts the more precise, NVIDIA-documented position: MIG provides strong hardware-level partitioning of SMs, L2 cache slices, and memory bandwidth/capacity (which is real and much stronger than time-slicing), and hardware fault/error containment — but it does not eliminate every side channel. The GPU package's power and thermal domains are shared across all MIG instances (there is no per-instance power/thermal partition), and the chapter's own section 6.5 monitors "thermal and power spikes (side-channel indicator)" as a generic GPU-sharing concern without ever noting that this specific channel is NOT closed by MIG — directly contradicting the "no side-channel is possible" claim made one section earlier.
  - Evidence: `chapter-06-placeholder.md:39-41` (risk diagram), `263` ("MIG gives hard isolation... so no side-channel is possible"), `271` ("MIG provides hard hardware isolation"), vs. `231-243` (power/thermal side-channel monitoring presented as a GPU-sharing-wide concern, GPU package still one power/thermal domain under MIG).
  - Why it matters for JR2018680: the review brief specifically calls this out — NVIDIA documents MIG as providing hardware-level fault isolation, not a certified guarantee against all side-channel/covert-channel attacks (e.g., shared power/thermal domain, and MIG has never been marketed or certified as a confidential-computing-grade isolation boundary). An interviewer probing GPU multi-tenancy security would expect a candidate to know this precise boundary — "MIG closes cache/SM/memory-bandwidth side channels but does not fully close power/thermal side channels" — rather than "no side-channel is possible."
  - Suggested fix: soften "no side-channel is possible" to something like "MIG closes the SM/L2/memory-bandwidth side channels that time-slicing leaves open, but the GPU package's power and thermal domains remain shared across MIG instances, so power/thermal side-channel monitoring in 6.5 still applies even under MIG" — and reconcile the risk diagram in 6.1 accordingly (MIG risk should not read as flatly "Low" without that caveat).

- [SEVERITY: low] The "MIG isolation failure" detection scenario (lines 101-115) uses duplicate GPU UUIDs across MIG instances as the failure signature. This isn't how MIG isolation failures actually manifest (MIG instance UUIDs are always distinct identifiers assigned at instance-creation time); presenting UUID collision as the diagnostic signal for isolation failure could send an interview candidate down the wrong troubleshooting path.
  - Evidence: `chapter-06-placeholder.md:101-115`.
  - Why it matters for JR2018680: low priority, but a candidate repeating this "check for duplicate UUIDs" claim in an interview would be technically incorrect.
  - Suggested fix: reframe as testing cross-instance memory-read/compute-interference (as section 6.2's `cuda-memtest` example already does) rather than UUID collision.

## chapter-07-placeholder.md — DMA, IOMMU, and SR-IOV Security

Good IOMMU/DMA fault mechanics and troubleshooting table.

- [SEVERITY: medium] Section 7.3 demonstrates NVIDIA data-center GPU SR-IOV as if it were generic PCIe SR-IOV: manually setting `sriov_numvfs`, unbinding a VF from the `nvidia` driver, and passing it directly to a VM via raw `vfio-pci`. In practice, NVIDIA data-center GPU SR-IOV is used internally by the NVIDIA vGPU Manager (installed in the hypervisor) to create mediated devices (mdev) for vGPU profiles; direct unmanaged `vfio-pci` passthrough of an NVIDIA VF without the vGPU Manager/licensing stack is not how NVIDIA's supported vGPU architecture works. The example could lead a candidate to describe NVIDIA vGPU deployment incorrectly in an interview.
  - Evidence: `chapter-07-placeholder.md:118-172`.
  - Why it matters for JR2018680: NVIDIA vGPU architecture (vGPU Manager, mdev, licensing) is exactly the kind of NVIDIA-specific systems knowledge this interview loop would probe, and the generic-Linux-SR-IOV framing glosses over it.
  - Suggested fix: add a note that production NVIDIA vGPU deployments go through the vGPU Manager/mdev framework rather than raw `vfio-pci` VF passthrough, and that whole-GPU passthrough (not SR-IOV) is the common alternative when vGPU licensing isn't in use.

## chapter-08-placeholder.md — BlueField and DOCA Security

Good conceptual coverage of DPU-as-trust-boundary and attestation flow.

- [SEVERITY: high] The chapter defines the acronym incorrectly: "DOCA (Data Center GPU Accelerated)" (line 36). NVIDIA's actual DOCA framework name is "Data Center-on-a-Chip Architecture" (NVIDIA DOCA SDK). This is a hard factual error about the volume's own subject-matter branding.
  - Evidence: `chapter-08-placeholder.md:36`.
  - Why it matters for JR2018680: getting NVIDIA's own product/acronym name wrong is exactly the kind of error an NVIDIA interviewer would notice immediately, and undermines credibility on a DPU/BlueField question.
  - Suggested fix: correct to "Data Center-on-a-Chip Architecture."

- [SEVERITY: low] The chapter's CLI examples (`doca-firewall`, `doca-crypto`, `doca-attest`, `doca-telemetry`) are illustrative pseudo-commands, not real DOCA tool names (real DOCA services/libraries include things like DOCA Flow, DOCA Firefly, DOCA IPsec, exposed via `doca_*` libraries/SDK APIs and BlueField's `mlnx`/`ovs-doca` tooling, not single unified `doca-*` CLI verbs shown here). Lower priority since other chapters use similar illustrative pseudo-commands, but worth noting since this chapter's commands read as more literal/copy-pasteable than most.
  - Evidence: `chapter-08-placeholder.md:42, 61, 71, 176`.
  - Why it matters for JR2018680: a candidate could reasonably expect these to be real commands and get corrected in an interview.
  - Suggested fix: label these as "illustrative" or replace with real DOCA SDK/API references.

## chapter-09-placeholder.md — Confidential Computing and Attestation

This is the chapter most directly relevant to the review's GPU confidential-computing focus, and it has the volume's most significant technical error plus a real depth gap. Also fixed a trivial Mermaid syntax bug inline (mismatched bracket/paren on the "Remote Verifier" node, `chapter-09-placeholder.md:116`, which would have broken diagram rendering).

- [SEVERITY: high] Section 9.3 shows enabling GPU confidential compute mode via `nvidia-smi -i 0 -c EXCLUSIVE_THREAD` (line 81), then verifying with `nvidia-smi -i 0 -q | grep Compute` → `Compute Mode: Default` (lines 83-85). This conflates two unrelated `nvidia-smi` concepts: `-c` sets the GPU **Compute Mode** (`DEFAULT`/`EXCLUSIVE_THREAD`/`EXCLUSIVE_PROCESS`/`PROHIBITED`), which controls how many contexts/processes can use the GPU concurrently — it has nothing to do with H100 Confidential Computing (CC) mode. Real GPU CC mode is a firmware/BIOS-level setting queried/toggled via `nvidia-smi conf-compute` subcommands, not the legacy `-c` compute-mode flag. The example's own output ("Compute Mode: Default") even contradicts the command that supposedly just set it to EXCLUSIVE_THREAD, which is a sign the example was not actually run/verified.
  - Evidence: `chapter-09-placeholder.md:80-85`.
  - Why it matters for JR2018680: this is the volume's single highest-value technical claim to get right, since the review focus explicitly calls out H100 confidential computing mode and attestation; a candidate repeating this command would visibly get GPU CC mode wrong in a hands-on interview.
  - Suggested fix: replace with the actual `nvidia-smi conf-compute -f`/query workflow (or note the correct subcommand family) for enabling/verifying H100 CC mode.

- [SEVERITY: medium] Depth/interview-readiness gap: this chapter (177 lines, the shortest chapter in the volume alongside ch-11) never resolves the gap flagged in Chapter 2 (which states GPUs generally lack attestation) — it doesn't name NVIDIA's actual GPU attestation architecture (NVIDIA Remote Attestation Service, local verifier, SPDM-based device identity, RIM/Reference Integrity Manifest for firmware measurement), instead presenting attestation generically via Intel-IAS-style pseudo-commands (`attest-client`, `attest-service`, `attest-verify`) applied uniformly to both SGX and GPU CC without distinguishing NVIDIA's actual attestation flow. It also never mentions that H100's initial CC implementation was not compatible with MIG (CC and MIG were mutually exclusive at launch) — a directly relevant interaction with this volume's own Chapter 6, and a concrete, testable interview fact for anyone asked to combine multi-tenancy (MIG) with confidential computing.
  - Evidence: chapter-wide (9.1-9.5); cross-reference gap with `chapter-02-placeholder.md:190-193,247` and `chapter-06-placeholder.md` (MIG chapter).
  - Why it matters for JR2018680: the review brief specifically calls out H100 CC mode and attestation as core topics; a candidate should know NVIDIA's attestation is device-identity + firmware-measurement based (not a rebrand of Intel IAS) and should know the MIG/CC interaction, since GPU sharing (ch6) and confidential computing (ch9) are natural follow-up interview combinations.
  - Suggested fix: add a subsection naming the NVIDIA Attestation Service/RIM flow specifically, and a line noting MIG+CC compatibility constraints (verify current status against latest NVIDIA CC documentation, as this evolves across driver/CUDA releases).

## chapter-10-placeholder.md — Data and Model Protection

Good data-lifecycle and key-management coverage; solid interview answer.

- [SEVERITY: medium] Section 10.1 presents `export NCCL_TLS_LEVEL=encrypt` as a real, working way to encrypt NCCL allreduce traffic between GPUs (lines 36-42), stating "This protects model gradients during allreduce operations." `NCCL_TLS_LEVEL` is not a documented NCCL environment variable — vanilla open-source NCCL does not provide built-in in-transit encryption of collective communications; this is a genuinely known, nontrivial gap in GPU cluster security (NCCL traffic over NVLink/RDMA/RoCE is typically protected by physical/network isolation rather than application-layer encryption, and adding encryption generally requires a different transport layer or vendor-specific extension). Presenting this as a one-line env-var fix is misleading on a topic (NCCL/RDMA network exposure) the review explicitly flags as important.
  - Evidence: `chapter-10-placeholder.md:33-42`.
  - Why it matters for JR2018680: NCCL/RDMA encryption is a real, hard, current problem in GPU cluster security — an interviewer would expect the candidate to know that this is *not* solved by a simple flag, and the chapter's confident one-liner would actively mislead prep.
  - Suggested fix: replace with an accurate statement of the current state (e.g., network-level isolation/encryption at the RoCE/IB fabric layer, or note this as an open problem/area of active development) rather than a fabricated env var.

- [SEVERITY: low] Section 10.4 repeats the same non-existent `kubectl auth can-i ... --resource-name=model-registry-creds` flag already flagged in Chapter 4 (`chapter-04-placeholder.md:287-289`).
  - Evidence: `chapter-10-placeholder.md:142-146`.
  - Why it matters for JR2018680: same as the Chapter 4 finding — command-line precision.
  - Suggested fix: same fix as Chapter 4; consider a single corrected example reused via cross-reference instead of repeating the flawed command.

## chapter-11-placeholder.md — Audit, Logging, and Compliance

Accurate, well-structured multi-layer audit/compliance chapter (Kubernetes, GPU/DCGM, network, application layers; SOC2/HIPAA mapping). No significant issues found.

## chapter-12-placeholder.md — Incident Response and Troubleshooting

Strong closing chapter: concrete incident playbooks (leaked token, GPU side-channel, container escape), a reusable runbook template, and a tabletop-drill format. No accuracy issues found. Good volume-closing summary table.
