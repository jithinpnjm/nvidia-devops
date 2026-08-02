# JD coverage gap report — /troubleshooting + /architecture vs. JR2018680

Audit-only, as requested. No content was built or changed. This maps every JD checklist item to the specific incidents (`src/data/troubleshooting.ts`, 61 items) and architecture scenarios (`src/data/architecture.ts`, 20 items) that cover it, verified by reading the actual data — not by title guessing. Method note: for "no coverage" claims on named technologies (Lustre, Grafana, etc.) I grepped the full data files for the literal name, not just scanned titles, so absence here means the string genuinely does not appear anywhere in the data, not that a differently-worded item might cover it.

## Format rendering check (does the "teaching-first" format actually apply here?)

`teach_troubleshooting_architecture.md` does not exist anywhere in this repo — if that template was written elsewhere, it wasn't committed here, so I audited the *rendered behavior* directly instead. `src/pages/troubleshooting.tsx` currently has a three-phase flow (`learn` → evidence-reveal → `solution`) with a ChatGPT prompt that explicitly instructs: "First teach the system involved... Then teach this incident completely," and a separate Socratic-drill prompt for assessment. That is teaching-first, not reveal-locked-quiz — the restructuring described in the audit brief appears to already be in place for troubleshooting. I did not deep-read all 61 incidents' individual prose depth in this pass (that would exceed an audit-only scope); if you want per-incident depth grading, say so and I'll do a second, narrower pass.

## JD checklist coverage

### Linux — equal pillar, not a Kubernetes footnote

| Sub-item | Status | Evidence |
|---|---|---|
| Process/memory/scheduling internals | **Strong** | `high-load` (Linux high load, idle CPU), `memory-reclaim` (Linux memory reclaim storm), category `Linux/Systems` |
| cgroups, namespaces (container mechanics beneath k8s) | **Partial** | No dedicated troubleshooting incident by this specific mechanism (the closest is `cpu-throttle`, which is cgroup-adjacent but K8s-framed). This is deeply covered in **Volume 1, Chapter 5** of the curriculum — but not in the troubleshooting/architecture pages this audit scopes. |
| systemd, boot process, kernel params for HPC/GPU nodes | **Gap in this scope** | No troubleshooting incident. Covered in **Volume 1, Chapter 6** and **Volume 10** curriculum, not here. |
| Storage/filesystem layer independent of Kubernetes | **Partial** | `disk-inode-exhaustion` covers the inode-vs-byte distinction well; `storage` (generic "Storage bottleneck") exists but is thin — see the named-technology gap below. |
| Linux networking stack fundamentals (routing, netfilter, bonding/NIC teaming) | **Gap** | No incident on raw Linux routing, netfilter, or NIC bonding/teaming. `network-policy` is Kubernetes NetworkPolicy, not the underlying Linux mechanism. `nat-port-exhaustion` is cloud NAT, not host-level netfilter. |
| Performance diagnosis: CPU steal, memory reclaim, I/O wait, FDs | **Strong** | `high-load`, `memory-reclaim`, `fd-exhaustion`, `noisy-neighbor-steal` (CPU steal specifically) all present and correctly categorized. |

**Is Linux visible as its own pillar in navigation, or only via scattered incidents?** Confirmed: **Linux already has a standalone, prominent pillar** — Volume 1 ("Foundations Beneath Kubernetes") is positioned as the first content volume in the curriculum sidebar, with 6 chapters, 6 senior deep dives, and its own troubleshooting exercise, entirely independent of Kubernetes. The gaps above are specifically in the *troubleshooting/architecture practice pages*, not in curriculum visibility. Recommendation: close the practice-page gaps (namespaces/cgroups mechanism incident, systemd/boot incident, raw Linux networking incident) rather than restructure navigation — the navigation problem the audit worried about does not actually exist.

### GPU/HPC stack

