---
title: Chapter 04 — Deploying and Operating NIM Services
description: Design NIM deployment, scaling, security, observability, rollout, and rollback in production.
sidebar_position: 5
tags: [nim, kubernetes, operations]
---

# Deploying and Operating NIM Services

A production NIM service requires more than a Deployment manifest. It requires authentication, resource guarantees, health checks, observability, and a controlled rollout process.

## Deployment Checklist

Minimal production NIM deployment must include:

- **Artifact access:** NGC container pull credentials in imagePullSecrets; NGC model entitlement token in pod secrets
- **GPU resource:** requests and limits (e.g., `nvidia.com/gpu: 1`), node affinity for GPU nodes
- **Model cache:** persistent volume mount for model weights, OR accept cold-start latency on every pod creation
- **Workload identity:** scoped NGC token (not long-lived), rotated regularly, with audit logging
- **Networking:** Service, Ingress, and NetworkPolicy; model API should not be exposed to untrusted networks
- **Health probes:** separate liveness, readiness, and startup probes; startup probe must account for model download time
- **Resource limits:** CPU, memory, and ephemeral storage; prevent runaway processes from consuming node
- **Observability:** Prometheus scrape config for metrics, structured logs to centralized logging, trace sampling for latency SLOs
- **Canary rollout:** deploy new revision to small percentage first, measure latency/correctness, then expand
- **Rollback plan:** previous revision pinned in Git, tested rollback procedure in runbook

➕ **Real Helm values snippet with all required production details:**

```yaml
# Example: production-ready NIM deployment
nim:
  name: llama2-7b
  replicaCount: 3
  
  image:
    repository: nvcr.io/nvidia/nim/llama2-7b
    tag: "1.0.5"
    digest: "sha256:a1b2c3d4e5f6..." # Pin immutable digest, not tag
    pullPolicy: IfNotPresent
  
  imagePullSecrets:
    - name: ngc-secret  # Pre-created: kubectl create secret docker-registry ngc-secret ...
  
  resources:
    requests:
      nvidia.com/gpu: 1  # Reserve one GPU per pod
      cpu: 4
      memory: "16Gi"
    limits:
      nvidia.com/gpu: 1  # Ensure no over-subscription
      cpu: 8             # Allow burst for preprocessing
      memory: "32Gi"     # Safety headroom above request
      ephemeralStorage: "50Gi"  # For model cache + temp files
  
  nodeSelector:
    node-type: gpu-ml  # Tag nodes that have compatible GPUs
  
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app
                  operator: In
                  values: [llama2-7b]
            topologyKey: kubernetes.io/hostname  # Spread across nodes
  
  env:
    - name: NGC_API_TOKEN
      valueFrom:
        secretKeyRef:
          name: ngc-credentials  # Pre-created, rotated monthly
          key: api-token
    - name: NIM_HTTP_PORT
      value: "8000"
    - name: NIM_GRPC_PORT
      value: "8001"
  
  cache:
    enabled: true
    mountPath: /model_cache
    size: "50Gi"  # Large enough for model + temp
    storageClass: fast-nvme  # Use fast storage, not network NFS
  
  livenessProbe:
    httpGet:
      path: /v1/health
      port: 8000
    initialDelaySeconds: 60    # Allow 60s for GPU initialization
    periodSeconds: 30
    timeoutSeconds: 5
    failureThreshold: 3        # Restart after 3 failures (90s total)
  
  readinessProbe:
    httpGet:
      path: /v1/health
      port: 8000
    initialDelaySeconds: 300   # Model download may take minutes
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 5        # More lenient than liveness
  
  startupProbe:
    httpGet:
      path: /v1/health
      port: 8000
    initialDelaySeconds: 0
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 60       # Allow up to 600s (10 min) for model load
  
  service:
    type: ClusterIP
    ports:
      - name: http
        port: 8000
        targetPort: 8000
        protocol: TCP
      - name: grpc
        port: 8001
        targetPort: 8001
        protocol: TCP
  
  networkPolicy:
    enabled: true
    ingress:
      - from:
          - namespaceSelector:
              matchLabels:
                name: inference  # Only this namespace can call NIM
        ports:
          - protocol: TCP
            port: 8000
  
  metrics:
    enabled: true
    scrapeInterval: 15s
    path: /metrics
  
  logging:
    level: INFO  # Change to DEBUG for troubleshooting, back to INFO after
    format: json  # Structured logs for log aggregation
  
  rollout:
    strategy: canary
    canaryReplicas: 1  # Deploy to 1 pod first
    canaryDuration: 5m # Monitor for 5 minutes
    gates:
      - name: latency
        threshold: "p95 < 200ms"  # Measurement from load test
      - name: correctness
        threshold: "deterministic request matches baseline"
      - name: gpu_utilization
        threshold: "gpu_utilization > 50%"  # Not stuck
```

## Scaling

Scale on queue depth, request rate, and latency SLO — not GPU utilization alone.

➕ **Scaling decision logic with real thresholds:**

```mermaid
flowchart TD
    Check["Monitor request metrics every 30s"]
    
    Queue{Queue depth > 10<br/>or<br/>requests_waiting_total > 20?}
    Queue -->|yes| Metrics["Measure latencies"]
    Queue -->|no| Check
    
    Metrics --> Latency{"Current latency<br/>p95 latency"}
    Latency -->|"p95 < 150ms"| OK["SLO met, no scale"]
    Latency -->|"p95 150-200ms"| Warn["Warning, prepare scale"]
    Latency -->|"p95 > 200ms"| Scale["SCALE: add replica"]
    
    OK --> Check
    Warn --> Check
    Scale --> Deploy["Deploy new pod (startup probe: 600s)"]
    Deploy --> WaitReady["Wait for readiness (model load)"]
    WaitReady --> Recheck["Recheck queue depth"]
    Recheck --> Check
```

**Why not scale on GPU utilization?** Model load time and cache warm-up mean that reactive autoscaling (adding pods when GPU utilization hits 70%) will always be too late. By the time the new pod is Ready and accepting requests, the queue is already backed up and latency is already broken.

**Better:** pre-emptively scale based on queue depth measured 5 minutes earlier, so the new pod is ready before the queue gets deep.

## Troubleshooting

**Symptom:** NIM Deployment revision is healthy (all Pods Ready) but latency is 40% slower than the previous revision.

**Root cause:** new revision may use different quantization, batching, or framework version that is functionally correct but slower.

**Prevention (operationally critical):** a new revision that is healthy but slower should fail the canary gate automatically. Define explicit latency SLO in the rollout gate before promoting to full fleet.

➕ **Real production runbook for latency regression detection:**

```yaml
# Example: Prometheus alert + canary gate
canary_gate_latency_check:
  prometheus_query: |
    histogram_quantile(0.95, rate(nim_request_duration_seconds_bucket[5m]))
  
  baseline_latency_p95: "180ms"  # Previous stable revision, measured during peak load
  
  canary_latency_threshold: 
    warning: "250ms"   # 40% slower = circuit breaker
    critical: "300ms"  # 67% slower = automatic rollback
  
  measurement_window: "5 minutes at 80% load"
  
  pass_criteria:
    - "measured latency < 250ms"
    - "no P99 outliers > 500ms"
    - "deterministic 100-token request in < 100ms"
  
  if_fails: "Automatic rollback to previous revision; alert on-call"
```

**Example alert rule:**

```
alert CanaryLatencyRegression
  expr: histogram_quantile(0.95, rate(nim_request_latency_seconds_bucket[5m])) > 0.25
  for: 2m
  action: "Pause canary rollout, investigate revision differences"
```
