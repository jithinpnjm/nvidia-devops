# Chapter 8: Security and Compliance

| Chapter metadata | Value |
|---|---|
| Volume | 23 — Interview Masterclass |
| Difficulty | Advanced |
| Estimated reading time | 60 minutes |
| Primary audience | Security engineers, compliance officers, platform teams |
| Core question | How do you secure GPU infrastructure? What isolation guarantees matter? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Threat model GPU infrastructure
- Verify hardware isolation (MIG, time-slicing)
- Design secure multi-tenant GPU systems
- Implement audit and compliance logging
- Assess regulatory requirements (HIPAA, SOC2, etc.)
- Validate security through testing and monitoring

## Threat Model: GPU Infrastructure

**Attack surface (GPU cluster):**

```
┌──────────────────────────────────────────────────────┐
│ External Threats                                     │
├──────────────────────────────────────────────────────┤
│ 1. Network attacks (DDoS, data interception)        │
│ 2. Unauthorized access to cluster                   │
│ 3. Model theft (inference output analysis)          │
│ 4. Data exfiltration (training data extraction)     │
│ 5. GPU resource hijacking                           │
├──────────────────────────────────────────────────────┤
│ Internal Threats                                     │
├──────────────────────────────────────────────────────┤
│ 1. Malicious container (tries to access peer GPU)  │
│ 2. Side-channel attacks (timing, power analysis)   │
│ 3. Memory covert channels (shared cache)            │
│ 4. Privilege escalation (kernel exploit)            │
│ 5. Compliance violations (audit trail tampering)   │
└──────────────────────────────────────────────────────┘
```

## Interview Questions

### Question 1: Threat Modeling Multi-Tenant GPU Systems

**Scenario:** "You operate a managed GPU cluster serving 50 customers. Each has sensitive models and data. Design a security architecture that prevents customer A from accessing customer B's GPU memory, inference results, or training data."

**Model Answer (4 minutes):**

"This is a defense-in-depth problem. I'd implement layers:

**Layer 1: Compute Isolation (MIG)**

Use MIG to partition GPUs at hardware level:

```
GPU 0:
├─ MIG instance 1 (Customer A) → 10 SMs, 20 GB VRAM
├─ MIG instance 2 (Customer B) → 10 SMs, 20 GB VRAM
└─ MIG instance 3 (Customer C) → 20 SMs, exclusive for inference

Guarantee: Customer A cannot execute instructions on Customer B's SMs
           Customer A cannot read Customer B's GPU memory
```

**Layer 2: Memory Isolation (cgroups + cgroup GPU device)**

Even with MIG, prevent container breakout from accessing host GPU:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: customer-a-training
spec:
  containers:
  - name: training
    securityContext:
      runAsNonRoot: true
      runAsUser: 1000
      readOnlyRootFilesystem: true
    resources:
      requests:
        nvidia.com/gpu: "1"  # Gets one MIG instance
    env:
    - name: NVIDIA_VISIBLE_DEVICES
      value: "GPU-abcd1234-5678"  # Specific MIG UUID
    volumeMounts:
    - name: model-storage
      mountPath: /models
      readOnly: true
  volumes:
  - name: model-storage
    secret:
      secretName: customer-a-model  # Per-customer secret
```

**Layer 3: Network Isolation**

Prevent data exfiltration over network:

```yaml
# Network policy: Customer A can only talk to storage and monitoring
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: customer-a-egress
spec:
  podSelector:
    matchLabels:
      customer: a
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          service: storage
    ports:
    - protocol: TCP
      port: 6379  # Redis for checkpoints
  - to:
    - podSelector:
        matchLabels:
          service: monitoring
    ports:
    - protocol: TCP
      port: 9090  # Prometheus
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system  # DNS only
    ports:
    - protocol: UDP
      port: 53
```

**Layer 4: Audit and Compliance**

Log all GPU access:

```yaml
AuditPolicy:
  - level: RequestResponse
    verbs: ["create", "delete", "patch"]
    resources: ["pods", "services"]
    namespaceSelector:
      matchLabels:
        sensitive: "true"
  - level: Metadata
    verbs: ["get", "list"]
    resources: ["secrets", "configmaps"]
```

All GPU jobs log:
```
{
  timestamp: 2024-01-15T10:30:45Z
  customer_id: customer-a
  job_id: training-xyz
  gpu_instance: gpu-0-mig-1
  action: model_loaded
  model_hash: sha256:abc123...
  data_size_mb: 1024
  access_pattern: read_only
}
```

**Layer 5: Secrets Management**

Customer models and data encrypted at rest:

```bash
# Key management
# - Each customer has unique key (stored in KMS)
# - Models encrypted with customer key
# - Training data encrypted separately
# - Keys never transferred to GPU