| Sub-item | Status | Evidence |
|---|---|---|
| NVIDIA driver + CUDA toolkit lifecycle/compatibility model | **Partial** | `driver-mismatch` and `kernel-patch-dkms-break` both exist and are mechanism-focused (not just symptom titles) — read `kernel-patch-dkms-break`'s evidence chain, it genuinely explains the DKMS rebuild mechanism. What's missing is a scenario framed around the *general compatibility model* (driver/CUDA/toolkit version matrix as a first-class concept) rather than one specific breakage. |
| GPU workload profiling (prove GPU-bound) | **Strong** | `low-gpu` (Low GPU utilization) is exactly this scenario. |
| NVIDIA Base Command Manager (BCM) at scale | **Partial in troubleshooting, Gap in architecture** | `bcm-category-drift` covers one specific BCM failure mode (config drift) well, but there is no architecture scenario about BCM-based provisioning/monitoring at fleet scale, and the JD names BCM specifically as a deliverable skill, not just a failure mode to diagnose. |
| NVIDIA GPU Operator + Network Operator | **Partial — GPU Operator yes, Network Operator absent** | `gpu-unavailable`, `mig`, `xid` all touch GPU Operator operand behavior. The literal string "Network Operator" does not appear anywhere in either data file — confirmed gap. |
| SLURM + MPI + enroot | **Strong** | `slurm-pending`, `slurm-fairshare-starve`, `slurm-failover-lost-jobs`, `mpi-nccl-startup-hang`, `enroot-gpu-not-visible` — five incidents, well-differentiated failure modes, this is the best-covered specialist area in the whole set. |
| RDMA — InfiniBand AND RoCE | **Partial — RoCE strong, InfiniBand thin** | `roce` is a dedicated incident. `rdma-perf` is fabric-generic (covers both). The literal string "InfiniBand" appears exactly once, in `architecture.ts`, as a decision-point line in a scenario about choosing between IB and RoCE — not as its own troubleshooting incident. Given the JD calls out both by name, InfiniBand deserves its own incident the way RoCE has one (e.g., subnet-manager failure, or a fabric-specific link-training issue distinct from the RoCE congestion/PFC story already covered). |

### Storage (named technologies)

**Gap — confirmed by direct string search.** "Lustre" appears exactly once, and only incidentally inside a CI/CD/Terraform incident's description ("a Terraform plan that would destroy... a production Lustre metadata server's storage volume") — it's set dressing for a different lesson, not a Lustre-specific teaching moment. "GPFS", "ZFS", and "XFS" appear **zero times** in either data file. The JD names these specifically; right now a candidate could complete every troubleshooting incident on this site and never encounter any of them by name. This is the single cleanest, most objective gap in the whole audit.

### Observability (named stack: Grafana, Loki, Prometheus)

**Partial — Prometheus strong, Grafana and Loki absent.** Prometheus is well covered: `cardinality` (Prometheus cardinality explosion) and `missing-gpu-metrics` (Missing DCGM GPU metrics, which is a Prometheus/DCGM-exporter pipeline issue) are both genuine, mechanism-level incidents. "Grafana" and "Loki" appear **zero times** in either data file — confirmed by direct search. The JD names this exact three-tool stack; right now two-thirds of it is invisible.

### Networking & data center architecture

**Gap as a standalone topic.** The only troubleshooting category touching general networking is "Cloud Networking" (`lb-keepalive-502`, `nat-port-exhaustion`) — both are cloud/LB-layer, not data-center/rack-level network architecture. The fabric-specific incidents (`nccl`, `roce`, `rdma-perf`, `topology`) are all GPU-fabric framed, which the JD explicitly wants treated as an *addition to*, not a *replacement for*, general networking/DC architecture fundamentals. No incident or architecture scenario currently teaches DC network architecture (leaf-spine, oversubscription ratios, rack-level topology) as a topic in its own right independent of the GPU-fabric angle — this exists in **Volume 6** curriculum but not in troubleshooting/architecture practice.

### Change management, CI/CD, automation

