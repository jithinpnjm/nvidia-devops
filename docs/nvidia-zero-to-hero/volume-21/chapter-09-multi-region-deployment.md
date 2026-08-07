---
title: Chapter 09 — Multi-Region Deployment
description: Data locality, failover strategies, cross-region training, global inference distribution.
sidebar_position: 10
tags: [multi-region, failover, disaster-recovery, geo-redundancy]
---

# Chapter 09 — Multi-Region Deployment

## PART 1: MULTI-REGION ARCHITECTURE

### 1.1 Active-Active Inference Serving

```yaml
GEOGRAPHY-AWARE LOAD BALANCING (2000 QPS, 3 regions)

Region 1 (us-west-2, 500 QPS):
  Latency to users: 20 ms
  Inference cluster: 50 nodes × 8 GPU = 400 GPUs
  Availability: 99.9% (3 AZs, NLB with health checks)

Region 2 (us-east-1, 500 QPS):
  Latency to users: 50 ms
  Inference cluster: 50 nodes × 8 GPU = 400 GPUs
  Availability: 99.9%

Region 3 (eu-west-1, 1000 QPS):
  Latency to users: 30 ms
  Inference cluster: 100 nodes × 8 GPU = 800 GPUs
  Availability: 99.9%

Global Load Balancer (GeoDNS + application-level routing):
  1. DNS lookup returns nearest region (GeoDNS)
  2. Client connects to region-specific LB
  3. LB routes to healthy inference pod
  4. If region down, client retries next region (30 sec failover)

Cost breakdown (annual):
  Hardware: 150 nodes × $285K = $42.75M (one-time)
  Amortized 3-year CAPEX: $42.75M / 3 = $14.25M/year
  Electricity: 1200 GPU × 350W × 8760h × $0.12/kWh = $436K/year (per-region varies by local cost)
  Personnel: 15 engineers × $150K = $2.25M/year
  Network (inter-region replication, WAN): $1M/year
  
  Total: $17.9M/year (for serving 2000 QPS with 99.9% SLA across 3 regions)
```

### 1.2 Disaster Recovery & Failover

```python
# Health checks + automatic failover

import asyncio
from typing import List

class RegionalInferenceCluster:
    def __init__(self, region: str, endpoint: str, capacity_qps: int):
        self.region = region
        self.endpoint = endpoint
        self.capacity_qps = capacity_qps
        self.healthy = True
        self.latency_ms = 0
        self.error_rate = 0.0
    
    async def health_check(self):
        """Poll regional cluster every 10 seconds"""
        while True:
            try:
                start = time.time()
                # Test inference (dummy request)
                response = await asyncio.wait_for(
                    self.test_inference(), timeout=5.0
                )
                self.latency_ms = (time.time() - start) * 1000
                self.healthy = True
                self.error_rate = 0.0
            except Exception as e:
                self.healthy = False
                self.error_rate = 1.0
                logging.error(f"Health check failed for {self.region}: {e}")
            
            await asyncio.sleep(10)  # Check every 10 sec
    
    async def test_inference(self):
        """Lightweight inference test"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"http://{self.endpoint}/v1/completions",
                json={"prompt": "test", "max_tokens": 1},
                timeout=5.0
            ) as resp:
                return await resp.json()

class GlobalLoadBalancer:
    def __init__(self, clusters: List[RegionalInferenceCluster]):
        self.clusters = clusters
    
    async def route_request(self, request):
        """Route to best healthy cluster"""
        # 1. Filter healthy clusters
        healthy = [c for c in self.clusters if c.healthy]
        
        if not healthy:
            raise RuntimeError("All regions down")
        
        # 2. Select by latency (prefer lower latency, then lower load)
        best_cluster = min(
            healthy,
            key=lambda c: (c.latency_ms, c.error_rate)
        )
        
        # 3. Route request
        try:
            response = await asyncio.wait_for(
                best_cluster.serve_request(request),
                timeout=30.0
            )
            return response
        except asyncio.TimeoutError:
            # Failover to next best cluster
            healthy.remove(best_cluster)
            if healthy:
                return await self.route_request(request)  # Retry with next cluster
            else:
                raise RuntimeError("Request timeout, all regions exhausted")

# Failover time: <1 second (health check detects in 10 sec, but client retries immediately)
# SLA impact: <0.1% error rate during regional outage (if N+1 redundancy)
```

---

## PART 2: CROSS-REGION TRAINING COORDINATION

### 2.1 Asynchronous Model Synchronization

```yaml
TRAINING IN MULTIPLE REGIONS

Scenario: Train Llama-100B in us-west and eu-west simultaneously

Region 1 (us-west):
  Cluster: 8 nodes (64 GPU H100)
  Training job: Steps 0–1000
  Checkpoint every 100 steps → upload to S3 (5 min)

Region 2 (eu-west):
  Cluster: 8 nodes (64 GPU H100)
  Training job: Steps 0–1000
  Checkpoint every 100 steps → upload to S3 (5 min)

Synchronization:
  Step 0–100: Both regions train independently
  Step 100: Both save checkpoint to S3
  Step 100+: Load peer region's checkpoint, merge model states
  
  Merged model: Average weights from both regions (reduces variance)
  
  Result: 2x throughput (128 GPU aggregate) with minor quality loss (≈0.5% perplexity)

Constraint:
  Inter-region latency: ~100 ms (too high for synchronous AllReduce)
  Solution: Asynchronous updates (eventual consistency, not strict synchronization)
```

---

## SUMMARY

Multi-region deployment trades off:
- **Latency:** Each user sees <50ms to nearest region (good UX)
- **Cost:** 3x infrastructure for 99.9% SLA (expensive, but necessary for critical services)
- **Complexity:** Failover, model synchronization, data consistency (operational burden)

**Key metrics:**
- Regional failover time: <1 second (client-side retry)
- Inference availability: 99.9% (one region down, traffic reroutes)
- Model sync overhead: <5% performance loss for eventual consistency

**In Chapter 10:** Observability and operational monitoring.
