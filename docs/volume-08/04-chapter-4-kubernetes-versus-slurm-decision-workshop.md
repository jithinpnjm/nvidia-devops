---
title: "Chapter 4 - Kubernetes versus Slurm decision workshop"
slug: "chapter-4-kubernetes-versus-slurm-decision-workshop"
sidebar_position: 4
description: "Chapter 4 - Kubernetes versus Slurm decision workshop — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
> Learning outcome Practice a common AI infrastructure architecture decision without forcing a universal answer.

## Worked scenario
**Situation:** A research organization runs 80% large batch training, 10% interactive notebooks and 10% online model services. It already operates Slurm but also has a mature Kubernetes platform team.

1. Separate workload classes instead of asking for one scheduler to "win."
2. For batch training, evaluate existing Slurm scheduling/accounting/topology capabilities and whether Kubernetes adds enough platform value to justify migration.
3. For online services, evaluate Kubernetes service/GitOps/observability/autoscaling ecosystem.
4. For notebooks, evaluate tenancy, quotas and developer experience across both.
5. Consider integration/shared identity/storage/observability and define ownership boundaries if using both.

**Conclusion:** A multi-platform answer can be correct when workload operating models differ; simplicity must include migration/operational reality.

---

➕ **The decision workshop as a decision tree (the sequencing the source describes, drawn):**
```
                     Start: "K8s or Slurm?"
                              │
              ┌───────────────┴───────────────┐
              │  WRONG framing — forces one    │
              │  scheduler to win everything   │
              └────────────────────────────────┘
                              │
                              ▼
             Split by WORKLOAD CLASS first (not by platform preference)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  Batch training (80%)   Online services (10%)   Notebooks (10%)
        │                     │                     │
        ▼                     ▼                     ▼
  Does Slurm already    K8s ecosystem (GitOps,   Compare tenancy/quota/
  do this well? Does    autoscaling, service      dev-experience on BOTH
  K8s add ENOUGH value  mesh, observability)       — this is the one class
  to justify migrating  strongly favors K8s        genuinely up for grabs
  a working system?     for long-running services
        │                     │                     │
        ▼                     ▼                     ▼
  Likely: KEEP Slurm    Likely: USE K8s        Likely: EITHER, pick by
  for this class        for this class          existing platform team skill
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              │
                              ▼
              Define integration: shared identity, storage,
              observability, and — critically — OWNERSHIP boundaries
              (who's on-call for what, at the seam between the two)
                              │
                              ▼
                    Multi-platform answer, justified per class
```

➕ **Mnemonic/shortcut for structuring this answer live: "SPLIT, DON'T PICK."**
The moment an interviewer poses "Kubernetes or Slurm?" as binary, the correct opening move is to split by workload class before evaluating either platform. Saying "split, don't pick" out loud, then walking the three classes, is a stronger opening than naming a platform first — it signals you refuse the false binary the question sets up.

➕ **Sample annotated scoring for this exact scenario, applying Chapter 3's matrix method to the batch-training class specifically:**
```
Batch training (80% of workload) — K8s vs keep-existing-Slurm

Dimension         Weight   Slurm(existing)   K8s(migrate)   Notes
Performance        0.25         5                 3          Slurm's topology-aware
                                                               gang scheduling + mature
                                                               MPI integration already
                                                               proven on THIS workload —
                                                               K8s would need volcano/
                                                               kueue to approach parity
Migration cost      0.30         5                 1          Existing = zero migration
                                                               cost by definition; this
                                                               is discovery fact, not bias
Operability          0.20         4                 3          Team already knows Slurm
                                                               for this workload; some
                                                               K8s skill exists too
Ecosystem fit        0.15         2                 5          If the customer wants ONE
                                                                platform long-term, K8s
                                                                unifies with the other 20%
Time-to-value        0.10         5                 1          Working today vs a
                                                                multi-quarter migration
TOTAL              1.00         4.35              2.55
```
Even with a real ecosystem-unification argument for K8s (rating 5 on that one row), the migration-cost and time-to-value weights make "leave batch training on Slurm" the numerically defensible answer for *this* workload class — matching the chapter's stated conclusion, but now with the arithmetic that survives a follow-up "why."

➕ **Extra worked scenario — a customer profile where the answer flips (to prove this isn't a template):**
> **Situation:** A startup with 20 engineers, no existing scheduler at all, needs to stand up training + inference from zero, and explicitly wants to hire generalist platform engineers rather than HPC specialists.
> Applying the same split: batch training here has NO "existing Slurm system" to protect (migration cost weight collapses to near-zero because there's nothing to migrate away from), and the hiring-pool argument favors Kubernetes skills being far more available than Slurm specialists in the general market.
> Result: this customer's batch-training class likely goes to Kubernetes with Kueue/Volcano for gang scheduling, even though the previous scenario's identical workload *percentage* mix kept Slurm. **The workload mix (80/10/10) was never the deciding variable — the existing operating model and team was.** This is the exact point to make if an interviewer tries to get you to memorize "80% batch = always Slurm."

➕ **Interview-ready line:** "I don't pick a scheduler, I split the workload into classes and let each class's discovery facts — existing system, team skill, and ecosystem needs — pick for it. A multi-platform answer is a sign the split was done correctly, not a hedge."

## Practice
➕ 1. Take the startup scenario above and run the notebooks (10%) and online-services (10%) classes through the same split — does anything change from the original research-org scenario's conclusion for those two classes? (Expect: online services still favors K8s regardless of customer profile, because the ecosystem argument for long-running services is closer to workload-agnostic than the training argument.)
➕ 2. An interviewer pushes back: "Isn't running two schedulers just operational complexity for its own sake?" Write the rebuttal that names the actual cost (a defined ownership seam, shared identity/storage/observability) versus the cost being reasoned about aloud (forcing one scheduler to do a job it's weaker at for 80% of the fleet).

➕ **Visual model — choose by workload shape, then share the platform seams:**
```
online service / API ─► Kubernetes ─┐
batch MPI / gang job ──► Slurm ─────┼── shared identity, data, telemetry, guardrails
interactive notebooks ─► policy choice┘
```
**Memory hook:** *"One fabric can serve two control planes; do not make one scheduler impersonate the other."*
