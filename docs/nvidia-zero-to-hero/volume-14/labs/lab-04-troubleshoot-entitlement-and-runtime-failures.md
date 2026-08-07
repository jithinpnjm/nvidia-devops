---
title: Lab 04 — Troubleshoot Entitlement and Runtime Failures
description: Separate registry, entitlement, platform, runtime, GPU, and model-readiness failures.
sidebar_position: 23
tags: [lab, troubleshooting, entitlement]
---

# Lab 04 — Troubleshoot Entitlement and Runtime Failures

## Objective

Diagnose a broken deployment by isolating which layer failed: artifact pull, entitlement, network, runtime, or GPU. The key skill is **ordered diagnosis** — test the lowest layers first to avoid time wasted on the wrong problem.

## Scenario: Pod cannot start, stuck in ImagePullBackOff

```
$ kubectl get pod nim-broken-abc123
NAME                 READY   STATUS             RESTARTS   AGE
nim-broken-abc123    0/1     ImagePullBackOff   0          3m
```

## Step 1: Extract Exact Image Reference and Digest

```bash
# Get the deployment to see what it's trying to pull
kubectl describe pod nim-broken-abc123 | grep Image:
# Output: Image: nvcr.io/nvidia/nim/llama2-7b:1.0.5

# Get the exact image hash from the registry (if it exists)
# First, check if this tag exists at all
curl -I https://nvcr.io/v2/nvidia/nim/llama2-7b/manifests/1.0.5 \
  -H "Authorization: Bearer $NGC_API_TOKEN"
# 200 OK = tag exists
# 404 Not Found = tag doesn't exist (misspelled?)
# 401 Unauthorized = credentials problem (step 2)

# Record findings in evidence file
cat >> troubleshooting-evidence.txt <<EOF
Step 1: Image reference
  Pod is trying to pull: nvcr.io/nvidia/nim/llama2-7b:1.0.5
  Tag exists in NGC: YES (200 OK response)
  Next step: Check entitlement
EOF
```

## Step 2: Verify Entitlement and Token Scope

```bash
# Check if NGC token is valid
curl -H "Authorization: Bearer $NGC_API_TOKEN" \
  https://api.ngc.nvidia.com/v2/models | head -20
# 200 OK = token is valid
# 401 Unauthorized = token expired or invalid
# Empty response = network issue or token missing

# Check NGC token expiry
curl -s -H "Authorization: Bearer $NGC_API_TOKEN" \
  https://api.ngc.nvidia.com/v2/user/profile | jq .

# Expected output (if token is valid):
# {
#   "name": "your-ngc-account",
#   "status": "active",
#   "org_admin": false
# }

# Try to access the specific model (test scope)
curl -H "Authorization: Bearer $NGC_API_TOKEN" \
  https://api.ngc.nvidia.com/v2/models/nvidia/nim/llama2-7b/versions
# 200 OK = you have entitlement for this model
# 403 Forbidden = entitlement scope doesn't include this model
# 401 Unauthorized = token invalid

# Record findings
cat >> troubleshooting-evidence.txt <<EOF
Step 2: Entitlement and token
  NGC token valid: YES (profile returned)
  Model entitlement: YES (200 response)
  Token expiry: $(curl -s -H "Authorization: Bearer $NGC_API_TOKEN" https://api.ngc.nvidia.com/v2/user/profile | jq -r .expire_date)
  Next step: Check network and registry reachability
EOF
```

## Step 3: Test Network, DNS, and Registry Reachability

```bash
# From the Kubernetes cluster, test if the pod can reach NGC
kubectl run network-test -it --image=ubuntu:22.04 -- bash

# Inside the test pod:
apt-get update && apt-get install -y curl

# DNS resolution test
nslookup nvcr.io
# Should return an IP address (not "NXDOMAIN")

# TLS certificate verification
curl -v https://nvcr.io/v2/ 2>&1 | grep -E "SSL|certificate"
# Should see "SSL certificate verify ok" (not "certificate problem")

# Registry reachability (unauthenticated)
curl -I https://nvcr.io/v2/
# Expected: 401 Unauthorized (expected, we don't have auth yet)
# If: 000 Connection refused → network blocked
# If: 530 (SSL/TLS error) → firewall or proxy issue

# Registry reachability (authenticated)
curl -I -H "Authorization: Bearer $NGC_API_TOKEN" \
  https://nvcr.io/v2/nvidia/nim/llama2-7b/manifests/1.0.5
# Expected: 200 OK
# If: 401 Unauthorized → token wrong (step 2 should have caught this)
# If: Connection refused → firewall blocking outbound HTTPS

# Record findings
cat >> troubleshooting-evidence.txt <<EOF
Step 3: Network and registry
  DNS resolution: OK (nvcr.io resolved)
  TLS certificate: OK
  Registry reachability: OK (authenticated pull works)
  Next step: Check image-pull secret in Kubernetes
EOF
```

