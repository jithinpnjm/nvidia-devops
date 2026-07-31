# Chapter 3 — Trade-off matrices with weighted requirements
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Compare options transparently without pretending all dimensions matter equally.

| Dimension | Example measure |
|---|---|
| Performance | P95 TTFT, tokens/s/GPU, training scaling efficiency |
| Reliability | failure domains, recovery, upgrade disruption |
| Operability | skills, automation, debugging, lifecycle burden |
| Security | isolation, IAM, network/data controls |
| Economics | cost/unit work, utilization, licensing, staff time |
| Time-to-value | procurement + integration + migration timeline |

Weights come from customer priorities. A 10% performance advantage may be irrelevant if the option violates data residency. A cheaper platform may be more expensive if operational complexity consumes scarce engineering capacity. Make assumptions explicit so the customer can challenge them.

---

➕ **The matrix mechanism, drawn as arithmetic (this is the actual computation an SA should be able to produce live):**
```
score(option) = Σ ( weight[dimension] × rating[option][dimension] )   for each dimension

weights must sum to 1.0 (or 100%) — otherwise scores aren't comparable across options
ratings are usually 1-5 or 1-10, ANCHORED to a concrete measure, not vibes
```

➕ **Sample worked trade-off matrix, with real weights and ratings — Kubernetes vs Slurm for a mixed training/inference customer (annotated):**
```
Customer priority context: 70% batch training (large jobs), 30% inference;
small platform team, strong Kubernetes skills, no Slurm experience.

Dimension        Weight   K8s rating(1-5)   Slurm rating(1-5)   K8s wtd   Slurm wtd
Performance       0.20         3                   5              0.60      1.00
  ↳ anchor: Slurm's topology-aware gang scheduling and mature MPI/collective
    integration outperform K8s-native scheduling for large synchronous jobs
    — this is a MEASURED gap (scaling efficiency), not a guess.

Reliability        0.15         4                   4              0.60      0.60
  ↳ tie: both have mature failure-domain models for this job type; no
    differentiator once checkpoint/restart is implemented on either.

Operability        0.30         5                   2              1.50      0.60
  ↳ HIGHEST weight in this matrix, because the customer explicitly has
    zero Slurm operational experience today — this weight reflects the
    customer's stated constraint, not the SA's opinion.

Security           0.10         4                   3              0.40      0.30
  ↳ K8s' RBAC/NetworkPolicy ecosystem is more mature for multi-tenant
    isolation than typical Slurm accounting-based separation.

Economics           0.15         4                   4              0.60      0.60
  ↳ tie at this scale; GPU-hour cost is dominated by hardware, not
    scheduler choice, at the workload sizes in discovery.

Time-to-value        0.10         5                   2              0.50      0.20
  ↳ platform team already runs K8s in production; adopting Slurm from
    zero adds a real training/hiring timeline the customer cannot skip.

TOTAL              1.00                                              4.20      3.30
```
**Why this artifact matters more than the bare table in the source:** the raw dimension table only says *what* to measure. This worked matrix shows the actual discipline: every weight and every rating has a one-line justification attached, so a customer (or an interviewer) can challenge a specific number instead of rejecting the whole recommendation. That's the difference between "trust me, K8s wins" and a defensible 4.20 vs 3.30.

➕ **The trap this matrix format prevents, made explicit:** if Performance had been weighted 0.50 instead of 0.20 — a reasonable-sounding "performance matters most" default — Slurm would win outright (0.50×5=2.50 alone almost closes the gap). The scenario above deliberately weighted Operability highest *because discovery (Chapter 1) surfaced that the team has zero Slurm experience* — the weights are not universal constants, they're a direct encoding of Chapter 1's discovery facts. **Interview-ready line:** "my weights aren't my opinion about what matters in general — they're a direct translation of what this specific customer's discovery revealed."

➕ **ASCII visualization of the weighted comparison (useful when whiteboarding live):**
```
Performance   K8s ███░░░░░░░ (0.60)   Slurm █████████░ (1.00)
Reliability    K8s ██████░░░░ (0.60)   Slurm ██████░░░░ (0.60)
Operability    K8s ███████████████ (1.50) Slurm ██████░░░░░░░░░ (0.60)  ← decisive gap
Security       K8s ████░░░░░░ (0.40)   Slurm ███░░░░░░░ (0.30)
Economics      K8s ██████░░░░ (0.60)   Slurm ██████░░░░ (0.60)
Time-to-value  K8s █████░░░░░ (0.50)   Slurm ██░░░░░░░░ (0.20)  ← decisive gap
                                    TOTAL: K8s 4.20  vs  Slurm 3.30
```
The bars make it visible at a glance that the K8s win is driven by exactly two dimensions (Operability, Time-to-value) — not a uniform advantage. Naming that concentration out loud ("the win isn't across the board, it's concentrated in two operational dimensions the customer told us matter most") is a stronger answer than reading the total score.

➕ **Extra worked scenario — same dimensions, different customer, opposite outcome (proves the matrix isn't a fixed answer, it's a method):**
> Same dimension set, new customer: large research lab, 500-person HPC team already running Slurm for a decade, mostly homogeneous large-scale training, near-zero inference workload.
> Re-weighted: Operability 0.10 (they're Slurm experts, K8s would be the unfamiliar one — actually flips ratings too, not just weights), Performance 0.30 (large synchronous training dominates), Time-to-value 0.05 (not migrating anything urgently).
> Re-rating: Slurm Operability rating becomes 5, K8s becomes 2 (ratings flip because *this* team's skill profile is reversed).
> Result: Slurm wins decisively — same dimensions, same method, opposite conclusion, because both the weights AND ratings are customer-specific facts, not fixed platform properties.
> **This is the single most important point to make about trade-off matrices in an interview:** the matrix is a reusable *method*, never a reusable *answer* — reusing last customer's weights on this customer's matrix is the actual mistake to call out if asked "what goes wrong with trade-off matrices in practice."

## Practice
1. Create a weighted decision matrix for Kubernetes vs Slurm for a hypothetical customer.

➕ 2. Take the worked matrix above and change exactly one weight (Performance 0.20 → 0.45, reducing others proportionally) — recompute both totals and identify the new winner. State the one sentence you'd say to the customer to justify why performance jumped to 0.45 (it must be a discovery fact, not a preference).
➕ 3. A stakeholder says "just tell me the answer, skip the matrix — you're the expert." Write the one-paragraph pushback that explains why showing weights is lower-risk for the SA than a bare verbal recommendation (hint: it's about what happens six months later when the decision is questioned).
</content>
