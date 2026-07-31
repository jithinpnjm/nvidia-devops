---
title: "Chapter 4 - Serving frameworks and the platform boundary"
slug: "chapter-4-serving-frameworks-and-the-platform-boundary"
sidebar_position: 4
description: "Chapter 4 - Serving frameworks and the platform boundary — AI Workloads and AI Platform Architecture."
source_document: "Volume_05_AI_Workloads_and_AI_Platform_Architecture(2).docx"
---
**Learning outcome:** Place Triton, NIM, vLLM and application gateways in an architecture without treating product names as the design.

A model server owns model execution, batching/scheduling and model-specific runtime behavior. NVIDIA Triton provides a general inference serving platform; NIM packages optimized model inference into standardized service containers/APIs; vLLM is a popular LLM-serving engine. The gateway layer can handle authentication, routing, quotas, request logging, canary/version routing and tenant controls independently of the model server.

Benchmark engines on the target model, precision, GPU and request distribution. Do not choose an engine solely from a public benchmark with a different workload.

```text
# Example Kubernetes resource boundary (illustrative)
resources:
  requests:
    nvidia.com/gpu: 1
    cpu: "4"
    memory: 16Gi
  limits:
    nvidia.com/gpu: 1
    memory: 24Gi
```

➕ **The platform-boundary diagram (what "product names are not the design" means in practice):**
```
 Client
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Gateway layer (independent of model server choice)          │
│ authn, routing, quotas, request logging, canary/version      │
│ routing, tenant controls, rate limiting                      │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Model server (owns execution, batching, scheduling)          │
│  — could be Triton, NIM (packages vLLM behind a proxy),       │
│    raw vLLM, TensorRT-LLM, SGLang — the gateway above          │
│    should not need to know or care which one                  │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
                     GPU(s) — the resource
                     boundary K8s actually
                     enforces (see manifest)
```
The architectural point: swapping the model server (e.g. vLLM → TensorRT-LLM for a latency win) should not require rewriting the gateway's auth/quota/routing logic, and swapping the gateway (e.g. adding a new API management product) should not require touching model execution. Coupling these two layers is the most common "platform boundary" mistake — e.g. baking tenant quota logic into a custom Triton backend instead of the gateway.

➕ **Sample output — proving the resource boundary is real, not just YAML:**
```
$ kubectl describe pod llm-server-0 | grep -A4 "Limits\|Requests"
    Limits:
      memory:  24Gi
    Requests:
      cpu:             4
      memory:          16Gi
      nvidia.com/gpu:  1

$ kubectl exec llm-server-0 -- nvidia-smi --query-gpu=memory.used,memory.total --format=csv
memory.used [MiB], memory.total [MiB]
71234 MiB, 81920 MiB          ← 71GB used of 80GB — note: nvidia.com/gpu:1 gives WHOLE-GPU
                                 access, K8s has no native concept of fractional GPU memory
                                 limits here — that enforcement is the model server's job, or
                                 requires MIG/time-slicing configured outside this manifest
```
This is the gap worth naming explicitly: the Kubernetes `limits.memory: 24Gi` governs *host* memory, not GPU memory — `nvidia.com/gpu: 1` is a whole-device allocation unit with no granularity below one GPU unless MIG partitioning or a fractional-GPU scheduler (Run:ai, per Senior Deep Dive 5) is layered in. A candidate who assumes `limits` constrains GPU memory the way it constrains CPU memory will misdiagnose GPU OOM as a Kubernetes scheduling bug.

➕ **Extra worked scenario — benchmarking trap:**
> **Situation:** A team picks vLLM over TensorRT-LLM based on a public benchmark showing vLLM 20% faster, then deploys and measures 30% slower throughput than the benchmark reported.
> 1. Check whether the public benchmark used the same model size/quantization, GPU SKU, and — critically — the same request distribution (concurrency level, input/output length mix) as production traffic.
> 2. A benchmark run at low concurrency with short prompts favors different engine internals (scheduling overhead dominates) than production traffic at high concurrency with long, variable-length prompts (batching/scheduling efficiency dominates).
> 3. Re-run the benchmark in-house with production-representative request shape before trusting any cross-engine comparison — this is exactly what the chapter's "do not choose an engine solely from a public benchmark with a different workload" line is warning against, made concrete.
> **Conclusion:** Engine benchmarks are workload-shape-specific measurements, not universal rankings — re-validate on your own model, precision, GPU and traffic pattern every time.

➕ **Diagram: why the public benchmark and production diverged**
```
Public benchmark shape:                Production traffic shape:
  concurrency: low (1-4)                 concurrency: high (64+)
  prompts: short, uniform                prompts: long, variable length
  ┌──┐┌──┐┌──┐                           ┌────────────┐┌──┐┌───────┐
  │Q1││Q2││Q3│ → scheduling overhead      │  Q1 (long) ││Q2│Q3(long)│
  └──┘└──┘└──┘   dominates result           └────────────┘└──┘└───────┘
                                          → batching/scheduling efficiency
                                            dominates result instead

  Engine A wins here  ──/──  does not imply  ──/──  Engine A wins here
  (low concurrency,                              (high concurrency,
   short prompt regime)                          mixed-length regime)
```
Two different bottlenecks are being measured under two different request shapes — a ranking under one shape does not transfer to the other, which is exactly why the in-house re-benchmark step is non-optional.

➕ **Diagram: engine/gateway swap independence (the payoff of the platform boundary)**
```
Swap the model server only:            Swap the gateway only:
 Gateway (unchanged) ──▶ vLLM           Gateway A ──▶ Model server (unchanged)
 Gateway (unchanged) ──▶ TensorRT-LLM      swap to
                          (latency win,  Gateway B ──▶ Model server (unchanged)
                          no gateway        (new API mgmt product,
                          code touched)     no execution code touched)
```
If either swap forces a change on the other side of the boundary, the two layers were coupled — the specific bug pattern to watch for is tenant-quota or batching logic accidentally implemented inside a custom backend instead of the gateway.

➕ **Shortcut/mnemonic:** *"Gateway decides who and how much; model server decides how fast and how batched; GPU is the only resource K8s actually fences — everything above that is software policy."*

➕ **Chapter drill questions (chapter-specific, additive):**
1. A tenant is granted `nvidia.com/gpu: 1` with no other GPU isolation. Name two concrete failure modes another tenant's workload could cause on the same physical GPU that Kubernetes resource limits would not prevent.
2. Design the boundary: which of the following belongs in the gateway vs. the model server — per-tenant token-per-minute quota, continuous batching admission control, canary 5% traffic split to a new model version, KV cache eviction policy? Justify each placement in one sentence.
