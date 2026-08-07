---
title: "Chapter 11 — Observability for Inference at Scale"
slug: chapter-11-observability-for-inference-at-scale
sidebar_position: 11
description: "Training and inference are different workloads with different observability needs. Learn to monitor model serving at scale."
tags: [gpu, observability, inference, serving, operations]
---

# Chapter 11 — Observability for Inference at Scale

Inference has different characteristics than training: many small requests instead of few large jobs, latency requirements instead of throughput requirements, and cost sensitivity instead of performance-only focus. This chapter covers observability patterns specific to inference.

| Chapter metadata | Value |
|---|---|
| Volume | 16 — GPU Observability and Operational Health |
| Difficulty | Intermediate |
| Estimated reading time | 40 minutes |
| Primary audience | ML Ops, platform engineers, serving infrastructure teams |
| Core question | How do you know if your model server is meeting SLAs while keeping costs reasonable? |

## Learning Objectives

You will be able to:
- Monitor inference latency and throughput under load
- Detect GPU starvation (too many requests for GPU capacity)
- Measure cost per inference request
- Balance quality (precision, batch size) with cost
- Identify inference bottlenecks (model loading, queuing, communication)

## Inference Workload Characteristics

| Training | Inference |
|---|---|
| Few large jobs, long duration | Many small requests, short duration |
| Throughput-optimized (samples/sec) | Latency-optimized (ms/request) |
| Batch size: 128-2048 | Batch size: 1-64 |
| GPU utilization: 80-95% (steady) | GPU utilization: 10-60% (bursty) |
| Observable per-job | Observable per-request or per-server |

## Inference Metrics and SLIs

**Core SLIs for inference:**

| SLI | Definition | Measurement | SLO |
|---|---|---|---|
| **P50 Latency** | Median request latency | Histogram bucket at 50th percentile | < 100 ms |
| **P99 Latency** | 99th percentile latency | Histogram bucket at 99th percentile | < 500 ms |
| **Throughput** | Requests per GPU per second | count(completed requests) / time | 50-200 req/s (model-dependent) |
| **Error Rate** | % requests that error out | count(errors) / count(total) | < 0.1% |
| **Model Accuracy** | % predictions that are correct | count(correct) / count(predictions) | > 99% (model-dependent) |

## Inference Server Observability

**Typical inference stack:**

```
Client → Load Balancer → Inference Server (Triton/vLLM/TensorRT) → GPU
```

**Metrics to collect at each layer:**

```yaml
Load Balancer:
  - Requests/sec
  - Error rate (4xx, 5xx)
  - Backend health (is inference server alive?)

Inference Server:
  - Queue depth (requests waiting for GPU)
  - Model loading time (cold start latency)
  - Batch size (how many requests processed together)
  - GPU memory utilization (model + KV cache for LLMs)
  - GPU utilization (% time kernels running)

GPU (via DCGM):
  - Temperature, power, clocks (same as training)
  - Memory used (is model + batch data fitting?)
  - ECC errors
```

### Real Example: Monitoring LLM Inference

**Setup: vLLM server with Prometheus metrics**

```bash
# Start inference server with Prometheus endpoint
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-7b-hf \
  --gpu-memory-utilization 0.9 \
  --port 8000 \
  --tensor-parallel-size 2 \
  --enable-metrics

# Prometheus scrapes metrics at :8000/metrics
```

**Real metrics from running LLM server:**

```text
# HELP vllm_request_prompt_tokens_total Total number of prompt tokens processed.
# TYPE vllm_request_prompt_tokens_total counter
vllm_request_prompt_tokens_total 45230

# HELP vllm_request_total Total number of requests.
vllm_request_total 1024

# HELP vllm_request_success Number of requests that finished without error.
vllm_request_success 1022

# HELP vllm_request_latency_seconds Request latency in seconds.
vllm_request_latency_seconds_bucket{le="0.1"} 450  (450 requests < 100ms)
vllm_request_latency_seconds_bucket{le="0.5"} 950  (950 requests < 500ms)
vllm_request_latency_seconds_bucket{le="1.0"} 1000 (all requests < 1s)

# HELP vllm_gpu_cache_usage_perc GPU cache (KV cache for LLM) usage percentage.
vllm_gpu_cache_usage_perc 87

# HELP vllm_batch_tokens_per_second Throughput of the model in terms of tokens/sec.
vllm_batch_tokens_per_second 2400

# HELP gpu_process_inference_requests_total Requests being processed on GPU right now
gpu_process_inference_requests_total 8  (8 requests currently on GPU)
```