$ kubectl create secret generic customer-a-model \
    --from-file=model.pt \
    --encryption-key=<kms-key-id>
```

**Threat matrix (verification):**

| Threat | Mitigation | Verification |
|---|---|---|
| A reads B's GPU memory | MIG hardware isolation | Run side-channel attack test; should fail |
| A reads B's model | Secrets encryption + RBAC | Try to mount another customer's secret; denied |
| A exfiltrates data via network | Network policy + TLS | Run tcpdump; all egress encrypted |
| A exploits GPU driver bug | No root access (securityContext) | Attempt privilege escalation; fails |
| A snoops on model via inference timing | Constant-time inference | Measure inference latency; no variation |

**Testing (before production):**

```bash
# 1. Verify MIG isolation
nvidia-smi -L  # List MIG instances
nvidia-smi --query-compute-apps=gpu_uuid,memory_used --format=csv
# Should show Customer A GPU-uuid-1 using only their partition

# 2. Verify memory isolation
# Run two containers (A and B) simultaneously
# Container A tries: cudaMalloc on B's memory space
# Should fail with "invalid device"

# 3. Verify network isolation
# Container A tries: curl http://customer-b-service/model
# Should timeout (network policy denies)

# 4. Verify secrets isolation
# Container A tries: kubectl get secret customer-b-model
# RBAC denies access

# 5. Verify audit logging
# Check logs: grep customer_id audit.log
# All customer-a operations logged, no customer-b data visible
```

**Residual risk (acknowledge):**

| Risk | Impact | Mitigation |
|---|---|---|
| GPU driver exploit | Could bypass MIG | Keep driver patched, security scanning |
| Timing side-channel | Model inference info leak | Add noise, constant-time execution |
| Power analysis | Sensitive data recovery | Requires physical access; not risk in cloud |
| Insider threat | Any layer can be bypassed | Employee vetting, 2FA, audit review |

This architecture provides **95%+ security** for multi-tenant workloads. Residual risk is mitigated by monitoring, auditing, and prompt patching."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| Defense in depth | Single layer failure doesn't compromise system |
| MIG is hardware boundary | No software exploits can cross it |
| Secrets encryption | Decrypt only at job startup, never store plaintext |
| Audit trails | Prove compliance and detect breaches |
| Testing validates design | Don't assume isolation; verify it |

**Follow-up Trap:** "Isn't MIG isolation enough?"

**Corrective answer:** "MIG is strong but not foolproof. Combined with network policies, RBAC, encryption, and auditing, you achieve defense in depth. Single layer failure still leaves protections."

**Verification Point:** Can the candidate design multi-layer security architecture and validate isolation?

---

### Question 2: Compliance Requirements (HIPAA, SOC2)

**Scenario:** "A healthcare customer asks: 'Can we train diagnostic models on your GPU cluster? Our data is PHI (Protected Health Information) and must comply with HIPAA.' What checks must you do before accepting the workload?"

**Model Answer (2.5 minutes):**

"HIPAA compliance is non-negotiable for healthcare. Here's my checklist:

**Pre-deployment security checks:**

```yaml
Compliance Checklist:
  Physical Security:
    ☐ Data center access controlled (badge + cameras)
    ☐ GPU cluster locked in secure area
    ☐ Hard drives encrypted (BitLocker / LUKS)
    ☐ No USB ports enabled on GPU nodes
  
  Network Security:
    ☐ All traffic encrypted (TLS 1.2+)
    ☐ VPN required for cluster access
    ☐ Network segmentation (PHI data isolated vlan)
    ☐ Intrusion detection system (IDS) running
    ☐ Firewall rules: minimal ports open
  
  Access Control:
    ☐ MFA (multi-factor auth) for cluster access
    ☐ RBAC: customer can only see their own data
    ☐ Service accounts use short-lived tokens
    ☐ No SSH keys; use SSO/SAML
  
  Data Protection:
    ☐ Encryption at rest (KMS)
    ☐ Encryption in transit (TLS)
    ☐ Data classification (tag all PHI)
    ☐ Audit logging of all data access
  
  Compliance & Audit:
    ☐ SOC 2 Type II certification
    ☐ Annual penetration testing
    ☐ Incident response plan documented
    ☐ 2-year audit log retention