## Step 4: Verify Image-Pull Secret or Workload Identity

```bash
# Check if the pull secret exists
kubectl get secret ngc-secret
# Expected: exists
# If: "Error from server (NotFound)" → secret missing

# Check secret format (without exposing the token value)
kubectl get secret ngc-secret -o json | \
  jq '.data | keys'
# Expected: [".dockerconfigjson"]

# Verify the secret is in the imagePullSecrets for the pod
kubectl get pod nim-broken-abc123 -o yaml | \
  grep -A 3 "imagePullSecrets:"
# Expected: name: ngc-secret

# If using workload identity (IRSA on EKS):
kubectl get serviceaccount nim-runner -o yaml | \
  grep "eks.amazonaws.com"
# Expected: eks.amazonaws.com/role-arn: arn:aws:iam::...

# Verify IAM role has NGC access
aws iam get-role-policy --role-name <role-name> --policy-name <policy>
# Should include s3:GetObject or similar for NGC artifacts

# Record findings
cat >> troubleshooting-evidence.txt <<EOF
Step 4: Image-pull secret
  Secret exists: YES
  Secret format: dockerconfigjson
  Pod references secret: YES (in imagePullSecrets)
  Workload identity: $(if [[ -z "$IRSA_ROLE" ]]; then echo "Not used"; else echo "YES"; fi)
  Next step: Check node and runtime layer
EOF
```

## Step 5: Inspect Node Runtime and GPU

```bash
# Which node is the pod on? (or trying to run on?)
kubectl get pod nim-broken-abc123 -o wide
# Output: nim-broken-abc123 ... gpu-node-0

# SSH to that node (or use kubectl debug)
kubectl debug node/gpu-node-0 -it --image=ubuntu:22.04 -- bash

# Inside the node:
# Check container runtime is working
systemctl status containerd
# Or: systemctl status docker
# Expected: active (running)

# Check GPU is visible to the node
nvidia-smi
# Expected: lists GPU(s)
# If: "command not found" → driver not installed
# If: "no devices" → driver installed but GPU not recognized

# Check NVIDIA Container Toolkit is installed
which nvidia-container-runtime
# Expected: /usr/bin/nvidia-container-runtime
# If: not found → cannot pass GPU to container

# Record findings
cat >> troubleshooting-evidence.txt <<EOF
Step 5: Node and runtime
  Container runtime: containerd (active)
  GPU visible to node: YES (nvidia-smi lists 1x A100)
  NVIDIA Container Toolkit: YES
  Next step: Check pod logs for actual error
EOF
```

## Step 6: Check Pod Events and Logs

```bash
# Get detailed pod events
kubectl describe pod nim-broken-abc123 | grep -A 10 "Events:"
# Example output:
# Events:
#   Type     Reason                 Age   From               Message
#   ----     ------                 ----  ----               -------
#   Normal   Scheduled              5m    default-scheduler  Successfully assigned to gpu-node-0
#   Warning  Failed                 5m    kubelet            Failed to pull image "nvcr.io/nvidia/nim/llama2-7b:1.0.5": rpc error: code = Unknown desc = failed to pull and unpack image ...: failed to resolve reference "nvcr.io/nvidia/nim/llama2-7b:1.0.5": pull access denied, repository does not exist or may require "...

# Parse the error:
# "pull access denied" → usually entitlement or token (step 2)
# "failed to resolve reference" → tag misspelled or doesn't exist (step 1)
# "connection refused" → network (step 3)
# "certificate error" → TLS/proxy (step 3)

# Get pod logs (if pod managed to start and then failed)
kubectl logs nim-broken-abc123 --previous
# Logs from previous attempt (if pod crashed and restarted)

# If no logs, try init container logs
kubectl logs nim-broken-abc123 -c init-container

# Record actual error message
cat >> troubleshooting-evidence.txt <<EOF
Step 6: Pod events and error
  Event: Failed to pull image
  Error message: $(kubectl describe pod nim-broken-abc123 | grep -A 5 "Failed to pull" | tail -1)
  Root cause: Token or entitlement
  Next step: Fix entitlement, pull, and verify
EOF
```

