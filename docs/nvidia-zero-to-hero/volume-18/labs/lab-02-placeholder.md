---
title: "Lab 2 - Build and Verify a Signed Container"
slug: "lab-02-build-verify-signed-container"
sidebar_position: 2
description: "Build an AI inference container, sign it with Cosign, and verify the signature before deployment."
---

# Lab 2 — Build and Verify a Signed Container

**Objective:** Sign a container image and practice verifying signatures.

**Estimated time:** 45 minutes

**Prerequisites:**
- Docker or container build tool
- Cosign installed
- Access to container registry (e.g., Docker Hub, GCR)

## Step 1: Generate Signing Key

```bash
$ cosign generate-key-pair

Enter password for private key:
Private key written to cosign.key
Public key written to cosign.pub
```

## Step 2: Build a Simple Container

```dockerfile
# Dockerfile
FROM nvcr.io/nvidia/pytorch:24.07-py3
RUN pip install transformers
COPY model-server.py /app/model-server.py
ENTRYPOINT ["python", "/app/model-server.py"]
```

```bash
$ docker build -t myregistry.azurecr.io/model-server:v1.0 .
```

## Step 3: Push to Registry

```bash
$ docker push myregistry.azurecr.io/model-server:v1.0
```

## Step 4: Sign the Image

```bash
$ cosign sign --key cosign.key myregistry.azurecr.io/model-server:v1.0
```

## Step 5: Verify the Signature

```bash
$ cosign verify --key cosign.pub myregistry.azurecr.io/model-server:v1.0
```

Expected output: Signature verification successful.

## Step 6: Attempt Verification with Wrong Key (Should Fail)

```bash
$ cosign verify --key wrong-key.pub myregistry.azurecr.io/model-server:v1.0
Error: no matching signatures found
```

## Step 7: Generate SBOM

```bash
$ syft myregistry.azurecr.io/model-server:v1.0 > model-server-v1.0.sbom.json

$ # Sign the SBOM
$ cosign attach sbom --sbom model-server-v1.0.sbom.json \
  --key cosign.key myregistry.azurecr.io/model-server:v1.0
```

## Deliverable

Document the process:

```
IMAGE: myregistry.azurecr.io/model-server:v1.0
DIGEST: sha256:abcdef...

SIGNATURE:
  Signed: Yes
  Key: cosign.pub (public key fingerprint)
  Timestamp: <timestamp>

SBOM:
  Generated: Yes
  Packages: <count>
  Signed: Yes

VERIFICATION:
  Signature valid: Yes
  SBOM valid: Yes
```

## Next Steps

Use this image in Kubernetes with a ClusterPolicy that enforces signature verification before deployment.
