# Chapter 11: System Design — Inference Serving

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Expert |
| Estimated reading time | 90 minutes |
| Primary audience | Staff/principal engineers, platform architects |
| Core question | How do you design a multi-tenant inference serving system at scale? |

## Interview Question: Design a Multi-Tenant LLM Inference Service

**Constraints (given in interview):**

- Serve multiple LLM models (7B, 13B, 70B parameters)
- 50,000 concurrent users across 8 hours peak
- SLO: p99 latency < 500ms
- SLO: uptime 99.9%
- Cost: < $5/1M tokens
- Multi-tenant: customers share infrastructure, but isolation required
- Variable traffic: 5× difference between peak and off-peak

**Walkthrough (15-20 minute answer):**

### Phase 1: Understand Requirements (3 minutes)

**Key clarifications:**

1. **Token cost model:** Incoming + outgoing tokens both count toward billing?
   - Yes → affects optimization (shorter responses lower cost)

2. **Model updates:** Do models get updated? How often?
   - Monthly → can pre-optimize, shard across nodes
   - Weekly → need fast update mechanism

3. **Batch size:** Can we batch requests or must each be independent?
   - Yes, within reason → enables token-per-latency optimization

**My assumptions:**

- Tokens = (prompt + completion) both counted
- Monthly updates
- Batching allowed up to 32 requests per inference
- Peak: 50K concurrent users × 5 requests/user/hour ÷ 3600 = 70K req/sec peak
- Each request: avg 200 prompt tokens + 100 completion tokens = 300 tokens

**Tokens per second (peak):**

```
70K req/sec × 300 tokens/req = 21M tokens/sec peak
Off-peak: 21M ÷ 5 = 4.2M tokens/sec

Continuous average (24h): (4.2M × 16 hours + 21M × 8 hours) ÷ 24 = 10M tokens/sec
```

### Phase 2: Architecture Overview (4 minutes)

```
┌──────────────────────────────────────────────────┐
│ Load Balancer / Routing (external)               │
├──────────────────────────────────────────────────┤
│ API Gateway (authentication, rate limiting)      │
├──────────────────────────────────────────────────┤
│ Model Router (choose 7B vs 13B vs 70B)          │
│ ├─ Simple queries → 7B (lower cost)             │
│ └─ Complex → 70B (higher cost, better accuracy) │
├──────────────────────────────────────────────────┤
│ Inference Cluster (4 pools: 7B, 13B, 70B, ...)  │
│ ├─ vLLM / TensorRT-LLM for batching             │
│ ├─ L40S GPUs for cost efficiency                │
│ └─ Shared metadata cache (KV cache, embeddings) │
├──────────────────────────────────────────────────┤
│ Request Queue & Scheduler                       │
│ ├─ Priority queue (paid customers first)        │
│ ├─ Batching scheduler (token-per-latency opt)  │
│ └─ Backpressure (queue limit, auto-reject)     │
├──────────────────────────────────────────────────┤
│ Monitoring & SLA                                │
│ ├─ p99 latency tracking                         │
│ ├─ Token throughput measurement                 │
│ └─ Cost per customer attribution                │
└──────────────────────────────────────────────────┘
```

### Phase 3: GPU and Model Sharding (4 minutes)

**Model choice and sharding:**

```
7B model: 14GB (FP16) → Fits on 1 L40S (48GB)
13B model: 26GB → Needs tensor parallelism (2 L40S) or pipeline
70B model: 140GB → Needs 3 L40S with tensor parallelism

GPUs needed (peak 21M tokens/sec):

Throughput per GPU:
- L40S: ~500 tokens/sec (empirically measured with vLLM)
- 1 L40S-week dedicated to 7B: 500 × 7 × 24 × 3600 = 302M tokens/week

For 21M tokens/sec peak:
- 7B pool: 42 L40S (21M ÷ 500 = 42K tokens/sec, × 1 GPU per 500 = 42)
- 13B pool: 84 L40S (each handles 250 tokens/sec)
- 70B pool: 42 L40S (with tensor parallelism, 3 GPUs per model instance)

Total: 42 + 84 + 126 = 252 L40S for peak
Cost: 252 × $12K = $3M hardware

Off-peak: Scale down to 50 L40S via autoscaling
```