**Interpretation:**

| Metric | Value | Meaning |
|---|---|---|
| Total requests | 1024 | Good volume |
| Success rate | 99.8% (1022/1024) | Excellent (99.8%) |
| P50 latency | < 100ms | Request completed in 100ms or less (median) |
| P99 latency | < 1s | Even worst-case requests < 1 second |
| Cache usage | 87% | KV cache is 87% full; headroom shrinking |
| Throughput | 2400 tokens/sec | Good utilization of GPU |
| Queue depth | 8 requests | GPU can handle 8 concurrent requests |

## Inference Bottleneck Diagnosis

**Framework: Where is latency coming from?**

```
Total request latency (e.g., 250ms) = Queue Wait + Model Load + GPU Execution + Post-Process

Queue Wait: Time request sits in queue (0-100ms)
Model Load: Time to load model weights (1-5ms per request if cold-started, 0ms if cached)
GPU Execution: Time to run inference (50-200ms depending on model size)
Post-Process: Output decoding, response formatting (5-20ms)
```

**Real latency breakdown for LLM inference:**

```
P50 request latency: 180ms
├─ Queue wait: 30ms (GPU was busy)
├─ Model load: 0ms (model already in GPU memory)
├─ GPU execution: 140ms (forward pass through 7B model)
└─ Post-process: 10ms (tokenize response)

P99 request latency: 450ms
├─ Queue wait: 200ms (GPU was saturated with high-priority requests)
├─ Model load: 0ms
├─ GPU execution: 240ms (longer sequences have longer generation time)
└─ Post-process: 10ms
```

**Bottleneck:** Queue wait on P99 (200ms) is significant. GPU is becoming saturated. Options:
1. Scale to more GPUs
2. Use lower precision (FP16 instead of FP32) to fit more in batch
3. Use speculative decoding to reduce generation time
4. Accept longer latency (adjust SLO)

## Inference Cost Optimization

**Cost per request = (GPU cost/month ÷ requests/month)**

Example calculation:

```
GPU: NVIDIA A100-80GB at $3.06/hour on cloud
Operating hours: 730 hours/month
Cost: 730 × $3.06 = $2,234/month

Request rate: 100 req/sec average
Requests/month: 100 req/sec × 86,400 sec/day × 30 days = 259.2 M requests

Cost per request: $2,234 / 259.2M = $0.0086 per request
```

**How to reduce cost per request:**

1. **Increase utilization** — run inference server at higher batch sizes
   - Cost impact: Lower (same GPU cost, more requests)
   - Latency impact: Higher (larger batches = longer queues)

2. **Use lower precision** — FP16 or INT8 instead of FP32
   - Cost impact: Lower (less memory, can fit larger models or batches)
   - Latency impact: Negligible (often faster)
   - Quality impact: Usually < 1% accuracy loss

3. **Model optimization** — distill, prune, or quantize
   - Cost impact: Much lower (smaller model = less GPU memory = more concurrent requests)
   - Quality impact: Depends on optimization; can be 0-5% accuracy loss

4. **Multi-model sharing** — run multiple models on one GPU via MIG
   - Cost impact: Lower (amortize GPU cost across multiple model instances)
   - Complexity: Higher (requires scheduling, context switching)

## Key Takeaways

1. **Inference SLOs are latency-based, not throughput-based** — P99 latency matters more than average.
2. **Queue wait is often the largest latency component** — scaling to more GPUs or batching larger can help.
3. **Cost per request is the real metric** — optimize utilization, precision, and model efficiency together.
4. **Precision/cost tradeoffs are steep** — FP16 can reduce cost by 30-40% with minimal quality loss.
5. **Monitor at the request level, not job level** — inference is thousands of small jobs, not one big one.

## Cross-References

- Chapter 03: Core GPU metrics (apply same principles to inference workloads)
- Volume 12: Inference systems and serving architecture
- **Next:** Chapter 12 covers incident response and advanced diagnostics
