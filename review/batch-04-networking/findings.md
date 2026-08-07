# Batch 04 — Networking & Interconnect — Findings

(Summary to be written at top once all chapters are reviewed.)

## F-06 — docs/volume-06 (HPC, Networking and Storage for AI)

### 01-chapter-1-distributed-systems-performance-for-gpu-jobs.md
- [SEVERITY: low] Structural oddity: the volume title page, edition notice, and formal "Learning outcome" statement appear at lines 352-364, *after* the chapter's Q&A, glossary, and "before you go deeper" checklist — i.e. mid-file, not at the top of the volume. Reads as a leftover docx-conversion artifact.
  - Evidence: "**VOLUME 6** ... Fourth Edition - Teaching text..." appears after the glossary section, followed by more chapter content (scaling-efficiency formula, nccl-tests example).
  - Why it matters for JR2018680: cosmetic only, does not affect technical content, but undermines the "gold standard" polish bar set by Volume 1.
  - Suggested fix: move the volume title/edition block to the top of chapter 1 or to index.md in a follow-up authoring pass.
- Content check: nccl-tests busbw/algbw annotated example is numerically consistent (algbw 2.19 × 1.75 ring factor ≈ busbw 3.84; 200Gb/s = 25GB/s line rate) — accurate.

### 02-chapter-2-ethernet-fundamentals-for-ai-fabrics.md
- [SEVERITY: low] Minor arithmetic inconsistency in the annotated MTU ping example: payload 8972 + 28-byte ICMP/IP header = 9000, which exactly equals the stated MTU of 9000, not "exceeds" it as the annotation claims.
  - Evidence: "`ping: local error: message too long, mtu=9000` ← path/local MTU is 9000, payload+headers(28) = 9000 exceeds it"
  - Why it matters for JR2018680: an interviewer who does the arithmetic live would catch this; the actual behavior (packet at exactly MTU size can still fail depending on OS/driver rounding) needed a sentence of explanation, not "exceeds."
  - Suggested fix: clarify that 9000 is at the boundary and some stacks require payload+headers < MTU, or adjust the example numbers to be unambiguous.
- Otherwise excellent: PFC/ECN/drop escalation ladder, `ethtool -S` annotated output, and the ECMP-vs-collective-flow failure mode (single long-lived AllReduce flow hashing onto one spine link) are accurate and exactly the kind of depth a NVIDIA infra interview probes.

### 03-chapter-3-rdma-roce-and-infiniband.md
- No issues found. This is the core RDMA/RoCE/IB chapter and it is strong: correctly distinguishes RDMA (capability) from InfiniBand/RoCE (transports), explains queue pairs/memory registration mechanically, gives an accurate PFC-without-ECN anti-pattern (PFC storm / head-of-line blocking), and includes a realistic `ib_write_bw` efficiency calculation (195.88/200 Gb/s ≈ 98%).
- This chapter explicitly does the "which generation/transport/congestion-control/oversubscription" framing the batch brief asked to check for — does not hand-wave the RoCE vs IB tradeoff.

### 04-chapter-4-gpudirect-rdma-nic-gpu-topology-and-nccl.md
- No issues found. `nvidia-smi topo -m` reading, NCCL ring-vs-tree tradeoffs (bandwidth-optimal O(N) vs latency-optimal O(log N)), and the annotated `NCCL_DEBUG=INFO` GDRDMA-fallback log diff are all accurate and interview-relevant.

### 05-chapter-5-nvidia-network-operator-and-kubernetes-accelerated-networking.md
- [SEVERITY: low] Technical/command error in the "Shortcut" one-liner: `kubectl get pods -n gpu-operator -n network-operator ...` — kubectl does not merge two `-n` flags into "both namespaces"; the second `-n` simply overrides the first, so this command only queries `network-operator`, not both.
  - Evidence: "`kubectl get pods -n gpu-operator -n network-operator --field-selector=status.phase!=Running`"
  - Why it matters for JR2018680: a candidate repeating this command verbatim in an interview or on-call scenario would get an incomplete/misleading result.
  - Suggested fix: use `kubectl get pods --all-namespaces -l ...` or two separate commands, or `-n gpu-operator,network-operator` is also invalid syntax — needs `--all-namespaces` with a label/field filter, or two sequential commands.
- Otherwise strong: correctly explains that NetworkPolicy does not govern SR-IOV/Multus secondary RDMA networks (a genuinely deep, correct interview point), and the Network Operator component table (MOFED driver container, SR-IOV device plugin, Multus, RDMA device plugin) is accurate.

### 06-chapter-6-storage-for-ai-datasets-checkpoints-and-model-distribution.md
- No issues found. Lustre/GPFS/ZFS comparison is technically accurate (Lustre MDS/OST split, GPFS distributed metadata + quorum, ZFS copy-on-write + ARC), and the checkpoint-stall-vs-dataloader-stall diagnostic distinction is a genuinely useful interview-grade heuristic.

### 07-chapter-7-slurm-scheduling-model.md
- No issues found. Job/allocation/step hierarchy, `sinfo`/`squeue`/`sacct` annotated output, and PD-reason (`Priority` vs `Resources`) distinction are all accurate and match real Slurm behavior.

### 08-chapter-8-kubernetes-slurm-or-both.md
- No issues found. Decision tree and 80/20 hybrid-fleet worked scenario are sound and avoid platform-tribalism hand-waving.