**Sharding strategy (for 70B):**

```
Single 70B model cannot fit on 1 L40S (140GB > 48GB).
Use tensor parallelism:
- Split model across 3 L40S
- Layer 0-18 on GPU0, Layer 19-37 on GPU1, Layer 38-56 on GPU2
- Each forward pass: GPU0 → GPU1 → GPU2 → output
- Network overhead: 3 transfers per forward pass
- Effective throughput: ~150 tokens/sec (vs 500 on 7B)
- Cost per token: 3× higher than 7B (3 GPUs vs 1)
```

**Model router logic:**

```python
class ModelRouter:
    def route(self, request):
        complexity = estimate_complexity(request.prompt)
        
        if complexity < 3:  # Simple factual question
            return "7b-model"  # Cheapest
        elif complexity < 7:
            return "13b-model"  # Balanced
        else:
            return "70b-model"  # Most capable
        
        # Cost pass-through to customer (transparency)
        estimated_tokens = estimate_output_length(request, model)
        request.cost = estimated_tokens * COST_PER_TOKEN[model]
```

### Phase 4: Batching and Latency Optimization (3 minutes)

**Token-per-latency trade-off:**

```
vLLM default: max_batch_size = 256 requests
- Throughput: High (256 × 100 tokens avg = 25.6K tokens)
- Latency: High (waiting for batch to fill = 50-100ms)

For p99 < 500ms SLO:
- Request latency: ~200ms (LLM generation)
- Batch wait time: up to 100ms (batching delay)
- Network: 20ms
- Total: 320ms (within SLO)

Batching scheduler:
- Wait 50ms or until batch size = 64, whichever comes first
- Tradeoff: 64 vs 256 batch size costs ~30% throughput but helps SLA
```

**Adaptive batching:**

```python
class AdaptiveBatcher:
    def schedule_batch(self):
        max_wait_ms = 50
        min_batch_size = 8
        target_batch_size = 64
        
        while time_since_first_request < max_wait_ms:
            if pending_requests >= target_batch_size:
                break
            sleep(1ms)
        
        batch = pending_requests[:target_batch_size]
        
        # Latency tracking
        latencies = [time.time() - req.arrival_time for req in batch]
        if max(latencies) > 500ms:
            log_warning(f"SLO miss: p99={max(latencies)}")
```

### Phase 5: Fault Tolerance and Cost Optimization (2 minutes)

**Failure handling:**

```
Single GPU failure (7B model):
- Redirect traffic to sibling 7B GPU
- User doesn't notice (other instances available)
- MTTR: < 10 seconds (health check + reroute)

Single GPU failure (70B model, tensor parallelism):
- All 3 GPUs needed; 1 failure = entire model instance down
- Mitigation: Run 2 instances of 70B (6 GPUs total)
- Cost: 2× for 70B models, but provides HA
```

**Cost optimization:**

```
Revenue: $5 per 1M tokens
Peak: 21M tokens/sec × 3600 sec = 75.6B tokens/hour peak
Daily (8 hour peak + 16 hour off-peak):
  Peak revenue: 75.6B × 8 × $5e-6 = $3,024/day
  Off-peak: 15.12B × 16 × $5e-6 = $1,209/day
  Total: $4,233/day = $1.55M/year

Hardware cost: $3M (peak) + $0.5M (off-peak autoscale)
OpEx: $2M/year (power, cooling, staff)
Total cost: $5.5M
Margin: $1.55M - $5.5M = **-$3.95M/year (LOSS)**

Options:
1. Charge more ($15+/1M tokens)
2. Reduce hardware cost (use cheaper models, fewer replicas)
3. Improve efficiency (batch better, reduce model sizes)

Recommended: Hybrid
- Offer tiered pricing: standard ($5), priority ($15), enterprise (custom)
- Serve 70% on $5 tier, 20% on $15 tier, 10% enterprise
- Average: $7.50/1M tokens
- Revenue: $1.55M × 1.5 = $2.33M

Still negative, but closer. Scale required to break even.
```

