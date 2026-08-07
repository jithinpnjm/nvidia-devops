---
title: Lab 01 — Inspect an NGC and NIM Deployment Plan
description: Build an artifact, entitlement, compatibility, and operations plan before deployment.
sidebar_position: 20
tags: [lab, ngc, nim]
---

# Lab 01 — Inspect an NGC and NIM Deployment Plan

## Objective

Produce a reviewable deployment plan for one NIM service **without deploying it**. The plan serves as both a safety checklist (did we forget something?) and a reference for operations (how do we troubleshoot this later?).

## Deliverables

You will build a YAML file that documents the entire deployment without executing it.

```yaml
# example_deployment_plan.yaml
deployment_id: "llm-inference-prod-20260807"
created_by: "<your-name>"
reviewed_by: "<approver-name>"  # Must be approved before deployment
approval_date: "2026-08-08"

## SECTION 1: Model and Container Identifiers
artifacts:
  model:
    name: "llama2-7b-hf"
    source: "HuggingFace (Meta)"
    license: "Community License (non-commercial)"
    source_url: "https://huggingface.co/meta-llama/Llama-2-7b-hf"
    revision: "sha256:abc123def456..."  # Immutable commit, not 'main'
    expected_size_gb: 14
    quantization: "none (native bfloat16)"
  
  container:
    image_mutable_tag: "nvcr.io/nvidia/nim/llama2-7b:1.0.5"
    digest_immutable: "sha256:a1b2c3d4e5f6..."
    # ✅ Always verify digest matches tag:
    # docker pull nvcr.io/nvidia/nim/llama2-7b:1.0.5
    # docker image ls --digests | grep llama2

## SECTION 2: Compatibility Matrix Verification
qualified_matrix:
  nvidia_ai_enterprise_version: "24.07"
  driver_version: "550.127"
  cuda_version: "12.4"
  cudnn_version: "9.1"
  kubernetes_version: "1.28.5"
  gpu_operator_version: "24.3.0"
  gpu_type: "A100 40GB"
  # ✅ Verification command:
  # curl https://www.nvidia.com/en-us/ai-enterprise/documentation/ | grep "qualified-combinations"
  compatibility_approved: true
  compatibility_approval_ticket: "SEC-12345"

## SECTION 3: License and Entitlement
entitlement:
  ngc_account_entitled: true
  subscription_model: "NVIDIA AI Enterprise 24.07"
  subscription_expires: "2027-01-31"
  model_requires_entitlement: false  # Llama2 Community License, no subscription needed
  approval_use_cases: ["internal staff tool", "non-revenue"]
  prohibited_use_cases: ["commercial inference", "redistribution"]
  audit_trail: "approved by ml-ops on 2026-08-01"

## SECTION 4: GPU and Memory Sizing
sizing:
  model_size_gb: 14
  framework_overhead_gb: 2
  activations_per_request_gb: 4  # Batch size 8 @ fp32
  safety_headroom_gb: 2  # Don't use 100% of GPU
  total_required_gpu_memory_gb: 22
  gpu_available_gb: 40  # A100
  fit_check: "✓ Model fits with margin"
  
  requests_per_gpu: 50  # Expected throughput
  total_replicas_needed: 2  # 100 req/sec / 50 req/gpu
  
  node_count: 1
  gpu_per_node: 2
  total_gpus: 2

## SECTION 5: Artifact Distribution and Mirror Strategy
artifacts_distribution:
  primary_source: "NGC (external)"
  mirror_internal:
    registry: "harbor-internal.company.com"
    image_path: "llama2-7b:1.0.5"
    sync_strategy: "manual pull after security review"
    retention_policy: "keep 3 old versions for rollback"
    sync_frequency: "when new version tested in staging"
  
  # ✅ Mirror validation command:
  # docker pull nvcr.io/nvidia/nim/llama2-7b@sha256:a1b2c3d4e5f6
  # docker tag nvcr.io/nvidia/nim/llama2-7b@sha256:a1b2c3d4e5f6 \
  #   harbor-internal.company.com/llama2-7b:1.0.5
  # docker push harbor-internal.company.com/llama2-7b:1.0.5

## SECTION 6: Secrets and Entitlement Management
secrets:
  ngc_api_token:
    storage: "AWS Secrets Manager"
    secret_name: "ngc-api-token-prod"
    rotation_schedule: "every 90 days"
    next_rotation: "2026-11-07"
    access_method: "IRSA (IAM role for service account)"
    access_verified: false  # Check during deployment
  
  # ✅ Verification command:
  # kubectl annotate serviceaccount nim-runner \
  #   eks.amazonaws.com/role-arn=arn:aws:iam::ACCOUNT:role/nim-runner-irsa
  # kubectl get secret ngc-credentials -o yaml | grep NGC_API_TOKEN

## SECTION 7: Health Probes and Monitoring
health_and_monitoring:
  liveness_probe:
    path: "/v1/health"
    initialDelaySeconds: 60
    periodSeconds: 30
    failureThreshold: 3
  
  readiness_probe:
    path: "/v1/health"
    initialDelaySeconds: 300  # Model may take minutes to load
    periodSeconds: 10
    failureThreshold: 5
  
  startup_probe:
    path: "/v1/health"
    initialDelaySeconds: 0
    periodSeconds: 10
    failureThreshold: 60  # Allow 10 minutes max
  
  metrics_export:
    enabled: true
    endpoint: "0.0.0.0:9090/metrics"
    prometheus_scrape_interval: "15s"
  
  # ✅ Probe validation command (after deployment):
  # kubectl logs <pod> | grep -i "readiness check"
  # curl -s http://service:8000/v1/health | jq .

## SECTION 8: Canary and Rollback Procedure
deployment_strategy:
  type: "canary"
  canary_replicas: 1
  canary_duration_minutes: 30
  
  canary_gates:
    - name: "functional"
      test: "deterministic inference request returns expected output"
      pass_criteria: "output matches baseline"
    
    - name: "latency"
      test: "load test 100 req/sec for 5 min, measure p95"
      pass_criteria: "p95 < 200ms (baseline 180ms, allow 10% regression)"
    
    - name: "gpu_utilization"
      test: "nvidia-smi GPU Utilization during load"
      pass_criteria: "GPU Util > 50% (not stuck waiting for data)"
  
  rollback:
    trigger: "any gate fails or manual abort"
    procedure: "helm rollback llama2-7b 0"
    estimated_time_to_recovery_minutes: 5
    previous_version_retention: "keep 3 versions"
  
  # ✅ Canary test command (after canary deployment):
  # kubectl logs -l app=llama2-7b,canary=true --tail=100

## SECTION 9: External Dependencies
external_dependencies:
  ngc_api_availability:
    url: "https://api.ngc.nvidia.com/v2/models"
    criticality: "high (model download)"
    fallback: "internal mirror (pre-tested)"
    test_command: "curl -H 'Authorization: Bearer $NGC_TOKEN' https://api.ngc.nvidia.com/v2/models"
  
  internal_mirror_registry:
    url: "harbor-internal.company.com"
    criticality: "critical (fallback if NGC unavailable)"
    expected_uptime: "99.9%"
    test_command: "docker pull harbor-internal.company.com/llama2-7b:1.0.5"
  
  model_cache_storage:
    path: "/model_cache"
    backend: "fast NVMe SSD (not network NFS)"
    size_gb: 50
    criticality: "critical (model load path)"
    test_command: "kubectl exec <pod> -- df -h /model_cache"

## SECTION 10: Support Ownership Matrix
support_ownership:
  nvidia:
    responsible_for:
      - "Driver 550.127 functionality"
      - "CUDA 12.4 compilation and execution"
      - "NIM container operation and model loading"
      - "GPU kernel execution"
    contact: "NVIDIA support portal"
    sla: "4-hour response for P1"
  
  platform_team:
    responsible_for:
      - "Kubernetes cluster availability"
      - "GPU Operator deployment and updates"
      - "Node health and driver installation"
    contact: "platform-ops@company.com"
  
  customer_application:
    responsible_for:
      - "Request preprocessing and tokenization"
      - "Inference correctness validation"
      - "Response postprocessing"
    contact: "ml-ops@company.com"

## SECTION 11: Pre-Deployment Checklist
pre_deployment_checklist:
  - [ ] Model license approved (Community License, non-commercial ✓)
  - [ ] Container digest verified against NGC (sha256:a1b2c3d4e5f6 ✓)
  - [ ] Staging deployment successful with same workload
  - [ ] Canary procedure documented and tested
  - [ ] Rollback tested (can roll back to previous version)
  - [ ] NGC token created and tested
  - [ ] Model cache storage provisioned (50GB fast NVMe)
  - [ ] Monitoring and alerting configured
  - [ ] Support contacts and SLAs documented
  - [ ] Change Advisory Board approval obtained

## Failure Injection Test

❌ **Test assumption:** Assume external NGC API is unavailable for 24 hours.

✅ **Outcome:** Verify that:
1. NIM can start using model from internal mirror
2. Inference continues without interruption
3. No alerts for NGC unavailability (expected, not a failure)

```bash
# Simulate NGC unavailability:
# 1. Verify model is cached internally:
kubectl exec &lt;pod&gt; -- ls -lh /model_cache/llama2-7b*

# 2. Temporarily block NGC in network policy:
kubectl apply -f - &lt;<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: block-ngc
spec:
  podSelector:
    matchLabels:
      app: llm-inference
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443
  - to:
    - podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
EOF

# 3. Verify inference still works:
curl http://service:8000/v1/completions \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is AI?", "max_tokens": 50}'

# 4. Remove the network policy:
kubectl delete networkpolicy block-ngc

# Expected result: Inference continues, no new pod failures.
```

## Validation for Reviewers

A peer or architect reviewing this plan should verify:

- [ ] **Can I understand every external dependency?** (NGC, mirror, storage, network)
- [ ] **Is the compatibility matrix explicitly stated and verifiable?**
- [ ] **Can I reproduce this deployment from this plan?** (all versions, digests, IDs specified)
- [ ] **Are there clear escalation paths?** (who owns Kubernetes? who owns GPU?)
- [ ] **Is there a fallback if NGC is unavailable?** (internal mirror required)
- [ ] **Have canary gates been tested?** (latency SLO, correctness, GPU utilization)
- [ ] **Can rollback be executed in < 10 minutes?** (previous version available, procedure documented)

If all checks pass, sign off. If any check fails, return for revision.