```

**Configuration example (HIPAA pod):**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: healthcare-training
  namespace: hipaa-compliance
  labels:
    data-classification: phi
spec:
  securityContext:
    runAsNonRoot: true
    fsGroup: 2000
    seLinuxOptions:
      level: "s0:c123,c456"  # SELinux context
  
  containers:
  - name: training
    image: healthcare-training:v1
    securityContext:
      runAsUser: 1000
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
    
    env:
    - name: HIPAA_MODE
      value: "true"
    
    volumeMounts:
    - name: encrypted-data
      mountPath: /data
      readOnly: false
    
    resources:
      limits:
        memory: "64Gi"
        cpu: "16"
        nvidia.com/gpu: "1"
  
  volumes:
  - name: encrypted-data
    secret:
      secretName: hipaa-training-data
      defaultMode: 0400  # Read-only to owner
  
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
          - key: hipaa-compliant
            operator: In
            values: ["true"]
        topologyKey: kubernetes.io/hostname  # Same HIPAA node pool
```

**Audit logging (mandatory for HIPAA):**

```python
# Healthcare training script logs all data access
import logging
import json

class HIPAALogger(logging.Handler):
    def emit(self, record):
        # Every data access generates audit entry
        audit_entry = {
            'timestamp': record.created,
            'user_id': os.getenv('USER'),
            'action': record.msg,
            'data_type': 'PHI',
            'job_id': os.getenv('JOB_ID'),
            'gpu_id': os.getenv('NVIDIA_VISIBLE_DEVICES'),
            'success': record.levelno < logging.ERROR
        }
        
        # Send to audit system (immutable log)
        send_to_audit_server(audit_entry)

# Configure
logger = logging.getLogger(__name__)
logger.addHandler(HIPAALogger())

# Usage
logger.info(f'Loaded patient batch: {batch_size} samples')
logger.info(f'Computed gradients: norm={grad_norm}')
logger.info(f'Synchronized across {num_gpus} GPUs')
```

**Data deletion (required by HIPAA for decommissioning):**

```bash
#!/bin/bash
# Before returning GPU to pool, wipe all customer data

# 1. Unmount encrypted volumes
umount /data/hipaa-training-*

# 2. Secure erase GPU memory (multiple passes)
for i in {1..3}; do
    nvidia-smi -i 0 --query-gpu=memory.total --format=csv,noheader | \
    xargs -I {} sh -c 'cuda-memtest --stress --iterations 100 --device 0'
done

# 3. Verify data is gone
gpumemtest --verify

# 4. Log completion
echo "GPU 0 wiped at $(date)" >> /var/log/gpu-wipe.log
```

**Before accepting customer's data:**

1. **Verify our SOC 2 certification** (show customer the certificate)
2. **Sign Business Associate Agreement (BAA)** - legally binding
3. **Configure network isolation** (customer in separate namespace)
4. **Enable all audit logging** (double-check it's working)
5. **Train staff** (HIPAA rules, data handling)
6. **Conduct joint security review** with customer

**Post-deployment monitoring:**

```yaml
# Alert on suspicious access patterns
Alert Rules:
- phi_data_accessed_after_hours → Page on-call
- failed_auth_attempts > 5 → Lockout user
- data_export_unusual_volume → Kill job, investigate
- audit_log_not_written_for_1min → System down alert
```

**If breach occurs (required notification):**

```
HIPAA Breach Response (within 60 days):
1. Notify affected individuals
2. Notify media (if > 500 people affected)
3. Notify HHS (Department of Health & Human Services)
4. Internal investigation (root cause analysis)
5. Remediation plan
6. Attestation to regulators
```

This is not optional—HIPAA violations carry $100-1.5M fines per incident."

**Key Reasoning Points:**

| Concept | Why it matters |
|---|---|
| HIPAA is strict | Violations are criminal, not just civil |
| Data classification drives architecture | PHI needs extra layers vs. public data |
| Audit trails are proof | "I didn't log it" is not a defense |
| Secrets management is critical | Never log passwords, encryption keys, etc. |
| Compliance is ongoing | Not one-time; must audit annually |

**Follow-up Trap:** "Can we just disable audit logging for performance?"

**Corrective answer:** "No. Audit logging is mandatory under HIPAA. If performance is an issue, use async logging or upgrade to faster storage. Never disable compliance controls."

**Verification Point:** Can the candidate design HIPAA-compliant systems and explain compliance requirements?

## Related Chapters

- **Chapter 7:** [Kubernetes and Container Orchestration](./chapter-07-kubernetes-and-container-orchestration.md) — RBAC and network policies
- **Chapter 9:** [Cluster Operations](./chapter-09-cluster-operations-and-capacity-planning.md) — incident response
- **Volume 16:** Observability (auditing)