### Phase 6: Multi-Tenancy and Isolation (2 minutes)

**Tenant isolation:**

```yaml
Per-tenant quotas:
  customer-a:
    max_concurrent_requests: 1000
    max_tokens_per_month: 10B
    priority: standard
  
  customer-b:
    max_concurrent_requests: 100
    max_tokens_per_month: 1B
    priority: standard
  
  customer-c:
    max_concurrent_requests: 10000
    max_tokens_per_month: 100B
    priority: priority (higher cost)

Rate limiting:
- Per-customer token budget (sliding window)
- If exceeded, reject with 429 (Too Many Requests)
- Allows bursts but prevents monopolization
```

**Token accounting (for billing):**

```python
class TokenCounter:
    def count_tokens(self, customer_id, request, response):
        prompt_tokens = len(tokenize(request.prompt))
        completion_tokens = len(tokenize(response.text))
        total = prompt_tokens + completion_tokens
        
        customer_usage[customer_id] += total
        
        # Check quota
        if customer_usage[customer_id] > customer_quota[customer_id]:
            log_warning(f"Customer {customer_id} exceeded quota")
            # Options: charge for overage, or reject future requests
```

### Phase 7: SLA Verification and Monitoring (1 minute)

**Dashboards:**

```
Metrics to track:
- p50, p99, p99.9 latency (per model, per customer)
- Throughput (tokens/sec, requests/sec)
- Queue depth (how many requests waiting?)
- Cost per token (to verify $5 target)
- GPU utilization (track idle capacity)
- Error rate (model inference failures)

Alerts:
- p99 latency > 500ms → scale up
- Queue depth > 1000 → backpressure, start rejecting
- Cost per token > $5.50 → investigate efficiency
```

## Interview Verification Checklist

- [ ] Clarified all requirements and trade-offs
- [ ] Estimated tokens/sec and GPU count
- [ ] Designed model sharding and routing strategy
- [ ] Planned batching for latency-throughput tradeoff
- [ ] Designed fault tolerance and HA strategy
- [ ] Calculated cost and revenue, identified profitability issues
- [ ] Explained multi-tenant isolation
- [ ] Designed monitoring and SLA verification

## Common Follow-ups

**"You're losing money. How do you make it profitable?"**

Answer: 
1. Raise prices (but risk losing customers)
2. Reduce model sizes (7B only, not 70B)
3. Improve efficiency (better batching, quantization)
4. Volume discounts (aggregate with other services)

**"A customer's request has 100K prompt tokens (huge context). How do you handle it?"**

Answer:
- Prompt is expensive (token cost linear)
- This request should cost $0.50 (100K × $5e-6)
- Some customers will contest; add per-token pricing transparency
- Consider attention caching (reuse prompt embeddings)

**"You have bursty traffic (1000× spikes). How do you maintain SLA?"**

Answer:
- Can't provision for 1000× peaks (cost prohibitive)
- Implement backpressure: reject excess requests with graceful message
- Queue with limited size (reject if queue > 10K)
- Offer "burst capacity" tier for premium customers

## Related Chapters

- **Chapter 2:** [CUDA Programming](./chapter-02-cuda-programming-and-optimization.md) — inference optimization
- **Chapter 4:** [Observability and Monitoring](./chapter-04-observability-and-monitoring.md) — SLA tracking
- **Chapter 6:** [GPU Sharing](./chapter-06-gpu-sharing-and-virtualization.md) — time-slicing for inference
- **Volume 21:** AI Factory (reference architectures)

