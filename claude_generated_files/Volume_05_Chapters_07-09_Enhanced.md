# Chapter 7 — State, caches and RAG dependencies
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Classify durable state, request state, model artifacts, vector data and caches so replicas can scale safely.

Keep application compute stateless when practical, but do not confuse "stateless service" with "no state in the system." Conversation history, vector indexes, model artifacts, prompt/result caches and KV-cache have different durability/locality requirements. Make each explicit.

## Practitioner lens
**Sagar Desai: decouple conversational state from Pod lifetime**
A public architecture example argues against relying on local in-process history/sticky sessions for horizontally scaled Kubernetes LLM services. The general lesson is to externalize durable session state while treating local caches as disposable acceleration.

[Public source](https://www.linkedin.com/posts/sagar-s-desai_systemdesign-llm-kubernetes-activity-7414861928189370368-hiHp)

| State | Typical property |
|---|---|
| Model artifact | versioned, large, read-mostly; startup distribution matters |
| Conversation/session | durable across replica changes; low-latency access |
| Vector index | persistent/search optimized; update/query behavior |
| KV cache | request/runtime-local performance state; large GPU memory footprint |
| Prompt/result cache | optional performance/cost optimization with invalidation/privacy concerns |

➕ **The state classification decision tree (durability × locality, the two axes the table implies but doesn't draw):**
```
                        Does losing this state on replica restart
                        break correctness (not just performance)?
                                    │
                     ┌───────────────┴───────────────┐
                    YES                              NO
                     │                                │
        Must be externalized/durable         Is it still valid/useful if
        (conversation/session, vector          copied to a NEW replica?
        index, model artifact registry)                  │
                                          ┌─────────────────┴─────────────────┐
                                         YES                                  NO
                                          │                                    │
                                Prompt/result cache                   KV cache — strictly
                                (shared cache tier,                    tied to THIS replica's
                                e.g. Redis — safe to                   GPU memory and THIS
                                miss, just costs                       request's lifetime;
                                recompute)                             never migrates, never
                                                                        shared across replicas
```
The KV cache leaf is the one most likely to be misclassified by someone applying general "externalize state" instincts from web-service architecture — unlike conversation history, KV cache is not a candidate for externalization to Redis/a database; it lives in GPU HBM for the duration of one request/session and is deliberately non-durable. Prefix caching (Senior Deep Dive 2) reuses it *within* a serving tier via routing, not by copying it out to a shared store.

➕ **Sample output — a session-affinity bug this classification prevents:**
```
$ kubectl get pods -l app=llm-chat -o wide
NAME              READY   STATUS    NODE
llm-chat-7f9c-0   1/1     Running   gpu-node-3
llm-chat-7f9c-1   1/1     Running   gpu-node-7

$ curl -s https://chat.internal/v1/conversations/abc123/history
{"error": "conversation not found"}     ← user's 2nd message hit a DIFFERENT replica than their 1st

$ kubectl logs llm-chat-7f9c-1 | grep abc123
(no output — this replica never saw this conversation ID)
```
This is the exact failure Sagar Desai's practitioner lens warns against: conversation history held only in the serving replica's process memory disappears the instant the load balancer routes a follow-up message to a different Pod — which it will, under any non-sticky load balancing, and even sticky sessions break on replica restart/rescale. The fix is externalizing conversation state to a shared store (Redis, a database) keyed by conversation ID, looked up by whichever replica happens to handle the request — not making replicas sticky, which just delays the same failure to the next scale-down event.

➕ **Extra worked scenario — prompt cache invalidation/privacy interaction:**
> **Situation:** A team adds a prompt/result cache keyed on exact prompt text to cut inference cost on repeated queries. Weeks later, a user reports seeing what looks like part of another user's earlier conversation in a response.
> 1. Root cause candidates: the cache key didn't include tenant/user scoping (two different users produced the same prompt text and got each other's cached completion), or the cache TTL/invalidation didn't account for the underlying model or system prompt changing, serving a stale answer.
> 2. This is the "invalidation/privacy concerns" the table's last row names in five words — the concrete failure is cross-tenant data leakage through an under-scoped cache key, which is a security incident, not just a correctness bug.
> 3. Fix: cache key must include every dimension that legitimately changes the answer's validity or the isolation boundary — tenant ID, model version, system prompt hash — at minimum. Treat the prompt/result cache as being inside the tenancy boundary discussed in Chapter 8, not outside it.
> **Conclusion:** A performance optimization (prompt caching) that ignores the tenancy/durability classification from this chapter turns into a security defect — the two chapters are not independent in practice.

➕ **Shortcut/mnemonic:** *"KV cache never leaves the GPU; session state never lives only in the Pod; model artifacts are read-mostly and versioned; prompt caches must be scoped as tightly as the tenancy boundary they sit inside."*

# Chapter 8 — Security and tenancy for AI platforms
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Apply familiar platform security controls to models, prompts, data, artifacts and shared GPUs.

AI infrastructure inherits cloud-native security requirements — identity, RBAC, network segmentation, secrets, image provenance, runtime hardening — and adds model/data supply chain concerns. Ask who can deploy models, pull artifacts, access prompts/data, call inference endpoints, use expensive GPU quota and read logs containing sensitive content.

GPU sharing also becomes a tenancy decision: cost-efficient packing is not enough if isolation requirements demand dedicated resources or hardware partitioning. Logging/telemetry must avoid leaking prompts, tokens or secrets by default.

➕ **The AI-platform security surface, mapped onto familiar cloud-native controls (the table this chapter implies but doesn't draw):**
```
Cloud-native control          AI-platform-specific extension
──────────────────────        ────────────────────────────────────────
Identity/RBAC                 who can pull a model artifact, call inference,
                               burn GPU-hours (a new, expensive quota dimension)
Network segmentation          isolate prefill/decode/KV-transfer traffic (Ch6)
                               between tenants sharing a fabric
Secrets management             API keys AND now "the prompt itself" — prompts can
                               contain PII/secrets pasted by users, unlike typical
                               service-to-service payloads
Image provenance                model artifact provenance — was this checkpoint
                               tampered with, does it match a signed/known hash
Runtime hardening               GPU-level isolation: process-level (no isolation),
                               MIG (hardware-partitioned), time-slicing (software-
                               scheduled, no memory isolation) — different guarantees
```
➕ **GPU sharing modes, compared for the isolation question the chapter poses directly:**
| Mode | Isolation | Noisy-neighbor risk | When required |
|---|---|---|---|
| Whole-GPU per tenant | Full (separate device) | None | Regulated/hard multi-tenant isolation |
| MIG (Multi-Instance GPU) | Hardware-partitioned (separate SM/memory slices) | Low — memory faults contained | Multiple trusted-but-separate workloads on one physical GPU |
| Time-slicing | None — same SM/memory, scheduled in time | High — one tenant's burst steals cycles from another | Best-effort, cost-sensitive, non-regulated workloads only |

➕ **Sample output — a noisy-neighbor incident caught via DCGM, not application metrics:**
```
$ dcgmi dmon -e 203,204,1002 -c 5
#Entity   DBE     SBE     GPUUTIL
GPU 0     0       0       98              ← tenant A's workload, expected high util
GPU 0     0       0       97
GPU 0     0       0       99
                                            (this is a time-sliced GPU — tenant B is on the SAME device)

$ kubectl logs tenant-b-inference-0 | tail -3
WARN: request latency 4200ms (SLO: 500ms) — GPU allocated but compute starved
```
Tenant B's pod has a `nvidia.com/gpu: 1` request satisfied by Kubernetes (scheduling succeeded, pod is Running) — but on a time-sliced physical GPU, "allocated" does not mean "guaranteed compute share." Tenant A's 98% utilization is silently starving Tenant B, and nothing in Kubernetes' own resource accounting will surface this — it requires DCGM-level, per-process GPU telemetry to prove, which is exactly why the chapter says isolation requirements may demand dedicated resources or hardware partitioning instead of time-slicing, despite the latter's better cost-efficiency.

➕ **Extra worked scenario — the log-leakage angle:**
> **Situation:** A platform team enables verbose request logging for debugging a latency issue in an LLM gateway. Three weeks later, a security review finds full user prompts — including some containing pasted API keys and one containing a customer's SSN — sitting in a log aggregation system with broad internal read access.
> 1. Root cause: "verbose logging" for an LLM gateway defaults to logging the full request/response body, which for this workload class *is* the sensitive data — unlike a typical REST API where the body is usually structured/non-sensitive metadata.
> 2. This is the concrete form of "logging/telemetry must avoid leaking prompts, tokens or secrets by default" — the failure mode is not exotic; it's the default behavior of a debugging feature nobody scoped for this workload's data sensitivity.
> 3. Fix: redact/exclude prompt and completion bodies from default log verbosity; if full-content logging is needed for debugging, gate it behind a narrowly-scoped, audited, time-boxed access path — treat it like credential logging, not like general request tracing.
> **Conclusion:** For AI platforms, "the payload" and "the sensitive data" are frequently the same bytes — security review of logging defaults needs to happen before the debugging feature ships, not after an incident.

➕ **Shortcut/mnemonic:** *"GPU-hours are a quota dimension like API rate limits, but ten times more expensive per unit — treat GPU quota abuse as a cost-security issue, not just a fairness issue. And when in doubt about isolation: time-slicing shares cycles, MIG shares hardware but partitions it, whole-GPU shares nothing."*

➕ **Interview-ready line:** *"Time-slicing and MIG both let you multi-tenant a GPU, but they give fundamentally different isolation guarantees — time-slicing is a scheduling policy with no memory/fault isolation, MIG is hardware-partitioned; the choice between them is a tenancy risk decision, not just a packing-efficiency one."*

# Chapter 9 — Performance and cost engineering
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Translate benchmarks into capacity, cost per unit work and headroom under real request distributions.

For inference, useful economic units include cost per 1K/1M tokens, cost per request at an SLO, or throughput per GPU. For training, GPU-hours and time-to-train matter, but failed/restarted jobs and checkpoint overhead can dominate cost. Benchmark warm and cold behavior, typical and peak request distributions, and failure headroom.

## Worked scenario
**Situation:** A cheaper GPU produces 60% of the throughput of a premium GPU at 45% of the hourly price.

1. Normalize by the actual outcome: tokens/s at required latency, not peak FLOPS.
2. Include replica count required for peak demand and availability headroom.
3. Include model fit, precision support, power/operational constraints and startup time.
4. Compute cost per unit work under expected utilization, then sensitivity-test traffic changes.
5. Recommend the cheaper device only if operational and SLO constraints remain acceptable.

**Conclusion:** Architecture cost decisions require normalized workload outcomes, not list price comparisons.

➕ **The cost-per-token arithmetic, worked all the way through (the calculation the worked scenario describes but doesn't compute):**
```
Premium GPU:  $4.00/hr,  100 tok/s at SLO-compliant batch config
Cheaper GPU:  $1.80/hr,   60 tok/s at SLO-compliant batch config   (60% throughput, 45% price)

Cost per 1M tokens:
Premium: ($4.00/hr ÷ 3600s) ÷ 100 tok/s × 1,000,000 tokens = $11.11 / 1M tokens
Cheaper: ($1.80/hr ÷ 3600s) ÷  60 tok/s × 1,000,000 tokens = $8.33  / 1M tokens
                                                              ↑ cheaper GPU wins on $/token
                                                                DESPITE lower absolute throughput —
                                                                this is the number the "45% of the
                                                                price, 60% of the throughput" headline
                                                                obscures until you divide them

But: replicas needed for the same peak tokens/s target
Premium: peak 1000 tok/s ÷ 100 tok/s/replica = 10 replicas × $4.00/hr = $40/hr fleet cost
Cheaper: peak 1000 tok/s ÷  60 tok/s/replica ≈ 17 replicas × $1.80/hr = $30.60/hr fleet cost
                                                                ↑ still cheaper — but now also check:
                                                                17 replicas vs 10 means MORE GPU-count-
                                                                bound risk (scheduling, node capacity,
                                                                MIG/quota limits) and more model-load-time
                                                                aggregate exposure during scale events
```
The headline "60% throughput at 45% price" sounds like it should be a wash — dividing them out shows the cheaper GPU is actually ~25% cheaper per token, which is the number worth presenting, along with the replica-count operational tradeoff the raw $/token figure hides.

➕ **Sample output — the training-cost side, where "failed/restarted jobs... can dominate cost" becomes a real invoice line:**
```
$ cat training_run_ledger.csv | awk -F, '{sum+=$2} END {print sum" GPU-hours total"}'
14200 GPU-hours total

$ grep -c "job_restart" training_events.log
6

$ awk -F, '$3=="restart_recompute" {sum+=$2} END {print sum" GPU-hours lost to restart recompute"}' training_run_ledger.csv
3100 GPU-hours lost to restart recompute
```
3,100 of 14,200 GPU-hours (≈22%) went to recomputing work lost across 6 restarts — at any GPU-hour price, that's a 22% cost overrun invisible in a "time-to-train" headline number that only counts wall-clock, not wasted compute. This is the concrete form of Senior Deep Dive 1's "measure application throughput and storage behavior together" and Chapter 2's checkpoint-storm scenario — checkpoint frequency/restore time objective is a cost lever, not just a reliability lever.

➕ **Extra worked scenario — warm vs. cold benchmark trap:**
> **Situation:** A benchmark reports 1200 tok/s aggregate throughput for a new serving configuration, measured over a 10-minute steady-state run after a 5-minute warmup that was excluded from the reported numbers. Production deploys the same configuration and observes P99 latency SLA violations during every rolling deployment.
> 1. The excluded "warmup" period is not benchmark noise to discard — it's real production behavior every time a replica starts: model load, CUDA graph capture/compilation (TensorRT-LLM especially), and cache warming all happen there, and users hit that replica during exactly this window in a rolling deployment.
> 2. Benchmark cold-start behavior explicitly and separately from steady-state throughput — the chapter's line "benchmark warm and cold behavior" is the direct fix, and it needs its own SLO treatment (e.g. exclude new replicas from the load balancer until a readiness probe confirms warm state, not just process-up state).
> **Conclusion:** A throughput number measured only in steady state is a different claim from "this configuration meets SLO in production," where cold starts happen continuously during every deploy, scale event, and node replacement.

➕ **Shortcut/mnemonic:** *"Normalize to $/unit-of-real-work (token, request-at-SLO), never to $/hour or $/FLOP alone — and always price in replica count, restart overhead, and cold-start exposure, not just steady-state throughput."*

➕ **Interview-ready line:** *"A GPU that's cheaper per hour isn't necessarily cheaper per token, and a GPU that's cheaper per token isn't automatically the right choice once you price in the replica count needed for peak demand and the operational risk of running more, smaller units."*

## Practice
1. Draw a training data/checkpoint/collective path and list observability at each boundary.
2. For an LLM service, define TTFT, queue duration, tokens/s and GPU memory, then explain how they interact.
3. Design autoscaling signals for batch inference versus interactive inference.
4. Classify five types of AI platform state by durability and locality.

➕ 5. Take the cost-per-token worked calculation above and add a third variable: the cheaper GPU has a 90-second cold start vs. the premium GPU's 20-second cold start. Recompute the effective fleet cost assuming traffic requires 3 scale-up events per day, and state at what cold-start-frequency threshold the cheaper GPU's per-token advantage gets eroded by scale-event overhead.
➕ 6. A training job's checkpoint ledger shows 22% of GPU-hours lost to restart recompute, as in the sample output above. Propose two concrete infrastructure changes (not "have fewer bugs") that would reduce this percentage, and state the tradeoff each introduces.

## Targeted references

[NVIDIA Developer: Deploying Generative AI in Production with NIM](https://www.youtube.com/watch?v=bpOvayHifNQ) - Short visual overview of NIM, Kubernetes scaling, metrics and production deployment.

[NVIDIA Kubernetes technical blog](https://developer.nvidia.com/blog/tag/kubernetes/) - Current posts on disaggregated inference, Dynamo, autoscaling and AI platform operations.
