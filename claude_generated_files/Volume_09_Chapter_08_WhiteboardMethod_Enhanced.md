# Chapter 8 — Solutions architecture whiteboard method
*(original text preserved in full below; additions marked with ➕ so you can see exactly what changed)*

**Learning outcome:** Discover, model paths/state/failure domains, compare options, recommend and define validation.

Before drawing boxes, ask workload type, SLO, scale, data location, tenancy/security, current platform skills, budget and growth. Then draw request/data/control paths and failure domains. Compare two or three options on weighted dimensions. End with a recommendation plus what the PoC/benchmark must validate.

## Worked scenario
**Situation:** Design a shared 128-GPU platform for training and inference.

1. Clarify training/inference split, models, concurrency, distributed job sizes and SLOs.
2. Define GPU pool strategy: homogeneous/heterogeneous, full GPU vs MIG/shared pools, topology requirements.
3. Choose scheduler/orchestration model per workload; consider Kubernetes, Slurm or integration.
4. Design fabric/storage around distributed training and model/data paths.
5. Define identity/tenancy/quota, observability, lifecycle automation and failure domains.
6. Capacity-test peak inference + training contention and define admission/fair-share policy.

**Conclusion:** A platform architecture is workload + resource-control + data-path + operations, not a Kubernetes diagram.

---

## Original — Question set G: Whiteboard: production GenAI platform

Whiteboard from requirements outward: client/gateway -> auth/rate limits -> model routing -> serving runtime -> GPU scheduling -> compute topology -> network/storage -> observability -> lifecycle/CI/CD -> failure domains. Ask about model count, prompt/output distribution, concurrency, data residency, availability and cost. Then choose components. A diagram that begins with "NIM" or "Kubernetes" before requirements is backwards.

---

## ➕ Additions

➕ **The whiteboard method as a strict left-to-right build order (this is the sequence to literally draw, live):**
```
DISCOVERY (spoken, before any box is drawn)
  workload type · SLO · scale · data location · tenancy/security ·
  current platform skills · budget · growth
        │
        ▼
client/gateway → auth/rate-limits → model routing → serving runtime
        │
        ▼
GPU scheduling → compute topology (NVLink/PCIe/NUMA) → network/storage
        │
        ▼
observability → lifecycle/CI-CD → failure domains
        │
        ▼
COMPARE 2-3 options on weighted dimensions → RECOMMEND → define what
the PoC/benchmark must prove before commit
```
➕ **Memory hook:** *"Discover before you draw, requirements before names."* The single most common failure mode named explicitly in the original text — starting with "NIM" or "Kubernetes" — is a mnemonic in itself: if the first word out of your mouth is a product name, you've already lost the "senior" signal, restart with a question instead.

➕ **Interview-ready line to open any whiteboard prompt with:**
> "Before I draw anything, I have six or seven questions — workload type, SLO, scale, data location, tenancy, current platform skills, and budget/growth trajectory. Can I ask a few of those first?"
This is nearly always granted, and even a partial answer ("it's mostly inference, multi-tenant, cost-sensitive") changes which of the next boxes you draw first.

➕ **Annotated sample whiteboard transcript — the 128-GPU shared platform scenario, narrated as if speaking while drawing:**

> "First — training and inference on the same 128 GPUs is a resource-contention problem before it's a scheduler problem, so let me ask: what's the expected split, and are these hard SLOs for inference or soft ones?" *(← clarify, and explicitly names the underlying tension before naming any tool)*
>
> "I'll draw two logical pools even if the hardware is homogeneous: a training pool sized for your largest distributed job's topology needs — same NVSwitch domain, ideally — and an inference pool that can use MIG or smaller GPU slices since inference replicas are usually smaller than a training job's minimum GPU count." *(← states WHY the pool split exists, ties back to Chapter 5's topology reasoning and Chapter 6's MIG/time-slicing tradeoffs)*
>
> "For scheduling, I'd lean toward Kubernetes if your team already operates it and inference dominates, since Kubernetes' Service/autoscaling primitives fit inference well; if training job sizes are large and long-running with gang-scheduling needs, Slurm's batch semantics are a more natural fit, or a Kubernetes+Slurm coexistence model where each owns a partition. I would not assume one scheduler is correct without hearing which workload dominates and what your team already knows." *(← comparison on weighted dimensions, explicitly deferring to discovery answers)*
>
> "For validation before commit: I'd want a PoC that runs your actual largest training job's collective benchmark on the training pool's topology, and a load test hitting the inference pool's SLO under realistic concurrency — both under simulated contention from the other pool, since 'shared 128 GPUs' means the interesting failure mode is exactly that contention." *(← ends with concrete PoC definition, not just "let's do a PoC")*

➕ **Extra worked scenario (new) — the whiteboard method applied to Question set G's production GenAI platform, end-to-end:**
> **Prompt:** "Whiteboard a production GenAI platform serving 3 different model sizes to external customers."
> 1. **Discover:** how many distinct models, expected prompt/output token distribution per model, expected concurrency, any data residency requirement (customer data must stay in-region?), required availability (single-region ok, or multi-region failover?), cost sensitivity.
> 2. **Draw left to right:** client → API gateway (auth, per-customer rate limits) → model router (which model does this request need — by explicit selection or classification) → serving runtime (NIM/Triton/vLLM per model, chosen only now, after the shape is clear) → GPU scheduling layer (Kubernetes with device plugin/MIG, sized per Chapter 6's formula) → compute topology (does the largest model need multi-GPU tensor parallelism, hence NVLink locality) → network/storage (model weight storage/loading path, KV-cache/session state if any) → observability (per-model TTFT/ITL dashboards, GPU util/Xid alerting) → lifecycle/CI-CD (model version rollout without downtime — canary a new model version behind the router) → failure domains (one model's GPU pool failing shouldn't take down the other two).
> 3. **Compare options** on 2-3 weighted dimensions relevant to what discovery revealed — e.g., if data residency is strict, self-hosted NIM/Triton beats a hosted API regardless of other factors; state that dimension as the deciding one explicitly.
> 4. **Recommend + validate:** name the recommendation, then state the PoC: load-test each model's serving path independently at expected peak concurrency, and validate the router's failure isolation by deliberately failing one model's pool and confirming the other two are unaffected.
> **Interview-ready line:** "The requirements determine whether this ends up being three separate small deployments or one shared router in front of a multi-model serving layer — I wouldn't draw the router box until I know whether these models actually need to share infrastructure or just share a brand."

## Practice
➕ 5. Whiteboard (on paper or aloud) a platform for a customer who explicitly refuses to answer discovery questions and says "just tell me Kubernetes or Slurm." Practice the sentence that states your assumption explicitly and proceeds anyway, without either refusing to answer or silently guessing.
➕ 6. Take the 128-GPU worked scenario above and redo step 2 (GPU pool strategy) under the constraint that the customer has zero MIG-capable hardware (older GPU generation) — explain what changes in your recommendation and why time-slicing's operational-complexity tradeoff becomes more relevant, not less.