## Step 7: Compare with Known-Good Deployment

```bash
# Deploy the same image on a known-working setup
kubectl create namespace troubleshooting-test

# Use the exact same image, but with debug flags
kubectl run nim-test -it \
  --namespace=troubleshooting-test \
  --image=nvcr.io/nvidia/nim/llama2-7b:1.0.5 \
  --image-pull-policy=Always \
  -- nvidia-smi

# If this pod ALSO fails → problem is environmental (network, token, etc.)
# If this pod SUCCEEDS → problem is specific to the broken pod's config

# Compare manifests side-by-side
kubectl get pod nim-broken-abc123 -o yaml > broken-pod.yaml
kubectl get pod nim-test -o yaml > working-pod.yaml
diff -u working-pod.yaml broken-pod.yaml
# Look for differences in: image, imagePullSecrets, nodeSelector, resource requests
```

## Failure Injection: Intentionally Broken Credentials

```bash
# Test 1: Create a secret with invalid token
kubectl create secret docker-registry ngc-secret-invalid \
  --docker-server=nvcr.io \
  --docker-username=\$oauthtoken \
  --docker-password="INVALID_TOKEN_12345" \
  -n troubleshooting-test

# Deploy with broken secret
kubectl run nim-broken-token -it \
  --namespace=troubleshooting-test \
  --image=nvcr.io/nvidia/nim/llama2-7b:1.0.5 \
  --overrides='{"spec":{"imagePullSecrets":[{"name":"ngc-secret-invalid"}]}}' \
  -- echo "test"

# Expected failure:
# ImagePullBackOff with "pull access denied" or "401 Unauthorized"

# Verify the error is DIFFERENT from runtime failures
# Record: this is a credential problem, not a GPU problem

# Test 2: Create a secret with correct token but wrong registry
kubectl create secret docker-registry docker-secret \
  --docker-server=docker.io \
  --docker-username=unused \
  --docker-password=unused

# Deploy trying to pull from docker.io (wrong registry)
kubectl run nim-wrong-registry -it \
  --namespace=troubleshooting-test \
  --image=nvcr.io/nvidia/nim/llama2-7b:1.0.5 \
  --overrides='{"spec":{"imagePullSecrets":[{"name":"docker-secret"}]}}' \
  -- echo "test"

# Expected: ImagePullBackOff (pull secret is for wrong registry)

# Clean up
kubectl delete namespace troubleshooting-test
```

## Resolution Procedure

Once root cause is identified, fix the lowest layer and re-verify:

```bash
# Example: Token was expired

# 1. Generate new NGC token (via NGC web UI or CLI)
export NEW_NGC_API_TOKEN="nvcr.io_<new-token>"

# 2. Recreate the secret
kubectl delete secret ngc-secret
kubectl create secret docker-registry ngc-secret \
  --docker-server=nvcr.io \
  --docker-username=\$oauthtoken \
  --docker-password=$NEW_NGC_API_TOKEN

# 3. Force pod restart (don't just wait, K8s won't re-pull if image was already there)
kubectl rollout restart deployment nim-deployment

# 4. Watch rollout
kubectl rollout status deployment nim-deployment

# 5. Verify image pull succeeded
kubectl get pod -l app=nim-deployment -o wide
# Expected: Running state, not ImagePullBackOff

# 6. Verify model loading
kubectl logs -l app=nim-deployment --tail=20 | grep -i "model\|readiness\|ready"
# Expected: "Model loaded successfully" or "Readiness check passed"

# 7. Test inference
kubectl port-forward svc/nim-deployment 8000:8000 &
curl http://localhost:8000/v1/health
# Expected: 200 OK
```

## Evidence Collection Checklist

Before closing the ticket, collect and preserve:

- [ ] Pod events (`kubectl describe pod`)
- [ ] Pod logs (`kubectl logs`)
- [ ] Node status (`kubectl get nodes`, `nvidia-smi`)
- [ ] Secret metadata (without exposing token: `kubectl get secret ngc-secret -o jsonpath='{.data}' | keys`)
- [ ] NGC token validity (date +%s for expiry comparison)
- [ ] Network diagnostic results (DNS, TLS, registry reachability)
- [ ] Kubernetes version and GPU Operator version
- [ ] Driver and CUDA version on node
- [ ] All commands run and their outputs (for audit trail)
