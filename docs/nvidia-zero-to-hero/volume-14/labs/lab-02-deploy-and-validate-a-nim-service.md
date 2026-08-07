---
title: Lab 02 — Deploy and Validate a NIM Service
description: Deploy an approved NIM service and validate model readiness, GPU execution, metrics, and rollback.
sidebar_position: 21
tags: [lab, nim, kubernetes]
---

# Lab 02 — Deploy and Validate a NIM Service

## Objective

Deploy a small approved NIM service in an isolated namespace and run a series of validation checks to prove it works before expanding to production.

## Prerequisites

Before starting, verify you have:

```bash
# 1. Valid NGC credentials
echo $NGC_API_TOKEN
# Should output a token like "nvcr.io_..."

# 2. Kubernetes access
kubectl config current-context
# Should show a valid cluster

# 3. A GPU node available
kubectl get nodes -L node-type | grep gpu
# Should show at least one node with gpu label

# 4. Sufficient GPU memory available
kubectl top nodes
# Check that at least one node has > 50GB available memory

# 5. A staging namespace (isolated)
kubectl create namespace nim-staging
kubectl label namespace nim-staging stage=staging

# 6. Fast storage for model cache
kubectl get pv | grep -i nvme
# Should show fast storage, not network NFS
```

## Step 1: Create Secret and Deploy

Create a Helm values file:

```yaml
# values-staging.yaml
replicaCount: 1

image:
  repository: nvcr.io/nvidia/nim/llama2-7b
  tag: "1.0.5"
  digest: "sha256:a1b2c3d4e5f6..."  # Pin immutable digest

imagePullSecrets:
  - name: ngc-secret

nodeSelector:
  node-type: gpu

resources:
  requests:
    nvidia.com/gpu: 1
    memory: "20Gi"
  limits:
    nvidia.com/gpu: 1
    memory: "30Gi"

# Model cache
cache:
  enabled: true
  size: "50Gi"

# Probes tuned for model load time
startupProbe:
  failureThreshold: 60  # 10 min max

service:
  type: ClusterIP
  port: 8000
```

Deploy:

```bash
# Create NGC secret
kubectl create secret docker-registry ngc-secret \
  --docker-server=nvcr.io \
  --docker-username=\$oauthtoken \
  --docker-password=$NGC_API_TOKEN \
  -n nim-staging

# Deploy via Helm
helm install nim-staging ./nim-helm-chart \
  -f values-staging.yaml \
  -n nim-staging

# Watch deployment
kubectl rollout status deployment/nim-staging -n nim-staging
```

## Step 2: Validate Pod Startup and GPU Assignment

```bash
# Check pod status (wait for Running)
kubectl get pods -n nim-staging -w
# Expected: nim-staging-abc123 Running 1/1 (may take 5+ minutes if model downloads)

# Check GPU was assigned
kubectl exec -n nim-staging nim-staging-abc123 -- nvidia-smi
# Expected output:
# +-----+------------------+------+
# | GPU | Name             | Mem  |
# +-----+------------------+------+
# |  0  | NVIDIA A100 40GB  | ??? MB / 40960MB

# Check readiness probe passed
kubectl logs -n nim-staging nim-staging-abc123 | grep -i "readiness\|model.*loaded"
# Expected: "Readiness check passed" or "Model loaded successfully"
```

## Step 3: Validate Service and Model Readiness

```bash
# Port-forward to test locally
kubectl port-forward -n nim-staging svc/nim-staging 8000:8000 &

# Test health endpoint
curl http://localhost:8000/v1/health
# Expected: 200 OK, with service info

# Test readiness (same endpoint)
curl http://localhost:8000/v1/readiness
# Expected: 200 OK, model is ready
```

## Step 4: Run Deterministic Inference Test

```bash
# Test 1: Verify model exists and responds
curl http://localhost:8000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2-7b",
    "prompt": "What is 2+2?",
    "max_tokens": 10
  }' | jq .

# Expected output:
# {
#   "id": "cmpl-...",
#   "object": "text_completion",
#   "created": 1691234567,
#   "model": "llama2-7b",
#   "choices": [
#     {
#       "text": " 4",
#       "finish_reason": "stop"
#     }
#   ]
# }

# Test 2: Verify determinism (same prompt, same output)
for i in {1..3}; do
  curl -s http://localhost:8000/v1/completions \
    -H "Content-Type: application/json" \
    -d '{"model": "llama2-7b", "prompt": "What is 2+2?", "max_tokens": 10}' | \
    jq -r '.choices[0].text'
done
# Expected: same output all 3 times

# Test 3: Verify different prompt gives different answer
curl -s http://localhost:8000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "llama2-7b", "prompt": "What is 3+3?", "max_tokens": 10}' | \
  jq -r '.choices[0].text'
# Expected: different output (likely " 6")
```

