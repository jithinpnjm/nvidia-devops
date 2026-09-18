---
title: "Chapter 10 - Data and Model Protection"
slug: "chapter-10-data-and-model-protection"
sidebar_position: 10
description: "Protect training data, model weights, and inference results; implement encryption at rest and in transit; manage model lifecycle."
---

# Chapter 10 — Data and Model Protection

**Learning outcome:** Design encryption strategies for data lifecycle, prevent unauthorized model access, implement secure model versioning and artifact management.

## 10.1 Data in motion: encryption during training and inference

**Problem:** Model weights and training data are sensitive. Unencrypted transmission allows eavesdropping.

**Solution:** TLS 1.3 for all network communication.

```bash
# Verify TLS enforcement in training cluster
$ cat /etc/kubernetes/manifests/training-api.yaml | grep -A 5 tls:
tls:
  - secretName: training-tls
    hosts:
    - training-service.example.com

# Test connection
$ curl -v https://training-service.example.com/status
* TLS 1.3
* certificate: /C=US/CN=training-service.example.com
* OK
```

**Training-specific: NCCL traffic is not natively encrypted — know this precisely**

`NCCL_TLS_LEVEL` is not a real NCCL environment variable, and open-source NCCL does not provide built-in in-transit encryption for GPU-to-GPU collective operations (allreduce, allgather, etc.) over NVLink, RDMA, or RoCE. This is a genuine, unresolved gap in GPU cluster security — not something a flag turns on — and it's worth understanding accurately rather than memorizing a fabricated fix:

- **Why it's hard:** NCCL is built for minimum-latency, kernel-bypass collective communication (GPUDirect RDMA, NVLink). Adding encryption in that path adds real latency and complexity, and vanilla NCCL simply doesn't do it.
- **What's actually used in practice today:**
  - **Physical/network isolation** — run NCCL traffic on a dedicated, non-routed fabric (InfiniBand partition, isolated RoCE VLAN) that untrusted tenants/traffic cannot reach, rather than encrypting the collective traffic itself.
  - **Fabric-level encryption** — some deployments terminate encryption at the network fabric layer (e.g., IPsec on RoCE/Ethernet transport) rather than inside NCCL, accepting the associated performance cost.
  - **Trust-boundary design** — treat "who can reach the NCCL fabric" as the actual security control (network policy, physical segmentation, dedicated training VPC/subnet) instead of relying on any collective-library encryption.
- **What to say in an interview:** "NCCL doesn't natively encrypt gradient traffic — that's a real, actively-discussed gap in GPU cluster security. In practice we secure it by isolating the RDMA/NVLink fabric at the network layer rather than depending on an application-layer flag that doesn't exist."

```bash
$ python train_multinode.py
# No encryption of NCCL traffic itself; security comes from fabric isolation
# (dedicated IB partition / isolated RoCE VLAN), not from an NCCL setting.
```

## 10.2 Data at rest: encryption in storage

**Key question:** Where does training data and model checkpoints live?

- Persistent volumes in Kubernetes → encrypted with etcd encryption + storage backend encryption
- Object storage (S3/GCS) → server-side encryption (SSE-KMS) + customer-managed keys
- Local node storage → at-rest encryption via dm-crypt

```bash
# Verify etcd encryption (Kubernetes secrets at rest)
$ kubectl get secrets --all-namespaces -o json | jq '.items[0].metadata.uid'
# This secret is encrypted inside etcd; decrypt key stored separately

# Verify storage class encryption
$ kubectl get storageclass | grep -E 'encrypted|crypt'

# Verify S3 bucket encryption
$ aws s3api get-bucket-encryption --bucket training-data-bucket
{
  "ServerSideEncryptionConfiguration": {
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms",
          "KMSMasterKeyID": "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
        }
      }
    ]
  }
}
# KMS key ensures only authorized processes can decrypt
```

## 10.3 Model artifact management: versioning, signatures, and access control

**Model versioning and inventory:**

```bash
# Store model metadata in immutable registry
$ cat model-registry.yaml
model-name: gpt-3-5-turbo-fine-tuned
version: 1.0.4
commit-hash: abc123def456  # Trained from this exact code commit
docker-image: gcr.io/myorg/model:v1.0.4
training-dataset: dataset-v2.3  # Which data version was used
security-scanSbom: gpt-3.5-v1.0.4.sbom
signature: sha256:abcdef... (signed with training-team key)
trained-date: 2026-08-07
approval-status: "approved-for-production"
approval-by: security-reviewer
```

**Access control on models:**

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: model-access-policy
  namespace: inference-ns
