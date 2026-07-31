---
title: "Chapter 2 - Architecture from data and control paths"
slug: "chapter-2-architecture-from-data-and-control-paths"
sidebar_position: 2
description: "Chapter 2 - Architecture from data and control paths — Senior Solutions Architecture Practice."
source_document: "Volume_08_Senior_Solutions_Architecture_Practice(2).docx"
---
> Learning outcome Draw what moves, what controls it, where state lives and where failure can occur before choosing products.

For an AI platform, draw at least: user/API request path, model/artifact path, training dataset/checkpoint path, GPU scheduling/control path, observability path and identity/security boundaries. This exposes dependencies that a product-box diagram hides.

A control plane tells systems what should happen; a data plane carries workload traffic/data. Kubernetes API/controller behavior is control plane; inference requests and model data are data plane. Keeping this distinction clear helps with security, scaling and failure-domain reasoning.

---

➕ **The six paths, drawn as one diagram (the "draw at least" instruction, made literal):**
```
                         ┌─────────────────────────┐
                         │   Identity/Security      │  ← boundary around EVERYTHING below
                         │   (who is allowed where)  │
                         └───────────┬─────────────┘
                                     │
   ┌───────────────┐   request   ┌──▼──────────┐   inference   ┌────────────┐
   │ User / client  │───────────▶│  API/Ingress │──────────────▶│  Serving   │
   └───────────────┘  (data plane)└──────────────┘   (data plane)│  pods/GPU  │
                                                                  └─────┬──────┘
                                                                        │ model weights
                                                              ┌─────────▼─────────┐
                                                              │ Model/artifact path│
                                                              │ (registry → node)  │
                                                              └─────────┬─────────┘
                                                                        │
   ┌────────────────────┐  checkpoints/data  ┌──────────────────────┐  │
   │ Training data path  │────────────────────▶│  Storage (dataset/  │◀─┘
   └────────────────────┘                       │  checkpoint tier)  │
                                                 └──────────────────────┘

   ┌────────────────────────────┐  schedule/place  ┌───────────────────┐
   │ GPU scheduling/control path │─────────────────▶│  K8s API / Slurm  │  (CONTROL plane —
   │ (kube-scheduler, device     │                   │  controller       │   says what SHOULD
   │  plugin, Slurm controller)  │                   └───────────────────┘   happen)
   └────────────────────────────┘

   ┌────────────────────────────────────────────────────────────────────┐
   │  Observability path — taps EVERY box above (metrics/logs/traces)   │
   └────────────────────────────────────────────────────────────────────┘
```
Every arrow above is a place a product-box diagram ("Kubernetes + GPU Operator + Triton") would hide — and each one is a distinct failure domain: the model-artifact path failing looks completely different from the request path failing, even though both present as "inference is down."

➕ **Control plane vs data plane — the one-line test to apply live, with GPU-specific examples:**
*"If it decides/schedules/declares desired state, it's control plane. If it carries the bytes the workload actually needs, it's data plane."*
| Component | Plane | Why |
|---|---|---|
| kube-apiserver, etcd | Control | stores/serves desired state, not workload bytes |
| kube-scheduler, Slurm controller | Control | decides placement, doesn't carry traffic |
| GPU device plugin (advertises GPU capacity) | Control | tells the scheduler what's available |
| Inference request (prompt → tokens) | Data | the actual workload payload |
| NCCL/RoCE collective traffic between GPUs during training | Data | the actual workload payload, even though it's "infrastructure-looking" traffic |
| Checkpoint write to storage | Data | it's data movement, even though it's "operational" |
| GPU Operator's driver installation step | Control | configures the host so data-plane work *can* happen later |

➕ **The trap this table exists to prevent:** RoCE/NCCL traffic *looks* like "infrastructure" because it's GPU-to-GPU and invisible to the application, but it is data plane — it's the workload's actual bytes moving. Engineers sometimes miscategorize it as control plane because it's not "user-facing," and then apply the wrong failure-isolation reasoning (e.g. assuming a control-plane outage tolerance applies to a fabric outage, when actually a fabric problem stalls the running job immediately — there's no "eventually consistent" grace period for a collective operation waiting on a stalled NCCL ring).

➕ **Worked scenario — using the six-path diagram to localize a real incident:**
> **Situation:** "Inference is returning 503s intermittently" is reported. A product-box view would just say "check the inference service."
> 1. Walk the request path first: API/ingress healthy? (data plane, user-facing) — yes, 200s reach the ingress.
> 2. Walk the model/artifact path: are pods actually loaded with the model, or stuck in an image/weight pull loop? — found: 2 of 8 replicas are stuck pulling a model artifact from a registry with intermittent throttling.
> 3. Walk the control path: is the scheduler even trying to keep replicas at desired count? — yes, it correctly keeps rescheduling the stuck pods, which is *why* the 503s are intermittent rather than total (some replicas serve fine, others cycle).
> 4. Conclusion: this is an artifact-path failure disguised as an inference-serving failure. Fixing "the inference service" (restarting pods, tuning autoscaler) would have been the wrong lever — the fix is registry reliability/caching, a completely different team and completely different mitigation (e.g. a local model-artifact cache/mirror).
> **Interview-ready line:** "I separate the six paths before I start debugging, because the same 503 symptom has a different owner and a different fix depending on which path actually failed."

➕ **Extra example — why "control plane down" and "data plane down" require opposite triage instincts:**
> If the Kubernetes control plane (API server/etcd) is unreachable, *already-running* inference pods usually keep serving traffic fine for a while — kubelets and existing iptables/service rules don't need the API server to keep forwarding traffic that's already configured. The danger is anything that needs a *new* decision: no new scheduling, no scaling, no self-healing on node failure. Conversely, if the data plane fails (e.g. the fabric between GPUs during a training job, or the ingress path for inference), the control plane can be perfectly healthy and reporting everything as "desired == actual" while the workload itself is dead in the water. **The one-liner:** control-plane outages degrade the platform's ability to *change*; data-plane outages degrade the platform's ability to *do work* — and a healthy control plane can coexist with a completely stalled workload.

## Practice
➕ 1. Draw the six-path diagram from memory for a training job (not inference) — specifically identify what the "user/API request path" even means for a batch training workload (hint: it's the job submission API, not a per-request path — this distinction is worth stating explicitly).
➕ 2. Take an incident you've handled (or the 503 scenario above) and classify each observed symptom by which of the six paths it belongs to before proposing a fix. State explicitly which path you initially assumed was at fault, and whether that assumption turned out correct.
