# Chapter 5 — Autoscaling inference
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Choose signals that represent demand and saturation, then account for model-load time, GPU granularity and cold capacity.

CPU utilization is often weakly correlated with GPU inference demand. Candidate scaling inputs include request concurrency, queue depth/duration, TTFT/latency, requests/s and tokens/s. GPU utilization/memory help determine whether a replica can safely take more load and whether memory is the limiting resource. The correct signal depends on the server and SLO.

## Practitioner lens
**Sagar Desai: hardware metrics and service metrics answer different questions**
A public post contrasts DCGM metrics (hardware behavior/health) with model-server traffic/queue metrics for scaling decisions. Use that split as a diagnostic framework: demand is not the same thing as device busy percentage.

[Public source](https://www.linkedin.com/posts/sagar-s-desai_kubernetes-gpu-nvidia-activity-7413160079337684992-fOZI)

## Worked scenario
**Situation:** GPU utilization sits at 95%, but P95 latency is within SLO and queue depth is near zero.

1. Do not scale solely because device utilization looks high.
2. Check concurrency, queue duration, TTFT/TPOT and error rate to determine service saturation.
3. Check headroom for traffic bursts/failures and memory capacity.
4. If unit economics matter, high utilization with healthy SLO may be desirable.
5. Scale when the chosen saturation/demand signal predicts SLO risk, not on a universal utilization threshold.

**Conclusion:** A busy GPU can be an efficient GPU; saturation is defined relative to service outcomes.

➕ **The autoscaling control loop, made visible (why this is harder than CPU-based HPA):**
```
                    ┌──────────────────────────────────────┐
                    │  Metric source: queue depth, TTFT,     │
                    │  gpu_cache_usage_perc, tokens/s         │
                    └───────────────────┬────────────────────┘
                                        ▼
                    ┌──────────────────────────────────────┐
                    │  HPA/KEDA evaluates against target      │
                    │  (e.g. queue_depth > 10 for 60s)         │
                    └───────────────────┬────────────────────┘
                                        ▼
                    ┌──────────────────────────────────────┐
                    │  Scale decision: +1 replica              │
                    └───────────────────┬────────────────────┘
                                        ▼
     ┌───────────────────────────────────────────────────────────┐
     │  NEW REPLICA LIFECYCLE — the part CPU-based web-app HPA     │
     │  never has to deal with:                                    │
     │  schedule pod → pull multi-GB image → allocate GPU →         │
     │  load model weights into GPU memory (seconds to MINUTES)    │
     │  → engine warmup/compile (TensorRT-LLM especially) →         │
     │  readiness probe passes → THEN it can serve traffic          │
     └───────────────────────────────────────────────────────────┘
                                        ▼
                    By the time the replica is ready, the traffic
                    spike that triggered scaling may already be over
                    (reactive scaling lag) — or still building
                    (predictive/warm-pool scaling needed)
```
This lifecycle box is the mechanism behind Senior Deep Dive 5's line "model load time can be minutes, so predictive capacity, warm pools and staged rollout may outperform reactive HPA alone" — a plain HPA reacting to a metric crossing a threshold has no concept of the multi-minute lead time between "decide to scale" and "capacity actually available."

➕ **Sample KEDA/HPA custom-metrics output during a scale event, annotated:**
```
$ kubectl get hpa llm-server-hpa
NAME             REFERENCE                TARGETS              MINPODS  MAXPODS  REPLICAS
llm-server-hpa   Deployment/llm-server    47/10 (queue_depth)  2        10       6
                                           ↑ current value       ↑ HPA has already scaled
                                             far exceeds target     to 6 trying to catch up —
                                                                     but each new replica takes
                                                                     ~90s to load a 70B model

$ kubectl describe hpa llm-server-hpa | tail -6
  Type     Reason              Age   From                       Message
  ----     ------              ----  ----                       -------
  Normal   SuccessfulRescale   45s   horizontal-pod-autoscaler  New size: 6; reason: external metric
                                                                 queue_depth above target
  Warning  FailedGetExternalMetric 30s horizontal-pod-autoscaler unable to fetch metrics:
                                                                 no data returned from custom metrics API
                                                                 ← metrics pipeline gap = HPA flies blind
```
The `FailedGetExternalMetric` warning is the operational trap: if the Prometheus adapter or metrics pipeline feeding KEDA/HPA has a gap (scrape failure, adapter restart), the autoscaler doesn't fail loudly — it just stalls at the last known replica count, silently, while queue depth may be climbing. Alert on metrics-pipeline health itself, not only on the scaling metric.

➕ **Extra worked scenario — autoscaler thrashing on the wrong metric:**
> **Situation:** An inference service is scaled on GPU utilization (target: scale up above 80%). Traffic is steady, but replica count oscillates between 4 and 8 every few minutes, and P99 latency is inconsistent.
> 1. GPU utilization for a healthy, well-batched LLM server legitimately sits near 90-100% under normal load — per this chapter's own worked scenario, high utilization with healthy SLO is desirable, not a scale trigger.
> 2. Scaling up on GPU% adds a replica, which — because continuous batching immediately spreads existing queued requests across more replicas — drops per-replica utilization below the scale-down threshold within one metric window, triggering scale-down, which then re-concentrates load and triggers scale-up again. This is oscillation caused by the *scaling metric reacting to the scaling action itself*.
> 3. Fix: scale on queue depth/duration or pending-request count instead — these are demand signals that don't mechanically drop the moment you add capacity in the same self-referential way, and add a cooldown/stabilization window regardless of metric choice.
> **Conclusion:** GPU utilization is a *saturation* signal (is this replica full), not a *demand* signal (is there more work than capacity) — using a saturation signal as the scale trigger causes the scaler to fight its own actions.

➕ **Shortcut/mnemonic:** *"Scale on demand-outpacing-capacity (queue depth, pending tokens, TTFT trend), size headroom on saturation (GPU%, KV cache%) — conflating the two causes either thrashing or SLO misses."*

➕ **Interview-ready line:** *"High GPU utilization by itself is not a scaling signal — it tells you a replica is being used efficiently. The scaling signal is whatever tells you demand is outpacing capacity before the SLO breaks, and that's usually queue depth or TTFT trend, not device busy percentage."*

➕ **Chapter drill questions (chapter-specific, additive):**
1. Design an autoscaling policy for a 70B-parameter model with a 90-second cold-start-to-ready time and a P95 TTFT SLO of 2 seconds under bursty traffic. Name the specific signal, the lead-time compensation mechanism, and one metric you'd alert on to detect a stalled metrics pipeline.
2. Explain why `kubectl top pod` and DCGM `DCGM_FI_DEV_GPU_UTIL` can disagree with a model server's own `num_requests_running` count as a scaling input, using the hardware-metric-vs-service-metric framing from the practitioner lens.

# Chapter 6 — Distributed and disaggregated inference
*(original text preserved in full below; additions marked with ➕)*

**Learning outcome:** Understand when multi-GPU/multi-node inference is necessary and what new failure/performance dependencies appear.

Large models may require tensor/model parallelism across GPUs. Very high-throughput systems may distribute work across replicas and specialized stages. Disaggregated architectures can separate prefill and decode pools, which creates explicit network/state-routing requirements. The benefit must outweigh added scheduling, routing, network and failure complexity.

For multi-node inference, capacity planning becomes topology-aware. A replica is not simply N interchangeable GPUs; it may require a specific connected set and communication characteristics.

➕ **Aggregated vs. disaggregated inference, side by side (the diagram this chapter needs):**
```
AGGREGATED (one pool does both phases):
┌───────────────────────────────────────────┐
│  GPU replica: prefill AND decode share      │
│  the same GPU(s) for one sequence            │
│  — simple routing, but prefill's compute      │
│  burst competes with decode's steady drip     │
│  for the same SM/memory-bandwidth budget       │
└───────────────────────────────────────────┘

DISAGGREGATED (separate pools by phase):
┌───────────────┐   KV cache transfer   ┌───────────────┐
│ Prefill pool   │ ─────────────────────▶│  Decode pool   │
│ compute-heavy,  │  (NVLink on-node:     │  memory-bw-     │
│ short-lived per  │   cheap; cross-node:  │  heavy, holds   │
│ request, scales   │   needs RDMA —        │  KV state for   │
│ with prompt len    │   NEW critical path   │  the sequence's │
│                     │   this pool didn't    │  entire life    │
│                     │   have before)         │                │
└───────────────┘                        └───────────────┘
     ▲                                          ▲
     └──────── request router must know ─────────┘
               which pool + which specific
               worker owns this sequence's state
```
The KV cache transfer arrow is the new failure/performance dependency the chapter's text names abstractly ("explicit network/state-routing requirements") — on a single node with NVLink, this transfer is cheap enough to be a rounding error; across nodes, it requires high-bandwidth interconnect (RDMA) and becomes a real latency contributor that must be benchmarked, not assumed away. This is also the exact mechanism Senior Deep Dive 4 (Dynamo) builds routing and KV management around.

➕ **Sample output — proving whether a "replica" actually got the topology it needs:**
```
$ nvidia-smi topo -m
        GPU0  GPU1  GPU2  GPU3  CPU Affinity
GPU0     X    NV12  NV12  NV12  0-31
GPU1    NV12   X    NV12  NV12  0-31
GPU2    NV12  NV12   X    NV12  32-63     ← different NUMA node than GPU0/1
GPU3    NV12  NV12  NV12   X    32-63

$ kubectl get pod tensor-parallel-replica-0 -o jsonpath='{.spec.nodeName}'
gpu-node-14
$ kubectl exec tensor-parallel-replica-0 -- nvidia-smi topo -m | grep NV
        GPU0  GPU1  GPU2  GPU3
GPU0     X    NV12  SYS   SYS      ← GPU0-1 are NVLinked, GPU2-3 are NOT (SYS = PCIe/cross-node path)
```
`SYS` in the topology matrix where you expected `NVx` is the single fastest way to catch "this tensor-parallel replica was scheduled across a slower link than the design assumed" — a scheduler that only checks `nvidia.com/gpu` count as a resource request has no native awareness of this, which is exactly why the chapter says "a replica is not simply N interchangeable GPUs."

➕ **Extra worked scenario — when disaggregation makes things worse:**
> **Situation:** A team disaggregates prefill and decode for a model serving short (200-token) prompts with short (150-token) outputs, expecting the throughput gains described for long-context workloads. Latency gets worse instead.
> 1. For short, roughly-symmetric prompt/output lengths, prefill and decode resource shapes don't diverge much — there's little of the "long prompts stress prefill, long outputs stress decode" imbalance disaggregation is designed to exploit (per Senior Deep Dive 4).
> 2. The KV transfer between pools, which was supposed to be a small fixed cost, becomes a larger fraction of total request time when the sequence itself is short — fixed overhead dominates when there's less work to amortize it over.
> 3. Correct decision: aggregate for this workload shape; reserve disaggregation for workloads where prefill and decode genuinely have different resource profiles (long documents, or very high concurrency with long generations).
> **Conclusion:** "The benefit must outweigh added scheduling, routing, network and failure complexity" is a workload-shape-dependent inequality, not a default — measure both configurations against the actual prompt/output length distribution before committing.

➕ **Shortcut/mnemonic:** *"Disaggregate when prefill and decode want different amounts of GPU — same amount, keep them together; check `nvidia-smi topo -m` before trusting any multi-GPU replica's performance model."*

➕ **Chapter drill questions (chapter-specific, additive):**
1. A tensor-parallel replica spans 4 GPUs, 2 of which show `SYS` instead of `NVx` in `nvidia-smi topo -m`. Explain the latency mechanism by which this degrades every forward pass, not just occasional requests.
2. Name the one architectural property of a workload (beyond raw model size) that should decide whether you disaggregate prefill/decode, and explain why a short-prompt chatbot and a long-document summarizer would reach opposite conclusions using that property.