| Sub-item | Status | Evidence |
|---|---|---|
| SW change management across compute/network/storage clusters | **Strong** | `canary-firmware-not-representative` (Change Management category) is exactly this — a coordinated firmware/driver rollout that passes canary but breaks part of the fleet, which is the textbook cross-layer change-management failure. The architecture side has an even better match: **"Fleet-wide firmware, driver and OS upgrade"** is a full architecture scenario built around coordinated multi-layer change. This JD item is well covered — better than several others. |
| CI/CD pipelines for deployment/automation | **Strong** | `cicd-emergency-override-bypass`, `cicd-runner-starvation`, `gitops-drift`, `gitops-mutating-webhook-loop`, `terraform-lock-orphan` on the troubleshooting side; **"Secure enterprise CI/CD supply chain"** and **"GitOps promotion and rollback platform"** as dedicated architecture scenarios. This is genuinely strong. |

### Consulting / customer-facing skills

| Sub-item | Status | Evidence |
|---|---|---|
| Executive-stakeholder presentation framing (distinct from peer-engineer framing) | **Gap — confirmed by direct search.** | Searched both `troubleshooting.tsx` and `architecture.tsx` for "executive," "stakeholder," and "customer framing" — zero matches. The existing "Interview-ready line" pattern (used across the curriculum and troubleshooting incidents) is consistently peer/interviewer-framed. There is no rendered variant that asks "how would you say this to a customer's VP of Infrastructure" versus "how would you say this to the interviewer." The raw material for this exists (`architecture.ts` already has customer-shaped scenarios like "Post-acquisition GPU platform consolidation," "Regulated air-gapped AI platform") — the gap is a missing *answer-framing variant*, not missing scenarios. |
| Documentation practice: runbooks, onboarding, best-practice guides | **Partial — implicit, not explicit** | Every one of the 61 troubleshooting incidents already carries a `runbook` field (containment step, labeled commands with rationale, escalation path) — so runbook *artifacts* are pervasive. What's missing is an explicit lesson on *how to write a good runbook* as its own skill, separate from consuming one. **Volume 10, Chapter 12** ("Customer runbooks, onboarding and best-practice documentation") already teaches this in the curriculum — it is simply not surfaced in the troubleshooting/architecture practice pages this audit scopes. |

## Summary table

| JD area | Verdict |
|---|---|
| Linux fundamentals (curriculum visibility) | Strong — already its own volume, not scattered |
| Linux fundamentals (troubleshooting practice) | Partial — CPU/memory/FD strong; namespaces/cgroups, systemd/boot, raw networking (routing/netfilter/bonding) missing as incidents |
| GPU driver/CUDA lifecycle | Partial — symptom-level strong, general compatibility-model scenario missing |
| GPU profiling | Strong |
| BCM at scale | Partial (troubleshooting) / Gap (architecture) |
| GPU Operator | Partial |
| Network Operator | **Gap** |
| Slurm + MPI + Enroot | Strong — best-covered specialist area |
| RDMA: RoCE | Strong |
| RDMA: InfiniBand | Partial — one decision-point mention, no dedicated incident |
| Storage: Lustre/GPFS/ZFS/XFS | **Gap** — essentially absent by name |
| Observability: Prometheus | Strong |
| Observability: Grafana | **Gap** |
| Observability: Loki | **Gap** |
| Networking & DC architecture (standalone) | Gap in practice pages (present in curriculum) |
| Cross-layer change management | Strong |
| CI/CD | Strong |
| Executive/customer-framing answers | **Gap** |
| Runbook-writing as an explicit skill | Partial — artifacts everywhere, explicit "how to write one" lesson not surfaced here |

## Proposed new incidents/scenarios for "no coverage" items (titles + one-line scope only — not built)