## Step 5: Measure Performance Metrics

```bash
# Metric 1: Cold start latency (first request after pod starts)
# (Already captured in Step 4, check time from container start to first successful request)
kubectl logs -n nim-staging nim-staging-abc123 | head -20
# Look for startup timestamps

# Metric 2: Warm request latency (steady state)
time curl http://localhost:8000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "llama2-7b", "prompt": "Hello", "max_tokens": 50}' > /dev/null
# Expected: < 200ms per request

# Metric 3: Throughput (how many requests/sec at low concurrency)
ab -n 100 -c 1 \
  -H "Content-Type: application/json" \
  -p request.json \
  http://localhost:8000/v1/completions
# request.json = {"model": "llama2-7b", "prompt": "Hello", "max_tokens": 10}
# Expected: ~5-10 requests/sec on single GPU

# Metric 4: GPU memory during inference
kubectl exec -n nim-staging nim-staging-abc123 -- nvidia-smi --query-gpu=memory.used --format=csv
# Expected: ~28GB for llama2-7b (loaded + one request)
```

## Step 6: Failure Injection Test

Deploy an intentionally broken revision (invalid model reference):

```bash
# Edit values to use non-existent model
cat > values-broken.yaml <<EOF
replicaCount: 1
image:
  repository: nvcr.io/nvidia/nim/fake-model-doesnotexist
  tag: "1.0.0"
nodeSelector:
  node-type: gpu
resources:
  requests:
    nvidia.com/gpu: 1
EOF

# Deploy the broken version
helm upgrade nim-staging ./nim-helm-chart \
  -f values-broken.yaml \
  -n nim-staging

# Verify it fails readiness (not Ready)
kubectl get pods -n nim-staging
# Expected: nim-staging-xyz789 0/1 (NOT Ready)

# Verify service traffic is not sent to unready pod
# (K8s automatically removes unready pods from Service endpoints)
kubectl get endpoints -n nim-staging nim-staging
# Expected: <none> (no endpoints because pod is not ready)

# Verify traffic still works via previous pod if it exists
# (In production with multiple replicas, traffic reroutes to healthy pods)

# Rollback to working version
helm rollback nim-staging 0 -n nim-staging

# Verify pod becomes Ready again
kubectl wait --for=condition=Ready pod -l app=nim-staging -n nim-staging --timeout=600s
```

## Step 7: Collect Evidence and Cleanup

```bash
# Capture final evidence
echo "=== Pod Status ===" >> nim-validation-evidence.txt
kubectl describe pod -n nim-staging -l app=nim-staging >> nim-validation-evidence.txt

echo "=== Logs ===" >> nim-validation-evidence.txt
kubectl logs -n nim-staging -l app=nim-staging --tail=50 >> nim-validation-evidence.txt

echo "=== GPU State ===" >> nim-validation-evidence.txt
kubectl exec -n nim-staging $(kubectl get pods -n nim-staging -o name) \
  -- nvidia-smi >> nim-validation-evidence.txt

echo "=== Metrics ===" >> nim-validation-evidence.txt
kubectl get --raw /api/v1/namespaces/nim-staging/pods \
  -o json | jq '.items[] | .metadata.name, .status.conditions' >> nim-validation-evidence.txt

# Kill port-forward
pkill -f "kubectl port-forward"

# Cleanup
kubectl delete namespace nim-staging
# Revoke temporary NGC token (in Secrets Manager)
# aws secretsmanager delete-secret --secret-id ngc-api-token-temp
```

## Validation Checklist

Before declaring "successful deployment":

- [ ] Pod reached Running state within 10 minutes
- [ ] GPU was assigned and visible inside container
- [ ] Readiness probe passed
- [ ] Health check returned 200
- [ ] Deterministic inference test passed (same prompt → same output)
- [ ] Latency &lt; 200ms per request (warm)
- [ ] GPU memory usage reasonable (~28GB for 7B model)
- [ ] Failure injection test proved readiness gate works
- [ ] Rollback procedure verified
- [ ] Evidence collected and archived
