---
title: Chapter 14 — Reference Architecture: Multi-Region Inference Deployment
description: Global deployment for latency-sensitive inference with disaster recovery and auto-scaling.
sidebar_position: 15
tags: [reference-architecture, inference, multi-region, geo-failover]
---

# Chapter 14 — Reference Architecture: Multi-Region Inference Deployment

## COMPLETE DESIGN: GLOBAL LLAMA INFERENCE (2000 QPS, 99.9% SLA)

### Global Deployment Spec

```yaml
SERVICE: Llama-3-70B Inference API (chatbot.example.com)

SLA:
  Availability: 99.9% (21.6 min downtime/month)
  Latency p99 TTFT: <500 ms
  Latency p99 ITL: <150 ms (inter-token latency)
  Throughput: 2000 QPS sustained peak

REGIONAL CLUSTERS (3 active-active regions):

Region 1: US-West (us-west-2, Oakland CA)
  Capacity: 50 nodes × 8 GPU = 400 H100s
  Peak QPS: 600 (30% of global traffic)
  Model: Llama-70B, 2-GPU tensor parallelism
  Inference replicas: 200 (one per 2-GPU unit)
  Latency to users: 20 ms (US West coast)
  Availability: 99.9% (3 AZs)

Region 2: US-East (us-east-1, Virginia)
  Capacity: 50 nodes × 8 GPU = 400 H100s
  Peak QPS: 600
  Model: Llama-70B, 2-GPU tensor parallelism
  Inference replicas: 200
  Latency to users: 50 ms (US East coast)
  Availability: 99.9% (3 AZs)

Region 3: EU-West (eu-west-1, Dublin Ireland)
  Capacity: 50 nodes × 8 GPU = 400 H100s
  Peak QPS: 800 (40% of traffic, largest region)
  Model: Llama-70B, 2-GPU tensor parallelism
  Inference replicas: 200
  Latency to users: 30 ms (Europe, Middle East, Africa)
  Availability: 99.9% (3 AZs)

TOTAL INFRASTRUCTURE:
  Hardware: 150 nodes, 1200 GPUs
  Software: 600 inference replicas
  Availability: N+2 per region (3 AZ, 2 AZs can fail without SLA breach)
  Failover time: <30 seconds (health check + client retry)

GLOBAL LOAD BALANCING:

Application LB (Layer 7):
  Route by geography (GeoDNS):
    client IP 12.34.56.78 (USA) → us-west-2 or us-east-1
    client IP 45.67.89.01 (Europe) → eu-west-1
  Fallback: If region unhealthy, reroute to next-closest region (1 sec latency increase)

Regional LB (Layer 4):
  Health check: Every 10 seconds (ping inference pod, verify <100ms latency)
  Active-active: No single "primary" region; all 3 serve simultaneously
  Failover: If 2/3 AZs down, reroute to other regions

Intra-region routing:
  Kubernetes Service (ClusterIP)
  Load balancer: Round-robin across vLLM pods
  Concurrency per pod: 64 concurrent sequences max (KV cache limit)
  CPU-to-GPU: CPU runs pre/post-processing, GPU runs inference

COST BREAKDOWN (Year 1):

Hardware (1200 GPUs):
  GPUs: 1200 × $30K = $36M
  Compute nodes: 150 × $10K = $1.5M
  Networking: $2M
  Storage (NVMe, S3): $1.5M
  Subtotal: $41M (one-time CAPEX)

Operations (Annual):
  Electricity: 400 kW avg × 8760h × $0.12/kWh = $420K
  Personnel: 20 engineers × $150K = $3M
  Network (inter-region WAN): $1M
  Cloud services (S3, monitoring): $0.5M
  Subtotal: $4.92M/year OPEX

Amortized (3-year TCO):
  CAPEX: $41M / 3 = $13.67M/year
  OPEX: $4.92M/year
  Total: $18.59M/year = $6.2M per region/year

Cost per 1K QPS:
  $6.2M / (2000 QPS) = $3.1K per 1K QPS
  Annual tokens: 2000 QPS × 86,400 s/day × 365 days × 150 tokens/seq ≈ 9.46 trillion tokens/year
  Cost per million tokens (annual cost / annual tokens, consistent units): $18.59M / (9.46 trillion / 1M) ≈ $1.96/1M tokens
  NOT competitive vs AWS Bedrock (~$0.005–0.02/1M tokens) — self-hosting here is roughly
  100-400x more expensive per token than Bedrock's published pricing. The case for self-hosting
  a multi-region deployment has to rest on data residency, latency, or customization requirements
  that Bedrock can't meet — not on raw per-token cost.
```

### Kubernetes Deployment