1. **"Lustre metadata server bottleneck under checkpoint load"** (troubleshooting, Storage & Data) — a training job's checkpoint writes saturate Lustre MDS metadata ops, not OST bandwidth; distinguishes metadata-bound from throughput-bound storage failure.
2. **"GPFS quorum loss during a rolling storage-node upgrade"** (troubleshooting, Storage & Data) — a maintenance window drops below quorum, causing filesystem-wide stalls, not just the node being upgraded.
3. **"XFS inode exhaustion from a checkpoint-sharding pattern"** (troubleshooting, Storage & Data) — distinct from the existing generic `disk-inode-exhaustion`, framed specifically around AI checkpoint sharding creating millions of small files.
4. **"Grafana dashboard shows healthy while Prometheus data is stale"** (troubleshooting, Observability) — a dashboard-vs-data-freshness trap: Grafana renders the last successfully-scraped value even after scraping has silently stopped.
5. **"Loki label cardinality collapse under high-volume GPU node logs"** (troubleshooting, Observability) — the log-pipeline analog of the existing Prometheus `cardinality` incident.
6. **"NVIDIA Network Operator fails to reconcile after a NIC firmware change"** (troubleshooting, Bare-metal/BCM or Networking/Fabric) — operand drift specific to Network Operator, distinct from the existing GPU Operator-focused incidents.
7. **"InfiniBand subnet manager failover loses fabric routing state"** (troubleshooting, Networking/Fabric) — an IB-specific fabric incident to sit alongside the existing RoCE-specific one.
8. **"Bonded NIC interface silently drops to half bandwidth after a driver update"** (troubleshooting, Linux/Systems) — raw Linux NIC-bonding/teaming failure, independent of any Kubernetes or GPU-fabric framing.
9. **"A routine kernel update changes default netfilter conntrack limits, causing connection drops under load"** (troubleshooting, Linux/Systems) — raw Linux networking-stack incident distinct from the existing K8s-framed `network-policy`.
10. **"systemd unit ordering causes a GPU-dependent service to start before the driver is loaded"** (troubleshooting, Linux/Systems) — boot-order/systemd-dependency incident for HPC/GPU nodes.
11. **"BCM-provisioned GPU cluster: designing the node-category and image-lifecycle model at 500-node scale"** (architecture) — the general BCM provisioning/monitoring architecture scenario the JD calls for, distinct from the existing single-failure-mode `bcm-category-drift` incident.
12. **"Data-center network architecture for a new AI cluster build"** (architecture) — leaf-spine topology, oversubscription ratio, rack power/cooling constraints as their own design problem, independent of the GPU-fabric-specific scenarios already present.

## Proposed depth expansion for "partial coverage" items

- **`driver-mismatch` and `kernel-patch-dkms-break`**: add a short "the general model" framing note (driver/CUDA/toolkit version matrix as a standing constraint, not just this one incident's specific break) so the mechanism generalizes beyond the one symptom — this can likely be a targeted addition to existing prose rather than a new incident.
- **`storage`**: currently generic ("Storage bottleneck") — rename/refocus toward a named technology (see proposed incidents above) or explicitly broaden its evidence chain to name Lustre/GPFS/XFS/ZFS as the systems being diagnosed, so it stops being the site's only, and vaguest, storage incident.
- **Executive/customer-framing**: rather than new scenarios, this is a rendering-layer addition — add a second "Say it to a customer executive" variant alongside the existing "Interview-ready line" pattern in both `troubleshooting.tsx` and `architecture.tsx`, reusing the same underlying scenario data (most architecture scenarios are already customer-shaped; they just need the second framing rendered).
- **Runbook-writing as an explicit skill**: add one short explicit "what makes a runbook usable at 3am" callout to the troubleshooting page's shell (not per-incident) — the per-incident `runbook` fields already model good structure; a single meta-explanation of *why* they're structured that way would make the pattern teach itself rather than being consumed silently 61 times.

## What this audit did not do (by design, per the audit-only scope)

- Did not grade the teaching-depth of all 61 individual incidents' prose (spot-checked the rendering mechanism and two incidents' content; a full per-incident depth grading is a separate, larger task).
- Did not touch, create, or edit any content file.
- Did not verify the architecture.ts scenarios' depth field-by-field the way I did for troubleshooting's `evidence`/`runbook` shape — if you want the same rigor applied there, say so.