data:
  model-access-rules: |
    # Only approved models can be deployed
    gpt-3-5-turbo-fine-tuned:v1.0.4:
      - can-deploy: inference-team
      - can-audit: security-team
      - can-delete: platform-team
    
    # Experimental model: restricted access
    experimental-moe-model:v0.9:
      - can-deploy: ml-research-team
      - can-delete: ml-research-team
      - approval-required: true
```

## 10.4 Key management: secrets for model decryption and authentication

**Problem:** Training jobs need credentials to access encrypted models and datasets. Where do credentials live?

**Solution: Kubernetes Secrets with RBAC**

```bash
# Secret contains model repository credentials
$ kubectl create secret generic model-registry-creds \
  --from-literal=username=ml-engineer \
  --from-literal=password=$(openssl rand -base64 32) \
  --namespace training-ns

# Only training service account can read it
$ kubectl create rolebinding model-secrets \
  --clusterrole=view \
  --serviceaccount=training-ns:trainer \
  --namespace training-ns \
  # Add resourceNames: ["model-registry-creds"] to restrict to one secret

# Verify (resource name is a positional argument, not a --resource-name flag)
$ kubectl auth can-i get secrets model-registry-creds \
  --as=system:serviceaccount:training-ns:trainer \
  --namespace training-ns
yes
```

**Better: External Secret Manager (Vault, AWS Secrets Manager)**

```bash
# Training pod retrieves credentials from Vault at runtime
$ vault kv get secret/model-registry-creds
Key                 Value
---                 -----
username            ml-engineer
password            <dynamically-generated-temporary-token>
ttl                 3600  # Token valid for 1 hour
```

## 10.5 Production Troubleshooting

| Issue | Symptom | Check | Fix |
|---|---|---|---|
| Model weights unencrypted in transit | Wireshark shows plaintext weights in packets | Enable TLS 1.3; verify cert is valid | Add TLS secret to Kubernetes; update model API to enforce HTTPS |
| Model stored in plaintext | S3 bucket contents readable without encryption | `aws s3api get-bucket-encryption` | Enable SSE-KMS; rotate key; re-encrypt existing objects |
| Unauthorized model access | Untrusted user can pull production model | Check RBAC; check model registry auth | Add RBAC restriction; require API token for model pull |
| Model versioning mismatch | Production runs outdated model; audit trail unclear | Check model metadata; check deployed image digest | Use immutable model registry; tag with commit hash + approval status |

## 10.6 Interview Question: Securing the Full Data Lifecycle

**Question:** "Design the security architecture for protecting a fine-tuned LLM from creation through serving. How do you ensure only approved models run in production, and how do you prevent unauthorized access to model weights?"

**Model answer (spoken):**
> "I'd design it in stages. During training: I'm honest that NCCL doesn't natively encrypt gradient traffic between GPUs, so I protect that path via network isolation — dedicated IB partition or isolated RoCE VLAN that only the training cluster can reach — rather than an application-layer encryption flag that doesn't exist. Training data is encrypted at rest on the storage backend (KMS-encrypted EBS or S3), and all control-plane/API traffic uses TLS 1.3. I'd log every training run with commit hash, data version, and trainer identity.
>
> After training, the model is signed. I'd use an industry standard like COSE (CBOR Object Signing and Encryption) to sign the model weights with a training-team private key. This prevents tampering or unauthorized versions from being deployed.
>
> The model is stored in a container registry with a tag like `gpt-3-fine-tuned:v1.0-approved`. I'd never use `:latest` — always a specific version with approval metadata. The container image itself is scanned for CVEs before it's promoted to production.
>
> For serving: the inference pod retrieves the model from the registry using a token that's valid for only 1 hour (issued by Vault). The token is never stored on disk; it's retrieved from Vault at Pod startup and rotated regularly.
>
> Access to the model registry requires RBAC: inference team can pull approved models, but cannot push or delete. Security team can audit which models were accessed and when.
>
> To verify: I'd test that an untrusted user cannot pull the model (gets 401 Unauthorized), and that someone modifying the model binary is detected (signature verification fails)."

## Key Takeaways

- Encrypt data in motion: TLS 1.3 for all APIs. NCCL/RDMA traffic between GPUs is NOT natively encrypted by NCCL — secure it via network/fabric isolation (dedicated IB partition, isolated RoCE VLAN), not a nonexistent env var.
- Encrypt data at rest: KMS or customer-managed keys for storage backends.
- Version models immutably: tag with commit hash and approval status.
- Sign model artifacts: cryptographic signatures prevent tampering.
- Manage credentials via external secret manager (Vault) or Kubernetes Secrets with RBAC.

## Cross References

- Previous: [Chapter 9 — Confidential Computing](./chapter-09-placeholder.md)
- Next: [Chapter 11 — Audit, Logging, and Compliance](./chapter-11-placeholder.md)
- Lab: [Lab 9 — Implement Model Signing and Verify Signatures](./labs/lab-09-placeholder.md)