```yaml
# kustomize/overlays/global-inference/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-inference-llama
spec:
  replicas: 200  # Per region (600 total across 3 regions)
  selector:
    matchLabels:
      app: vllm-inference
      model: llama-70b
  
  template:
    metadata:
      labels:
        app: vllm-inference
        model: llama-70b
        region: us-west-2  # Per-region value
    
    spec:
      # GPU resource request
      containers:
      - name: vllm
        image: vllm:0.5.0
        resources:
          limits:
            nvidia.com/gpu: 2  # 2-GPU tensor parallelism
            memory: "400Gi"
          requests:
            nvidia.com/gpu: 2
            memory: "400Gi"
        
        env:
        - name: TENSOR_PARALLEL_SIZE
          value: "2"
        - name: GPU_MEMORY_UTILIZATION
          value: "0.95"
        - name: MAX_NUM_SEQS
          value: "64"
        - name: VLLM_LOGGING_LEVEL
          value: "INFO"
        
        ports:
        - containerPort: 8000
          name: http
        
        # Health probe (critical for failover)
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 2
      
      # Affinity: Spread across AZs
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values: ["vllm-inference"]
              topologyKey: topology.kubernetes.io/zone
        
        nodeSelector:
          gpu: "true"
          compute-type: inference
---
# Service for load balancing
apiVersion: v1
kind: Service
metadata:
  name: vllm-inference-svc
spec:
  type: LoadBalancer
  selector:
    app: vllm-inference
  ports:
  - protocol: TCP
    port: 443
    targetPort: 8000
  sessionAffinity: None  # No session stickiness (stateless)
---
# HPA for auto-scaling
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vllm-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vllm-inference-llama
  minReplicas: 150  # At least 150 replicas per region
  maxReplicas: 250  # Scale to 250 if demand spikes
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: inference_request_queue_depth
      target:
        type: AverageValue
        averageValue: "10"  # Scale if avg queue depth >10
```

### Disaster Recovery Procedures

```yaml
FAILOVER SCENARIO: One entire region (us-west-2) fails

Timeline:

T+0: Region failures detected
  - Health checker pings us-west-2 LB: Timeout
  - 10 failed health checks = region marked DOWN
  - 60 seconds elapsed

T+60: Failover decision
  - Global LB reroutes us-west-2 traffic to us-east-1 + eu-west-1
  - Clients receive 500 errors for ~30 seconds (during DNS/LB update)
  - New distribution: 600 QPS from us-west-2 → split to other regions
  - us-east-1 now handles 1000 QPS (was 600, now at 95% capacity)
  - eu-west-1 now handles 1000 QPS (was 800, now at 95% capacity)

T+90–120: Auto-scaling kicks in
  - Kubernetes HPA detects queue depth >10, CPU >80%
  - Spins up additional pods in us-east-1 and eu-west-1
  - Scale from 200 to 250 replicas per region (marginal)
  - At peak, can only scale to ~200 replicas per region (40% utilization headroom)

T+2 hours: Manual remediation
  - SRE team investigates us-west-2 (power loss? network partition?)
  - If infrastructure recovers: Gradually shift traffic back over 30 min
  - If infrastructure destroyed: Provision new region (3–7 days)

IMPACT ANALYSIS:
  Availability: 99.9% = 21.6 min downtime/month
  This failure: 30 sec × 1 month / 30 = 1 sec acceptable downtime (WELL within budget)
  SLA met: YES (despite complete region failure!)

COST OF OUTAGE:
  Lost revenue: 30 sec × 2000 QPS × $0.0001 per request = $60
  Personnel cost (incident response): 2 hours × $150/hr = $300
  Total: ~$360 (negligible)
  
COST OF 3-REGION REDUNDANCY:
  2-region would be cheaper ($30.7M vs $18.59M), BUT:
    - 2-region failure = full outage (50/50 chance each region fails)
    - Cost of outage (reputation, lost customers): $1M+
  3-region: Small upfront cost avoids catastrophic failure risk
```

---

## SUMMARY

Multi-region inference deployment provides:

1. **Low latency:** Users in any region see <50ms TTFT (good UX).
2. **High availability:** 99.9% SLA despite any single-region failure.
3. **Elastic scaling:** Auto-scale pods during traffic spikes.
4. **Cost:** ~$1.96 per million tokens — substantially higher than commercial API pricing (e.g., AWS Bedrock ~$0.005–0.02/1M tokens); self-hosting is not a per-token cost play here.

**Deployment complexity:** High (Kubernetes multi-cluster, cross-region failover, monitoring).

**Key insight:** The economic case for self-hosting a multi-region deployment isn't "cheaper than the cloud API" on raw token cost — it's control over data residency, latency, and customization that a managed API can't offer. For non-critical services where those requirements don't apply, a managed API or a smaller single-region deployment is usually the more cost-effective choice.

---

## VOLUME 21 CONCLUSION

From strategy (Chapter 1: workload characterization) to execution (Chapter 14: global deployment), an AI factory is built by layering constraints:

1. **Constraints:** Business SLA (99.9% uptime), cost target (<$0.01/token), workload profile (2000 QPS).
2. **Hardware:** GPU selection (H100 vs H200), topology (single-rack vs multi-rack), interconnect (NVLink + InfiniBand).
3. **Software:** Distributed training (DeepSpeed ZeRO), inference serving (vLLM), orchestration (Kubernetes).
4. **Operations:** Monitoring (Prometheus), automation (HPA), incident response playbooks.

Each decision ripples forward: A workload that requires 99.9% uptime → forces multi-region → forces 3x hardware cost → forces spot instances to offset cost → forces robust checkpoint management.

**Next steps:** Chapters 13–14 provided blueprints. Labs 01–04 teach design through hands-on exercises.
